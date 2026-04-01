"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ← Pasos 7-10: componentes y hook extraídos a sus propios ficheros
import YearPillsFilter   from "../ui/YearPillsFilter";
import MonthPillsFilter  from "../ui/MonthPillsFilter";
import FilterDropdown, { type MultiCheckOption } from "../ui/FilterDropdown";
import useElementSize    from "../../hooks/useElementSize";

type Props = { token: string | null; currentUser?: User | null };
type GraficoEmpresaOption = { id: number; nombre: string };
type GraficoFiltersResponse = { empresas: GraficoEmpresaOption[]; anios: number[]; meses: number[] };
type GraficoPoint  = { period_key: string; period_label: string; value: number; ventana?: string };
type GraficoSerie  = { serie_key: string; serie_label: string; points: GraficoPoint[] };
type GraficoSeriesGroup = { series: GraficoSerie[] };
type GraficosSeriesResponse = {
  filters: { empresa_ids: number[]; anios: number[]; meses: number[]; aggregation: string };
  scope: { all_empresas_selected: boolean; aggregation: string };
  energia_facturada: GraficoSeriesGroup; perdidas: GraficoSeriesGroup;
  perdidas_kwh: GraficoSeriesGroup; perdidas_ventanas: GraficoSeriesGroup;
  perdidas_kwh_ventanas: GraficoSeriesGroup; energias_publicadas: GraficoSeriesGroup;
  energias_pf: GraficoSeriesGroup; autoconsumo: GraficoSeriesGroup;
  energia_generada: GraficoSeriesGroup; adquisicion: GraficoSeriesGroup;
  adquisicion_ventanas: GraficoSeriesGroup;
};
type GraficosPsSeriesResponse = {
  filters: { empresa_ids: number[]; anios: number[]; meses: number[]; aggregation: string };
  scope: { all_empresas_selected: boolean; aggregation: string };
  cups_por_tipo: GraficoSeriesGroup; energia_por_tipo: GraficoSeriesGroup;
  importe_por_tipo: GraficoSeriesGroup; energia_por_tarifa: GraficoSeriesGroup;
  cups_por_tarifa: GraficoSeriesGroup; importe_por_tarifa: GraficoSeriesGroup;
};
type ChartRow = { period_key: string; period_label: string; [key: string]: string | number };
type CustomTooltipEntry = { value?: number | string; name?: number | string; dataKey?: number | string; payload?: ChartRow };
type CustomTooltipProps = { active?: boolean; payload?: readonly CustomTooltipEntry[]; label?: string; extraByLabel?: Record<string, string[]> };
type ChartCardProps = {
  title: string; subtitle: string; series: GraficoSerie[]; hiddenSeries: Record<string, boolean>;
  onToggleSerie: (key: string) => void; selector?: React.ReactNode; loading?: boolean;
  error?: string | null; onExpand?: () => void; lastValueLabel?: string; lastValue?: string;
  trend?: { value: number; label: string }; accentColor?: string; badgeLabel?: string;
};
type Grafica2SerieKey = "pct" | "pct_m2" | "pct_m7" | "pct_m11" | "pct_art15" | "kwh" | "kwh_m2" | "kwh_m7" | "kwh_m11" | "kwh_art15";
type Grafica5Modo = "cups" | "energia" | "importe";
type Grafica5TipoKey = "total" | "t1" | "t2" | "t3" | "t4" | "t5";
type Grafica6Modo = "cups" | "energia" | "importe";
type Grafica6TarifaKey = "total" | "t20td" | "t30td" | "t30tdve" | "t61td" | "t62td" | "t63td" | "t64td";
type TwoFlagsState = { a: boolean; b: boolean };

const GRAFICA2_OPCIONES: { key: Grafica2SerieKey; label: string; grupo: "pct" | "kwh" }[] = [
  { key: "pct",       label: "Pérdidas (%)",         grupo: "pct" },
  { key: "pct_m2",    label: "Pérdidas M2 (%)",      grupo: "pct" },
  { key: "pct_m7",    label: "Pérdidas M7 (%)",      grupo: "pct" },
  { key: "pct_m11",   label: "Pérdidas M11 (%)",     grupo: "pct" },
  { key: "pct_art15", label: "Pérdidas ART15 (%)",   grupo: "pct" },
  { key: "kwh",       label: "Pérdidas (kWh)",       grupo: "kwh" },
  { key: "kwh_m2",    label: "Pérdidas M2 (kWh)",    grupo: "kwh" },
  { key: "kwh_m7",    label: "Pérdidas M7 (kWh)",    grupo: "kwh" },
  { key: "kwh_m11",   label: "Pérdidas M11 (kWh)",   grupo: "kwh" },
  { key: "kwh_art15", label: "Pérdidas ART15 (kWh)", grupo: "kwh" },
];
const GRAFICA5_TIPOS: { key: Grafica5TipoKey; label: string }[] = [
  { key: "total", label: "Total" }, { key: "t1", label: "Tipo 1" }, { key: "t2", label: "Tipo 2" },
  { key: "t3", label: "Tipo 3" }, { key: "t4", label: "Tipo 4" }, { key: "t5", label: "Tipo 5" },
];
const G5_KEYS_BY_MODO: Record<Grafica5Modo, Record<Grafica5TipoKey, string>> = {
  cups:    { total: "cups_total", t1: "cups_t1", t2: "cups_t2", t3: "cups_t3", t4: "cups_t4", t5: "cups_t5" },
  energia: { total: "en_total",   t1: "en_t1",   t2: "en_t2",   t3: "en_t3",   t4: "en_t4",   t5: "en_t5"   },
  importe: { total: "im_total",   t1: "im_t1",   t2: "im_t2",   t3: "im_t3",   t4: "im_t4",   t5: "im_t5"   },
};
const GRAFICA5_MODO_CONFIG: Record<Grafica5Modo, { groupKey: keyof GraficosPsSeriesResponse; label: string }> = {
  cups:    { groupKey: "cups_por_tipo",    label: "CUPS"    },
  energia: { groupKey: "energia_por_tipo", label: "Energía" },
  importe: { groupKey: "importe_por_tipo", label: "Importe" },
};
const GRAFICA6_TARIFAS: { key: Grafica6TarifaKey; label: string }[] = [
  { key: "total", label: "Total" }, { key: "t20td", label: "2.0TD" }, { key: "t30td", label: "3.0TD" },
  { key: "t30tdve", label: "3.0TDVE" }, { key: "t61td", label: "6.1TD" }, { key: "t62td", label: "6.2TD" },
  { key: "t63td", label: "6.3TD" }, { key: "t64td", label: "6.4TD" },
];
const G6_KEYS_BY_MODO: Record<Grafica6Modo, Record<Grafica6TarifaKey, string>> = {
  cups:    { total: "ct_total", t20td: "ct_20td", t30td: "ct_30td", t30tdve: "ct_30tdve", t61td: "ct_61td", t62td: "ct_total", t63td: "ct_total", t64td: "ct_total" },
  energia: { total: "et_total", t20td: "et_20td", t30td: "et_30td", t30tdve: "et_30tdve", t61td: "et_61td", t62td: "et_total", t63td: "et_total", t64td: "et_total" },
  importe: { total: "it_total", t20td: "it_20td", t30td: "it_30td", t30tdve: "it_30tdve", t61td: "it_61td", t62td: "it_total", t63td: "it_total", t64td: "it_total" },
};
const GRAFICA6_MODO_CONFIG: Record<Grafica6Modo, { groupKey: keyof GraficosPsSeriesResponse; label: string }> = {
  cups:    { groupKey: "cups_por_tarifa",    label: "CUPS"    },
  energia: { groupKey: "energia_por_tarifa", label: "Energía" },
  importe: { groupKey: "importe_por_tarifa", label: "Importe" },
};
const ADQ_VENTANAS = ["M2", "M7", "M11", "ART15"] as const;
const MESES_LABEL: Record<number, string> = {
  1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
};
const LINE_COLORS = [
  "#6D5EF8","#F5A623","#7ED321","#D0021B","#4A90E2",
  "#9B59B6","#1ABC9C","#E67E22","#2ECC71","#E74C3C",
  "#3498DB","#F39C12","#16A085","#8E44AD","#27AE60",
];
const GRAFICA_ACCENT: Record<number, string> = {
  1: "#60a5fa", 2: "#fbbf24", 3: "#f87171", 4: "#34d399", 5: "#a78bfa", 6: "#fb923c",
};
const GRAFICA_BADGE: Record<number, string> = {
  1: "G1", 2: "G2", 3: "G3", 4: "G4", 5: "G5", 6: "G6",
};

