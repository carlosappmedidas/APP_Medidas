"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { useDashboardFilters } from "./hooks/useDashboardFilters";
import { useDashboardEnergyComparisonChart } from "./hooks/useDashboardEnergyComparisonChart";
import { useDashboardEnergyTrendChart } from "./hooks/useDashboardEnergyTrendChart";
import { useDashboardLossesTrendChart } from "./hooks/useDashboardLossesTrendChart";
import { useDashboardLossesConsistency } from "./hooks/useDashboardLossesConsistency";
import DashboardMiniCard from "./ui/DashboardMiniCard";
import DashboardPlaceholderBox from "./ui/DashboardPlaceholderBox";
import DashboardEnergyComparisonChart from "./charts/DashboardEnergyComparisonChart";
import DashboardEnergyTrendChart from "./charts/DashboardEnergyTrendChart";
import DashboardLossesTrendChart from "./charts/DashboardLossesTrendChart";
import LossesConsistencyCard from "./ui/LossesConsistencyCard";
import {
  formatKwhEur,
  formatKwhOnly,
  formatMonthYear,
  formatSignedNumberEs,
} from "./formatters";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = {
  token: string | null;
};

type ReeDashboardHitosResponse = {
  anio: number | null;
  mes: number | null;
  mes_label: string | null;
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

export default function DashboardSection({ token }: Props) {
  const isLogged = !!token;
  const [empresa, setEmpresa] = useState("");
  const [anio, setAnio] = useState("");
  const [mes, setMes] = useState("");
  const [reeHitosData, setReeHitosData] = useState<ReeDashboardHitosResponse | null>(null);
  const [reeHitosLoading, setReeHitosLoading] = useState(false);
  const [reeHitosError, setReeHitosError] = useState<string | null>(null);

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

  const lossesConsistencyAnio = useMemo(() => {
    if (anioValue !== null) return anioValue;
    const lastAnio = data?.common_period?.anio;
    if (!lastAnio) return null;
    const lastMes = data?.common_period?.mes;
    if (lastMes !== undefined && lastMes !== null && lastMes <= 3) {
      return lastAnio - 1;
    }
    return lastAnio;
  }, [anioValue, data]);

  const { data: lossesConsistencyData, loading: lossesConsistencyLoading, error: lossesConsistencyError } =
    useDashboardLossesConsistency({ token, empresaId, anio: lossesConsistencyAnio, mes: mesValue });

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
  type ReeHito = { dia: string; label: string; mesAfectado: string; isAlert: boolean };

  const reeHitos: ReeHito[] = useMemo(() => {
    if (!reeHitosData) return [];
    return [
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m2),
        label: "Publ. m-2",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m2 ?? "—",
        isAlert: false,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m7),
        label: "Publ. m-7",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m7 ?? "—",
        isAlert: false,
      },
      {
        dia: extractDay(reeHitosData.fecha_limite_respuesta_objeciones),
        label: "Lím. objec.",
        mesAfectado: reeHitosData.mes_afectado_limite_respuesta_objeciones ?? "—",
        isAlert: true,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_m11),
        label: "Publ. m-11",
        mesAfectado: reeHitosData.mes_afectado_publicacion_m11 ?? "—",
        isAlert: false,
      },
      {
        dia: extractDay(reeHitosData.fecha_publicacion_art15),
        label: "Publ. Art.15",
        mesAfectado: reeHitosData.mes_afectado_publicacion_art15 ?? "—",
        isAlert: false,
      },
    ];
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

        {/* ── Fila 1: Energía · Pérdidas · Consistencia ────────────── */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">

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
              className="rounded-lg p-3 flex flex-col items-center justify-center text-center"
              style={{ background: "var(--field-bg)", minHeight: "80px" }}
            >
              <div
                className="group relative cursor-default"
                title={`${variationTooltipTitle}: ${energiaFacturadaVariationKwh} kWh · ${energiaFacturadaVariationEur} €`}
              >
                <div className="text-[22px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
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
              className="rounded-lg p-3 flex flex-col items-center justify-center text-center"
              style={{ background: "var(--field-bg)", minHeight: "80px" }}
            >
              <div className="text-[22px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
                {perdidasTotal}
              </div>
              <div
                className="mt-2 pt-2 w-full text-[11px]"
                style={{ borderTop: "0.5px solid var(--card-border)", color: "var(--text)" }}
              >
                <span className="ui-muted">{variationTooltipTitle}:</span>{" "}
                <span>{perdidasVariation}</span>
              </div>
            </div>
          </div>

          {/* Consistencia de pérdidas — sin cambios */}
          <div
            className="rounded-xl border p-4 flex flex-col items-center justify-center"
            style={{
              borderColor: "var(--card-border)",
              background: "var(--card-bg)",
              minHeight: "130px",
            }}
          >
            <div className="text-center text-[10px] font-semibold uppercase tracking-[0.04em] ui-muted mb-1">
              {`CONSISTENCIA PÉRDIDAS ${lossesConsistencyAnio ?? ""}`.trim()}
            </div>
            <div className="text-center text-[9px] ui-muted mb-2">
              Comparativa entre publicaciones
            </div>
            <LossesConsistencyCard
              data={lossesConsistencyData}
              loading={lossesConsistencyLoading}
              error={lossesConsistencyError}
              compact
            />
          </div>
        </div>

        {/* ── Fila 2: Objeciones + Alertas (izq) · Calendario (der) ── */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">

          {/* Objeciones */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] ui-muted mb-3 text-center">
              Objeciones
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: "Total activas", value: "—" },
                { label: "Total respondidas en plazo", value: "—" },
                { label: "Total respondidas fuera plazo", value: "—" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px]"
                  style={{ background: "var(--field-bg)" }}
                >
                  <span className="ui-muted">{row.label}</span>
                  <span className="font-semibold">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Alertas */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] ui-muted mb-3 text-center">
              Alertas
            </div>
            <DashboardPlaceholderBox heightClassName="min-h-[80px]" />
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
                {reeHitos.map((hito, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
                    style={{
                      background: hito.isAlert ? "#FEF2F2" : "var(--field-bg)",
                      gridColumn: idx === 4 ? "1 / -1" : undefined,
                    }}
                  >
                    <div
                      className="flex items-center justify-center rounded flex-shrink-0 text-[10px] font-semibold"
                      style={{
                        width: "20px",
                        height: "20px",
                        background: hito.isAlert ? "#FCEBEB" : "var(--card-bg)",
                        color: hito.isAlert ? "#7F1D1D" : "var(--text)",
                      }}
                    >
                      {reeHitosLoading ? "·" : hito.dia}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[10px] font-semibold truncate"
                        style={{ color: hito.isAlert ? "#7F1D1D" : "var(--text)" }}
                      >
                        {hito.label}
                      </div>
                      <div
                        className="text-[9px]"
                        style={{ color: hito.isAlert ? "#A32D2D" : "var(--text-muted, var(--field-text))" }}
                      >
                        {reeHitosLoading ? "..." : hito.mesAfectado}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Fila 3: 3 gráficas ───────────────────────────────────── */}
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
