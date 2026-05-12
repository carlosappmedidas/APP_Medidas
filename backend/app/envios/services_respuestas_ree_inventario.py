# app/envios/services_respuestas_ree_inventario.py
# pyright: reportMissingImports=false
"""
Búsqueda de respuestas REE (.ok / .bad) para envíos de inventario
AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT.

Espejo de `services_respuestas_ree.py` pero contra la tabla `envios_inventario`.

Escanea la `carpeta_entrada_general` configurada en cada FtpConfig activa
del tenant. Para cada fichero `.ok.bz2` o `.bad{N}.bz2` que reconoce el
parser de inventario:
  - Busca el envío original en envios_inventario por nombre de fichero base
  - Si llega .ok:
      - Marca el envío como estado_ree='ok' (idempotente)
      - Auto-resuelve alertas respuesta_ree_inventario si las había
      - Borra de envios_inventario filas .bad previas del mismo
        (tipo + empresa + fecha_generacion) — el .ok las hace obsoletas
  - Si llega .bad{N}:
      - Marca el envío como estado_ree='bad', estado_ree_n=N
      - Incrementa reintentos si N cambió
      - Crea/actualiza alerta respuesta_ree_inventario
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
from app.envios.models import EnvioInventario
from app.envios.parser_inventario import (
    parsear_nombre_inventario,
    nombre_base_original_inventario,
)
from app.envios.automatizacion.services_alertas import (
    auto_resolver_alertas_respuesta_ree_inventario_por_ok,
    crear_alerta_respuesta_ree_bad_inventario,
)


# ── Resultado agregado de la búsqueda ─────────────────────────────────────────

class _ResultadoBusqueda:
    def __init__(self) -> None:
        self.respuestas_revisadas: int = 0
        self.ok_marcados: int = 0
        self.bad_marcados: int = 0
        self.bad_borrados: int = 0
        self.errores: List[str] = []

    def to_dict(self) -> dict:
        return {
            "respuestas_revisadas": self.respuestas_revisadas,
            "ok_marcados": self.ok_marcados,
            "bad_marcados": self.bad_marcados,
            "bad_borrados": self.bad_borrados,
            "errores": self.errores,
        }


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
    original en envios_inventario y actualiza su estado. Idempotente.
    """
    parsed = parsear_nombre_inventario(nombre_respuesta)
    if parsed is None or not parsed.es_respuesta:
        return

    nombre_original = nombre_base_original_inventario(nombre_respuesta)
    if not nombre_original:
        return

    envio = (
        db.query(EnvioInventario)
        .filter(
            EnvioInventario.tenant_id == tenant_id,
            EnvioInventario.empresa_id == empresa_id,
            EnvioInventario.nombre_fichero == nombre_original,
        )
        .first()
    )
    if envio is None:
        # Respuesta para un envío que no tenemos registrado → ignorar
        return

    # Extraer valores en variables locales
    estado_actual = getattr(envio, "estado_ree", None)
    estado_n_actual = getattr(envio, "estado_ree_n", None)
    envio_tipo = getattr(envio, "tipo", None)
    envio_frecuencia = getattr(envio, "frecuencia", None)
    envio_fecha_gen = getattr(envio, "fecha_generacion", None)
    envio_id = int(getattr(envio, "id"))
    reintentos_actuales = getattr(envio, "reintentos", None) or 0

    res.respuestas_revisadas += 1
    ahora = datetime.utcnow()

    if parsed.respuesta_tipo == "ok":
        # Idempotencia: si ya está como ok, no hacemos nada
        if estado_actual == "ok":
            return
        era_bad_antes = (estado_actual == "bad")

        envio.estado_ree = "ok"  # type: ignore
        envio.estado_ree_n = None  # type: ignore
        envio.respuesta_recibida_at = ahora  # type: ignore
        envio.respuesta_nombre_fichero = nombre_respuesta  # type: ignore
        envio.updated_at = ahora  # type: ignore
        res.ok_marcados += 1

        # Auto-resolver alertas si este envío estaba marcado como bad
        if era_bad_antes and envio_frecuencia and envio_fecha_gen is not None:
            try:
                periodo_envio = f"{envio_fecha_gen.year:04d}-{envio_fecha_gen.month:02d}"
                auto_resolver_alertas_respuesta_ree_inventario_por_ok(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    frecuencia=str(envio_frecuencia),
                    periodo_envio=periodo_envio,
                    nombre_fichero_original=str(getattr(envio, "nombre_fichero", "")),
                )
            except Exception:
                pass

        # Borrar filas .bad previas del mismo (tipo + empresa + fecha_generacion)
        # — el .ok hace obsoletos todos los .bad de la misma "serie"
        q_bad = db.query(EnvioInventario).filter(
            EnvioInventario.tenant_id == tenant_id,
            EnvioInventario.empresa_id == empresa_id,
            EnvioInventario.tipo == envio_tipo,
            EnvioInventario.fecha_generacion == envio_fecha_gen,
            EnvioInventario.estado_ree == "bad",
            EnvioInventario.id != envio_id,
        )
        borrados = q_bad.count()
        if borrados:
            q_bad.delete(synchronize_session=False)
            res.bad_borrados += borrados

        db.commit()

    elif parsed.respuesta_tipo == "bad":
        n_nuevo = parsed.respuesta_n or 1
        # Idempotencia: mismo bad N ya marcado → nada
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

        # Crear/actualizar alerta de tipo respuesta_ree_inventario
        if envio_frecuencia and envio_fecha_gen is not None:
            try:
                periodo_envio = f"{envio_fecha_gen.year:04d}-{envio_fecha_gen.month:02d}"
                crear_alerta_respuesta_ree_bad_inventario(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    frecuencia=str(envio_frecuencia),
                    periodo_envio=periodo_envio,
                    nombre_fichero=str(getattr(envio, "nombre_fichero", "")),
                    bad_n=n_nuevo,
                )
            except Exception:
                # Si falla la alerta, NO bloqueamos el marcado del envío
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
    los ficheros .ok / .bad que parsean como AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT
    y los procesa contra envios_inventario.
    """
    carpeta = (config.carpeta_entrada_general or "").strip()
    if not carpeta:
        return

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
        # Atajo: solo ficheros que parecen respuesta
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

def buscar_respuestas_envios_inventario_tenant(db: Session, *, tenant_id: int) -> dict:
    """
    Busca respuestas REE de inventario en TODAS las conexiones FTP activas
    del tenant. Devuelve un resumen agregado con contadores y errores.
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