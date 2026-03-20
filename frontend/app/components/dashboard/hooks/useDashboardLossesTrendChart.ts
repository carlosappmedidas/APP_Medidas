"use client";

import { useDashboardQuery } from "./useDashboardQuery";

export type DashboardLossesTrendChartPoint = {
  mes: number;
  mes_label: string;
  perdidas_e_facturada_pct: number;
};

export type DashboardLossesTrendChartResponse = {
  filters: {
    tenant_id?: number | null;
    empresa_id: number | null;
    anio: number | null;
    mes: number | null;
  };
  resolved_period: {
    anio: number;
    mes: number;
  } | null;
  chart_scope: {
    anio: number;
    from_mes: number;
    to_mes: number;
  } | null;
  series: DashboardLossesTrendChartPoint[];
};

type Params = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardLossesTrendChart(params: Params) {
  return useDashboardQuery<DashboardLossesTrendChartResponse>(params, {
    endpoint: "/dashboard/losses-trend-chart",
    defaultErrorMessage: "No se pudo cargar la evolución de pérdidas.",
  });
}