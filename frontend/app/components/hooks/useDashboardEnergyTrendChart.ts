"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

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

type UseDashboardEnergyTrendChartParams = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardEnergyTrendChart({
  token,
  empresaId = null,
  anio = null,
  mes = null,
}: UseDashboardEnergyTrendChartParams) {
  const [data, setData] = useState<DashboardEnergyTrendChartResponse | null>(null);
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
      const response = await fetch(`${API_BASE_URL}/dashboard/energy-trend-chart${queryString}`, {
        method: "GET",
        headers: getAuthHeaders(token),
      });

      if (!response.ok) {
        let detail = "No se pudo cargar la gráfica de evolución de energía.";

        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          //
        }

        throw new Error(detail);
      }

      const json = (await response.json()) as DashboardEnergyTrendChartResponse;
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado cargando la gráfica de evolución de energía.";
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