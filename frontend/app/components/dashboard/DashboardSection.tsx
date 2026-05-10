"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { useDashboardFilters } from "./hooks/useDashboardFilters";
import { useDashboardEnergyComparisonChart } from "./hooks/useDashboardEnergyComparisonChart";
import { useDashboardEnergyTrendChart } from "./hooks/useDashboardEnergyTrendChart";
import { useDashboardLossesTrendChart } from "./hooks/useDashboardLossesTrendChart";
import DashboardMiniCard from "./ui/DashboardMiniCard";
import DashboardPlaceholderBox from "./ui/DashboardPlaceholderBox";
import DashboardEnergyComparisonChart from "./charts/DashboardEnergyComparisonChart";
import DashboardEnergyTrendChart from "./charts/DashboardEnergyTrendChart";
import DashboardLossesTrendChart from "./charts/DashboardLossesTrendChart";
import {
  formatKwhEur,
  formatKwhOnly,
  formatMonthYear,
  formatSignedNumberEs,
} from "./formatters";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = {
  token: string | null;
  onNavigateToAlertas?: () => void;
};

type ReeDashboardHitosResponse = {
  anio: number | null;
  mes: number | null;
  mes_label: string | null;
  fecha_publicacion_m1: string | null;
  mes_afectado_publicacion_m1: string | null;
  fecha_publicacion_m2: string | null;
  mes_afectado_publicacion_m2: string | null;
  fecha_publicacion_m7: string | null;
  mes_afectado_publicacion_m7: string | null;
  fecha_limite_respuesta_objeciones: string | null;
  mes_afectado_limite_respuesta_objeciones: string | null;
  fecha_publicacion_m11: string | null;
  mes_afectado_publicacion_m11: string | null;
  fecha_publicacion_art15: string | null;
  mes_afectado_publicacion_art15: string | null;
};

const NOMBRES_MES: Record<number, string> = {
  1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr",
  5: "May", 6: "Jun", 7: "Jul", 8: "Ago",
  9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
};

function formatDashboardDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDashboardDateWithMesAfectado(
  fecha: string | null,
  mesAfectado: string | null
): string {
  if (!fecha) return "—";
  const fechaFormateada = formatDashboardDate(fecha);
  if (!mesAfectado) return fechaFormateada;
  return `${fechaFormateada} → ${mesAfectado}`;
}

// Extrae solo el día de una fecha ISO "YYYY-MM-DD"
function extractDay(value: string | null): string {
  if (!value) return "—";
  const parts = value.split("-");
  if (parts.length < 3) return "—";
  return String(parseInt(parts[2], 10));
}

