"use client";

import { useDashboardQuery } from "./useDashboardQuery";

export type DashboardSummaryResponse = {
  filters: {
    tenant_id?: number | null;
    empresa_id: number | null;
    anio: number | null;
    mes: number | null;
  };
  common_period: {
    anio: number;
    mes: number;
  } | null;
  previous_common_period: {
    anio: number;
    mes: number;
  } | null;
  aggregation_mode: "month" | "ytd";
  energia_facturada: {
    energia_neta_facturada_kwh_total: number;
    importe_total_eur_total: number;
    variation_vs_previous: {
      energia_neta_facturada_kwh_delta: number | null;
      importe_total_eur_delta: number | null;
    };
  };
  perdidas: {
    perdidas_e_facturada_kwh_total: number;
    perdidas_e_facturada_eur_total?: number | null;
    variation_vs_previous: {
      perdidas_e_facturada_kwh_delta: number | null;
    };
  };
};

type Params = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardSummary(params: Params) {
  return useDashboardQuery<DashboardSummaryResponse>(params, {
    endpoint: "/dashboard/summary",
    defaultErrorMessage: "No se pudo cargar el resumen del dashboard.",
  });
}