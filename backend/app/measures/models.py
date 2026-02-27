# app/measures/models.py
# pyright: reportMissingImports=false

from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey

from app.core.models_base import Base, TimestampMixin


class MedidaMicro(TimestampMixin, Base):
    __tablename__ = "medidas_micro"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # Punto de medida (CUPS o equivalente)
    punto_id = Column(String(50), nullable=False, index=True)

    # Momento de la medida (intervalo real: 15/30/60 min, etc.)
    timestamp = Column(DateTime, nullable=False, index=True)

    # Valores ya normalizados
    energia_kwh = Column(Float, nullable=True)
    potencia_kw = Column(Float, nullable=True)

    calidad = Column(String(20), nullable=True)  # p.e. "OK", "EST", "FALLO"

    # De qué fichero viene
    source_file_id = Column(
        Integer, ForeignKey("ingestion_files.id"), nullable=False, index=True
    )


class MedidaGeneral(TimestampMixin, Base):
    __tablename__ = "medidas_general"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # Identificador del punto de medida (CUPS o equivalente)
    punto_id = Column(String(50), nullable=False, index=True)

    # Periodo (mes agregación)
    anio = Column(Integer, nullable=False, index=True)
    mes = Column(Integer, nullable=False, index=True)

    # ⚡ MÉTRICAS AGREGADAS "GENERALES"
    energia_bruta_facturada = Column(Float, nullable=True)
    energia_autoconsumo_kwh = Column(Float, nullable=True)
    energia_generada_kwh = Column(Float, nullable=True)
    energia_frontera_dd_kwh = Column(Float, nullable=True)
    energia_pf_kwh = Column(Float, nullable=True)
    energia_pf_final_kwh = Column(Float, nullable=True)
    energia_neta_facturada_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_pct = Column(Float, nullable=True)

    # ⚡ MÉTRICAS BALD POR "VENTANA DE PUBLICACIÓN"

    # --- M2 ---
    energia_publicada_m2_kwh = Column(Float, nullable=True)
    energia_autoconsumo_m2_kwh = Column(Float, nullable=True)
    energia_pf_m2_kwh = Column(Float, nullable=True)
    energia_frontera_dd_m2_kwh = Column(Float, nullable=True)
    energia_generada_m2_kwh = Column(Float, nullable=True)
    energia_neta_facturada_m2_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_m2_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_m2_pct = Column(Float, nullable=True)

    # --- M7 ---
    energia_publicada_m7_kwh = Column(Float, nullable=True)
    energia_autoconsumo_m7_kwh = Column(Float, nullable=True)
    energia_pf_m7_kwh = Column(Float, nullable=True)
    energia_frontera_dd_m7_kwh = Column(Float, nullable=True)
    energia_generada_m7_kwh = Column(Float, nullable=True)
    energia_neta_facturada_m7_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_m7_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_m7_pct = Column(Float, nullable=True)

    # --- M11 ---
    energia_publicada_m11_kwh = Column(Float, nullable=True)
    energia_autoconsumo_m11_kwh = Column(Float, nullable=True)
    energia_pf_m11_kwh = Column(Float, nullable=True)
    energia_frontera_dd_m11_kwh = Column(Float, nullable=True)
    energia_generada_m11_kwh = Column(Float, nullable=True)
    energia_neta_facturada_m11_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_m11_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_m11_pct = Column(Float, nullable=True)

    # --- ART15 ---
    energia_publicada_art15_kwh = Column(Float, nullable=True)
    energia_autoconsumo_art15_kwh = Column(Float, nullable=True)
    energia_pf_art15_kwh = Column(Float, nullable=True)
    energia_frontera_dd_art15_kwh = Column(Float, nullable=True)
    energia_generada_art15_kwh = Column(Float, nullable=True)
    energia_neta_facturada_art15_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_art15_kwh = Column(Float, nullable=True)
    perdidas_e_facturada_art15_pct = Column(Float, nullable=True)

    # De qué fichero viene este agregado (último fichero que ha actualizado esta fila)
    file_id = Column(
        Integer,
        ForeignKey("ingestion_files.id"),
        nullable=False,
        index=True,
    )


