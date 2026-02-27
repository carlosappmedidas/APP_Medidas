# tests/test_measures_m1_autoconsumo.py

from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_m1_autoconsumo


def _crear_fichero_m1_autoconsumo(db: Session) -> IngestionFile:
    """
    Crea un registro de ingestion_files para M1 de autoconsumos.

    OJO: hay que rellenar anio y mes porque en la tabla son NOT NULL.
    """
    fichero = IngestionFile(
        tenant_id=1,
        empresa_id=1,
        tipo="M1_AUTOCONSUMO",
        filename="0277_202301_autoconsumos.xlsx",
        storage_key="local-test/0277_202301_autoconsumos.xlsx",
        status="pending",
        uploaded_by=1,
        anio=2023,
        mes=1,
    )
    db.add(fichero)
    db.commit()
    db.refresh(fichero)
    return fichero


def test_procesar_m1_autoconsumo_sin_filas_lanza_error(db_session: Session):
    fichero = _crear_fichero_m1_autoconsumo(db_session)

    with pytest.raises(ValueError, match="no contiene filas de datos"):
        procesar_m1_autoconsumo(
            db=db_session,
            tenant_id=1,
            empresa_id=1,
            fichero=fichero,
            filas_raw=[],
        )


def test_procesar_m1_autoconsumo_crea_medida_general(db_session: Session):
    """
    Reglas para autoconsumos:

    - Sumar toda la columna 'Kwh'.
    - El periodo (anio, mes) se obtiene del nombre de fichero 0277_202301_autoconsumos.xlsx.
    - Se guarda en medidas_general.energia_autoconsumo_kwh.
    """

    fichero = _crear_fichero_m1_autoconsumo(db_session)

    filas_raw = [
        {"Kwh": 10.5},
        {"Kwh": 20.0},
        {"Kwh": 5.5},
    ]
    energia_esperada = 10.5 + 20.0 + 5.5

    mg = procesar_m1_autoconsumo(
        db=db_session,
        tenant_id=1,
        empresa_id=1,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    # Comprobamos que devuelve algo razonable
    assert isinstance(mg, MedidaGeneral)

    medidas = db_session.query(MedidaGeneral).all()
    assert len(medidas) == 1

    m = medidas[0]
    assert m.anio == 2023
    assert m.mes == 1

    assert m.energia_autoconsumo_kwh == pytest.approx(energia_esperada)

    # Relación con fichero y empresa
    assert m.tenant_id == 1
    assert m.empresa_id == 1
    assert m.file_id == fichero.id