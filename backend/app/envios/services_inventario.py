# app/envios/services_inventario.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.empresas.models import Empresa
from app.envios.models import EnvioInventario


# ── Helper ────────────────────────────────────────────────────────────────────

def _nombre_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return str(getattr(emp, "nombre", "") or f"Empresa {empresa_id}") if emp else f"Empresa {empresa_id}"


def _envio_inventario_to_dict(db: Session, e: EnvioInventario) -> dict:
    """
    Convierte un EnvioInventario a dict listo para la API. Traduce
    estado_ree NULL a 'pendiente' para que el frontend tenga siempre
    un valor mostrable.
    """
    estado_raw = getattr(e, "estado_ree", None)
    estado = str(estado_raw) if estado_raw else "pendiente"
    empresa_id_int = int(getattr(e, "empresa_id"))
    return {
        "id": e.id,
        "empresa_id": e.empresa_id,
        "empresa_nombre": _nombre_empresa(db, empresa_id_int),
        "codigo_ree_empresa": e.codigo_ree_empresa,
        "tipo": e.tipo,
        "frecuencia": e.frecuencia,
        "fecha_generacion": e.fecha_generacion,
        "version": e.version,
        "nombre_fichero": e.nombre_fichero,
        "subido_sftp_at": e.subido_sftp_at,
        "estado_ree": estado,
        "estado_ree_n": e.estado_ree_n,
        "respuesta_recibida_at": e.respuesta_recibida_at,
        "respuesta_nombre_fichero": e.respuesta_nombre_fichero,
        "reintentos": e.reintentos,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }


# ── Listar histórico de inventario ───────────────────────────────────────────

def list_envios_inventario(
    db: Session,
    *,
    tenant_id: int,
    empresa_ids: Optional[List[int]] = None,
    tipos: Optional[List[str]] = None,
    frecuencias: Optional[List[str]] = None,
    estados: Optional[List[str]] = None,
    meses: Optional[List[tuple[int, int]]] = None,  # lista de (anio, mes)
    limit: int = 500,
) -> List[dict]:
    """
    Devuelve el histórico de envíos de inventario filtrado.

    Filtros (todos son listas multi-select):
      - empresa_ids:  IDs de empresa
      - tipos:        AUTOCONSUMO / CUPSCAU / CUPS45 / CUPSDAT
      - frecuencias:  'mensual' / 'diario'
      - estados:      'pendiente' (NULL en BD) / 'ok' / 'bad'
      - meses:        lista de tuplas (anio, mes) — filtra por
                      fecha_generacion que caiga en ese mes

    Orden: subido_sftp_at descendente (más reciente primero).
    """
    from sqlalchemy import extract, or_, and_

    q = db.query(EnvioInventario).filter(EnvioInventario.tenant_id == tenant_id)

    if empresa_ids:
        q = q.filter(EnvioInventario.empresa_id.in_(empresa_ids))

    if tipos:
        q = q.filter(EnvioInventario.tipo.in_(tipos))

    if frecuencias:
        q = q.filter(EnvioInventario.frecuencia.in_(frecuencias))

    # Estado — "pendiente" en API = NULL en BD
    if estados:
        clauses = []
        if "pendiente" in estados:
            clauses.append(EnvioInventario.estado_ree.is_(None))
        no_pend = [e for e in estados if e != "pendiente"]
        if no_pend:
            clauses.append(EnvioInventario.estado_ree.in_(no_pend))
        if clauses:
            q = q.filter(or_(*clauses))

    # Meses — cada (anio, mes) matchea si fecha_generacion cae en él
    if meses:
        mes_clauses = []
        for anio, mes in meses:
            mes_clauses.append(
                and_(
                    extract("year",  EnvioInventario.fecha_generacion) == anio,
                    extract("month", EnvioInventario.fecha_generacion) == mes,
                )
            )
        if mes_clauses:
            q = q.filter(or_(*mes_clauses))

    rows = q.order_by(EnvioInventario.subido_sftp_at.desc()).limit(limit).all()
    return [_envio_inventario_to_dict(db, r) for r in rows]


# ── Contadores para badges ───────────────────────────────────────────────────

def count_envios_inventario(
    db: Session,
    *,
    tenant_id: int,
) -> dict:
    """
    Devuelve contadores agregados para mostrar como badges en la cabecera
    de la pestaña Inventario.

    Returns:
      { total, pendiente, ok, bad }
    """
    q = db.query(EnvioInventario).filter(EnvioInventario.tenant_id == tenant_id)

    total = q.count()
    pendiente = q.filter(EnvioInventario.estado_ree.is_(None)).count()
    ok = q.filter(EnvioInventario.estado_ree == "ok").count()
    bad = q.filter(EnvioInventario.estado_ree == "bad").count()
    return {"total": total, "pendiente": pendiente, "ok": ok, "bad": bad}


