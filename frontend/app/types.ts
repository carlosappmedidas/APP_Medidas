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

// ---- Usuarios ----
export type User = {
  id: number;
  tenant_id: number;
  email: string;
  rol: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string | null;

  // Backend real: lista de IDs (vacía => “sin filtro extra”, ve todas)
  empresa_ids_permitidas: number[];

  // opcional legacy
  empresas_permitidas?: Empresa[];
};

// ------------------------------------------------------------
// Ingestion warnings
// ------------------------------------------------------------
export type IngestionWarningItem =
  | string
  | {
      type?: string;
      code?: string;
      message?: string;
      periodo?: string;
      periodo_principal?: string;
      anio?: number;
      mes?: number;
      energia_kwh?: number;
      fecha_final?: string;
      fecha_inicio?: string;
      poliza_existente?: string;
      poliza_nueva?: string;
      tarifa_existente?: string;
      tarifa_nueva?: string;
      cups?: string;
      [k: string]: unknown;
    };

export type IngestionFile = {
  id: number;
  empresa_id: number;
  tipo: string;
  anio: number;
  mes: number;
  filename: string;
  status: string;

  rows_ok?: number;
  rows_error?: number;

  created_at?: string;
  updated_at?: string | null;
  processed_at?: string | null;
  error_message?: string | null;

  warnings?: IngestionWarningItem[];
  notices?: IngestionWarningItem[];
  warnings_message?: string | null;
};

// ------------------------------------------------------------
// Delete preview
// ------------------------------------------------------------
export type DeleteFilesFilters = {
  tenant_id?: number;
  empresa_id?: number;
  tipo?: string;
  status_?: string;
  anio?: number;
  mes?: number;
};

export type DeleteImpactPeriod = {
  tenant_id: number;
  empresa_id: number;
  anio: number;
  mes: number;
};

export type DeleteImpactRefactura = {
  source_period: {
    anio: number;
    mes: number;
  };
  affected_period: {
    anio: number;
    mes: number;
  };
  energia_kwh?: number | null;
  filename?: string | null;
  ingestion_file_id?: number | null;
};

export type DeleteImpactIngestionFileItem = {
  id: number;
  tenant_id: number;
  empresa_id: number;
  tipo: string;
  anio: number;
  mes: number;
  filename: string;
  status?: string | null;
};

export type DeleteImpactSummary = {
  ingestion_files_count: number;
  m1_period_contributions_count: number;
  general_period_contributions_count: number;
  bald_period_contributions_count: number;
  ps_period_detail_count: number;
  ps_period_contributions_count: number;
  medidas_general_direct_count: number;
  medidas_ps_direct_count: number;
  affected_general_periods_count: number;
  affected_ps_periods_count: number;
  orphan_medidas_general_candidate_count: number;
  orphan_medidas_ps_candidate_count: number;
  refacturas_m1_count: number;
};

export type DeleteImpactPreview = {
  filters: DeleteFilesFilters;

  summary: DeleteImpactSummary;

  ingestion_files: DeleteImpactIngestionFileItem[];

  affected_general_periods: DeleteImpactPeriod[];
  affected_ps_periods: DeleteImpactPeriod[];

  orphan_medidas_general_candidates: DeleteImpactPeriod[];
  orphan_medidas_ps_candidates: DeleteImpactPeriod[];

  refacturas_m1: DeleteImpactRefactura[];
};

export type DeleteFilesResponse = {
  deleted_ingestion_files: number;
  deleted_m1_period_contributions: number;
  deleted_general_period_contributions: number;
  deleted_bald_period_contributions: number;
  deleted_ps_period_detail: number;
  deleted_ps_period_contributions: number;
  deleted_medidas_general_direct: number;
  deleted_medidas_general_orphan: number;
  deleted_medidas_ps_direct: number;
  deleted_medidas_ps_orphan: number;
  filters: DeleteFilesFilters;
};