class MedidaPS(TimestampMixin, Base):
    """
    Agregado mensual por empresa / punto de los ficheros PS_*.

    Clave lógica:
      tenant_id + empresa_id + punto_id + anio + mes
    """

    __tablename__ = "medidas_ps"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    punto_id = Column(String(50), nullable=False, index=True)

    anio = Column(Integer, nullable=False, index=True)
    mes = Column(Integer, nullable=False, index=True)

    # --- ENERGÍA POR TIPO DE PS (poliza 1..5) ---
    energia_ps_tipo_1_kwh = Column(Float, nullable=True)
    energia_ps_tipo_2_kwh = Column(Float, nullable=True)
    energia_ps_tipo_3_kwh = Column(Float, nullable=True)
    energia_ps_tipo_4_kwh = Column(Float, nullable=True)
    energia_ps_tipo_5_kwh = Column(Float, nullable=True)
    energia_ps_total_kwh = Column(Float, nullable=True)

    # --- CUPS POR TIPO DE PS ---
    cups_tipo_1 = Column(Integer, nullable=True)
    cups_tipo_2 = Column(Integer, nullable=True)
    cups_tipo_3 = Column(Integer, nullable=True)
    cups_tipo_4 = Column(Integer, nullable=True)
    cups_tipo_5 = Column(Integer, nullable=True)
    cups_total = Column(Integer, nullable=True)

    # --- IMPORTE POR TIPO DE PS ---
    importe_tipo_1_eur = Column(Float, nullable=True)
    importe_tipo_2_eur = Column(Float, nullable=True)
    importe_tipo_3_eur = Column(Float, nullable=True)
    importe_tipo_4_eur = Column(Float, nullable=True)
    importe_tipo_5_eur = Column(Float, nullable=True)
    importe_total_eur = Column(Float, nullable=True)

    # --- BLOQUES POR TARIFA (energía, cups, importe) ---
    # 2.0TD
    energia_tarifa_20td_kwh = Column(Float, nullable=True)
    cups_tarifa_20td = Column(Integer, nullable=True)
    importe_tarifa_20td_eur = Column(Float, nullable=True)

    # 3.0TD
    energia_tarifa_30td_kwh = Column(Float, nullable=True)
    cups_tarifa_30td = Column(Integer, nullable=True)
    importe_tarifa_30td_eur = Column(Float, nullable=True)

    # 3.0TDVE
    energia_tarifa_30tdve_kwh = Column(Float, nullable=True)
    cups_tarifa_30tdve = Column(Integer, nullable=True)
    importe_tarifa_30tdve_eur = Column(Float, nullable=True)

    # 6.1TD
    energia_tarifa_61td_kwh = Column(Float, nullable=True)
    cups_tarifa_61td = Column(Integer, nullable=True)
    importe_tarifa_61td_eur = Column(Float, nullable=True)

    # 6.2TD
    energia_tarifa_62td_kwh = Column(Float, nullable=True)
    cups_tarifa_62td = Column(Integer, nullable=True)
    importe_tarifa_62td_eur = Column(Float, nullable=True)

    # 6.3TD
    energia_tarifa_63td_kwh = Column(Float, nullable=True)
    cups_tarifa_63td = Column(Integer, nullable=True)
    importe_tarifa_63td_eur = Column(Float, nullable=True)

    # 6.4TD
    energia_tarifa_64td_kwh = Column(Float, nullable=True)
    cups_tarifa_64td = Column(Integer, nullable=True)
    importe_tarifa_64td_eur = Column(Float, nullable=True)

    # Fichero PS que originó (o actualizó por última vez) este agregado
    file_id = Column(
        Integer,
        ForeignKey("ingestion_files.id"),
        nullable=False,
        index=True,
    )