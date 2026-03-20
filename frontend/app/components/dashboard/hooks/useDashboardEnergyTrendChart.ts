"use client";

import { useDashboardQuery } from "./useDashboardQuery";

export type DashboardEnergyTrendChartPoint = {
  mes: number;
  mes_label: string;
  energia_neta_facturada_kwh: number;
};

export type DashboardEnergyTrendChartResponse = {
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
  series: DashboardEnergyTrendChartPoint[];
};

type Params = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardEnergyTrendChart(params: Params) {
  return useDashboardQuery<DashboardEnergyTrendChartResponse>(params, {
    endpoint: "/dashboard/energy-trend-chart",
    defaultErrorMessage: "No se pudo cargar la gráfica de evolución de energía.",
  });
}