# ── Lista de meses (anio, mes) con al menos un envío de inventario ────────────

def list_meses_disponibles_inventario(
    db: Session,
    *,
    tenant_id: int,
) -> List[dict]:
    """
    Devuelve los meses (anio, mes) que tienen al menos un envío de
    inventario en BD, basándose en fecha_generacion.
    Útil para poblar el selector "Mes generación" del histórico.
    Orden: más recientes primero.
    """
    from sqlalchemy import extract

    rows = (
        db.query(
            extract("year",  EnvioInventario.fecha_generacion).label("anio"),
            extract("month", EnvioInventario.fecha_generacion).label("mes"),
        )
        .filter(
            EnvioInventario.tenant_id == tenant_id,
            EnvioInventario.fecha_generacion.isnot(None),
        )
        .distinct()
        .all()
    )

    pares = sorted(
        {(int(r.anio), int(r.mes)) for r in rows if r.anio is not None and r.mes is not None},
        reverse=True,
    )
    return [{"anio": a, "mes": m} for a, m in pares]


# ── Borrado de un envío de inventario (solo BD) ───────────────────────────────

def delete_envio_inventario(
    db: Session,
    *,
    tenant_id: int,
    envio_id: int,
) -> None:
    """
    Borra un envío de la tabla `envios_inventario`. NO toca el SFTP.
    Lanza ValueError si no existe o pertenece a otro tenant.
    """
    envio = (
        db.query(EnvioInventario)
        .filter(EnvioInventario.id == envio_id, EnvioInventario.tenant_id == tenant_id)
        .first()
    )
    if envio is None:
        raise ValueError(f"Envío de inventario {envio_id} no encontrado")
    db.delete(envio)
    db.commit()


# ── Descarga del fichero original o respuesta REE ─────────────────────────────

def descargar_fichero_envio_inventario(
    db: Session,
    *,
    tenant_id: int,
    envio_id: int,
    tipo: str,
) -> tuple[bytes, str]:
    """
    Descarga del SFTP el fichero asociado a un envío de inventario.

    `tipo`:
      - `original`    → carpeta_salida_general + envio.nombre_fichero
      - `respuesta`   → carpeta_entrada_general + envio.respuesta_nombre_fichero

    Devuelve (contenido_binario, nombre_fichero).
    Lanza ValueError si no existe el envío, no hay carpeta configurada,
    o no hay respuesta registrada (en el caso de tipo=respuesta).
    """
    # 1. Localizar el envío
    envio = (
        db.query(EnvioInventario)
        .filter(EnvioInventario.id == envio_id, EnvioInventario.tenant_id == tenant_id)
        .first()
    )
    if envio is None:
        raise ValueError(f"Envío de inventario {envio_id} no encontrado")

    # 2. Determinar carpeta y fichero según el tipo
    empresa_id_int = int(getattr(envio, "empresa_id"))
    if tipo == "original":
        nombre_fichero = str(getattr(envio, "nombre_fichero"))
        carpeta_attr = "carpeta_salida_general"
    elif tipo == "respuesta":
        respuesta_nombre = getattr(envio, "respuesta_nombre_fichero", None)
        if not respuesta_nombre:
            raise ValueError("Este envío todavía no tiene respuesta REE registrada")
        nombre_fichero = str(respuesta_nombre)
        carpeta_attr = "carpeta_entrada_general"
    else:
        raise ValueError(f"Tipo '{tipo}' no válido")

    # 3. Buscar la FtpConfig activa de la empresa del envío
    from app.comunicaciones.models import FtpConfig
    from app.comunicaciones.services import (
        _resolver_directorio,
        leer_fichero_ftp,
    )

    config = (
        db.query(FtpConfig)
        .filter(
            FtpConfig.tenant_id == tenant_id,
            FtpConfig.empresa_id == empresa_id_int,
            FtpConfig.activo.is_(True),
        )
        .first()
    )
    if config is None:
        raise ValueError(
            "No hay conexión FTP activa para la empresa de este envío"
        )

    carpeta_raw = getattr(config, carpeta_attr, None)
    if not carpeta_raw:
        nombre_legible = (
            "carpeta_salida_general" if tipo == "original" else "carpeta_entrada_general"
        )
        raise ValueError(
            f"La conexión FTP no tiene configurada `{nombre_legible}` — "
            f"configúrala en Comunicaciones → Conexiones FTP"
        )

    # 4. Resolver plantillas {mes_actual}/{mes_anterior} y descargar
    carpeta_resuelta = _resolver_directorio(str(carpeta_raw).strip())
    config_id_int = int(getattr(config, "id"))
    contenido = leer_fichero_ftp(
        db,
        config_id=config_id_int,
        tenant_id=tenant_id,
        path=carpeta_resuelta,
        fichero=nombre_fichero,
        registrar=False,  # no contaminar el log de Comunicaciones
    )
    return contenido, nombre_fichero