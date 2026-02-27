# tests/test_measures_acum_h2_grd_generacion.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.models_base import Base
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_acum_h2_grd_generacion


def crear_sesion_sqlite():
    engine = create_engine("sqlite:///:memory:")
    # Creamos sólo las tablas que necesitamos para el test
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


def test_acum_h2_grd_crea_medida_general():
    db = crear_sesion_sqlite()

    # 1) Tenant, empresa, usuario
    tenant = Tenant(id=1, nombre="T1")
    empresa = Empresa(id=1, tenant_id=tenant.id, nombre="E1")
    db.add_all([tenant, empresa])
    db.commit()

    # Creamos el usuario sin kwargs para evitar problemas de firma
    user = User()
    user.id = 1
    user.tenant_id = tenant.id
    user.email = "test@example.com"
    user.password_hash = "fake-hash"  # suficiente para el test
    user.is_active = True
    # Si tu modelo tiene más NOT NULL, añádelos aquí igual que estos
    db.add(user)
    db.commit()

    # 2) IngestionFile simulado
    fichero = IngestionFile(
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_GRD_GENERACION",
        # Para este test ponemos anio/mes coherentes con el nombre de fichero
        anio=2025,
        mes=11,
        filename="ACUM_H2_GRD_0336_P2_202511.0",
        storage_key="local-test/ACUM_H2_GRD_0336_P2_202511.0",
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

    mg = procesar_acum_h2_grd_generacion(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    # 4) Comprobaciones
    assert mg.tenant_id == tenant.id
    assert mg.empresa_id == empresa.id
    # Del nombre ACUM_H2_GRD_0336_P2_202511.0 -> 2025 / 11
    assert mg.anio == 2025
    assert mg.mes == 11
    # Sólo suman las filas AS: 10 + 20 = 30
    assert mg.energia_generada_kwh == 30.0
    assert mg.file_id == fichero.id