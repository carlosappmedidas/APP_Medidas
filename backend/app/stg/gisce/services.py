# app/stg/gisce/services.py
# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportCallIssue=false, reportArgumentType=false
"""CRUD config GISCE + test de conexion + preview dry-run."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.core.crypto import cifrar_password, descifrar_password
from app.stg.models import StgGisceConfig

from .client import (
    GisceAuthError,
    GisceClient,
    GisceConnectionError,
    GisceError,
)

from .schemas import (
    GisceConfigIn,
    GisceExecuteResult,
    GiscePreviewItem,
    GiscePreviewResult,
    GisceTestResult,
)

def _limpiar_host(host: str) -> str:
    """Quita esquema (http://, https://) y trailing slash del host."""
    h = (host or "").strip()
    if h.startswith("https://"):
        h = h[len("https://"):]
    elif h.startswith("http://"):
        h = h[len("http://"):]
    return h.rstrip("/")


def leer_config(db: Session, empresa_id: int) -> Optional[StgGisceConfig]:
    return (
        db.query(StgGisceConfig)
        .filter(StgGisceConfig.empresa_id == empresa_id)
        .one_or_none()
    )


def guardar_config(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    payload: GisceConfigIn,
) -> StgGisceConfig:
    cfg = leer_config(db, empresa_id)
    pwd_cifrado = cifrar_password(payload.password)

    if cfg is None:
        cfg = StgGisceConfig(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre=payload.nombre,
            host=_limpiar_host(payload.host),
            puerto=payload.puerto,
            database=payload.database,
            usuario=payload.usuario,
            password_cifrado=pwd_cifrado,
            activo=payload.activo,
            estado="no_probado",
        )
        db.add(cfg)
    else:
        cfg.nombre = payload.nombre
        cfg.host = _limpiar_host(payload.host)
        cfg.puerto = payload.puerto
        cfg.database = payload.database
        cfg.usuario = payload.usuario
        cfg.password_cifrado = pwd_cifrado
        cfg.activo = payload.activo
        # Al cambiar credenciales, invalidamos el estado anterior
        cfg.estado = "no_probado"
        cfg.ultimo_error = None

    db.commit()
    db.refresh(cfg)
    return cfg


def _build_client_from_config(cfg: StgGisceConfig) -> GisceClient:
    pwd_claro = descifrar_password(cfg.password_cifrado)
    return GisceClient(
        url=f"http://{_limpiar_host(cfg.host)}:{cfg.puerto}",
        database=cfg.database,
        usuario=cfg.usuario,
        password=pwd_claro,
    )


def probar_conexion(db: Session, empresa_id: int) -> GisceTestResult:
    cfg = leer_config(db, empresa_id)
    if cfg is None:
        return GisceTestResult(
            ok=False,
            estado="error",
            mensaje="No hay configuracion GISCE guardada para esta empresa.",
        )

    cli = _build_client_from_config(cfg)
    try:
        uid = cli.login()
    except GisceAuthError as exc:
        cfg.estado = "error"
        cfg.ultimo_error = str(exc)
        db.commit()
        return GisceTestResult(
            ok=False, estado="error",
            mensaje="Credenciales rechazadas por GISCE.",
            detalle=str(exc),
        )
    except GisceConnectionError as exc:
        cfg.estado = "error"
        cfg.ultimo_error = str(exc)
        db.commit()
        return GisceTestResult(
            ok=False, estado="error",
            mensaje="No se pudo contactar con el servidor GISCE.",
            detalle=str(exc),
        )
    except GisceError as exc:
        cfg.estado = "error"
        cfg.ultimo_error = str(exc)
        db.commit()
        return GisceTestResult(
            ok=False, estado="error",
            mensaje="Error desconocido al conectar con GISCE.",
            detalle=str(exc),
        )

    cfg.estado = "ok"
    cfg.ultimo_error = None
    db.commit()
    return GisceTestResult(
        ok=True, uid=uid, estado="ok",
        mensaje=f"Conexion correcta. uid={uid}",
    )


def preview_import(db: Session, empresa_id: int) -> "GiscePreviewResult":
    """Dry-run: trae datos remotos de GISCE y los compara con locales SIN tocar BD.

    Matching:
      - CTs: primero por id_externo_gisce == giscedata.cts.id. Si NULL en local,
        fallback por codigo_ct == giscedata.cts.name (match string).
      - CUPS: por stg_cups.cups == giscedata.cups.ps.name.

    OJO: OpenERP 5/6 devuelve False (no None) cuando un char esta vacio. Normalizamos.
    """
    from app.stg.models import Cups, StgConcentrador
    from .schemas import GiscePreviewItem, GiscePreviewResult

    cfg = leer_config(db, empresa_id)
    if cfg is None:
        return GiscePreviewResult(
            ok=False,
            error="No hay configuracion GISCE guardada para esta empresa.",
        )

    cli = _build_client_from_config(cfg)

    # 1. Traer datos remotos (login lazy)
    try:
        cts_remoto = cli.search_read(
            "giscedata.cts",
            fields=["id", "name", "active"],
        )
        cups_remoto = cli.search_read(
            "giscedata.cups.ps",
            fields=["id", "name", "et", "titular", "active", "direccio", "data_baixa"],
        )
    except GisceAuthError as exc:
        return GiscePreviewResult(ok=False, error=f"Credenciales rechazadas: {exc}")
    except GisceConnectionError as exc:
        return GiscePreviewResult(ok=False, error=f"No se pudo contactar con GISCE: {exc}")
    except GisceError as exc:
        return GiscePreviewResult(ok=False, error=f"Error GISCE: {exc}")

    # Helper: OpenERP 5/6 devuelve False para char vacio; normalizamos a None
    def _norm(v):
        if v is False or v == "":
            return None
        return v

    # 2. Cargar locales (stg_cups tiene empresa_id directo)
    cts_local = (
        db.query(StgConcentrador)
        .filter(StgConcentrador.empresa_id == empresa_id)
        .all()
    )
    cups_local = (
        db.query(Cups)
        .filter(Cups.empresa_id == empresa_id)
        .all()
    )

    # 3. Indices para lookup
    cts_local_by_id_externo = {
        c.id_externo_gisce: c for c in cts_local if c.id_externo_gisce is not None
    }
    # Matching CTs: GISCE.giscedata.cts.name (ej "102.CTR.E300000049")
    # se compara con stg_concentrador.id_ct (mismo formato), NO con codigo_ct
    # (que contiene el ID Circutor "CIR4622546XXX" del PLC fisico).
    cts_local_by_id_ct = {c.id_ct: c for c in cts_local if c.id_ct is not None}
    cups_local_by_name = {c.cups: c for c in cups_local}

    cts_remoto_ids = {ct["id"] for ct in cts_remoto}
    cts_remoto_codigos = {ct["name"] for ct in cts_remoto}
    cups_remoto_names = {c["name"] for c in cups_remoto}

    # 4. Diff CTs
    cts_nuevos = 0
    cts_modificar = 0
    cts_sin_cambios = 0
    nuevos_ct: list[GiscePreviewItem] = []
    modificar_ct: list[GiscePreviewItem] = []
    for ct in cts_remoto:
        codigo = ct["name"]
        local = cts_local_by_id_externo.get(ct["id"]) or cts_local_by_id_ct.get(codigo)
        if local is None:
            cts_nuevos += 1
            if len(nuevos_ct) < 10:
                nuevos_ct.append(GiscePreviewItem(
                    codigo=codigo, accion="nuevo",
                    detalle=f"GISCE id={ct['id']}, active={ct['active']}",
                ))
            continue
        cambios = []
        if local.id_externo_gisce != ct["id"]:
            if local.id_externo_gisce is None:
                cambios.append(f"id_externo_gisce NULL->{ct['id']}")
            else:
                cambios.append(f"id_externo_gisce {local.id_externo_gisce}->{ct['id']}")
        if bool(local.activo) != bool(ct["active"]):
            cambios.append(f"activo {local.activo}->{ct['active']}")
        if cambios:
            cts_modificar += 1
            if len(modificar_ct) < 10:
                modificar_ct.append(GiscePreviewItem(
                    codigo=codigo, accion="modificar",
                    detalle="; ".join(cambios),
                ))
        else:
            cts_sin_cambios += 1

    cts_huerfanos_local = sum(
        1 for c in cts_local
        if (c.id_ct is None or c.id_ct not in cts_remoto_codigos)
        and (c.id_externo_gisce is None or c.id_externo_gisce not in cts_remoto_ids)
    )

    # 5. Diff CUPS
    cups_nuevos = 0
    cups_modificar = 0
    cups_sin_cambios = 0
    nuevos_cups: list[GiscePreviewItem] = []
    modificar_cups: list[GiscePreviewItem] = []
    for cu in cups_remoto:
        name = cu["name"]
        local = cups_local_by_name.get(name)
        if local is None:
            cups_nuevos += 1
            if len(nuevos_cups) < 10:
                titular = (_norm(cu.get("titular")) or "")[:40]
                et = _norm(cu.get("et")) or "?"
                nuevos_cups.append(GiscePreviewItem(
                    codigo=name, accion="nuevo",
                    detalle=f"titular={titular}, et={et}",
                ))
            continue
        cambios = []
        if _norm(local.titular) != _norm(cu.get("titular")):
            cambios.append("titular cambia")
        if _norm(local.direccion) != _norm(cu.get("direccio")):
            cambios.append("direccion cambia")
        if bool(local.activo) != bool(cu["active"]):
            cambios.append(f"activo {local.activo}->{cu['active']}")
        if cambios:
            cups_modificar += 1
            if len(modificar_cups) < 10:
                modificar_cups.append(GiscePreviewItem(
                    codigo=name, accion="modificar",
                    detalle="; ".join(cambios),
                ))
        else:
            cups_sin_cambios += 1

    cups_huerfanos_local = sum(
        1 for c in cups_local if c.cups not in cups_remoto_names
    )

    return GiscePreviewResult(
        ok=True,
        cts_remoto_total=len(cts_remoto),
        cups_remoto_total=len(cups_remoto),
        cts_local_total=len(cts_local),
        cups_local_total=len(cups_local),
        cts_nuevos=cts_nuevos,
        cts_modificar=cts_modificar,
        cts_sin_cambios=cts_sin_cambios,
        cts_huerfanos_local=cts_huerfanos_local,
        cups_nuevos=cups_nuevos,
        cups_modificar=cups_modificar,
        cups_sin_cambios=cups_sin_cambios,
        cups_huerfanos_local=cups_huerfanos_local,
        cts_muestra=(nuevos_ct + modificar_ct)[:10],
        cups_muestra=(nuevos_cups + modificar_cups)[:10],
    )


def execute_import(db: Session, empresa_id: int) -> "GisceExecuteResult":
    """Aplica el import real desde GISCE: UPDATE id_externo_gisce en CTs.

    Alcance Paquete 8f-4 inicial:
      - SOLO CTs: UPDATE stg_concentrador.id_externo_gisce con el id GISCE
        para los CTs que matcheen por id_ct == giscedata.cts.name.
      - NO crea CTs nuevos (los 3 con formato XX/PFR sin PLC fisico).
      - NO toca CUPS (pendiente de pestana 'Equipos de Medida').

    Matching identico al preview:
      1. id_externo_gisce ya poblado -> match directo
      2. id_ct == giscedata.cts.name -> fallback

    Idempotente: re-ejecutar es seguro, los ya enlazados van a
    cts_sin_cambios.

    Transaccion unica: si algo falla, rollback total.
    """
    from datetime import datetime
    from app.stg.models import StgConcentrador
    from .schemas import GiscePreviewItem

    cfg = leer_config(db, empresa_id)
    if cfg is None:
        return GisceExecuteResult(
            ok=False,
            error="No hay configuracion GISCE guardada para esta empresa.",
        )

    cli = _build_client_from_config(cfg)

    # 1. Traer CTs remotos
    try:
        cts_remoto = cli.search_read(
            "giscedata.cts",
            fields=["id", "name", "active"],
        )
    except GisceAuthError as exc:
        return GisceExecuteResult(ok=False, error=f"Credenciales rechazadas: {exc}")
    except GisceConnectionError as exc:
        return GisceExecuteResult(ok=False, error=f"No se pudo contactar con GISCE: {exc}")
    except GisceError as exc:
        return GisceExecuteResult(ok=False, error=f"Error GISCE: {exc}")

    # 2. Cargar CTs locales
    cts_local = (
        db.query(StgConcentrador)
        .filter(StgConcentrador.empresa_id == empresa_id)
        .all()
    )

    # 3. Indices para lookup (mismo criterio que preview)
    cts_local_by_id_externo = {
        c.id_externo_gisce: c for c in cts_local if c.id_externo_gisce is not None
    }
    cts_local_by_id_ct = {c.id_ct: c for c in cts_local if c.id_ct is not None}

    cts_remoto_ids = {ct["id"] for ct in cts_remoto}
    cts_remoto_codigos = {ct["name"] for ct in cts_remoto}

    # 4. Recorrer GISCE y aplicar UPDATEs
    cts_actualizados = 0
    cts_sin_cambios = 0
    cts_skipped_nuevos = 0
    actualizados_muestra: list[GiscePreviewItem] = []
    skipped_nuevos_muestra: list[GiscePreviewItem] = []

    try:
        for ct in cts_remoto:
            codigo = ct["name"]
            local = cts_local_by_id_externo.get(ct["id"]) or cts_local_by_id_ct.get(codigo)

            if local is None:
                # CT nuevo en GISCE, no esta en BD -> skip (no creamos)
                cts_skipped_nuevos += 1
                if len(skipped_nuevos_muestra) < 10:
                    skipped_nuevos_muestra.append(GiscePreviewItem(
                        codigo=codigo, accion="skipped_nuevo",
                        detalle=f"GISCE id={ct['id']}, no presente en stg_concentrador",
                    ))
                continue

            if local.id_externo_gisce == ct["id"]:
                # Ya enlazado -> sin cambios (idempotencia)
                cts_sin_cambios += 1
                continue

            # Hay cambio: poblar id_externo_gisce
            valor_anterior = local.id_externo_gisce
            local.id_externo_gisce = ct["id"]
            cts_actualizados += 1
            if len(actualizados_muestra) < 10:
                detalle = (
                    f"id_externo_gisce NULL->{ct['id']}"
                    if valor_anterior is None
                    else f"id_externo_gisce {valor_anterior}->{ct['id']}"
                )
                actualizados_muestra.append(GiscePreviewItem(
                    codigo=codigo, accion="actualizado",
                    detalle=detalle,
                ))

        # 5. Contar huerfanos locales (informativo, no se modifican)
        cts_skipped_huerfanos = sum(
            1 for c in cts_local
            if (c.id_ct is None or c.id_ct not in cts_remoto_codigos)
            and (c.id_externo_gisce is None or c.id_externo_gisce not in cts_remoto_ids)
        )

        # 6. Actualizar metadata de la config
        ahora = datetime.utcnow()
        cfg.ultimo_import = ahora
        cfg.estado = "ok"
        cfg.ultimo_error = None

        db.commit()

    except Exception as exc:
        db.rollback()
        return GisceExecuteResult(
            ok=False,
            error=f"Error aplicando cambios: {exc}",
        )

    return GisceExecuteResult(
        ok=True,
        cts_remoto_total=len(cts_remoto),
        cts_local_total=len(cts_local),
        cts_actualizados=cts_actualizados,
        cts_sin_cambios=cts_sin_cambios,
        cts_skipped_nuevos=cts_skipped_nuevos,
        cts_skipped_huerfanos=cts_skipped_huerfanos,
        cts_actualizados_muestra=actualizados_muestra,
        cts_skipped_nuevos_muestra=skipped_nuevos_muestra,
        fecha_import=ahora,
    )
