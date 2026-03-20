"use client";

import { useDashboardQuery } from "./useDashboardQuery";

export type VentanaData = {
  kwh: number | null;
  perdidas_pct: number | null;
  pf_kwh: number | null;
};

export type LossesConsistencyResponse = {
  filters: {
    tenant_id?: number | null;
    empresa_id: number | null;
    anio: number | null;
    mes: number | null;
  };
  common_period: { anio: number; mes: number } | null;
  aggregation_mode: string;
  ventanas: {
    m1: VentanaData;
    m2: VentanaData;
    m7: VentanaData;
    m11: VentanaData;
    art15: VentanaData;
  };
  comparaciones: {
    m1_vs_m2: number | null;
    m2_vs_m7: number | null;
    m7_vs_m11: number | null;
    m11_vs_art15: number | null;
  };
};

type Params = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardLossesConsistency(params: Params) {
  return useDashboardQuery<LossesConsistencyResponse>(params, {
    endpoint: "/dashboard/losses-consistency",
    defaultErrorMessage: "No se pudo cargar la consistencia de pérdidas.",
  });
}