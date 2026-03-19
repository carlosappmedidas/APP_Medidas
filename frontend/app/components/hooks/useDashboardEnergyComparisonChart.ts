"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

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

type UseDashboardEnergyComparisonChartParams = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardEnergyComparisonChart({
  token,
  empresaId = null,
  anio = null,
  mes = null,
}: UseDashboardEnergyComparisonChartParams) {
  const [data, setData] = useState<DashboardEnergyComparisonChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (empresaId != null) params.set("empresa_id", String(empresaId));
    if (anio != null) params.set("anio", String(anio));
    if (mes != null) params.set("mes", String(mes));

    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [empresaId, anio, mes]);

  const load = useCallback(async () => {
    if (!token) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/dashboard/energy-comparison-chart${queryString}`,
        {
          method: "GET",
          headers: getAuthHeaders(token),
        }
      );

      if (!response.ok) {
        let detail = "No se pudo cargar la gráfica del dashboard.";

        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          //
        }

        throw new Error(detail);
      }

      const json = (await response.json()) as DashboardEnergyComparisonChartResponse;
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado cargando la gráfica del dashboard.";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    error,
    reload: load,
  };
}