// ── CONSTANTES DE LAYOUT ──────────────────────────────────────────────────────
const CHART_AREA_HEIGHT = 120;
const CARD_MIN_HEIGHT   = 265;

function formatYAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}k`;
  if (abs < 1 && abs > 0) return `${sign}${abs.toFixed(2)}`;
  return `${sign}${abs.toFixed(0)}`;
}
function formatXAxisTick(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length === 2) {
    const mes = Number.parseInt(parts[1], 10);
    return `${MESES_LABEL[mes] ?? parts[1]} ${parts[0].slice(2)}`;
  }
  return value;
}
function formatNumberEs(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}
function buildChartRows(series: GraficoSerie[]): ChartRow[] {
  const map = new Map<string, ChartRow>();
  for (const serie of series) {
    for (const point of serie.points) {
      if (!map.has(point.period_key))
        map.set(point.period_key, { period_key: point.period_key, period_label: point.period_label });
      const row = map.get(point.period_key)!;
      row[serie.serie_key] = point.value;
      if (point.ventana) row[`${serie.serie_key}__ventana`] = point.ventana;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.period_key.localeCompare(b.period_key));
}
function buildChartRowsCombined(seriesA: GraficoSerie[], seriesB: GraficoSerie[]): ChartRow[] {
  return buildChartRows([...seriesA, ...seriesB]);
}
function relabelSeries(series: GraficoSerie[], overrides: Record<string, string>): GraficoSerie[] {
  return series.map((s) => ({ ...s, serie_label: overrides[s.serie_key] ?? s.serie_label }));
}
function buildTooltipExtraByLabel(rows: ChartRow[], extraKeys: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const extras = extraKeys.filter((k) => row[k] != null).map((k) => `${k}: ${formatNumberEs(row[k] as number)}`);
    if (extras.length > 0) result[row.period_label] = extras;
  }
  return result;
}

function CustomTooltip({ active, payload, label, extraByLabel }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", minWidth: 140 }}>
      <div className="mb-1 font-medium ui-muted">{label}</div>
      {payload.map((entry, i) => {
        const matchLabel = typeof entry.name === "string" ? entry.name : String(entry.name ?? "");
        const matchKey   = typeof entry.dataKey === "string" ? entry.dataKey : String(entry.dataKey ?? "");
        const numericValue = typeof entry.value === "number" ? entry.value : Number(entry.value);
        const ventana = entry.payload ? (entry.payload[`${matchKey}__ventana`] as string | undefined) : undefined;
        const displayLabel = ventana ? `${matchLabel} (${ventana})` : matchLabel;
        return (
          <div key={`${matchKey}-${i}`} className="flex items-center justify-between gap-3">
            <span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>{displayLabel}</span>
            <span className="font-mono">{formatNumberEs(numericValue)}</span>
          </div>
        );
      })}
      {extraByLabel?.[label ?? ""]?.map((extra, i) => (
        <div key={i} className="mt-0.5 ui-muted">{extra}</div>
      ))}
    </div>
  );
}

// ── ChartCard ─────────────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, series, hiddenSeries, onToggleSerie,
  selector, loading, error, onExpand,
  lastValueLabel, lastValue, trend, accentColor = "#60a5fa", badgeLabel = "G",
}: ChartCardProps) {
  const [containerRef, size] = useElementSize();
  const rows = useMemo(() => buildChartRows(series), [series]);
  const visibleSeries = series.filter((s) => !hiddenSeries[s.serie_key]);
  const canRenderChart = size.width > 50 && rows.length > 0 && visibleSeries.length > 0;
  const CHART_BOTTOM_PADDING = CHART_AREA_HEIGHT + 10;

  return (
    <div
      className="rounded-xl border"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--card-border)",
        position: "relative",
        overflow: "visible",
        paddingBottom: CHART_BOTTOM_PADDING,
        minHeight: CARD_MIN_HEIGHT,
      }}
    >
      <div style={{ padding: "8px 11px 6px", borderBottom: "1px solid var(--card-border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 9, background: `${accentColor}28`, color: accentColor, flexShrink: 0 }}>
              {badgeLabel}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {(lastValue || trend) && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0 }}>
                {lastValueLabel && <span style={{ fontSize: 8, color: "rgba(226,232,240,.38)", whiteSpace: "nowrap" }}>{lastValueLabel}</span>}
                {lastValue && <span style={{ fontSize: 13, fontWeight: 500, color: accentColor, lineHeight: 1.2 }}>{lastValue}</span>}
                {trend && <span style={{ fontSize: 9, fontWeight: 500, color: trend.value >= 0 ? "#34d399" : "#fca5a5" }}>{trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}{trend.label}</span>}
              </div>
            )}
            {onExpand && (
              <button type="button" onClick={onExpand} title="Expandir gráfica"
                style={{ fontSize: 10, padding: "3px 7px", border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, background: "transparent", color: "rgba(226,232,240,.32)", cursor: "pointer", flexShrink: 0 }}>
                ⤢
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 9, color: "rgba(226,232,240,.38)", marginTop: 1 }}>{subtitle}</div>
        {selector && <div style={{ marginTop: 5 }}>{selector}</div>}
        {!selector && series.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 5 }}>
            {series.map((s) => {
              const active = !hiddenSeries[s.serie_key];
              return (
                <button key={s.serie_key} type="button" onClick={() => onToggleSerie(s.serie_key)}
                  style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: active ? `1px solid ${accentColor}80` : "1px solid rgba(255,255,255,.1)", background: active ? `${accentColor}30` : "transparent", color: active ? accentColor : "rgba(226,232,240,.45)" }}>
                  {s.serie_label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: CHART_AREA_HEIGHT,
          padding: "5px 9px 7px",
          background: "var(--card-bg)",
        }}
      >
        <div style={{
          height: "100%",
          borderRadius: 7,
          background: "rgba(0,0,0,.18)",
          overflow: "visible",
          position: "relative",
        }}>
          {loading && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(226,232,240,.35)" }}>Cargando...</div>
          )}
          {!loading && error && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fca5a5", padding: "0 8px", textAlign: "center" }}>{error}</div>
          )}
          {!loading && !error && canRenderChart && (
            <LineChart width={size.width - 18} height={CHART_AREA_HEIGHT - 12} data={rows}
              margin={{ top: 6, right: 8, left: -14, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
              <XAxis dataKey="period_label" tick={{ fontSize: 8 }} tickFormatter={formatXAxisTick} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8 }} tickFormatter={formatYAxis} tickLine={false} axisLine={false}
                width={48} domain={["auto", "auto"]} />
              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={props.payload as readonly CustomTooltipEntry[]}
                    label={typeof props.label === "string" ? props.label : String(props.label ?? "")}
                  />
                )}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
              />
              {visibleSeries.map((s, i) => (
                <Line key={s.serie_key} type="monotone" dataKey={s.serie_key} name={s.serie_label}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={i === 0 ? 2 : 1.5} dot={false} activeDot={{ r: 3 }}
                  strokeDasharray={i === 0 ? undefined : i % 2 === 0 ? "5 2" : "3 2"} />
              ))}
            </LineChart>
          )}
          {!loading && !error && !canRenderChart && rows.length === 0 && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(226,232,240,.3)" }}>Sin datos para el filtro seleccionado</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ExpandedChart ─────────────────────────────────────────────────────────────

function ExpandedChart({
  title, subtitle, series, hiddenSeries, onToggleSerie,
  selector, loading, error,
  onClose, accentColor = "#60a5fa", badgeLabel = "G",
  allAnios, expandedAnios, onToggleExpandedAnio, onSelectAllExpandedAnios,
}: {
  title: string; subtitle: string; series: GraficoSerie[]; hiddenSeries: Record<string, boolean>;
  onToggleSerie: (key: string) => void; selector?: React.ReactNode; loading?: boolean;
  error?: string | null; onClose: () => void; accentColor?: string; badgeLabel?: string;
  allAnios: number[]; expandedAnios: number[]; onToggleExpandedAnio: (anio: number) => void;
  onSelectAllExpandedAnios: () => void;
}) {
  const [containerRef, size] = useElementSize();
  const rows = useMemo(() => buildChartRows(series), [series]);
  const visibleSeries = series.filter((s) => !hiddenSeries[s.serie_key]);
  const canRenderChart = size.width > 50 && rows.length > 0 && visibleSeries.length > 0;
  const currentYear = new Date().getFullYear();

  const kpis = useMemo(() => {
    if (!canRenderChart) return null;
    const mainKey = visibleSeries[0]?.serie_key;
    if (!mainKey) return null;
    const values = rows.map((r) => r[mainKey] as number).filter((v) => typeof v === "number" && !isNaN(v));
    if (!values.length) return null;
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const max  = Math.max(...values);
    const min  = Math.min(...values);
    const avg  = values.reduce((a, b) => a + b, 0) / values.length;
    const maxRow = rows.find((r) => r[mainKey] === max);
    const minRow = rows.find((r) => r[mainKey] === min);
    const pct = prev && prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null;
    return { last, prev, max, min, avg, maxLabel: maxRow?.period_label, minLabel: minRow?.period_label, pct };
  }, [rows, visibleSeries, canRenderChart]);

  const rangeShortcuts = [
    { label: "Último año", anios: [currentYear] },
    { label: "2 años",     anios: [currentYear, currentYear - 1] },
    { label: "4 años",     anios: [currentYear, currentYear - 1, currentYear - 2, currentYear - 3] },
  ];
  const applyShortcut = (anios: number[]) => {
    anios.forEach((y) => { if (!expandedAnios.includes(y)) onToggleExpandedAnio(y); });
    expandedAnios.filter((y) => !anios.includes(y)).forEach((y) => onToggleExpandedAnio(y));
  };
  const shortcutPillStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap",
    border: isActive ? "1px solid rgba(37,99,235,.5)" : "1px solid rgba(255,255,255,.14)",
    background: isActive ? "rgba(37,99,235,.25)" : "rgba(0,0,0,.22)",
    color: isActive ? "#93c5fd" : "rgba(226,232,240,.45)", height: 28, display: "flex", alignItems: "center",
  });

  return (
    <div className="rounded-xl border" style={{ background: "#111f35", borderColor: "rgba(30,58,95,.9)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 16px 10px", borderBottom: "1px solid rgba(30,58,95,.7)", background: "var(--card-bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: `${accentColor}28`, color: accentColor }}>{badgeLabel}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{title}</span>
          </div>
          <div style={{ fontSize: 10, color: "rgba(226,232,240,.4)" }}>{subtitle} — vista expandida · filtro ampliado a 4 años</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.45)", marginRight: 2 }}>Año:</span>
            {rangeShortcuts.map((sc) => {
              const isActive = sc.anios.every((y) => expandedAnios.includes(y)) && expandedAnios.length === sc.anios.length;
              return (<button key={sc.label} type="button" onClick={() => applyShortcut(sc.anios)} style={shortcutPillStyle(isActive)}>{sc.label}</button>);
            })}
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
            <YearPillsFilter allAnios={allAnios} selectedAnios={expandedAnios} onToggle={onToggleExpandedAnio} onSelectAll={onSelectAllExpandedAnios} />
          </div>
          {selector && <div style={{ marginTop: 4 }}>{selector}</div>}
          {!selector && series.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {series.map((s) => {
                const active = !hiddenSeries[s.serie_key];
                return (
                  <button key={s.serie_key} type="button" onClick={() => onToggleSerie(s.serie_key)}
                    style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, cursor: "pointer", border: active ? `1px solid ${accentColor}80` : "1px solid rgba(255,255,255,.12)", background: active ? `${accentColor}30` : "transparent", color: active ? accentColor : "rgba(226,232,240,.5)" }}>
                    {s.serie_label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(96,165,250,.7)", background: "rgba(37,99,235,.12)", border: "1px solid rgba(37,99,235,.25)", borderRadius: 7, padding: "4px 10px", whiteSpace: "nowrap" }}>↑ 4 años cargados al expandir</div>
          <button type="button" onClick={onClose} style={{ fontSize: 11, padding: "5px 12px", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, background: "transparent", color: "rgba(226,232,240,.6)", cursor: "pointer", whiteSpace: "nowrap" }}>✕ Volver al grid</button>
        </div>
      </div>

      {kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid rgba(30,58,95,.6)" }}>
          {[
            { label: "Último valor",       val: formatYAxis(kpis.last), sub: kpis.pct != null ? `${kpis.pct >= 0 ? "▲" : "▼"} ${Math.abs(kpis.pct).toFixed(1)}% vs anterior` : "", subColor: kpis.pct != null ? (kpis.pct >= 0 ? "#34d399" : "#fca5a5") : undefined, valColor: accentColor },
            { label: "Máximo histórico",   val: formatYAxis(kpis.max),  sub: kpis.maxLabel ?? "", subColor: undefined, valColor: "#34d399" },
            { label: "Mínimo del período", val: formatYAxis(kpis.min),  sub: kpis.minLabel ?? "", subColor: undefined, valColor: "#fca5a5" },
            { label: `Media (${rows.length} meses)`, val: formatYAxis(kpis.avg), sub: "", subColor: undefined, valColor: "var(--text)" },
          ].map((k, i) => (
            <div key={i} style={{ padding: "10px 14px", borderRight: i < 3 ? "1px solid rgba(30,58,95,.45)" : "none" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.38)", marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: k.valColor }}>{k.val}</div>
              {k.sub && <div style={{ fontSize: 9, color: k.subColor ?? "rgba(226,232,240,.32)", marginTop: 2 }}>{k.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div ref={containerRef} style={{ padding: "12px 16px 12px" }}>
        <div style={{ height: 260, background: "rgba(0,0,0,.15)", borderRadius: 10, overflow: "hidden" }}>
          {loading && <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(226,232,240,.35)" }}>Cargando...</div>}
          {!loading && error && <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fca5a5" }}>{error}</div>}
          {!loading && !error && canRenderChart && (
            <LineChart width={size.width - 32} height={260} data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="period_label" tick={{ fontSize: 9 }} tickFormatter={formatXAxisTick} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={formatYAxis} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} />
              <Tooltip content={(props) => <CustomTooltip active={props.active} payload={props.payload as readonly CustomTooltipEntry[]} label={typeof props.label === "string" ? props.label : String(props.label ?? "")} />} />
              <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 8, fontSize: 10 }} />
              <Brush dataKey="period_label" height={20} stroke={accentColor} fill="rgba(0,0,0,.3)" travellerWidth={8} />
              {visibleSeries.map((s, i) => (
                <Line key={s.serie_key} type="monotone" dataKey={s.serie_key} name={s.serie_label}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={i === 0 ? 2.5 : 1.5}
                  dot={false} activeDot={{ r: 4 }} strokeDasharray={i === 0 ? undefined : i % 2 === 0 ? "5 2" : "3 2"} />
              ))}
            </LineChart>
          )}
          {!loading && !error && !canRenderChart && <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(226,232,240,.3)" }}>Sin datos para el filtro seleccionado</div>}
        </div>
      </div>
    </div>
  );
}

// ── Selectores ────────────────────────────────────────────────────────────────

function TwoFlagsSelector({ flags, setFlags, labelA, labelB, accentColor }: { flags: TwoFlagsState; setFlags: (f: TwoFlagsState) => void; labelA: string; labelB: string; accentColor?: string }) {
  const color = accentColor ?? "#6D5EF8";
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {([{ flag: "a" as const, label: labelA }, { flag: "b" as const, label: labelB }]).map(({ flag, label }) => {
        const active = flags[flag];
        return (
          <button key={flag} type="button" onClick={() => setFlags({ ...flags, [flag]: !flags[flag] })}
            style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: active ? `1px solid ${color}80` : "1px solid rgba(255,255,255,.1)", background: active ? `${color}30` : "transparent", color: active ? color : "rgba(226,232,240,.45)" }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Grafica2Selector({ active, onChange, accentColor }: { active: Set<Grafica2SerieKey>; onChange: (next: Set<Grafica2SerieKey>) => void; accentColor?: string }) {
  const color = accentColor ?? "#fbbf24";
  const toggle = (key: Grafica2SerieKey) => {
    const next = new Set(active);
    if (next.has(key)) { if (next.size > 1) next.delete(key); } else next.add(key);
    onChange(next);
  };
  const pcts = GRAFICA2_OPCIONES.filter((o) => o.grupo === "pct");
  const kwhs = GRAFICA2_OPCIONES.filter((o) => o.grupo === "kwh");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {pcts.map((o) => {
          const isActive = active.has(o.key);
          return (<button key={o.key} type="button" onClick={() => toggle(o.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: isActive ? `1px solid ${color}80` : "1px solid rgba(255,255,255,.1)", background: isActive ? `${color}30` : "transparent", color: isActive ? color : "rgba(226,232,240,.45)" }}>{o.label}</button>);
        })}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {kwhs.map((o) => {
          const isActive = active.has(o.key);
          return (<button key={o.key} type="button" onClick={() => toggle(o.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: isActive ? "1px solid rgba(96,165,250,.5)" : "1px solid rgba(255,255,255,.1)", background: isActive ? "rgba(96,165,250,.25)" : "transparent", color: isActive ? "#93c5fd" : "rgba(226,232,240,.45)" }}>{o.label}</button>);
        })}
      </div>
    </div>
  );
}

function TwoLevelSelector<M extends string, K extends string>({ modos, modoActivo, onModo, items, activoItems, onToggleItem, accentColor }: { modos: { key: M; label: string }[]; modoActivo: M; onModo: (m: M) => void; items: { key: K; label: string }[]; activoItems: Set<K>; onToggleItem: (k: K) => void; accentColor?: string }) {
  const color = accentColor ?? "#a78bfa";
  const toggle = (k: K) => {
    const next = new Set(activoItems);
    if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
    onToggleItem(k);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {modos.map((m) => {
          const active = modoActivo === m.key;
          return (<button key={m.key} type="button" onClick={() => onModo(m.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, cursor: "pointer", border: active ? "1px solid rgba(255,255,255,.2)" : "1px solid rgba(255,255,255,.07)", background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? "var(--text)" : "rgba(226,232,240,.4)" }}>{m.label}</button>);
        })}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {items.map((item) => {
          const active = activoItems.has(item.key);
          return (<button key={item.key} type="button" onClick={() => toggle(item.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: active ? `1px solid ${color}80` : "1px solid rgba(255,255,255,.1)", background: active ? `${color}30` : "transparent", color: active ? color : "rgba(226,232,240,.45)" }}>{item.label}</button>);
        })}
      </div>
    </div>
  );
}

function toggleSelection<T>(value: T, setter: React.Dispatch<React.SetStateAction<T[]>>) {
  setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
}
function selectAll<T>(all: T[], current: T[], setter: React.Dispatch<React.SetStateAction<T[]>>) {
  if (current.length === all.length) setter([]); else setter(all);
}

export default function GraficosSection({ token }: Props) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedEmpresas, setSelectedEmpresas] = useState<number[]>([]);
  const [selectedAnios,    setSelectedAnios]    = useState<number[]>([currentYear, currentYear - 1]);
  const [selectedMeses,    setSelectedMeses]    = useState<number[]>([]);
  const [filtersData,    setFiltersData]    = useState<GraficoFiltersResponse | null>(null);
  const [seriesData,     setSeriesData]     = useState<GraficosSeriesResponse | null>(null);
  const [psSeriesData,   setPsSeriesData]   = useState<GraficosPsSeriesResponse | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [seriesLoading,  setSeriesLoading]  = useState(false);
  const [psSeriesLoading,setPsSeriesLoading]= useState(false);
  const [filtersError,   setFiltersError]   = useState<string | null>(null);
  const [seriesError,    setSeriesError]    = useState<string | null>(null);
  const [psSeriesError,  setPsSeriesError]  = useState<string | null>(null);
  const [expandedGrafica, setExpandedGrafica] = useState<number | null>(null);
  const [expandedAnios,   setExpandedAnios]   = useState<number[]>([currentYear, currentYear - 1, currentYear - 2, currentYear - 3]);
  const [g1Flags,  setG1Flags]  = useState<TwoFlagsState>({ a: true, b: false });
  const [g3Flags,  setG3Flags]  = useState<TwoFlagsState>({ a: true, b: false });
  const [g4Flags,  setG4Flags]  = useState<TwoFlagsState>({ a: true, b: false });
  const [g2Active, setG2Active] = useState<Set<Grafica2SerieKey>>(new Set(["pct"]));
  const [g5Modo,        setG5Modo]        = useState<Grafica5Modo>("cups");
  const [g5ActiveTipos, setG5ActiveTipos] = useState<Set<Grafica5TipoKey>>(new Set(["total"]));
  const [g6Modo,          setG6Modo]          = useState<Grafica6Modo>("cups");
  const [g6ActiveTarifas, setG6ActiveTarifas] = useState<Set<Grafica6TarifaKey>>(new Set(["total"]));
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const toggleSerie = useCallback((key: string) => { setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] })); }, []);

  const loadFilters = useCallback(async () => {
    if (!token) return;
    setFiltersLoading(true); setFiltersError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/medidas-graficos/filters`, { headers: getAuthHeaders(token) });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      setFiltersData((await response.json()) as GraficoFiltersResponse);
    } catch (err) { setFiltersError(err instanceof Error ? err.message : "Error cargando filtros"); }
    finally { setFiltersLoading(false); }
  }, [token]);

  const loadSeries = useCallback(async (aniosOverride?: number[]) => {
    if (!token) return;
    setSeriesLoading(true); setSeriesError(null);
    try {
      const searchParams = new URLSearchParams();
      const aniosToUse = aniosOverride ?? selectedAnios;
      for (const id   of selectedEmpresas) searchParams.append("empresa_ids", String(id));
      for (const anio of aniosToUse)       searchParams.append("anios", String(anio));
      for (const mes  of selectedMeses)    searchParams.append("meses", String(mes));
      const response = await fetch(`${API_BASE_URL}/medidas-graficos/series?${searchParams.toString()}`, { headers: getAuthHeaders(token) });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      setSeriesData((await response.json()) as GraficosSeriesResponse);
    } catch (err) { setSeriesError(err instanceof Error ? err.message : "Error cargando series"); }
    finally { setSeriesLoading(false); }
  }, [token, selectedEmpresas, selectedAnios, selectedMeses]);

  const loadPsSeries = useCallback(async (aniosOverride?: number[]) => {
    if (!token) return;
    setPsSeriesLoading(true); setPsSeriesError(null);
    try {
      const searchParams = new URLSearchParams();
      const aniosToUse = aniosOverride ?? selectedAnios;
      for (const id   of selectedEmpresas) searchParams.append("empresa_ids", String(id));
      for (const anio of aniosToUse)       searchParams.append("anios", String(anio));
      for (const mes  of selectedMeses)    searchParams.append("meses", String(mes));
      const response = await fetch(`${API_BASE_URL}/medidas-graficos-ps/series-cups?${searchParams.toString()}`, { headers: getAuthHeaders(token) });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      setPsSeriesData((await response.json()) as GraficosPsSeriesResponse);
    } catch (err) { setPsSeriesError(err instanceof Error ? err.message : "Error cargando series PS"); }
    finally { setPsSeriesLoading(false); }
  }, [token, selectedEmpresas, selectedAnios, selectedMeses]);

  useEffect(() => { void loadFilters(); }, [loadFilters]);
  useEffect(() => { void loadSeries(); void loadPsSeries(); }, [loadSeries, loadPsSeries]);
  useEffect(() => {
    if (expandedGrafica === null) return;
    void loadSeries(expandedAnios); void loadPsSeries(expandedAnios);
  }, [expandedAnios, expandedGrafica]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExpand = useCallback((graficaNum: number) => {
    const anios4 = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].filter((y) => !filtersData || filtersData.anios.includes(y));
    setExpandedAnios(anios4.length > 0 ? anios4 : [currentYear]);
    setExpandedGrafica(graficaNum);
    void loadSeries(anios4); void loadPsSeries(anios4);
  }, [currentYear, filtersData, loadSeries, loadPsSeries]);

  const handleCloseExpanded = useCallback(() => {
    setExpandedGrafica(null); void loadSeries(); void loadPsSeries();
  }, [loadSeries, loadPsSeries]);

  const empresaOptions = useMemo<MultiCheckOption[]>(() => (filtersData?.empresas ?? []).map((e) => ({ value: e.id, label: `${e.id} – ${e.nombre}` })), [filtersData]);
  const anioOptions    = useMemo<MultiCheckOption[]>(() => (filtersData?.anios ?? []).map((y) => ({ value: y, label: String(y) })), [filtersData]);

  const grafica1Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const result: GraficoSerie[] = [];
    if (g1Flags.a && seriesData.energia_facturada.series[0]) result.push({ ...seriesData.energia_facturada.series[0], serie_key: "g1_facturada", serie_label: "E neta facturada" });
    if (g1Flags.b && seriesData.adquisicion.series[0]) result.push({ ...seriesData.adquisicion.series[0], serie_label: "Adquisición" });
    return result;
  }, [seriesData, g1Flags]);

  const grafica1Subtitle = useMemo(() => {
    const labels = [];
    if (g1Flags.a) labels.push("E neta facturada");
    if (g1Flags.b) labels.push("Adquisición (pub. más reciente)");
    return `Histórico de ${labels.join(" y ")}.`;
  }, [g1Flags]);

  const grafica2Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const result: GraficoSerie[] = [];
    for (const opcion of GRAFICA2_OPCIONES) {
      if (!g2Active.has(opcion.key)) continue;
      if (opcion.grupo === "pct") {
        if (opcion.key === "pct") { const s = seriesData.perdidas.series[0]; if (s) result.push({ ...s, serie_key: "pct", serie_label: "Pérdidas (%)" }); }
        else { const ventana = opcion.key.replace("pct_", "").toUpperCase(); const s = seriesData.perdidas_ventanas.series.find((x) => x.serie_key.toLowerCase().includes(ventana.toLowerCase())); if (s) result.push({ ...s, serie_key: opcion.key, serie_label: opcion.label }); }
      } else {
        if (opcion.key === "kwh") { const s = seriesData.perdidas_kwh.series[0]; if (s) result.push({ ...s, serie_key: "kwh", serie_label: "Pérdidas (kWh)" }); }
        else { const ventana = opcion.key.replace("kwh_", ""); const s = seriesData.perdidas_kwh_ventanas.series.find((x) => x.serie_key === `perd_kwh_${ventana}`); if (s) result.push({ ...s, serie_key: opcion.key, serie_label: opcion.label }); }
      }
    }
    return result;
  }, [seriesData, g2Active]);

  const grafica2Subtitle = useMemo(() => `Histórico de ${[...g2Active].map((k) => GRAFICA2_OPCIONES.find((o) => o.key === k)?.label ?? k).join(", ")}.`, [g2Active]);

  const energiasPfSinFinal = useMemo(() => seriesData?.energias_pf.series.filter((s) => !s.serie_key.includes("final")) ?? [], [seriesData]);
  const grafica3Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const result: GraficoSerie[] = [];
    if (g3Flags.a) result.push(...relabelSeries(seriesData.energias_publicadas.series, {}));
    if (g3Flags.b) result.push(...relabelSeries(energiasPfSinFinal, {}));
    return result;
  }, [seriesData, g3Flags, energiasPfSinFinal]);

  const grafica3Subtitle = useMemo(() => {
    const parts = [];
    if (g3Flags.a) parts.push("E neta publicada (M2, M7, M11, ART15)");
    if (g3Flags.b) parts.push("E PF (M2, M7, M11, ART15)");
    return `Histórico de ${parts.join(" y ")}.`;
  }, [g3Flags]);

  const grafica4Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const result: GraficoSerie[] = [];
    if (g4Flags.a && seriesData.autoconsumo.series[0]) result.push({ ...seriesData.autoconsumo.series[0], serie_key: "g4_autoconsumo", serie_label: "E autoconsumo" });
    if (g4Flags.b && seriesData.energia_generada.series[0]) result.push({ ...seriesData.energia_generada.series[0], serie_key: "g4_generada", serie_label: "E generada" });
    return result;
  }, [seriesData, g4Flags]);

  const grafica4Subtitle = useMemo(() => { const p = []; if (g4Flags.a) p.push("E autoconsumo"); if (g4Flags.b) p.push("E generada"); return `Histórico de ${p.join(" y ")}.`; }, [g4Flags]);

  const grafica5Series = useMemo((): GraficoSerie[] => {
    if (!psSeriesData) return [];
    const group = psSeriesData[GRAFICA5_MODO_CONFIG[g5Modo].groupKey] as GraficoSeriesGroup;
    const realKeys = new Set([...g5ActiveTipos].map((k) => G5_KEYS_BY_MODO[g5Modo][k]).filter(Boolean));
    return group.series.filter((s) => realKeys.has(s.serie_key));
  }, [psSeriesData, g5Modo, g5ActiveTipos]);

  const grafica5Subtitle = `${GRAFICA5_MODO_CONFIG[g5Modo].label} PS por tipo — ${[...g5ActiveTipos].map((k) => GRAFICA5_TIPOS.find((t) => t.key === k)?.label ?? k).join(", ")}.`;

  const grafica6Series = useMemo((): GraficoSerie[] => {
    if (!psSeriesData) return [];
    const group = psSeriesData[GRAFICA6_MODO_CONFIG[g6Modo].groupKey] as GraficoSeriesGroup;
    const realKeys = new Set([...g6ActiveTarifas].map((k) => G6_KEYS_BY_MODO[g6Modo][k]).filter(Boolean));
    return group.series.filter((s) => realKeys.has(s.serie_key));
  }, [psSeriesData, g6Modo, g6ActiveTarifas]);

  const grafica6Subtitle = `${GRAFICA6_MODO_CONFIG[g6Modo].label} PS por tarifa — ${[...g6ActiveTarifas].map((k) => GRAFICA6_TARIFAS.find((t) => t.key === k)?.label ?? k).join(", ")}.`;

  function getLastValueInfo(series: GraficoSerie[]) {
    const s = series[0];
    if (!s || s.points.length === 0) return { label: "—", value: "—", trend: undefined };
    const pts  = [...s.points].sort((a, b) => a.period_key.localeCompare(b.period_key));
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const pct  = prev && prev.value !== 0 ? ((last.value - prev.value) / Math.abs(prev.value)) * 100 : undefined;
    return { label: `${s.serie_label} · ${last.period_label}`, value: formatYAxis(last.value), trend: pct !== undefined ? { value: pct, label: "%" } : undefined };
  }

  const g1Info = useMemo(() => getLastValueInfo(grafica1Series), [grafica1Series]);
  const g2Info = useMemo(() => getLastValueInfo(grafica2Series), [grafica2Series]);
  const g3Info = useMemo(() => getLastValueInfo(grafica3Series), [grafica3Series]);
  const g4Info = useMemo(() => getLastValueInfo(grafica4Series), [grafica4Series]);
  const g5Info = useMemo(() => getLastValueInfo(grafica5Series), [grafica5Series]);
  const g6Info = useMemo(() => getLastValueInfo(grafica6Series), [grafica6Series]);

  const GRAFICA5_MODOS = useMemo(() => [
    { key: "cups" as Grafica5Modo, label: "CUPS" }, { key: "energia" as Grafica5Modo, label: "Energía" }, { key: "importe" as Grafica5Modo, label: "Importe" },
  ], []);
  const GRAFICA6_MODOS: { key: Grafica6Modo; label: string }[] = [
    { key: "cups", label: "CUPS" }, { key: "energia", label: "Energía" }, { key: "importe", label: "Importe" },
  ];

  const expandedData = useMemo(() => {
    if (expandedGrafica === null) return null;
    const map: Record<number, { series: GraficoSerie[]; subtitle: string; selector?: React.ReactNode }> = {
      1: { series: grafica1Series, subtitle: grafica1Subtitle, selector: <TwoFlagsSelector flags={g1Flags} setFlags={setG1Flags} labelA="E neta fact." labelB="Adquisición" accentColor={GRAFICA_ACCENT[1]} /> },
      2: { series: grafica2Series, subtitle: grafica2Subtitle, selector: <Grafica2Selector active={g2Active} onChange={setG2Active} accentColor={GRAFICA_ACCENT[2]} /> },
      3: { series: grafica3Series, subtitle: grafica3Subtitle, selector: <TwoFlagsSelector flags={g3Flags} setFlags={setG3Flags} labelA="E neta publ." labelB="E PF" accentColor={GRAFICA_ACCENT[3]} /> },
      4: { series: grafica4Series, subtitle: grafica4Subtitle, selector: <TwoFlagsSelector flags={g4Flags} setFlags={setG4Flags} labelA="E autoconsumo" labelB="E generada" accentColor={GRAFICA_ACCENT[4]} /> },
      5: { series: grafica5Series, subtitle: grafica5Subtitle, selector: <TwoLevelSelector modos={GRAFICA5_MODOS} modoActivo={g5Modo} onModo={setG5Modo} items={GRAFICA5_TIPOS} activoItems={g5ActiveTipos} onToggleItem={(k) => { setG5ActiveTipos((prev) => { const n = new Set(prev); n.has(k) ? (n.size > 1 && n.delete(k)) : n.add(k); return n; }); }} accentColor={GRAFICA_ACCENT[5]} /> },
      6: { series: grafica6Series, subtitle: grafica6Subtitle, selector: <TwoLevelSelector modos={GRAFICA6_MODOS} modoActivo={g6Modo} onModo={setG6Modo} items={GRAFICA6_TARIFAS} activoItems={g6ActiveTarifas} onToggleItem={(k) => { setG6ActiveTarifas((prev) => { const n = new Set(prev); n.has(k) ? (n.size > 1 && n.delete(k)) : n.add(k); return n; }); }} accentColor={GRAFICA_ACCENT[6]} /> },
    };
    return map[expandedGrafica] ?? null;
  }, [expandedGrafica, grafica1Series, grafica2Series, grafica3Series, grafica4Series, grafica5Series, grafica6Series, grafica1Subtitle, grafica2Subtitle, grafica3Subtitle, grafica4Subtitle, grafica5Subtitle, grafica6Subtitle, g1Flags, g2Active, g3Flags, g4Flags, g5Modo, g5ActiveTipos, g6Modo, g6ActiveTarifas, GRAFICA5_MODOS]);

  const isLoading = seriesLoading || psSeriesLoading;
  const mainError = seriesError ?? psSeriesError ?? null;

  const handleToggleExpandedAnio = useCallback((anio: number) => {
    setExpandedAnios((prev) => prev.includes(anio) ? prev.filter((y) => y !== anio) : [...prev, anio]);
  }, []);
  const handleSelectAllExpandedAnios = useCallback(() => { setExpandedAnios([]); }, []);

  return (
    <section className="text-sm">
      <div className="flex flex-col gap-6">

        {expandedGrafica !== null && expandedData && (
          <ExpandedChart
            title={`Gráfica ${expandedGrafica}. ${["Evolución de energía facturada / Adquisición","Evolución de pérdidas","Evolución de energías publicadas / E PF","Evolución de autoconsumo / energía generada","Evolución PS por tipo","Evolución PS por tarifa"][expandedGrafica - 1]}`}
            subtitle={expandedData.subtitle} series={expandedData.series} hiddenSeries={hiddenSeries}
            onToggleSerie={toggleSerie} selector={expandedData.selector} loading={isLoading} error={mainError}
            onClose={handleCloseExpanded} accentColor={GRAFICA_ACCENT[expandedGrafica]} badgeLabel={GRAFICA_BADGE[expandedGrafica]}
            allAnios={filtersData?.anios ?? []} expandedAnios={expandedAnios}
            onToggleExpandedAnio={handleToggleExpandedAnio} onSelectAllExpandedAnios={handleSelectAllExpandedAnios}
          />
        )}

        {expandedGrafica === null && (
          <>
            <div className="rounded-xl border" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.5)" }}>Empresa</span>
                {filtersLoading ? (
                  <div className="ui-select" style={{ minWidth: 160, color: "rgba(226,232,240,.4)" }}>Cargando...</div>
                ) : (
                  <FilterDropdown title="Empresa" options={empresaOptions} selectedValues={selectedEmpresas}
                    onToggle={(v) => toggleSelection(v, setSelectedEmpresas)}
                    onSelectAll={() => selectAll(empresaOptions.map((e) => e.value), selectedEmpresas, setSelectedEmpresas)}
                    allLabel="Todas" />
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.5)" }}>Año</span>
                <YearPillsFilter
                  allAnios={filtersData?.anios ?? [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]}
                  selectedAnios={selectedAnios}
                  onToggle={(v) => toggleSelection(v, setSelectedAnios)}
                  onSelectAll={() => selectAll(filtersData?.anios ?? [], selectedAnios, setSelectedAnios)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.5)" }}>Mes</span>
                <MonthPillsFilter selectedMeses={selectedMeses}
                  onToggle={(v) => toggleSelection(v, setSelectedMeses)}
                  onSelectAll={() => selectAll(Array.from({ length: 12 }, (_, i) => i + 1), selectedMeses, setSelectedMeses)} />
              </div>
              <div style={{ flex: 1 }} />
            </div>

            <div style={{ fontSize: 10, color: "rgba(96,165,250,.7)", background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.2)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#60a5fa", fontSize: 12 }}>i</span>
              Mostrando {selectedAnios.length > 0 ? selectedAnios.sort((a,b)=>b-a).join(", ") : "todos los años"} — pulsa "Todos" para ver el histórico completo · Haz clic en ⤢ para expandir cualquier gráfica con 4 años de datos
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>

              <ChartCard badgeLabel="G1" accentColor={GRAFICA_ACCENT[1]} title="E facturada / Adquisición" subtitle={grafica1Subtitle} series={grafica1Series} hiddenSeries={hiddenSeries} onToggleSerie={toggleSerie} selector={<TwoFlagsSelector flags={g1Flags} setFlags={setG1Flags} labelA="E neta fact." labelB="Adquisición" accentColor={GRAFICA_ACCENT[1]} />} loading={seriesLoading} error={seriesError} onExpand={() => handleExpand(1)} lastValueLabel={g1Info.label} lastValue={g1Info.value} trend={g1Info.trend} />

              <ChartCard badgeLabel="G2" accentColor={GRAFICA_ACCENT[2]} title="Evolución de pérdidas" subtitle={grafica2Subtitle} series={grafica2Series} hiddenSeries={hiddenSeries} onToggleSerie={toggleSerie} selector={<Grafica2Selector active={g2Active} onChange={setG2Active} accentColor={GRAFICA_ACCENT[2]} />} loading={seriesLoading} error={seriesError} onExpand={() => handleExpand(2)} lastValueLabel={g2Info.label} lastValue={g2Info.value} trend={g2Info.trend} />

              <ChartCard badgeLabel="G3" accentColor={GRAFICA_ACCENT[3]} title="Energías publicadas / E PF" subtitle={grafica3Subtitle} series={grafica3Series} hiddenSeries={hiddenSeries} onToggleSerie={toggleSerie} selector={<TwoFlagsSelector flags={g3Flags} setFlags={setG3Flags} labelA="E neta publ." labelB="E PF" accentColor={GRAFICA_ACCENT[3]} />} loading={seriesLoading} error={seriesError} onExpand={() => handleExpand(3)} lastValueLabel={g3Info.label} lastValue={g3Info.value} trend={g3Info.trend} />

              <ChartCard badgeLabel="G4" accentColor={GRAFICA_ACCENT[4]} title="Autoconsumo / E generada" subtitle={grafica4Subtitle} series={grafica4Series} hiddenSeries={hiddenSeries} onToggleSerie={toggleSerie} selector={<TwoFlagsSelector flags={g4Flags} setFlags={setG4Flags} labelA="E autoconsumo" labelB="E generada" accentColor={GRAFICA_ACCENT[4]} />} loading={seriesLoading} error={seriesError} onExpand={() => handleExpand(4)} lastValueLabel={g4Info.label} lastValue={g4Info.value} trend={g4Info.trend} />

              <ChartCard badgeLabel="G5" accentColor={GRAFICA_ACCENT[5]} title="PS por tipo" subtitle={grafica5Subtitle} series={grafica5Series} hiddenSeries={hiddenSeries} onToggleSerie={toggleSerie}
                selector={<TwoLevelSelector modos={GRAFICA5_MODOS} modoActivo={g5Modo} onModo={setG5Modo} items={GRAFICA5_TIPOS} activoItems={g5ActiveTipos} onToggleItem={(k) => { setG5ActiveTipos((prev) => { const n = new Set(prev); if (n.has(k)) { if (n.size > 1) n.delete(k); } else n.add(k); return n; }); }} accentColor={GRAFICA_ACCENT[5]} />}
                loading={psSeriesLoading} error={psSeriesError} onExpand={() => handleExpand(5)} lastValueLabel={g5Info.label} lastValue={g5Info.value} trend={g5Info.trend} />

              <ChartCard badgeLabel="G6" accentColor={GRAFICA_ACCENT[6]} title="PS por tarifa" subtitle={grafica6Subtitle} series={grafica6Series} hiddenSeries={hiddenSeries} onToggleSerie={toggleSerie}
                selector={<TwoLevelSelector modos={GRAFICA6_MODOS} modoActivo={g6Modo} onModo={setG6Modo} items={GRAFICA6_TARIFAS} activoItems={g6ActiveTarifas} onToggleItem={(k) => { setG6ActiveTarifas((prev) => { const n = new Set(prev); if (n.has(k)) { if (n.size > 1) n.delete(k); } else n.add(k); return n; }); }} accentColor={GRAFICA_ACCENT[6]} />}
                loading={psSeriesLoading} error={psSeriesError} onExpand={() => handleExpand(6)} lastValueLabel={g6Info.label} lastValue={g6Info.value} trend={g6Info.trend} />

            </div>
          </>
        )}
      </div>
    </section>
  );
}
