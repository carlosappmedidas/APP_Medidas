// app/types.ts

export type Empresa = {
  id: number;
  tenant_id: number;
  nombre: string;
  codigo_ree: string | null;
  codigo_cnmc: string | null;
  activo: boolean;
};

export type MedidaGeneral = {
  id: number;
  tenant_id: number;
  empresa_id: number;

  empresa_codigo?: string | null;
  empresa_nombre?: string | null;

  punto_id: string;
  anio: number;
  mes: number;

  // Bloque "general"
  energia_bruta_facturada: number | null;
  energia_autoconsumo_kwh: number | null;
  energia_generada_kwh: number | null;
  energia_frontera_dd_kwh: number | null;
  energia_pf_kwh?: number | null;
  energia_pf_final_kwh: number | null;

  energia_neta_facturada_kwh: number | null;
  perdidas_e_facturada_kwh: number | null;
  perdidas_e_facturada_pct: number | null;

  // ---- Ventanas BALD: M2 ----
  energia_publicada_m2_kwh: number | null;
  energia_autoconsumo_m2_kwh: number | null;
  energia_pf_m2_kwh: number | null;
  energia_frontera_dd_m2_kwh: number | null;
  energia_generada_m2_kwh: number | null;
  energia_neta_facturada_m2_kwh: number | null;
  perdidas_e_facturada_m2_kwh: number | null;
  perdidas_e_facturada_m2_pct: number | null;

  // ---- M7 ----
  energia_publicada_m7_kwh: number | null;
  energia_autoconsumo_m7_kwh: number | null;
  energia_pf_m7_kwh: number | null;
  energia_frontera_dd_m7_kwh: number | null;
  energia_generada_m7_kwh: number | null;
  energia_neta_facturada_m7_kwh: number | null;
  perdidas_e_facturada_m7_kwh: number | null;
  perdidas_e_facturada_m7_pct: number | null;

  // ---- M11 ----
  energia_publicada_m11_kwh: number | null;
  energia_autoconsumo_m11_kwh: number | null;
  energia_pf_m11_kwh: number | null;
  energia_frontera_dd_m11_kwh: number | null;
  energia_generada_m11_kwh: number | null;
  energia_neta_facturada_m11_kwh: number | null;
  perdidas_e_facturada_m11_kwh: number | null;
  perdidas_e_facturada_m11_pct: number | null;

  // ---- ART15 ----
  energia_publicada_art15_kwh: number | null;
  energia_autoconsumo_art15_kwh: number | null;
  energia_pf_art15_kwh: number | null;
  energia_frontera_dd_art15_kwh: number | null;
  energia_generada_art15_kwh: number | null;
  energia_neta_facturada_art15_kwh: number | null;
  perdidas_e_facturada_art15_kwh: number | null;
  perdidas_e_facturada_art15_pct: number | null;

  file_id: number;
};

export type MedidaPS = {
  id: number;
  tenant_id: number;
  empresa_id: number;
  punto_id: string;
  anio: number;
  mes: number;

  empresa_codigo?: string | null;

  energia_ps_tipo_1_kwh: number | null;
  energia_ps_tipo_2_kwh: number | null;
  energia_ps_tipo_3_kwh: number | null;
  energia_ps_tipo_4_kwh: number | null;
  energia_ps_tipo_5_kwh: number | null;
  energia_ps_total_kwh: number | null;

  cups_tipo_1: number | null;
  cups_tipo_2: number | null;
  cups_tipo_3: number | null;
  cups_tipo_4: number | null;
  cups_tipo_5: number | null;
  cups_total: number | null;

  importe_tipo_1_eur: number | null;
  importe_tipo_2_eur: number | null;
  importe_tipo_3_eur: number | null;
  importe_tipo_4_eur: number | null;
  importe_tipo_5_eur: number | null;
  importe_total_eur: number | null;

  energia_tarifa_20td_kwh: number | null;
  cups_tarifa_20td: number | null;
  importe_tarifa_20td_eur: number | null;

  energia_tarifa_30td_kwh: number | null;
  cups_tarifa_30td: number | null;
  importe_tarifa_30td_eur: number | null;

  energia_tarifa_30tdve_kwh: number | null;
  cups_tarifa_30tdve: number | null;
  importe_tarifa_30tdve_eur: number | null;

  energia_tarifa_61td_kwh: number | null;
  cups_tarifa_61td: number | null;
  importe_tarifa_61td_eur: number | null;

  energia_tarifa_62td_kwh: number | null;
  cups_tarifa_62td: number | null;
  importe_tarifa_62td_eur: number | null;

  energia_tarifa_63td_kwh: number | null;
  cups_tarifa_63td: number | null;
  importe_tarifa_63td_eur: number | null;

  energia_tarifa_64td_kwh: number | null;
  cups_tarifa_64td: number | null;
  importe_tarifa_64td_eur: number | null;

  file_id: number;
};

// ---- Usuarios (lo que devuelve UserRead en el backend) ----
export type User = {
  id: number;
  tenant_id: number;
  email: string;
  rol: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string | null;

  // ✅ Backend real: lista de IDs (vacía => “sin filtro extra”, ve todas)
  empresa_ids_permitidas: number[];

  // (opcional legacy; no lo usa esta UI)
  empresas_permitidas?: Empresa[];
};