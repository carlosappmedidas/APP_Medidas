# tests/test_measures_acum_h2_gen_generacion.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.models_base import Base
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_acum_h2_gen_generacion


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


def test_acum_h2_gen_crea_medida_general():
    db = crear_sesion_sqlite()

    # 1) Tenant, empresa, usuario
    tenant = Tenant(id=1, nombre="T1")
    empresa = Empresa(id=1, tenant_id=1, nombre="E1")

    user = User(
        id=1,
        tenant_id=tenant.id,
        email="test@example.com",
        # si tu modelo real tiene campos obligatorios extra (password_hash, etc.),
        # añádelos aquí igual que en el test de ACUM H2 GRD
    )

    db.add_all([tenant, empresa, user])
    db.commit()

    # 2) IngestionFile simulado para ACUM H2 GEN
    fichero = IngestionFile(
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_GEN_GENERACION",
        anio=None,
        mes=None,
        filename="ACUM_H2_GEN_0277_P2_202505.0",
        storage_key="local-test/ACUM_H2_GEN_0277_P2_202505.0",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(fichero)
    db.commit()
    db.refresh(fichero)

    # 3) Filas simuladas (dos filas AS y una que no cuenta)
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
            "Valor_Acumulado_Total_Energia": "10",
            "Numero_Total_Horas_Medidas": "0",
            "Col_dummy": "",
        },
        {
            "Codigo_PF": "PF2",
            "Magnitud": "AS",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "20",
            "Numero_Total_Horas_Medidas": "0",
            "Col_dummy": "",
        },
        {
            # Esta fila no cuenta porque Magnitud != 'AS'
            "Codigo_PF": "PF3",
            "Magnitud": "XX",
            "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)": "0",
            "Numero_Horas_Medidas_Estimadas": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Redundante": "0",
            "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)": "0",
            "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)": "0",
            "Valor_Acumulado_Total_Energia": "9999",
            "Numero_Total_Horas_Medidas": "0",
            "Col_dummy": "",
        },
    ]

    mg = procesar_acum_h2_gen_generacion(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    # 4) Comprobaciones
    assert mg.tenant_id == tenant.id
    assert mg.empresa_id == empresa.id
    # Del nombre ACUM_H2_GEN_0277_P2_202505.0 -> 2025 / 05
    assert mg.anio == 2025
    assert mg.mes == 5
    # Sólo suman las filas AS: 10 + 20 = 30
    assert mg.energia_generada_kwh == 30.0
    assert mg.file_id == fichero.id