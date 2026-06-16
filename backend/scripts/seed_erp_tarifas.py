#!/usr/bin/env python
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportCallIssue=false, reportAttributeAccessIssue=false, reportAssignmentType=false
"""
Seed de catálogos ERP: tarifas de acceso + periodos (E-6a).

Fuente: CNMC Circular 3/2020 (art. 6) — estructura 2.0TD…6.4TD + peaje VE.
Códigos REE: gestionatr TABLA_17. Idempotente: actualiza la tarifa si existe
y solo inserta los periodos que falten.

Uso:
    cd ~/Proyectos/APP_Medidas/backend
    source .venv/bin/activate
    python scripts/seed_erp_tarifas.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Asegura imports "from app..." aunque se ejecute desde /scripts
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.erp.models import ErpTarifa, ErpTarifaPeriodo  # noqa: E402

REFERENCIA = "CNMC Circular 3/2020 art. 6"
VIGENCIA_DESDE = date(2021, 6, 1)

# codigo, descripcion, codigo_ree (TABLA_17), nivel, nE, nP, orden
TARIFAS = [
    ("2.0TD",   "BT hasta 15 kW",                 "018", "BT", 3, 2, 1),
    ("3.0TD",   "BT más de 15 kW",                "019", "BT", 6, 6, 2),
    ("3.0TDVE", "BT recarga vehículo eléctrico",  "024", "BT", 6, 6, 3),
    ("6.1TD",   "AT 1–30 kV",                     "020", "AT", 6, 6, 4),
    ("6.2TD",   "AT 30–72,5 kV",                  "021", "AT", 6, 6, 5),
    ("6.3TD",   "AT 72,5–145 kV",                 "022", "AT", 6, 6, 6),
    ("6.4TD",   "AT ≥ 145 kV",                    "023", "AT", 6, 6, 7),
]

# Descripción de periodos de energía solo para 2.0TD (punta/llano/valle)
DESC_2_0TD_ENERGIA = {1: "punta", 2: "llano", 3: "valle"}


def main() -> int:
    settings = get_settings()
    if not settings.DATABASE_URL:
        print("ERROR: DATABASE_URL no está configurada")
        return 1

    engine = create_engine(settings.DATABASE_URL, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    db = SessionLocal()

    creadas = actualizadas = periodos_nuevos = 0
    try:
        for codigo, desc, ree, nivel, n_e, n_p, orden in TARIFAS:
            t = db.query(ErpTarifa).filter(ErpTarifa.codigo == codigo).one_or_none()
            if t is None:
                t = ErpTarifa(
                    codigo=codigo,
                    descripcion=desc,
                    codigo_ree=ree,
                    nivel_tension=nivel,
                    num_periodos_energia=n_e,
                    num_periodos_potencia=n_p,
                    referencia_normativa=REFERENCIA,
                    vigencia_desde=VIGENCIA_DESDE,
                    orden=orden,
                    activo=True,
                )
                db.add(t)
                db.flush()  # asigna t.id
                creadas += 1
            else:
                # Actualiza por si cambió algo (no duplica, conserva id/periodos)
                t.descripcion = desc
                t.codigo_ree = ree
                t.nivel_tension = nivel
                t.num_periodos_energia = n_e
                t.num_periodos_potencia = n_p
                t.referencia_normativa = REFERENCIA
                t.vigencia_desde = VIGENCIA_DESDE
                t.orden = orden
                actualizadas += 1

            # Periodos: inserta solo los que falten
            existentes = {
                (p.periodo, p.tipo)
                for p in db.query(ErpTarifaPeriodo).filter(ErpTarifaPeriodo.tarifa_id == t.id).all()
            }
            for tipo, n in (("energia", n_e), ("potencia", n_p)):
                for i in range(1, n + 1):
                    periodo = f"P{i}"
                    if (periodo, tipo) in existentes:
                        continue
                    descripcion = None
                    if codigo == "2.0TD" and tipo == "energia":
                        descripcion = DESC_2_0TD_ENERGIA.get(i)
                    db.add(ErpTarifaPeriodo(
                        tarifa_id=t.id,
                        periodo=periodo,
                        tipo=tipo,
                        orden=i,
                        descripcion=descripcion,
                    ))
                    periodos_nuevos += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(f"OK · tarifas creadas={creadas}, actualizadas={actualizadas}, periodos nuevos={periodos_nuevos}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())