# app/envios/services_respuestas_ree.py
# pyright: reportMissingImports=false
"""
Búsqueda de respuestas REE (.ok / .bad) para envíos AGRECL/INMECL/MAGCL.

Escanea la `carpeta_entrada_general` configurada en cada FtpConfig activa
del tenant. Para cada fichero `.ok.bz2` o `.bad{N}.bz2` que encuentra:
  - Lo parsea con `parsear_nombre_envio` para extraer metadatos
  - Busca el envío original en envios_m por nombre de fichero base
  - Si llega .ok:
      - Marca el envío como estado_ree='ok' (idempotente)
      - Borra de envios_m todas las filas con estado='bad' previas del
        mismo (tipo + empresa + comerc + periodo) — el .bad ya no es
        relevante una vez tenemos el .ok
  - Si llega .bad{N}:
      - Marca el envío como estado_ree='bad', estado_ree_n=N
      - Incrementa reintentos si N cambió
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig
from app.comunicaciones.services import (
    _conectar_en_path,
    _parse_list_line,
    _resolver_directorio,
)
from app.envios.models import EnvioM
from app.envios.parser import parsear_nombre_envio
from app.envios.automatizacion.services_alertas import (
    auto_resolver_alertas_respuesta_ree_por_ok,
    crear_alerta_respuesta_ree_bad,
)


# ── Resultado agregado de la búsqueda ─────────────────────────────────────────

class _ResultadoBusqueda:
    def __init__(self) -> None:
        self.respuestas_revisadas: int = 0  # ficheros .ok/.bad escaneados
        self.ok_marcados: int = 0           # envíos pasados a estado 'ok'
        self.bad_marcados: int = 0          # envíos pasados a estado 'bad'
        self.bad_borrados: int = 0          # filas .bad eliminadas tras un .ok
        self.errores: List[str] = []        # errores por conexión

    def to_dict(self) -> dict:
        return {
            "respuestas_revisadas": self.respuestas_revisadas,
            "ok_marcados": self.ok_marcados,
            "bad_marcados": self.bad_marcados,
            "bad_borrados": self.bad_borrados,
            "errores": self.errores,
        }


# ── Helper: construir nombre original a partir del nombre de la respuesta ──

def _nombre_base_original(nombre_respuesta: str) -> Optional[str]:
    """
    Convierte el nombre de una respuesta REE en el nombre del fichero original.
    Ejemplos:
      INMECL_..._20251229.0.ok.bz2     → INMECL_..._20251229.0.bz2
      INMECL_..._20251229.0.bad2.bz2   → INMECL_..._20251229.0.bz2
      AGRECL_0277_20251229.0.ok.bz2    → AGRECL_0277_20251229.0.bz2
    Devuelve None si el patrón no encaja.
    """
    if not nombre_respuesta.endswith(".bz2"):
        return None
    sin_bz2 = nombre_respuesta[:-4]  # quitar ".bz2"
    # Buscar ".ok" o ".bad{N}" al final
    for sufijo in (".ok",):
        if sin_bz2.endswith(sufijo):
            base = sin_bz2[: -len(sufijo)]
            return base + ".bz2"
    # ".badN" → buscar el último ".bad" seguido de dígitos
    idx = sin_bz2.rfind(".bad")
    if idx > 0:
        resto = sin_bz2[idx + 4:]  # lo que va tras ".bad"
        if resto == "" or resto.isdigit():
            base = sin_bz2[:idx]
            return base + ".bz2"
    return None


# ── Procesar una respuesta concreta ───────────────────────────────────────────

def _procesar_respuesta(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    nombre_respuesta: str,
    res: _ResultadoBusqueda,
) -> None:
    """
    Procesa un fichero .ok / .bad encontrado en el SFTP. Busca el envío
    original en BD y actualiza su estado. Idempotente.
    """
    parsed = parsear_nombre_envio(nombre_respuesta)
    if parsed is None or not parsed.es_respuesta:
        return

    nombre_original = _nombre_base_original(nombre_respuesta)
    if not nombre_original:
        return

    envio = (
        db.query(EnvioM)
        .filter(
            EnvioM.tenant_id == tenant_id,
            EnvioM.empresa_id == empresa_id,
            EnvioM.nombre_fichero == nombre_original,
        )
        .first()
    )
    if envio is None:
        # Respuesta para un envío que no tenemos registrado → ignorar
        return

    # Extraer valores en variables locales para que Pylance los trate como
    # tipos nativos en lugar de Column[X]
    estado_actual = getattr(envio, "estado_ree", None)
    estado_n_actual = getattr(envio, "estado_ree_n", None)
    envio_tipo = getattr(envio, "tipo", None)
    envio_comerc = getattr(envio, "comercializadora_codigo", None)
    envio_anio = getattr(envio, "periodo_anio", None)
    envio_mes = getattr(envio, "periodo_mes", None)
    envio_id = int(getattr(envio, "id"))
    reintentos_actuales = getattr(envio, "reintentos", None) or 0

    res.respuestas_revisadas += 1
    ahora = datetime.utcnow()

    if parsed.respuesta_tipo == "ok":
        # Idempotencia: si ya está como ok, no hacemos nada
        if estado_actual == "ok":
            return
        # Recordamos si era un .bad antes (para auto-resolver alertas)
        era_bad_antes = (estado_actual == "bad")

        envio.estado_ree = "ok"  # type: ignore
        envio.estado_ree_n = None  # type: ignore
        envio.respuesta_recibida_at = ahora  # type: ignore
        envio.respuesta_nombre_fichero = nombre_respuesta  # type: ignore
        envio.updated_at = ahora  # type: ignore
        res.ok_marcados += 1

        # Auto-resolver alertas respuesta_ree si este envío estaba marcado como bad
        if era_bad_antes:
            envio_m_clas = getattr(envio, "m_clasificacion", None)
            envio_subido = getattr(envio, "subido_sftp_at", None)
            if envio_m_clas and envio_subido is not None:
                try:
                    periodo_envio = f"{envio_subido.year:04d}-{envio_subido.month:02d}"
                    auto_resolver_alertas_respuesta_ree_por_ok(
                        db,
                        tenant_id=tenant_id,
                        empresa_id=empresa_id,
                        m_clas=str(envio_m_clas),
                        periodo_envio=periodo_envio,
                        nombre_fichero_original=str(getattr(envio, "nombre_fichero", "")),
                    )
                except Exception:
                    pass

        # Borrar todas las filas .bad previas del mismo (tipo+empresa+comerc+periodo)
        # — la respuesta .ok hace obsoletos todos los .bad de la misma "serie"
        q_bad = db.query(EnvioM).filter(
            EnvioM.tenant_id == tenant_id,
            EnvioM.empresa_id == empresa_id,
            EnvioM.tipo == envio_tipo,
            EnvioM.estado_ree == "bad",
            EnvioM.id != envio_id,
        )
        # comerc/periodo pueden ser NULL en AGRECL → comparar adecuadamente
        if envio_comerc is None:
            q_bad = q_bad.filter(EnvioM.comercializadora_codigo.is_(None))
        else:
            q_bad = q_bad.filter(EnvioM.comercializadora_codigo == envio_comerc)
        if envio_anio is None:
            q_bad = q_bad.filter(EnvioM.periodo_anio.is_(None))
        else:
            q_bad = q_bad.filter(EnvioM.periodo_anio == envio_anio)
        if envio_mes is None:
            q_bad = q_bad.filter(EnvioM.periodo_mes.is_(None))
        else:
            q_bad = q_bad.filter(EnvioM.periodo_mes == envio_mes)

        borrados = q_bad.count()
        if borrados:
            q_bad.delete(synchronize_session=False)
            res.bad_borrados += borrados

        db.commit()

    elif parsed.respuesta_tipo == "bad":
        n_nuevo = parsed.respuesta_n or 1
        # Idempotencia: si ya está como bad con el mismo N, no hacemos nada
        if estado_actual == "bad" and (estado_n_actual or 0) == n_nuevo:
            return
        n_anterior: Optional[int] = estado_n_actual if estado_actual == "bad" else None
        envio.estado_ree = "bad"  # type: ignore
        envio.estado_ree_n = n_nuevo  # type: ignore
        envio.respuesta_recibida_at = ahora  # type: ignore
        envio.respuesta_nombre_fichero = nombre_respuesta  # type: ignore
        envio.updated_at = ahora  # type: ignore
        if n_anterior is None or n_nuevo > n_anterior:
            envio.reintentos = reintentos_actuales + 1  # type: ignore
        res.bad_marcados += 1

        # Crear/actualizar alerta de tipo respuesta_ree para este .bad nuevo
        envio_m_clas = getattr(envio, "m_clasificacion", None)
        envio_subido = getattr(envio, "subido_sftp_at", None)
        if envio_m_clas and envio_subido is not None:
            try:
                periodo_envio = f"{envio_subido.year:04d}-{envio_subido.month:02d}"
                crear_alerta_respuesta_ree_bad(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    m_clas=str(envio_m_clas),
                    periodo_envio=periodo_envio,
                    nombre_fichero=str(getattr(envio, "nombre_fichero", "")),
                    bad_n=n_nuevo,
                )
            except Exception:
                # Si falla la creación de alerta, NO bloqueamos el marcado del envío
                pass

        db.commit()


# ── Buscar respuestas en una conexión FTP ─────────────────────────────────────

def _buscar_respuestas_en_config(
    db: Session,
    *,
    config: FtpConfig,
    tenant_id: int,
    res: _ResultadoBusqueda,
) -> None:
    """
    Lista la `carpeta_entrada_general` de una conexión activa, encuentra
    los ficheros .ok / .bad que parsean como AGRECL/INMECL/MAGCL y los
    procesa contra envios_m.
    """
    carpeta = (config.carpeta_entrada_general or "").strip()
    if not carpeta:
        return  # sin carpeta configurada → skip silencioso

    # Resolver plantillas {mes_actual}/{mes_anterior}
    carpeta_resuelta = _resolver_directorio(carpeta)

    try:
        ftp = _conectar_en_path(config, carpeta_resuelta)
    except Exception as e:
        res.errores.append(
            f"[{config.nombre or config.host}] No se pudo conectar a {carpeta_resuelta}: {str(e)[:150]}"
        )
        return

    try:
        lineas: List[str] = []
        ftp.retrlines("LIST", lineas.append)
    except Exception as e:
        res.errores.append(
            f"[{config.nombre or config.host}] Error listando {carpeta_resuelta}: {str(e)[:150]}"
        )
        try:
            ftp.quit()
        except Exception:
            pass
        return
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    empresa_id_int = int(getattr(config, "empresa_id"))
    label = str(getattr(config, "nombre", None) or getattr(config, "host", "?"))

    for linea in lineas:
        parsed_line = _parse_list_line(linea)
        if not parsed_line or parsed_line["tipo"] != "file":
            continue
        nombre = parsed_line["nombre"]
        # Atajo para no parsear ficheros que no son respuestas
        if not (".ok" in nombre or ".bad" in nombre):
            continue
        try:
            _procesar_respuesta(
                db,
                tenant_id=tenant_id,
                empresa_id=empresa_id_int,
                nombre_respuesta=nombre,
                res=res,
            )
        except Exception as e:
            db.rollback()
            res.errores.append(f"[{label}] {nombre}: {str(e)[:150]}")


# ── Punto de entrada público ──────────────────────────────────────────────────

def buscar_respuestas_envios_tenant(db: Session, *, tenant_id: int) -> dict:
    """
    Busca respuestas REE en TODAS las conexiones FTP activas del tenant.
    Devuelve un resumen agregado con contadores y errores por conexión.
    """
    res = _ResultadoBusqueda()

    configs = (
        db.query(FtpConfig)
        .filter(FtpConfig.tenant_id == tenant_id, FtpConfig.activo.is_(True))
        .all()
    )
    for config in configs:
        try:
            _buscar_respuestas_en_config(db, config=config, tenant_id=tenant_id, res=res)
        except Exception as e:
            db.rollback()
            res.errores.append(
                f"[{config.nombre or config.host}] Error inesperado: {str(e)[:150]}"
            )

    return res.to_dict()