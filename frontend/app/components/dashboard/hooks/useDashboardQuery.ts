"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";

type Params = {
  token: string | null;
  empresaId?: number | null;
  anio?: number | null;
  mes?: number | null;
};

type UseDashboardQueryOptions = {
  endpoint: string;
  defaultErrorMessage: string;
};

export function useDashboardQuery<T>(
  { token, empresaId = null, anio = null, mes = null }: Params,
  { endpoint, defaultErrorMessage }: UseDashboardQueryOptions
) {
  const [data, setData] = useState<T | null>(null);
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
      const response = await fetch(`${API_BASE_URL}${endpoint}${queryString}`, {
        method: "GET",
        headers: getAuthHeaders(token),
      });

      if (!response.ok) {
        let detail = defaultErrorMessage;
        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          // ignore json parse error
        }
        throw new Error(detail);
      }

      const json = (await response.json()) as T;
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : defaultErrorMessage;
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, queryString, endpoint, defaultErrorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}