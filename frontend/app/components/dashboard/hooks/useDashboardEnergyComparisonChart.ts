"use client";

import { useDashboardQuery } from "./useDashboardQuery";

export type DashboardEnergyComparisonChartPoint = {
  mes: number;
  mes_label: string;
  energia_neta_facturada_kwh: number;
  energia_publicada_m2_kwh: number;
  energia_publicada_m7_kwh: number;
  energia_publicada_m11_kwh: number;
  energia_publicada_art15_kwh: number;
  energia_pf_final_kwh: number;
};

export type DashboardEnergyComparisonChartResponse = {
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
  series: DashboardEnergyComparisonChartPoint[];
};

type Params = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardEnergyComparisonChart(params: Params) {
  return useDashboardQuery<DashboardEnergyComparisonChartResponse>(params, {
    endpoint: "/dashboard/energy-comparison-chart",
    defaultErrorMessage: "No se pudo cargar la gráfica del dashboard.",
  });
}