export default function DashboardSection({ token, onNavigateToAlertas }: Props) {
  const isLogged = !!token;
  const [empresa, setEmpresa] = useState("");
  const [anio, setAnio] = useState("");
  const [mes, setMes] = useState("");
  const [reeHitosData, setReeHitosData] = useState<ReeDashboardHitosResponse | null>(null);
  const [reeHitosLoading, setReeHitosLoading] = useState(false);
  const [reeHitosError, setReeHitosError] = useState<string | null>(null);

  // Contadores para la tarjeta de Alertas (objeciones + publicaciones REE + envíos REE)
  const [alertasObjecionesCount, setAlertasObjecionesCount] = useState<number | null>(null);
  const [alertasPublicacionesCount, setAlertasPublicacionesCount] = useState<number | null>(null);
  const [alertasEnviosCount, setAlertasEnviosCount] = useState<number | null>(null);

  const empresaId = empresa ? Number(empresa) : null;
  const anioValue = anio ? Number(anio) : null;
  const mesValue = anio && mes ? Number(mes) : null;

  const { data: filtersData, loading: filtersLoading, error: filtersError } =
    useDashboardFilters({ token, empresaId });

  const { data, loading, error } = useDashboardSummary({
    token, empresaId, anio: anioValue, mes: mesValue,
  });

  const { data: chartData, loading: chartLoading, error: chartError } =
    useDashboardEnergyComparisonChart({ token, empresaId, anio: anioValue, mes: mesValue });

  const { data: energyTrendChartData, loading: energyTrendChartLoading, error: energyTrendChartError } =
    useDashboardEnergyTrendChart({ token, empresaId, anio: anioValue, mes: mesValue });

  const { data: lossesTrendChartData, loading: lossesTrendChartLoading, error: lossesTrendChartError } =
    useDashboardLossesTrendChart({ token, empresaId, anio: anioValue, mes: mesValue });

  useEffect(() => { setMes(""); }, [empresa]);
  useEffect(() => { setMes(""); }, [anio]);

  useEffect(() => {
    const loadReeDashboardHitos = async () => {
      if (!token) {
        setReeHitosData(null);
        setReeHitosError(null);
        return;
      }
      setReeHitosLoading(true);
      setReeHitosError(null);
      try {
        const searchParams = new URLSearchParams();
        if (anioValue !== null) searchParams.set("anio", String(anioValue));
        if (mesValue !== null) searchParams.set("mes", String(mesValue));
        const url = `${API_BASE_URL}/calendario-ree/dashboard-hitos${
          searchParams.toString() ? `?${searchParams.toString()}` : ""
        }`;
        const response = await fetch(url, { method: "GET", headers: getAuthHeaders(token) });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "No se pudieron cargar los hitos REE del dashboard.");
        }
        const json = (await response.json()) as ReeDashboardHitosResponse;
        setReeHitosData(json);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudieron cargar los hitos REE del dashboard.";
        setReeHitosError(message);
        setReeHitosData(null);
      } finally {
        setReeHitosLoading(false);
      }
    };
    void loadReeDashboardHitos();
  }, [token, anioValue, mesValue]);

  // Cargar contadores de alertas activas (Objeciones + Publicaciones REE + Envíos REE)
  useEffect(() => {
    if (!token) {
      setAlertasObjecionesCount(null);
      setAlertasPublicacionesCount(null);
      setAlertasEnviosCount(null);
      return;
    }
    let cancelled = false;
    const cargarContadores = async () => {
      try {
        const [resObj, resPub, resEnv] = await Promise.all([
          fetch(`${API_BASE_URL}/objeciones/alertas?estado=activa`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE_URL}/measures/descarga/automatizacion/alertas?estado=activa`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE_URL}/envios/alertas/contador`, { headers: getAuthHeaders(token) }),
        ]);
        if (cancelled) return;

        // Objeciones: el endpoint devuelve un array directamente
        if (resObj.ok) {
          const dataObj = await resObj.json();
          setAlertasObjecionesCount(Array.isArray(dataObj) ? dataObj.length : 0);
        } else {
          setAlertasObjecionesCount(0);
        }

        // Publicaciones REE: devuelve { total, activas, items }
        if (resPub.ok) {
          const dataPub = await resPub.json();
          const activas = typeof dataPub?.activas === "number" ? dataPub.activas : (Array.isArray(dataPub?.items) ? dataPub.items.length : 0);
          setAlertasPublicacionesCount(activas);
        } else {
          setAlertasPublicacionesCount(0);
        }

        // Envíos REE: devuelve { total, critical, warning, info }
        if (resEnv.ok) {
          const dataEnv = await resEnv.json();
          const total = typeof dataEnv?.total === "number" ? dataEnv.total : 0;
          setAlertasEnviosCount(total);
        } else {
          setAlertasEnviosCount(0);
        }
      } catch {
        if (cancelled) return;
        setAlertasObjecionesCount(0);
        setAlertasPublicacionesCount(0);
        setAlertasEnviosCount(0);
      }
    };
    void cargarContadores();
    return () => { cancelled = true; };
  }, [token]);

  const empresaOptions = useMemo(() => {
    const base = [{ value: "", label: "Todas" }];
    if (!filtersData?.empresas?.length) return base;
    return [
      ...base,
      ...filtersData.empresas.map((empresaItem) => ({
        value: String(empresaItem.id),
        label: empresaItem.nombre ?? empresaItem.codigo ?? `Empresa ${empresaItem.id}`,
      })),
    ];
  }, [filtersData]);

  const anioOptions = useMemo(() => {
    const base = [{ value: "", label: "Último disponible" }];
    if (!filtersData?.anios?.length) return base;
    return [
      ...base,
      ...filtersData.anios.map((anioItem) => ({
        value: String(anioItem),
        label: String(anioItem),
      })),
    ];
  }, [filtersData]);

  const mesesDisponibles = useMemo(() => {
    if (!anio) return [];
    if (!filtersData?.meses?.length) return [];
    return [...filtersData.meses].sort((a, b) => a - b);
  }, [filtersData, anio]);

  const mesOptions = useMemo(() => {
    const base = [{ value: "", label: "Último disponible" }];
    if (!mesesDisponibles.length) return base;
    return [
      ...base,
      ...mesesDisponibles.map((mesItem) => ({
        value: String(mesItem),
        label: NOMBRES_MES[mesItem] ?? String(mesItem).padStart(2, "0"),
      })),
    ];
  }, [mesesDisponibles]);

  useEffect(() => {
    if (!mes) return;
    const mesNumero = Number(mes);
    if (!mesesDisponibles.includes(mesNumero)) setMes("");
  }, [mes, mesesDisponibles]);

  const aggregationMode = data?.aggregation_mode ?? "month";

  const periodoComunLabel = useMemo(
    () => formatMonthYear(data?.common_period?.anio, data?.common_period?.mes),
    [data]
  );

  const previousPeriodoLabel = useMemo(
    () => formatMonthYear(data?.previous_common_period?.anio, data?.previous_common_period?.mes),
    [data]
  );

  const periodoTituloLabel = useMemo(() => {
    if (!data?.common_period) return "";
    const { anio: a, mes: m } = data.common_period;
    if (aggregationMode === "ytd") return String(a);
    return `${NOMBRES_MES[m] ?? m} ${a}`;
  }, [data, aggregationMode]);

  const resumenSubtitle = useMemo(() => {
    if (!isLogged) return "Resumen inicial del dashboard.";
    if (aggregationMode === "ytd") {
      return "Resumen acumulado del año hasta el último mes común disponible entre Medidas General y PS.";
    }
    return "Resumen inicial del último mes común disponible entre Medidas General y PS.";
  }, [isLogged, aggregationMode]);

  const periodoInfoLabel = useMemo(() => {
    if (aggregationMode === "ytd") return `Acumulado hasta: ${periodoComunLabel}`;
    return `Periodo común actual: ${periodoComunLabel}`;
  }, [aggregationMode, periodoComunLabel]);

  const variationTooltipTitle = useMemo(() => {
    if (aggregationMode === "ytd") return "Variación vs mismo acumulado año anterior";
    return "Variación vs mes anterior";
  }, [aggregationMode]);

  const energiaCardTitle = useMemo(() => {
    if (aggregationMode === "ytd") return `ENERGÍA FACTURADA ACUMULADA ${periodoTituloLabel}`.trim();
    return `ENERGÍA FACTURADA ${periodoTituloLabel}`.trim();
  }, [aggregationMode, periodoTituloLabel]);

  const perdidasCardTitle = useMemo(() => {
    if (aggregationMode === "ytd") return `PÉRDIDAS ACUMULADAS ${periodoTituloLabel}`.trim();
    return `PÉRDIDAS ${periodoTituloLabel}`.trim();
  }, [aggregationMode, periodoTituloLabel]);

  const anioGraficoLabel = useMemo(() => {
    if (data?.common_period?.anio) return String(data.common_period.anio);
    return "";
  }, [data]);

  const energiaFacturadaTotal = useMemo(() => {
    if (!isLogged) return "—";
    if (loading) return "Cargando...";
    if (!data?.common_period) return "Sin datos";
    return formatKwhEur(
      data.energia_facturada.energia_neta_facturada_kwh_total,
      data.energia_facturada.importe_total_eur_total
    );
  }, [isLogged, loading, data]);

  const energiaFacturadaVariationKwh = useMemo(() => {
    if (!isLogged || loading || !data?.previous_common_period) return "—";
    return formatSignedNumberEs(
      data.energia_facturada.variation_vs_previous.energia_neta_facturada_kwh_delta
    );
  }, [isLogged, loading, data]);

  const energiaFacturadaVariationEur = useMemo(() => {
    if (!isLogged || loading || !data?.previous_common_period) return "—";
    return formatSignedNumberEs(
      data.energia_facturada.variation_vs_previous.importe_total_eur_delta
    );
  }, [isLogged, loading, data]);

  const perdidasTotal = useMemo(() => {
    if (!isLogged) return "—";
    if (loading) return "Cargando...";
    if (!data?.common_period) return "Sin datos";
    return formatKwhOnly(data.perdidas.perdidas_e_facturada_kwh_total);
  }, [isLogged, loading, data]);

  const perdidasVariation = useMemo(() => {
    if (!isLogged) return "—";
    if (loading) return "Cargando...";
    if (!data?.previous_common_period) return "—";
    const currentLosses = data.perdidas.perdidas_e_facturada_kwh_total;
    const rawDelta = data.perdidas.variation_vs_previous.perdidas_e_facturada_kwh_delta;
    if (rawDelta == null || Number.isNaN(rawDelta)) return "—";
    const previousLosses = currentLosses - rawDelta;
    const displayDelta = Math.abs(currentLosses) - Math.abs(previousLosses);
    return formatSignedNumberEs(displayDelta);
  }, [isLogged, loading, data]);

  // Variación vs mismo periodo año anterior — solo se muestra si existe dato.
  const energiaFacturadaVariationYoyKwh = useMemo(() => {
    if (!isLogged || loading || !data?.previous_year_period) return null;
    return formatSignedNumberEs(
      data.energia_facturada.variation_vs_previous_year.energia_neta_facturada_kwh_delta
    );
  }, [isLogged, loading, data]);

  const energiaFacturadaVariationYoyEur = useMemo(() => {
    if (!isLogged || loading || !data?.previous_year_period) return null;
    return formatSignedNumberEs(
      data.energia_facturada.variation_vs_previous_year.importe_total_eur_delta
    );
  }, [isLogged, loading, data]);

  const perdidasVariationYoy = useMemo(() => {
    if (!isLogged || loading || !data?.previous_year_period) return null;
    const currentLosses = data.perdidas.perdidas_e_facturada_kwh_total;
    const rawDelta = data.perdidas.variation_vs_previous_year.perdidas_e_facturada_kwh_delta;
    if (rawDelta == null || Number.isNaN(rawDelta)) return null;
    const previousLosses = currentLosses - rawDelta;
    const displayDelta = Math.abs(currentLosses) - Math.abs(previousLosses);
    return formatSignedNumberEs(displayDelta);
  }, [isLogged, loading, data]);

  // Etiqueta del periodo año anterior (ej. "Feb 2025")
  const previousYearPeriodLabel = useMemo(() => {
    if (!data?.previous_year_period) return "";
    const { anio: a, mes: m } = data.previous_year_period;
    return `${NOMBRES_MES[m] ?? m} ${a}`;
  }, [data]);

  const dashboardErrorText = useMemo(() => {
    if (!isLogged) return null;
    return error;
  }, [isLogged, error]);

  const filtersErrorText = useMemo(() => {
    if (!isLogged) return null;
    return filtersError;
  }, [isLogged, filtersError]);

  const comparisonHelpText = useMemo(() => {
    if (!data?.previous_common_period) return null;
    if (aggregationMode === "ytd") {
      return `Comparando hasta ${periodoComunLabel} contra el acumulado hasta ${previousPeriodoLabel}.`;
    }
    return `Comparando ${periodoComunLabel} contra ${previousPeriodoLabel}.`;
  }, [aggregationMode, data, periodoComunLabel, previousPeriodoLabel]);

  const hayFiltrosActivos = !!(empresa || anio || mes);

  // ── Datos del calendario para el nuevo layout ────────────────────────
  // Cada hito incluye su fecha completa (ISO) para poder calcular cuál es
  // el "próximo" comparándolo con la fecha de hoy. El primero cuya fecha
  // sea >= hoy se marca como `isNext`. Los anteriores como `isPast`.
  type ReeHito = {
    dia: string;
    label: string;
    mesAfectado: string;
    fechaIso: string | null;
    isNext: boolean;
    isPast: boolean;
  };

  const reeHitos: ReeHito[] = useMemo(() => {
    if (!reeHitosData) return [];

    // Construir lista base con fecha ISO original
    const base = [
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m1),
        label: "Publ. m+1",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m1 ?? "—",
        fechaIso: reeHitosData.fecha_publicacion_m1,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m2),
        label: "Publ. m-2",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m2 ?? "—",
        fechaIso: reeHitosData.fecha_publicacion_m2,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m7),
        label: "Publ. m-7",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m7 ?? "—",
        fechaIso: reeHitosData.fecha_publicacion_m7,
      },
      {
        dia: extractDay(reeHitosData.fecha_limite_respuesta_objeciones),
        label: "Lím. objec.",
        mesAfectado: reeHitosData.mes_afectado_limite_respuesta_objeciones ?? "—",
        fechaIso: reeHitosData.fecha_limite_respuesta_objeciones,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m11),
        label: "Publ. m-11",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m11 ?? "—",
        fechaIso: reeHitosData.fecha_publicacion_m11,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_art15),
        label: "Publ. Art.15",
        mesAfectado: reeHitosData.mes_afectado_publicacion_art15 ?? "—",
        fechaIso: reeHitosData.fecha_publicacion_art15,
      },
    ];

    // Calcular fecha de hoy a las 00:00 (para que un hito de hoy cuente como "próximo")
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyMs = hoy.getTime();

    // Buscar el índice del PRIMER hito con fecha >= hoy en orden cronológico.
    // Importante: hay que ordenar los hitos por fecha para encontrar el siguiente
    // cronológicamente, no el primero del array (que va por tipo de publicación).
    const conFechaMs = base.map((h, idx) => {
      if (!h.fechaIso) return { idx, ms: NaN };
      const d = new Date(`${h.fechaIso}T00:00:00`);
      return { idx, ms: d.getTime() };
    });
    const futuros = conFechaMs
      .filter((x) => !Number.isNaN(x.ms) && x.ms >= hoyMs)
      .sort((a, b) => a.ms - b.ms);
    const idxNext = futuros.length > 0 ? futuros[0].idx : -1;

    return base.map((h, idx) => {
      const ms = conFechaMs[idx].ms;
      const isPast = !Number.isNaN(ms) && ms < hoyMs;
      const isNext = idx === idxNext;
      return { ...h, isNext, isPast };
    });
  }, [reeHitosData]);

  const reeCalendarioMesLabel = useMemo(() => {
    if (reeHitosData?.mes_label) return reeHitosData.mes_label;
    return "";
  }, [reeHitosData]);
  // ────────────────────────────────────────────────────────────────────

  return (
    <section className="ui-card text-sm">
      <div className="flex flex-col gap-4">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <h3 className="ui-card-title text-base md:text-lg">DASHBOARD MEDIDAS</h3>
            <p className="ui-card-subtitle mt-1">{resumenSubtitle}</p>
            {isLogged && (
              <div className="mt-1 text-[11px] ui-muted">
                {periodoInfoLabel.split(":")[0]}:{" "}
                <span className="font-semibold">{periodoComunLabel}</span>
              </div>
            )}
            {isLogged && comparisonHelpText ? (
              <div className="mt-1 text-[11px] ui-muted">{comparisonHelpText}</div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex flex-row gap-2 items-end">
              <div className="flex flex-col gap-0.5">
                <label className="ui-label">Empresa</label>
                <select
                  className="ui-select text-[11px] w-auto"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  disabled={!isLogged || filtersLoading}
                >
                  {empresaOptions.map((option) => (
                    <option key={`empresa-${option.value || "all"}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="ui-label">Año</label>
                <select
                  className="ui-select text-[11px] w-auto"
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                  disabled={!isLogged || filtersLoading}
                >
                  {anioOptions.map((option) => (
                    <option key={`anio-${option.value || "all"}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="ui-label">Mes</label>
                <select
                  className="ui-select text-[11px] w-auto"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  disabled={!isLogged || filtersLoading || !anio}
                >
                  {mesOptions.map((option) => (
                    <option key={`mes-${option.value || "all"}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {hayFiltrosActivos && (
              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={() => { setEmpresa(""); setAnio(""); setMes(""); }}
                disabled={!isLogged}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {filtersErrorText && (
          <div className="ui-alert ui-alert--danger">
            Error cargando filtros del dashboard: {filtersErrorText}
          </div>
        )}
        {dashboardErrorText && (
          <div className="ui-alert ui-alert--danger">
            Error cargando el resumen del dashboard: {dashboardErrorText}
          </div>
        )}

        {/* ── Fila 1: Energía · Pérdidas · Alertas · Calendario ────── */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-4">

          {/* Energía facturada — borde exterior + título muted + datos con field-bg */}
          <div
            className="rounded-xl border p-3 flex flex-col gap-2"
            style={{
              borderColor: "var(--card-border)",
              background: "var(--card-bg)",
              borderLeft: "3px solid #378ADD",
            }}
          >
            <div className="text-center text-[10px] font-semibold uppercase tracking-[0.07em] ui-muted">
              {energiaCardTitle}
            </div>
            <div
              className="rounded-lg p-3 flex flex-col items-center justify-center text-center flex-1"
              style={{ background: "var(--field-bg)", minHeight: "80px" }}
            >
              <div
                className="group relative cursor-default"
                title={`${variationTooltipTitle}: ${energiaFacturadaVariationKwh} kWh · ${energiaFacturadaVariationEur} €`}
              >
                <div
                  className="text-[18px] font-semibold leading-snug whitespace-nowrap"
                  style={{ color: "var(--text)" }}
                >
                  {energiaFacturadaTotal}
                </div>
              </div>
              <div
                className="mt-2 pt-2 w-full text-[11px]"
                style={{ borderTop: "0.5px solid var(--card-border)", color: "var(--text)" }}
              >
                <span className="ui-muted">{variationTooltipTitle}:</span>{" "}
                <span>{energiaFacturadaVariationKwh} · {energiaFacturadaVariationEur}</span>
              </div>
              {energiaFacturadaVariationYoyKwh !== null && energiaFacturadaVariationYoyEur !== null && (
                <div
                  className="mt-1 w-full text-[11px]"
                  style={{ color: "var(--text)" }}
                >
                  <span className="ui-muted">Variación vs {previousYearPeriodLabel}:</span>{" "}
                  <span>{energiaFacturadaVariationYoyKwh} · {energiaFacturadaVariationYoyEur}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pérdidas — borde exterior + título muted + datos con field-bg */}
          <div
            className="rounded-xl border p-3 flex flex-col gap-2"
            style={{
              borderColor: "var(--card-border)",
              background: "var(--card-bg)",
              borderLeft: "3px solid #D85A30",
            }}
          >
            <div className="text-center text-[10px] font-semibold uppercase tracking-[0.07em] ui-muted">
              {perdidasCardTitle}
            </div>
            <div
              className="rounded-lg p-3 flex flex-col items-center justify-center text-center flex-1"
              style={{ background: "var(--field-bg)", minHeight: "80px" }}
            >
              <div
                className="text-[18px] font-semibold leading-snug whitespace-nowrap"
                style={{ color: "var(--text)" }}
              >
                {perdidasTotal}
              </div>
               <div
                className="mt-2 pt-2 w-full text-[11px]"
                style={{ borderTop: "0.5px solid var(--card-border)", color: "var(--text)" }}
              >
                <span className="ui-muted">{variationTooltipTitle}:</span>{" "}
                <span>{perdidasVariation}</span>
              </div>
              {perdidasVariationYoy !== null && (
                <div
                  className="mt-1 w-full text-[11px]"
                  style={{ color: "var(--text)" }}
                >
                  <span className="ui-muted">Variación vs {previousYearPeriodLabel}:</span>{" "}
                  <span>{perdidasVariationYoy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Alertas — tarjeta unificada con contadores y CTA */}
          <div
            className="rounded-xl border p-4 flex flex-col cursor-pointer transition-transform hover:-translate-y-px"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
            onClick={() => { if (onNavigateToAlertas) onNavigateToAlertas(); }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] ui-muted mb-3 text-center">
              🔔 Alertas activas
            </div>
            <div className="grid grid-cols-3 gap-1.5 flex-1 mb-3">
              {/* Objeciones */}
              <div
                className="rounded-lg p-2.5 flex flex-col justify-center"
                style={{ background: "var(--field-bg)" }}
              >
                <div className="text-[13px] mb-1">📥</div>
                <div
                  className="text-[20px] font-semibold leading-none"
                  style={{ color: (alertasObjecionesCount ?? 0) > 0 ? "var(--text)" : "#1D9E75" }}
                >
                  {alertasObjecionesCount ?? "—"}
                </div>
                <div className="text-[9px] uppercase tracking-[0.04em] ui-muted mt-1">
                  Objeciones
                </div>
              </div>
              {/* Publicaciones REE */}
              <div
                className="rounded-lg p-2.5 flex flex-col justify-center"
                style={{ background: "var(--field-bg)" }}
              >
                <div className="text-[13px] mb-1">📊</div>
                <div
                  className="text-[20px] font-semibold leading-none"
                  style={{ color: (alertasPublicacionesCount ?? 0) > 0 ? "var(--text)" : "#1D9E75" }}
                >
                  {alertasPublicacionesCount ?? "—"}
                </div>
                <div className="text-[9px] uppercase tracking-[0.04em] ui-muted mt-1">
                  Publicaciones
                </div>
              </div>
              {/* Envíos REE */}
              <div
                className="rounded-lg p-2.5 flex flex-col justify-center"
                style={{ background: "var(--field-bg)" }}
              >
                <div className="text-[13px] mb-1">📤</div>
                <div
                  className="text-[20px] font-semibold leading-none"
                  style={{ color: (alertasEnviosCount ?? 0) > 0 ? "var(--text)" : "#1D9E75" }}
                >
                  {alertasEnviosCount ?? "—"}
                </div>
                <div className="text-[9px] uppercase tracking-[0.04em] ui-muted mt-1">
                  Envíos REE
                </div>
              </div>
            </div>
            <div
              className="text-[11px] font-medium flex items-center gap-1"
              style={{ color: "#378ADD" }}
            >
              Ver todas las alertas →
            </div>
          </div>

          {/* Calendario REE — compacto 2 col */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] ui-muted mb-3 text-center">
              {reeHitosLoading
                ? "Cargando calendario..."
                : `Calendario REE${reeCalendarioMesLabel ? ` · ${reeCalendarioMesLabel}` : ""}`}
            </div>
            {reeHitosError && (
              <div className="text-[10px] ui-muted text-center">{reeHitosError}</div>
            )}
            {!reeHitosError && (
              <div className="grid grid-cols-2 gap-1.5">
                {reeHitos.map((hito, idx) => {
                  // Estilos según el estado del hito
                  const bgCelda = hito.isNext
                    ? "rgba(245,158,11,0.10)"
                    : "var(--field-bg)";
                  const bgDia = hito.isNext
                    ? "rgba(245,158,11,0.20)"
                    : "var(--card-bg)";
                  const colorTexto = hito.isNext ? "#D97706" : "var(--text)";
                  const colorMes = hito.isNext
                    ? "#D97706"
                    : "var(--text-muted, var(--field-text))";
                  const opacidad = hito.isPast ? 0.45 : 1;
                  const borde = hito.isNext
                    ? "1px solid rgba(245,158,11,0.5)"
                    : "1px solid transparent";

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg relative"
                      style={{
                        background: bgCelda,
                        border: borde,
                        opacity: opacidad,
                      }}
                    >
                      {hito.isNext && (
                        <span
                          style={{
                            position: "absolute",
                            top: "-7px",
                            left: "8px",
                            fontSize: "8px",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            background: "#F59E0B",
                            color: "#0d1322",
                            padding: "1px 6px",
                            borderRadius: "6px",
                          }}
                        >
                          PRÓXIMO
                        </span>
                      )}
                      <div
                        className="flex items-center justify-center rounded flex-shrink-0 text-[10px] font-semibold"
                        style={{
                          width: "20px",
                          height: "20px",
                          background: bgDia,
                          color: colorTexto,
                        }}
                      >
                        {reeHitosLoading ? "·" : hito.dia}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[10px] font-semibold truncate"
                          style={{ color: colorTexto }}
                        >
                          {hito.label}
                        </div>
                        <div
                          className="text-[9px]"
                          style={{ color: colorMes }}
                        >
                          {reeHitosLoading ? "..." : hito.mesAfectado}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Fila 2: 3 gráficas ───────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">

          <DashboardMiniCard
            title={`EVOLUCIÓN DE ENERGÍA FACTURADA ${anioGraficoLabel}`.trim()}
            minHeightClassName="min-h-[180px]"
          >
            <DashboardEnergyTrendChart
              loading={energyTrendChartLoading}
              error={energyTrendChartError}
              points={energyTrendChartData?.series ?? []}
            />
          </DashboardMiniCard>

          <DashboardMiniCard
            title={`EVOLUCIÓN DE PÉRDIDAS ${anioGraficoLabel}`.trim()}
            minHeightClassName="min-h-[180px]"
          >
            <DashboardLossesTrendChart
              loading={lossesTrendChartLoading}
              error={lossesTrendChartError}
              points={lossesTrendChartData?.series ?? []}
            />
          </DashboardMiniCard>

          <DashboardMiniCard
            title={`ENERGÍA FACTURADA VS. REE VS. PF ${anioGraficoLabel}`.trim()}
            minHeightClassName="min-h-[180px]"
          >
            <DashboardEnergyComparisonChart
              loading={chartLoading}
              error={chartError}
              points={chartData?.series ?? []}
            />
          </DashboardMiniCard>

        </div>

        {!isLogged && (
          <div className="ui-alert ui-alert--danger">
            Inicia sesión para ver datos reales en el dashboard.
          </div>
        )}

      </div>
    </section>
  );
}
