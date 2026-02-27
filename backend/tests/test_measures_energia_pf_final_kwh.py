# pyright: reportCallIssue=false, reportAttributeAccessIssue=false

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.models_base import Base
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import (
    procesar_acum_h2_rdd_pf_kwh,
    procesar_acumcil_generacion,
    procesar_acum_h2_rdd_frontera_dd,
)


def crear_sesion_sqlite():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        bind=engine,
        tables=[
            Tenant.__table__,
            User.__table__,
            Empresa.__table__,
            IngestionFile.__table__,
            MedidaGeneral.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def _crear_tenant_empresa_usuario(db):
    tenant = Tenant(id=1, nombre="T1", plan="starter")
    empresa = Empresa(id=1, tenant_id=tenant.id, nombre="E1")

    user = User(
        id=1,
        tenant_id=tenant.id,
        email="test@example.com",
        password_hash="hash",
        rol="owner",
        is_active=True,
    )

    db.add_all([tenant, empresa, user])
    db.commit()
    return tenant, empresa, user


def test_energia_pf_final_kwh_formula_completa():
    """
    Comprueba que energia_pf_final_kwh se recalcula correctamente como:

        energia_pf_final_kwh = energia_pf_kwh + energia_generada_kwh - energia_frontera_dd_kwh

    usando:
      - 1 fichero PF (RDD P1, Magnitud AE)
      - 1 fichero de generación ACUMCIL (Magnitud AS)
      - 1 fichero de frontera DD (RDD P2, Magnitud AE)
    """
    db = crear_sesion_sqlite()
    tenant, empresa, user = _crear_tenant_empresa_usuario(db)

    # --- 1) Fichero PF: ACUM_H2_RDD_0277_P1_202505.0 (Magnitud AE) -> energia_pf_kwh ---
    fichero_pf = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_PF",
        anio=2025,
        mes=5,
        filename="ACUM_H2_RDD_0277_P1_202505.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P1_202505.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero_pf)
    db.commit()
    db.refresh(fichero_pf)

    filas_pf = [
        {
            "Codigo_PF": "PF1",
            "Magnitud": "AE",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "100",
            "Numero_Total_Horas_Medidas": "0",
        },
    ]

    mg_pf = procesar_acum_h2_rdd_pf_kwh(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero_pf,
        filas_raw=filas_pf,
    )

    assert mg_pf.tenant_id == tenant.id
    assert mg_pf.empresa_id == empresa.id
    assert mg_pf.anio == 2025
    assert mg_pf.mes == 5
    assert mg_pf.energia_pf_kwh == 100.0  # type: ignore[attr-defined]
    # En este punto, generada = 0, frontera = 0 -> pf_final = 100
    assert mg_pf.energia_pf_final_kwh == 100.0  # type: ignore[attr-defined]

    # --- 2) Fichero de generación ACUMCIL_H2_0277_202505_20250601.0 (Magnitud AS) ---
    fichero_gen = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUMCIL_GENERACION",
        anio=2025,
        mes=5,
        filename="ACUMCIL_H2_0277_202505_20250601.0",
        storage_key="local-test/ACUMCIL_H2_0277_202505_20250601.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero_gen)
    db.commit()
    db.refresh(fichero_gen)

    filas_gen = [
        {
            "Codigo_CIL": "CIL1",
            "Codigo_Distribuidor": "D1",
            "Codigo_Unidad_programacion": "UP1",
            "Codigo_Tipo_Punto": "T",
            "Codigo_Provincia": "28",
            "Fecha_inicio": "2025-05-01",
            "Fecha_final": "2025-05-31",
            "Magnitud": "AS",
            "Parcial_Estimada": "0",
            "Horas_Estimadas": "0",
            "Parcial_Redundante": "0",
            "Horas_Redundantes": "0",
            "Parcial_Configuracion": "0",
            "Horas_Totales": "0",
            "Valor_Acumulado_Total_Energia": "50",
        },
    ]

    mg_gen = procesar_acumcil_generacion(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero_gen,
        filas_raw=filas_gen,
    )

    # Misma fila de medidas_general
    assert mg_gen.id == mg_pf.id
    assert mg_gen.energia_generada_kwh == 50.0
    # pf_kwh = 100, generada = 50, frontera = 0  -> pf_final = 150
    assert mg_gen.energia_pf_final_kwh == 150.0  # type: ignore[attr-defined]

    # --- 3) Fichero frontera DD: ACUM_H2_RDD_0277_P2_202505.0 (Magnitud AE) ---
    fichero_frontera = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_FRONTERA_DD",
        anio=2025,
        mes=5,
        filename="ACUM_H2_RDD_0277_P2_202505.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P2_202505.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero_frontera)
    db.commit()
    db.refresh(fichero_frontera)

    filas_frontera = [
        {
            "Codigo_PF": "PF_F",
            "Magnitud": "AE",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "10",
            "Numero_Total_Horas_Medidas": "0",
        },
    ]

    mg_final = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero_frontera,
        filas_raw=filas_frontera,
        magnitud_objetivo="AE",
    )

    # Misma fila
    assert mg_final.id == mg_pf.id
    assert mg_final.energia_frontera_dd_kwh == 10.0  # type: ignore[attr-defined]

    # pf_kwh = 100, generada = 50, frontera = 10  -> pf_final = 140
    assert mg_final.energia_pf_final_kwh == 140.0  # type: ignore[attr-defined]