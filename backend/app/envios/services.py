# app/envios/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.empresas.models import Empresa
from app.envios.models import EnvioM


# ── Helper ────────────────────────────────────────────────────────────────────

def _nombre_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return str(getattr(emp, "nombre", "") or f"Empresa {empresa_id}") if emp else f"Empresa {empresa_id}"


def _envio_to_dict(db: Session, e: EnvioM) -> dict:
    """
    Convierte un EnvioM a dict listo para la API. Traduce estado_ree NULL
    a 'pendiente' para que el frontend tenga siempre un valor mostrable.
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
        "comercializadora_codigo": e.comercializadora_codigo,
        "periodo_anio": e.periodo_anio,
        "periodo_mes": e.periodo_mes,
        "fecha_generacion": e.fecha_generacion,
        "version": e.version,
        "m_clasificacion": e.m_clasificacion,
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


# ── Listar histórico de envíos ───────────────────────────────────────────────

def list_envios(
    db: Session,
    *,
    tenant_id: int,
    m_clasificacion: Optional[str] = None,
    empresa_id: Optional[int] = None,
    tipo: Optional[str] = None,
    periodo_anio: Optional[int] = None,
    periodo_mes: Optional[int] = None,
    estado: Optional[str] = None,
    limit: int = 500,
) -> List[dict]:
    """
    Devuelve el histórico de envíos filtrado por los criterios indicados.

    Filtros:
      - m_clasificacion: 'M1' / 'M2' / 'M7'
      - empresa_id: id de empresa
      - tipo: 'AGRECL' / 'INMECL' / 'MAGCL'
      - periodo_anio / periodo_mes: filtran por mes de los datos
      - estado: 'pendiente' (NULL en BD) / 'ok' / 'bad'

    Orden: subido_sftp_at descendente (más reciente primero).
    """
    q = db.query(EnvioM).filter(EnvioM.tenant_id == tenant_id)

    if m_clasificacion:
        q = q.filter(EnvioM.m_clasificacion == m_clasificacion)
    if empresa_id is not None:
        q = q.filter(EnvioM.empresa_id == empresa_id)
    if tipo:
        q = q.filter(EnvioM.tipo == tipo)
    if periodo_anio is not None:
        q = q.filter(EnvioM.periodo_anio == periodo_anio)
    if periodo_mes is not None:
        q = q.filter(EnvioM.periodo_mes == periodo_mes)
    if estado:
        if estado == "pendiente":
            q = q.filter(EnvioM.estado_ree.is_(None))
        else:
            q = q.filter(EnvioM.estado_ree == estado)

    rows = q.order_by(EnvioM.subido_sftp_at.desc()).limit(limit).all()
    return [_envio_to_dict(db, r) for r in rows]


# ── Contadores rápidos para badges del histórico ─────────────────────────────

def count_envios(
    db: Session,
    *,
    tenant_id: int,
    m_clasificacion: Optional[str] = None,
) -> dict:
    """
    Devuelve contadores agregados para mostrar como badges en la cabecera
    de la tarjeta del histórico.

    Returns:
      { total, pendiente, ok, bad }
    """
    q = db.query(EnvioM).filter(EnvioM.tenant_id == tenant_id)
    if m_clasificacion:
        q = q.filter(EnvioM.m_clasificacion == m_clasificacion)

    total = q.count()
    pendiente = q.filter(EnvioM.estado_ree.is_(None)).count()
    ok = q.filter(EnvioM.estado_ree == "ok").count()
    bad = q.filter(EnvioM.estado_ree == "bad").count()
    return {"total": total, "pendiente": pendiente, "ok": ok, "bad": bad}


# ── Lista de periodos (anio, mes) con al menos un envío ───────────────────────

def list_periodos_disponibles(
    db: Session,
    *,
    tenant_id: int,
    m_clasificacion: Optional[str] = None,
) -> List[dict]:
    """
    Devuelve los periodos (anio, mes) que tienen al menos un envío en BD.
    Útil para poblar el selector "Periodo" del histórico sin mostrar
    opciones vacías. Orden: más recientes primero.
    """
    q = (
        db.query(EnvioM.periodo_anio, EnvioM.periodo_mes)
        .filter(
            EnvioM.tenant_id == tenant_id,
            EnvioM.periodo_anio.isnot(None),
            EnvioM.periodo_mes.isnot(None),
        )
    )
    if m_clasificacion:
        q = q.filter(EnvioM.m_clasificacion == m_clasificacion)

    rows = q.distinct().all()
    # Filtramos None defensivamente y ordenamos descendente
    pares = sorted(
        {(int(a), int(m)) for a, m in rows if a is not None and m is not None},
        reverse=True,
    )
    return [{"anio": a, "mes": m} for a, m in pares]


# ── Borrado de un envío del histórico (solo BD) ───────────────────────────────

def delete_envio(
    db: Session,
    *,
    tenant_id: int,
    envio_id: int,
) -> None:
    """
    Borra un envío de la tabla `envios_m`. NO toca el SFTP.
    Lanza ValueError si no existe o pertenece a otro tenant.
    """
    envio = (
        db.query(EnvioM)
        .filter(EnvioM.id == envio_id, EnvioM.tenant_id == tenant_id)
        .first()
    )
    if envio is None:
        raise ValueError(f"Envío {envio_id} no encontrado")
    db.delete(envio)
    db.commit()


# ── Descarga del fichero enviado (original) o respuesta REE (.ok/.bad) ────────

def descargar_fichero_envio(
    db: Session,
    *,
    tenant_id: int,
    envio_id: int,
    tipo: str,
) -> tuple[bytes, str]:
    """
    Descarga del SFTP el fichero asociado a un envío.

    `tipo`:
      - `original`    → carpeta_salida_general + envio.nombre_fichero
      - `respuesta`   → carpeta_entrada_general + envio.respuesta_nombre_fichero

    Devuelve (contenido_binario, nombre_fichero).
    Lanza ValueError si no existe el envío, no hay carpeta configurada,
    o no hay respuesta registrada (en el caso de tipo=respuesta).
    """
    # 1. Localizar el envío
    envio = (
        db.query(EnvioM)
        .filter(EnvioM.id == envio_id, EnvioM.tenant_id == tenant_id)
        .first()
    )
    if envio is None:
        raise ValueError(f"Envío {envio_id} no encontrado")

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