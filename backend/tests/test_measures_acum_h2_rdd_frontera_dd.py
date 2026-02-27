# pyright: reportCallIssue=false, reportAttributeAccessIssue=false

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.models_base import Base
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_acum_h2_rdd_frontera_dd


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


def test_acum_h2_rdd_frontera_dd_crea_medida_general():
    db = crear_sesion_sqlite()
    tenant, empresa, user = _crear_tenant_empresa_usuario(db)

    # Fichero P2 (AE) -> suma en energia_frontera_dd_kwh
    fichero = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_FRONTERA_DD",
        anio=2024,
        mes=1,
        filename="ACUM_H2_RDD_0277_P2_202401.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P2_202401.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero)
    db.commit()
    db.refresh(fichero)

    # Filas simuladas (solo Magnitud AE cuenta)
    filas_raw = [
        {
            "Codigo_PF": "DDDK109141",
            "Magnitud": "AS",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "3",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "1347",
            "Numero_Total_Horas_Medidas": "2976",
        },
        {
            "Codigo_PF": "DDDK109141",
            "Magnitud": "AE",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "35",
            "Numero_Horas_Medidas_Estimadas": "3",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "54914",
            "Numero_Total_Horas_Medidas": "2976",
        },
    ]

    mg = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero,
        filas_raw=filas_raw,
        magnitud_objetivo="AE",
    )

    assert mg.tenant_id == tenant.id
    assert mg.empresa_id == empresa.id
    assert mg.anio == 2024
    assert mg.mes == 1
    # Solo suma la fila AE: 54914
    assert mg.energia_frontera_dd_kwh == 54914.0
    assert mg.file_id == fichero.id


def test_acum_h2_rdd_frontera_dd_acumula_con_segundo_fichero():
    db = crear_sesion_sqlite()
    tenant, empresa, user = _crear_tenant_empresa_usuario(db)

    # Primer fichero P2 (AE)
    fichero1 = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_FRONTERA_DD",
        anio=2024,
        mes=1,
        filename="ACUM_H2_RDD_0277_P2_202401.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P2_202401.0",
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

    mg1 = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero1,
        filas_raw=filas_raw_1,
        magnitud_objetivo="AE",
    )

    assert mg1.energia_frontera_dd_kwh == 100.0

    # Segundo fichero P2 del mismo mes (debe acumular)
    fichero2 = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_FRONTERA_DD",
        anio=2024,
        mes=1,
        filename="ACUM_H2_RDD_0277_P2_202401_v2.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P2_202401_v2.0",
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

    mg2 = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero2,
        filas_raw=filas_raw_2,
        magnitud_objetivo="AE",
    )

    # 100 (primer fichero) + 50 (segundo fichero) = 150
    assert mg2.energia_frontera_dd_kwh == 150.0
    # Debe seguir siendo el mismo registro de MedidaGeneral
    assert mg2.id == mg1.id
    # Y el file_id apunta al último fichero procesado
    assert mg2.file_id == fichero2.id


def test_acum_h2_rdd_frontera_dd_suma_p1_y_p2():
    """
    Comprueba que si procesamos primero un fichero P2 (AE) y luego
    un fichero P1 (AS), la cabecera energia_frontera_dd_kwh queda
    con la suma de ambos.
    """
    db = crear_sesion_sqlite()
    tenant, empresa, user = _crear_tenant_empresa_usuario(db)

    # Fichero P2 (AE)
    fichero_p2 = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_FRONTERA_DD",
        anio=2024,
        mes=1,
        filename="ACUM_H2_RDD_0277_P2_202401.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P2_202401.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero_p2)
    db.commit()
    db.refresh(fichero_p2)

    filas_p2 = [
        {
            "Codigo_PF": "PF_P2",
            "Magnitud": "AE",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "200",
            "Numero_Total_Horas_Medidas": "0",
        },
    ]

    mg_after_p2 = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero_p2,
        filas_raw=filas_p2,
        magnitud_objetivo="AE",
    )

    assert mg_after_p2.energia_frontera_dd_kwh == 200.0

    # Fichero P1 (AS) del mismo mes
    fichero_p1 = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD_FRONTERA_DD",
        anio=2024,
        mes=1,
        filename="ACUM_H2_RDD_0277_P1_202401.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P1_202401.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero_p1)
    db.commit()
    db.refresh(fichero_p1)

    filas_p1 = [
        {
            "Codigo_PF": "PF_P1",
            "Magnitud": "AS",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "300",
            "Numero_Total_Horas_Medidas": "0",
        },
    ]

    mg_after_p1 = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero_p1,
        filas_raw=filas_p1,
        magnitud_objetivo="AS",
    )

    # 200 (P2 AE) + 300 (P1 AS) = 500
    assert mg_after_p1.energia_frontera_dd_kwh == 500.0
    # Sigue siendo la misma fila de MedidaGeneral
    assert mg_after_p1.id == mg_after_p2.id