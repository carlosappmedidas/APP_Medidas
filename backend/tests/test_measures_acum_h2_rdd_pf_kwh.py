# tests/test_measures_acum_h2_rdd_pf_kwh.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.models_base import Base
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_acum_h2_rdd_pf_kwh


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


def test_acum_h2_rdd_pf_kwh_crea_medida_general():
    db = crear_sesion_sqlite()
    tenant, empresa, user = _crear_tenant_empresa_usuario(db)

    fichero = IngestionFile(  # type: ignore[call-arg]
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
    db.add(fichero)
    db.commit()
    db.refresh(fichero)

    # Dos filas: solo la Magnitud AE debe sumar
    filas_raw = [
        {
            "Codigo_PF": "PF1",
            "Magnitud": "AS",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "200",
            "Numero_Total_Horas_Medidas": "0",
        },
        {
            "Codigo_PF": "PF1",
            "Magnitud": "AE",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "500",
            "Numero_Total_Horas_Medidas": "0",
        },
    ]

    mg = procesar_acum_h2_rdd_pf_kwh(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    assert mg.tenant_id == tenant.id
    assert mg.empresa_id == empresa.id
    assert mg.anio == 2025
    assert mg.mes == 5
    # Solo suma la fila AE: 500
    assert mg.energia_pf_kwh == 500.0  # type: ignore[attr-defined]
    assert mg.file_id == fichero.id


def test_acum_h2_rdd_pf_kwh_acumula_con_segundo_fichero():
    db = crear_sesion_sqlite()
    tenant, empresa, user = _crear_tenant_empresa_usuario(db)

    # Primer fichero
    fichero1 = IngestionFile(  # type: ignore[call-arg]
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
    db.add(fichero1)
    db.commit()
    db.refresh(fichero1)

    filas_raw_1 = [
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

    mg1 = procesar_acum_h2_rdd_pf_kwh(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero1,
        filas_raw=filas_raw_1,
    )

    assert mg1.energia_pf_kwh == 100.0  # type: ignore[attr-defined]

    # Segundo fichero mismo mes (acumula)
    fichero2 = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_PF",
        anio=2025,
        mes=5,
        filename="ACUM_H2_RDD_0277_P1_202505_v2.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P1_202505_v2.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero2)
    db.commit()
    db.refresh(fichero2)

    filas_raw_2 = [
        {
            "Codigo_PF": "PF2",
            "Magnitud": "AE",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "50",
            "Numero_Total_Horas_Medidas": "0",
        },
    ]

    mg2 = procesar_acum_h2_rdd_pf_kwh(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero2,
        filas_raw=filas_raw_2,
    )

    # 100 (primer fichero) + 50 (segundo fichero) = 150
    assert mg2.energia_pf_kwh == 150.0  # type: ignore[attr-defined]
    assert mg2.id == mg1.id
    assert mg2.file_id == fichero2.id