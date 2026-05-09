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