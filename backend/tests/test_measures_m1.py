# tests/test_measures_m1.py
from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from app.measures.services import procesar_m1
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_m1_autoconsumo


def _crear_fichero_m1(db: Session) -> IngestionFile:
    fichero = IngestionFile(
        tenant_id=1,
        empresa_id=1,
        tipo="M1_FACTURACION",
        anio=2023,   # 👈 IMPORTANTE: NOT NULL en BD
        mes=2,       # usamos febrero porque el test trabaja con febrero
        filename="m1_demo.xlsm",
        storage_key="tenant-1/m1_demo.xlsm",
        status="pending",
        uploaded_by=1,
    )
    db.add(fichero)
    db.commit()
    db.refresh(fichero)
    return fichero


def test_procesar_m1_sin_filas_lanza_error(db_session: Session):
    fichero = _crear_fichero_m1(db_session)

    with pytest.raises(ValueError, match="no contiene filas de datos"):
        procesar_m1(
            db=db_session,
            tenant_id=1,
            empresa_id=1,
            fichero=fichero,
            filas_raw=[],
        )


def test_procesar_m1_crea_medida_general_con_energia_bruta(db_session: Session):
    """
    Reglas que queremos probar:

    - Buscar la última Fecha_final del fichero.
    - Tomar TODAS las filas cuyo año/mes de Fecha_final coincide con esa fecha.
    - Sumar Energia_Kwh de esas filas.
    - Guardar una única fila en medidas_general.energia_bruta_facturada.
    """

    fichero = _crear_fichero_m1(db_session)

    filas_raw = [
        # Mes anterior -> NO se debe usar (enero 2023)
        {
            "Fecha_inicio": "2023-01-01",
            "Fecha_final": "2023-01-31",
            "Energia_Kwh": 5.0,
        },
        # Mismo mes que la última Fecha_final (febrero 2023) -> SÍ se usan
        {
            "Fecha_inicio": "2023-02-01",
            "Fecha_final": "2023-02-05",
            "Energia_Kwh": 7.0,
        },
        {
            "Fecha_inicio": "2023-02-10",
            "Fecha_final": "2023-02-28",
            "Energia_Kwh": 20.0,
        },
        {
            "Fecha_inicio": "2023-02-15",
            "Fecha_final": "2023-02-28",
            "Energia_Kwh": 30.0,
        },
    ]

    procesar_m1(
        db=db_session,
        tenant_id=1,
        empresa_id=1,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    medidas = db_session.query(MedidaGeneral).all()
    assert len(medidas) == 1

    m = medidas[0]
    # anio / mes de la última Fecha_final
    assert m.anio == 2023
    assert m.mes == 2

    # 7 + 20 + 30 = 57.0
    # (solo filas cuyo año/mes de Fecha_final es febrero 2023)
    assert m.energia_bruta_facturada == pytest.approx(57.0)

    # Relación con fichero y empresa
    assert m.tenant_id == 1
    assert m.empresa_id == 1
    assert m.file_id == fichero.id

    def test_procesar_m1_autoconsumo_suma_kwh_y_actualiza_medida_general(db_session: Session):
    fichero = _crear_fichero_m1(db_session)
    fichero.filename = "0277_202301_autoconsumos.xlsx"
    db_session.commit()

    filas_raw = [
        {"Kwh": 10},
        {"Kwh": 20.5},
        {"Kwh": 5},
    ]

    mg = procesar_m1_autoconsumo(
        db=db_session,
        tenant_id=1,
        empresa_id=1,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    assert mg.anio == 2023
    assert mg.mes == 1
    assert mg.energia_autoconsumo_kwh == pytest.approx(35.5)