#!/usr/bin/env python
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportCallIssue=false, reportAttributeAccessIssue=false, reportAssignmentType=false
"""
Seed de catalogos de normativa CNMC (direccion): tipo de via, piso, puerta,
tipo de aclarador de finca.

Fuente: CNMC "Tablas de codigos" (Tablas 12/14/15/16) + SIPS CNMC 4.0.
Idempotente: si el codigo existe, actualiza descripcion/orden/activo; si no,
lo inserta. orden = orden oficial de la tabla CNMC (no alfabetico).

Uso:
    cd ~/Proyectos/APP_Medidas/backend
    source .venv/bin/activate
    python scripts/seed_erp_cnmc.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.erp.models import (  # noqa: E402
    ErpCnmcTipoVia, ErpCnmcPiso, ErpCnmcPuerta, ErpCnmcAclaradorFinca,
    ErpCnmcTipoPuntoMedida, ErpCnmcPropiedadAparato, ErpCnmcTelegestion,
)

# (codigo, descripcion) en ORDEN oficial de la tabla CNMC
TIPO_VIA = [
    ("AC", "Acceso"),
    ("AD", "Aldea"),
    ("AF", "Afueras"),
    ("AG", "Agrupación"),
    ("AL", "Alameda"),
    ("AR", "Arrabal"),
    ("AU", "Autopista / Autovía"),
    ("AV", "Avenida"),
    ("BC", "Barranco"),
    ("BD", "Barriada"),
    ("BL", "Bloque"),
    ("BO", "Barrio"),
    ("CA", "Colonia"),
    ("CF", "Callejón"),
    ("CH", "Chalet"),
    ("CI", "Carril"),
    ("CJ", "Calleja"),
    ("CL", "Calle"),
    ("CM", "Complejo"),
    ("CN", "Camino"),
    ("CO", "Cooperativa"),
    ("CR", "Carretera"),
    ("CS", "Casa"),
    ("CT", "Cuesta"),
    ("DI", "Diseminado extrarradio"),
    ("ED", "Edificio"),
    ("EN", "Entrada"),
    ("FC", "Finca"),
    ("FI", "Ficticio"),
    ("GL", "Glorieta"),
    ("GR", "Grupo"),
    ("LG", "Lugar"),
    ("MA", "Masía"),
    ("MU", "Muelle"),
    ("MZ", "Manzana"),
    ("NU", "Núcleo"),
    ("OV", "Otros"),
    ("PA", "Parque"),
    ("PB", "Poblado"),
    ("PD", "Partida"),
    ("PE", "Paseo"),
    ("PI", "Políg.industrial"),
    ("PJ", "Paraje"),
    ("PL", "Pantalan"),
    ("PO", "Polígono"),
    ("PQ", "Parque"),
    ("PR", "Prolongación"),
    ("PS", "Pasaje"),
    ("PT", "Plazoleta"),
    ("PY", "Playa"),
    ("PZ", "Plaza"),
    ("RA", "Rambla"),
    ("RD", "Ronda"),
    ("RS", "Residencial"),
    ("SD", "Senda"),
    ("SU", "Subida"),
    ("TR", "Travesía"),
    ("UR", "Urbanización"),
    ("VI", "Vial"),
    ("ZN", "Zona"),
]

PISO = [
    ("AT", "Ático"),
    ("BA", "Bajo"),
    ("EP", "Entreplanta"),
    ("ES", "Entresuelo"),
    ("LO", "Local"),
    ("PA", "Patio"),
    ("PR", "Principal"),
    ("S1", "Sótano-1"),
    ("S2", "Sótano-2"),
    ("S3", "Sótano 3"),
    ("S4", "Sótano 4"),
    ("S5", "Sótano 5"),
    ("S6", "Sótano 6"),
    ("SA", "Sobre ático"),
    ("SS", "Semisótano"),
    ("001", "Primero"),
    ("002", "Segundo"),
    ("003", "Tercero"),
    ("004", "Cuarto"),
    ("005", "Quinto"),
    ("006", "Sexto"),
    ("007", "Séptimo"),
    ("008", "Octavo"),
    ("009", "Noveno"),
    ("010", "Décimo"),
    ("011", "Décimo primero"),
]

PUERTA = [
    ("ZA", "Izq-Izq"),
    ("ZB", "Izq-Ctr"),
    ("ZC", "Izq-Dch"),
    ("ZD", "Izq"),
    ("ZE", "Ext-Izq"),
    ("ZF", "Ext-Ctr"),
    ("ZG", "Ext-Dch"),
    ("ZH", "Ext"),
    ("ZI", "Ctr-Izq"),
    ("ZJ", "Ctr"),
    ("ZK", "Ctr-Dch"),
    ("ZL", "Int"),
    ("ZM", "Int-Izq"),
    ("ZN", "Int-Ctr"),
    ("ZO", "Int-Dch"),
    ("ZP", "Dch"),
    ("ZQ", "Dch-Izq"),
    ("ZR", "Dch-Ctr"),
    ("ZS", "Dch-Dch"),
    ("001", "Una"),
]

ACLARADOR = [
    ("BI", "BIS"),
    ("KM", "Punto Kilométrico"),
    ("NO", "Normal"),
    ("PC", "Parcela"),
    ("PR", "Próximo"),
    ("SN", "S/N"),
]


# --- Modulo 2: catalogos CNMC del equipo de medida ---

# Tabla 30 (CNMC) - SOLO REFERENCIA: el tipo de punto de medida se calcula por
# potencia (tipo_punto_medida_rpum en normativa_atr.py), NO se asigna desde aqui.
TIPO_PUNTO_MEDIDA = [
    ("01", "Punto de medida tipo 1"),
    ("02", "Punto de medida tipo 2"),
    ("03", "Punto de medida tipo 3"),
    ("04", "Punto de medida tipo 4"),
    ("05", "Punto de medida tipo 5"),
]

# Tabla 32 (CNMC) - propiedad del aparato (contador e ICP)
PROPIEDAD_APARATO = [
    ("1", "Distribuidor"),
    ("2", "Cliente"),
    ("3", "Comercializador"),
    ("4", "Otros"),
]

# Tabla 111 (CNMC) - tipo de telegestion
TELEGESTION = [
    ("01", "Telegestion operativa con curva de carga horaria"),
    ("02", "Telegestion operativa sin curva de carga horaria"),
    ("03", "Sin telegestion"),
]

CATALOGOS = [
    ("erp_cnmc_tipo_via", ErpCnmcTipoVia, TIPO_VIA),
    ("erp_cnmc_piso", ErpCnmcPiso, PISO),
    ("erp_cnmc_puerta", ErpCnmcPuerta, PUERTA),
    ("erp_cnmc_aclarador_finca", ErpCnmcAclaradorFinca, ACLARADOR),
    ("erp_cnmc_tipo_punto_medida", ErpCnmcTipoPuntoMedida, TIPO_PUNTO_MEDIDA),
    ("erp_cnmc_propiedad_aparato", ErpCnmcPropiedadAparato, PROPIEDAD_APARATO),
    ("erp_cnmc_telegestion", ErpCnmcTelegestion, TELEGESTION),
]


def _seed(db, Model, filas):
    creadas = actualizadas = 0
    for orden, (codigo, descripcion) in enumerate(filas, start=1):
        row = db.query(Model).filter(Model.codigo == codigo).one_or_none()
        if row is None:
            db.add(Model(codigo=codigo, descripcion=descripcion, orden=orden, activo=True))
            creadas += 1
        else:
            row.descripcion = descripcion
            row.orden = orden
            row.activo = True
            actualizadas += 1
    return creadas, actualizadas


def main() -> int:
    settings = get_settings()
    if not settings.DATABASE_URL:
        print("ERROR: DATABASE_URL no esta configurada")
        return 1
    engine = create_engine(settings.DATABASE_URL, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    db = SessionLocal()
    try:
        for nombre, Model, filas in CATALOGOS:
            c, a = _seed(db, Model, filas)
            print(f"  {nombre}: creadas={c}, actualizadas={a} (total {len(filas)})")
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print("OK - seed catalogos CNMC completado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
