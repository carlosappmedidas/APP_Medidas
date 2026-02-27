from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.models_base import Base
from app.tenants.models import Tenant
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.models import MedidaGeneral
from app.measures.services import procesar_acum_h2_rdd_frontera_dd


def _crear_sesion_sqlite():
    """BD SQLite en memoria solo con las tablas necesarias."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        bind=engine,
        tables=[
            Tenant.__table__,
            Empresa.__table__,
            IngestionFile.__table__,
            MedidaGeneral.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_procesar_acum_h2_rdd_frontera_dd_suma_solo_AE():
    db = _crear_sesion_sqlite()

    # 1) Tenant y empresa mínimos
    tenant = Tenant(nombre="Luxida", plan="starter")  # type: ignore[call-arg]
    db.add(tenant)
    db.flush()

    empresa = Empresa(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        nombre="Empresa Demo",
        codigo_ree="REE",
        codigo_cnmc="CNMC",
        activo=True,
    )
    db.add(empresa)
    db.commit()
    db.refresh(tenant)
    db.refresh(empresa)

    # 2) Fichero de ingestion simulado
    fichero = IngestionFile(  # type: ignore[call-arg]
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        tipo="ACUM_H2_RDD",
        anio=2024,
        mes=1,
        filename="ACUM_H2_RDD_0277_P2_202401.0",
        storage_key="local-test/ACUM_H2_RDD_0277_P2_202401.0",
        status="pending",
        uploaded_by=1,
    )
    db.add(fichero)
    db.commit()
    db.refresh(fichero)

    # 3) Filas de ejemplo:
    # - Dos filas AE (10 y 20) que deben contarse.
    # - Una fila AS que NO debe contarse.
    filas_raw = [
        {
            "Codigo_PF": "PF1",
            "Magnitud": "AE",
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
            "Magnitud": "AE",
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
            # Esta no debe contar (Magnitud AS)
            "Codigo_PF": "PF3",
            "Magnitud": "AS",
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

    mg = procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant.id,
        empresa_id=empresa.id,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    # Comprobaciones básicas
    assert mg.tenant_id == tenant.id
    assert mg.empresa_id == empresa.id
    assert mg.anio == 2024
    assert mg.mes == 1

    # Solo suman las filas AE: 10 + 20 = 30
    assert getattr(mg, "energia_frontera_dd_kwh") == 30.0  # type: ignore[attr-defined]

    # Y que el file_id corresponde al fichero procesado
    assert mg.file_id == fichero.id