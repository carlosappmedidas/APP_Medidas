"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

export type VentanaData = {
  kwh: number | null;
  perdidas_pct: number | null;
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

export function useDashboardLossesConsistency({
  token,
  empresaId = null,
  anio = null,
  mes = null,
}: Params) {
  const [data, setData] = useState<LossesConsistencyResponse | null>(null);
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
        `${API_BASE_URL}/dashboard/losses-consistency${queryString}`,
        { method: "GET", headers: getAuthHeaders(token) }
      );
      if (!response.ok) {
        let detail = "No se pudo cargar la consistencia de pérdidas.";
        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const json = (await response.json()) as LossesConsistencyResponse;
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error inesperado cargando la consistencia de pérdidas.";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}