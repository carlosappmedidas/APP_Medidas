"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

export type DashboardFiltersResponse = {
  empresas: Array<{
    id: number;
    nombre: string | null;
    codigo: string | null;
  }>;
  anios: number[];
  meses: number[];
};

type UseDashboardFiltersParams = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
};

export function useDashboardFilters({
  token,
  empresaId = null,
  anio = null,
}: UseDashboardFiltersParams) {
  const [data, setData] = useState<DashboardFiltersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (empresaId != null) {
      params.set("empresa_id", String(empresaId));
    }

    if (anio != null) {
      params.set("anio", String(anio));
    }

    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [empresaId, anio]);

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
      const response = await fetch(`${API_BASE_URL}/dashboard/filters${queryString}`, {
        method: "GET",
        headers: getAuthHeaders(token),
      });

      if (!response.ok) {
        let detail = "No se pudieron cargar los filtros del dashboard.";

        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          //
        }

        throw new Error(detail);
      }

      const json = (await response.json()) as DashboardFiltersResponse;
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado cargando filtros del dashboard.";
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