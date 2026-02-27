# tests/test_measures_acumcil_generacion.py
from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.ingestion.services import procesar_fichero_acumcil_generacion


def _crear_fichero_acumcil(db: Session) -> IngestionFile:
    fichero = IngestionFile(
        tenant_id=1,
        empresa_id=1,
        tipo="ACUMCIL_GENERACION",
        filename="ACUMCIL_H2_0277_202401_20240207.0",
        storage_key="local-test/ACUMCIL_H2_0277_202401_20240207.0",
        status="pending",
        uploaded_by=1,
        anio=2024,
        mes=1,
    )
    db.add(fichero)
    db.commit()
    db.refresh(fichero)
    return fichero


def test_acumcil_sin_filas_lanza_error(db_session: Session):
    fichero = _crear_fichero_acumcil(db_session)

    with pytest.raises(ValueError, match="no contiene filas de datos"):
        procesar_fichero_acumcil_generacion(
            db=db_session,
            tenant_id=1,
            empresa_id=1,
            fichero=fichero,
            filas_raw=[],
        )


def test_acumcil_crea_medida_general_generada(db_session: Session):
    fichero = _crear_fichero_acumcil(db_session)

    filas_raw = [
        {
            "Codigo_CIL": "C1",
            "Magnitud": "AS",
            "Valor_Acumulado_Total_Energia": "10.5",
        },
        {
            "Codigo_CIL": "C2",
            "Magnitud": "AS",
            "Valor_Acumulado_Total_Energia": "20,5",
        },
        {
            "Codigo_CIL": "C3",
            "Magnitud": "AE",  # no se debe usar
            "Valor_Acumulado_Total_Energia": "999",
        },
    ]

    mg = procesar_fichero_acumcil_generacion(
        db=db_session,
        tenant_id=1,
        empresa_id=1,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    medidas = db_session.query(MedidaGeneral).all()
    assert len(medidas) == 1

    m = medidas[0]
    assert m.anio == 2024
    assert m.mes == 1

    assert m.energia_generada_kwh == pytest.approx(31.0)

    assert m.tenant_id == 1
    assert m.empresa_id == 1
    assert m.file_id == fichero.id