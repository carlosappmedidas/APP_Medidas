"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";

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

type UseDashboardSummaryParams = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

export function useDashboardSummary({
  token,
  empresaId = null,
  anio = null,
  mes = null,
}: UseDashboardSummaryParams) {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
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
      const response = await fetch(`${API_BASE_URL}/dashboard/summary${queryString}`, {
        method: "GET",
        headers: getAuthHeaders(token),
      });

      if (!response.ok) {
        let detail = "No se pudo cargar el resumen del dashboard.";

        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          //
        }

        throw new Error(detail);
      }

      const json = (await response.json()) as DashboardSummaryResponse;
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado cargando el dashboard.";
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