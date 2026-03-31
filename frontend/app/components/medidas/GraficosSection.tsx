"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

// ── Tipos ────────────────────────────────────────────────────────────────────

type Props = { token: string | null; currentUser?: User | null };

type GraficoEmpresaOption = { id: number; nombre: string };
type GraficoFiltersResponse = {
  empresas: GraficoEmpresaOption[];
  anios: number[];
  meses: number[];
};
type GraficoPoint  = { period_key: string; period_label: string; value: number };
type GraficoSerie  = { serie_key: string; serie_label: string; points: GraficoPoint[] };
type GraficoSeriesGroup = { series: GraficoSerie[] };
type GraficosSeriesResponse = {
  filters: { empresa_ids: number[]; anios: number[]; meses: number[]; aggregation: string };
  scope: { all_empresas_selected: boolean; aggregation: string };
  energia_facturada: GraficoSeriesGroup;
  perdidas: GraficoSeriesGroup;
  perdidas_kwh: GraficoSeriesGroup;
  perdidas_ventanas: GraficoSeriesGroup;
  energias_publicadas: GraficoSeriesGroup;
  energias_pf: GraficoSeriesGroup;
  autoconsumo: GraficoSeriesGroup;
  energia_generada: GraficoSeriesGroup;
  adquisicion: GraficoSeriesGroup;
  adquisicion_ventanas: GraficoSeriesGroup;
};
type GraficosPsSeriesResponse = {
  filters: { empresa_ids: number[]; anios: number[]; meses: number[]; aggregation: string };
  scope: { all_empresas_selected: boolean; aggregation: string };
  cups_por_tipo: GraficoSeriesGroup;
  energia_por_tipo: GraficoSeriesGroup;
  importe_por_tipo: GraficoSeriesGroup;
  energia_por_tarifa: GraficoSeriesGroup;
  cups_por_tarifa: GraficoSeriesGroup;
  importe_por_tarifa: GraficoSeriesGroup;
};
type ChartRow    = { period_key: string; period_label: string; [key: string]: string | number };
type CustomTooltipEntry = { value?: number | string; name?: number | string; dataKey?: number | string };
type CustomTooltipProps = { active?: boolean; payload?: readonly CustomTooltipEntry[]; label?: string; extraByLabel?: Record<string, string[]> };
type MultiCheckOption   = { value: number; label: string };
type ElementSize        = { width: number; height: number };
type FilterDropdownProps = {
  title: string;
  options: MultiCheckOption[];
  selectedValues: number[];
  onToggle: (value: number) => void;
  onSelectAll: () => void;
  allLabel?: string;
};
type ChartCardProps = {
  title: string;
  subtitle: string;
  series: GraficoSerie[];
  hiddenSeries: Record<string, boolean>;
  onToggleSerie: (key: string) => void;
  selector?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onExpand?: () => void;
  lastValueLabel?: string;
  lastValue?: string;
  trend?: { value: number; label: string };
  accentColor?: string;
  badgeLabel?: string;
};

// G2
type Grafica2SerieKey = "pct" | "pct_m2" | "pct_m7" | "pct_m11" | "pct_art15" | "kwh" | "kwh_m2" | "kwh_m7" | "kwh_m11" | "kwh_art15";
// G5
type Grafica5Modo    = "cups" | "energia" | "importe";
type Grafica5TipoKey = "total" | "tipo_1" | "tipo_2" | "tipo_3" | "tipo_4" | "tipo_5";
// G6
type Grafica6Modo    = "cups" | "energia" | "importe";
type Grafica6TarifaKey = "total" | "td_2_0" | "td_3_0" | "td_3_0ve" | "td_6_1" | "td_6_2" | "td_6_3" | "td_6_4";
type TwoFlagsState   = { a: boolean; b: boolean };

// ── Constantes ────────────────────────────────────────────────────────────────

const GRAFICA2_OPCIONES: { key: Grafica2SerieKey; label: string; grupo: "pct" | "kwh" }[] = [
  { key: "pct",      label: "Pérdidas (%)",    grupo: "pct" },
  { key: "pct_m2",   label: "Pérdidas M2 (%)", grupo: "pct" },
  { key: "pct_m7",   label: "Pérdidas M7 (%)", grupo: "pct" },
  { key: "pct_m11",  label: "Pérdidas M11 (%)", grupo: "pct" },
  { key: "pct_art15",label: "Pérdidas ART15 (%)", grupo: "pct" },
  { key: "kwh",      label: "Pérdidas (kWh)",  grupo: "kwh" },
  { key: "kwh_m2",   label: "Pérdidas M2 (kWh)", grupo: "kwh" },
  { key: "kwh_m7",   label: "Pérdidas M7 (kWh)", grupo: "kwh" },
  { key: "kwh_m11",  label: "Pérdidas M11 (kWh)", grupo: "kwh" },
  { key: "kwh_art15",label: "Pérdidas ART15 (kWh)", grupo: "kwh" },
];

const GRAFICA5_TIPOS: { key: Grafica5TipoKey; label: string }[] = [
  { key: "total",  label: "Total"  },
  { key: "tipo_1", label: "Tipo 1" },
  { key: "tipo_2", label: "Tipo 2" },
  { key: "tipo_3", label: "Tipo 3" },
  { key: "tipo_4", label: "Tipo 4" },
  { key: "tipo_5", label: "Tipo 5" },
];

const GRAFICA5_MODO_CONFIG: Record<Grafica5Modo, { groupKey: keyof GraficosPsSeriesResponse; label: string }> = {
  cups:    { groupKey: "cups_por_tipo",    label: "CUPS"    },
  energia: { groupKey: "energia_por_tipo", label: "Energía" },
  importe: { groupKey: "importe_por_tipo", label: "Importe" },
};

const GRAFICA6_TARIFAS: { key: Grafica6TarifaKey; label: string }[] = [
  { key: "total",    label: "Total"    },
  { key: "td_2_0",  label: "2.0TD"   },
  { key: "td_3_0",  label: "3.0TD"   },
  { key: "td_3_0ve",label: "3.0TDVE" },
  { key: "td_6_1",  label: "6.1TD"   },
  { key: "td_6_2",  label: "6.2TD"   },
  { key: "td_6_3",  label: "6.3TD"   },
  { key: "td_6_4",  label: "6.4TD"   },
];

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

// Colores por gráfica para el nuevo diseño
const GRAFICA_ACCENT: Record<number, string> = {
  1: "#60a5fa",
  2: "#fbbf24",
  3: "#f87171",
  4: "#34d399",
  5: "#a78bfa",
  6: "#fb923c",
};

const GRAFICA_BADGE: Record<number, string> = {
  1: "G1", 2: "G2", 3: "G3", 4: "G4", 5: "G5", 6: "G6",
};

// ── Utilidades ────────────────────────────────────────────────────────────────

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
      if (!map.has(point.period_key)) {
        map.set(point.period_key, { period_key: point.period_key, period_label: point.period_label });
      }
      const row = map.get(point.period_key)!;
      row[serie.serie_key] = point.value;
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
    const extras = extraKeys
      .filter((k) => row[k] != null)
      .map((k) => `${k}: ${formatNumberEs(row[k] as number)}`);
    if (extras.length > 0) result[row.period_label] = extras;
  }
  return result;
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, extraByLabel }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs"
      style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", minWidth: 140 }}
    >
      <div className="mb-1 font-medium ui-muted">{label}</div>
      {payload.map((entry, i) => {
        const matchLabel = typeof entry.name === "string" ? entry.name : String(entry.name ?? "");
        const matchKey   = typeof entry.dataKey === "string" ? entry.dataKey : String(entry.dataKey ?? "");
        const numericValue = typeof entry.value === "number" ? entry.value : Number(entry.value);
        return (
          <div key={`${matchKey}-${i}`} className="flex items-center justify-between gap-3">
            <span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>{matchLabel}</span>
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

function useElementSize(): [React.MutableRefObject<HTMLDivElement | null>, ElementSize] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth  = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);
      setSize((prev) => prev.width === nextWidth && prev.height === nextHeight ? prev : { width: nextWidth, height: nextHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

// ── FilterDropdown (multi-check, igual que antes) ─────────────────────────────

function FilterDropdown({ title, options, selectedValues, onToggle, onSelectAll, allLabel = "Todas" }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const allSelected = selectedValues.length === 0 || selectedValues.length === options.length;
  const summary = allSelected ? allLabel : `${selectedValues.length} sel.`;
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ui-select"
        style={{ minWidth: 160, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <span>{title}: {summary}</span>
        <span style={{ fontSize: 10, color: "rgba(226,232,240,.5)" }}>▾</span>
      </button>
      {open && (
        <div
          className="rounded-xl border"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
            background: "var(--card-bg)", borderColor: "var(--card-border)",
            padding: 8, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--card-border)" }}>
            <span style={{ fontSize: 10, color: "rgba(226,232,240,.5)" }}>{title}</span>
            <button type="button" onClick={onSelectAll} className="ui-btn ui-btn-outline ui-btn-xs">
              {allLabel}
            </button>
          </div>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,58,95,.5)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background: selectedValues.includes(opt.value) ? "#2563eb" : "transparent",
                border: `1px solid ${selectedValues.includes(opt.value) ? "#2563eb" : "rgba(255,255,255,.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff",
              }}>
                {selectedValues.includes(opt.value) ? "✓" : ""}
              </div>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── YearPillsFilter — nuevo componente híbrido ────────────────────────────────
// Muestra los últimos 4 años como pills + desplegable "Anteriores" si hay más

function YearPillsFilter({
  allAnios,
  selectedAnios,
  onToggle,
  onSelectAll,
}: {
  allAnios: number[];
  selectedAnios: number[];
  onToggle: (anio: number) => void;
  onSelectAll: () => void;
}) {
  const [prevOpen, setPrevOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPrevOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const sorted      = [...allAnios].sort((a, b) => b - a);
  const recent      = sorted.slice(0, 4);
  const previous    = sorted.slice(4);
  const allSelected = selectedAnios.length === 0 || selectedAnios.length === allAnios.length;
  const prevActive  = previous.filter((y) => selectedAnios.includes(y));

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap",
    border: active ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,.14)",
    background: active ? "#1d4ed8" : "rgba(0,0,0,.22)",
    color: active ? "#fff" : "rgba(226,232,240,.45)",
    height: 28, display: "flex", alignItems: "center",
  });

  const allPillStyle: React.CSSProperties = {
    fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
    border: allSelected ? "1px solid #34d399" : "1px solid rgba(52,211,153,.28)",
    background: allSelected ? "rgba(52,211,153,.2)" : "transparent",
    color: allSelected ? "#34d399" : "rgba(52,211,153,.6)",
    height: 28, display: "flex", alignItems: "center",
  };

  return (
    <div ref={wrapRef} style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {/* Pill "Todos" */}
      <button type="button" onClick={onSelectAll} style={allPillStyle}>Todos</button>

      {/* Separador */}
      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />

      {/* Últimos 4 años */}
      {recent.map((y) => (
        <button key={y} type="button" onClick={() => onToggle(y)} style={pillStyle(selectedAnios.includes(y))}>
          {y}
        </button>
      ))}

      {/* Desplegable "Anteriores" — solo si hay años previos */}
      {previous.length > 0 && (
        <>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setPrevOpen((v) => !v)}
              style={{
                fontSize: 11, padding: "0 10px", borderRadius: 7, cursor: "pointer",
                height: 28, display: "flex", alignItems: "center", gap: 5,
                border: prevActive.length > 0 ? "1px solid rgba(37,99,235,.4)" : "1px solid rgba(255,255,255,.1)",
                background: prevActive.length > 0 ? "rgba(37,99,235,.15)" : "rgba(0,0,0,.18)",
                color: prevActive.length > 0 ? "#93c5fd" : "rgba(226,232,240,.38)",
              }}
            >
              Anteriores
              {prevActive.length > 0 && (
                <span style={{ fontSize: 9, background: "rgba(37,99,235,.5)", color: "#fff", borderRadius: 8, padding: "1px 5px" }}>
                  {prevActive.length}
                </span>
              )}
              {prevOpen ? " ▴" : " ▾"}
            </button>

            {prevOpen && (
              <div
                className="rounded-xl border"
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                  background: "var(--card-bg)", borderColor: "var(--card-border)",
                  padding: 6, minWidth: 110, boxShadow: "0 8px 24px rgba(0,0,0,.5)",
                }}
              >
                {previous.map((y) => (
                  <div
                    key={y}
                    onClick={() => onToggle(y)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,58,95,.5)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{
                      width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                      background: selectedAnios.includes(y) ? "#2563eb" : "transparent",
                      border: `1px solid ${selectedAnios.includes(y) ? "#2563eb" : "rgba(255,255,255,.2)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff",
                    }}>
                      {selectedAnios.includes(y) ? "✓" : ""}
                    </div>
                    {y}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── MonthPillsFilter — meses como pills de 3 letras ───────────────────────────

function MonthPillsFilter({
  selectedMeses,
  onToggle,
  onSelectAll,
}: {
  selectedMeses: number[];
  onToggle: (mes: number) => void;
  onSelectAll: () => void;
}) {
  const allSelected = selectedMeses.length === 0 || selectedMeses.length === 12;

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 10, padding: "0 6px", borderRadius: 6, cursor: "pointer",
    border: active ? "1px solid rgba(37,99,235,.5)" : "1px solid rgba(255,255,255,.1)",
    background: active ? "rgba(37,99,235,.28)" : "rgba(0,0,0,.18)",
    color: active ? "#93c5fd" : "rgba(226,232,240,.38)",
    height: 26, display: "flex", alignItems: "center", minWidth: 30, justifyContent: "center",
  });

  const allStyle: React.CSSProperties = {
    fontSize: 10, padding: "0 7px", borderRadius: 6, cursor: "pointer",
    border: allSelected ? "1px solid #34d399" : "1px solid rgba(52,211,153,.22)",
    background: allSelected ? "rgba(52,211,153,.14)" : "transparent",
    color: allSelected ? "#34d399" : "rgba(52,211,153,.55)",
    height: 26, display: "flex", alignItems: "center",
  };

  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      <button type="button" onClick={onSelectAll} style={allStyle}>Todos</button>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
        <button key={m} type="button" onClick={() => onToggle(m)} style={pillStyle(selectedMeses.includes(m))}>
          {MESES_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

// ── ChartCard — card del grid 3×2 ────────────────────────────────────────────

function ChartCard({
  title, subtitle, series, hiddenSeries, onToggleSerie,
  selector, loading, error, onExpand,
  lastValueLabel, lastValue, trend, accentColor = "#60a5fa", badgeLabel = "G",
}: ChartCardProps) {
  const [containerRef, size] = useElementSize();
  const rows = useMemo(() => buildChartRows(series), [series]);
  const visibleSeries = series.filter((s) => !hiddenSeries[s.serie_key]);

  const canRenderChart = size.width > 50 && rows.length > 0 && visibleSeries.length > 0;

  return (
    <div
      className="rounded-xl border"
      style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* Header */}
      <div style={{ padding: "8px 11px 6px", borderBottom: "1px solid var(--card-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 9,
            background: `${accentColor}28`, color: accentColor,
          }}>
            {badgeLabel}
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{title}</span>
        </div>
        <div style={{ fontSize: 9, color: "rgba(226,232,240,.38)", marginTop: 1 }}>{subtitle}</div>
        {selector && <div style={{ marginTop: 5 }}>{selector}</div>}

        {/* Pills de series */}
        {series.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 5 }}>
            {series.map((s) => {
              const active = !hiddenSeries[s.serie_key];
              return (
                <button
                  key={s.serie_key}
                  type="button"
                  onClick={() => onToggleSerie(s.serie_key)}
                  style={{
                    fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer",
                    border: active ? `1px solid ${accentColor}80` : "1px solid rgba(255,255,255,.1)",
                    background: active ? `${accentColor}30` : "transparent",
                    color: active ? accentColor : "rgba(226,232,240,.45)",
                  }}
                >
                  {s.serie_label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ flex: 1, padding: "6px 9px 3px" }}>
        <div style={{ height: 110, borderRadius: 7, background: "rgba(0,0,0,.18)", overflow: "hidden" }}>
          {loading && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(226,232,240,.35)" }}>
              Cargando...
            </div>
          )}
          {!loading && error && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fca5a5", padding: "0 8px", textAlign: "center" }}>
              {error}
            </div>
          )}
          {!loading && !error && canRenderChart && (
            <LineChart width={size.width - 18} height={110} data={rows} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
              <XAxis dataKey="period_label" tick={{ fontSize: 8 }} tickFormatter={formatXAxisTick} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8 }} tickFormatter={formatYAxis} tickLine={false} axisLine={false} width={42} />
              <Tooltip content={(props) => <CustomTooltip active={props.active} payload={props.payload as readonly CustomTooltipEntry[]} label={typeof props.label === "string" ? props.label : String(props.label ?? "")} />} />
              <Brush dataKey="period_label" height={16} stroke={accentColor} fill="rgba(0,0,0,.3)" travellerWidth={6} />
              {visibleSeries.map((s, i) => (
                <Line
                  key={s.serie_key}
                  type="monotone"
                  dataKey={s.serie_key}
                  name={s.serie_label}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={i === 0 ? 2 : 1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  strokeDasharray={i === 0 ? undefined : i % 2 === 0 ? "5 2" : "3 2"}
                />
              ))}
            </LineChart>
          )}
          {!loading && !error && !canRenderChart && rows.length === 0 && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(226,232,240,.3)" }}>
              Sin datos para el filtro seleccionado
            </div>
          )}
        </div>
        {/* Brush label */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 0 2px" }}>
          <span style={{ fontSize: 8, color: "rgba(226,232,240,.28)", whiteSpace: "nowrap" }}>
            {rows[0]?.period_label ?? ""}
          </span>
          <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,.06)", borderRadius: 1 }}>
            <div style={{ height: 2, background: `${accentColor}40`, borderRadius: 1, width: "100%" }} />
          </div>
          <span style={{ fontSize: 8, color: "rgba(226,232,240,.28)", whiteSpace: "nowrap" }}>
            {rows[rows.length - 1]?.period_label ?? ""}
          </span>
        </div>
      </div>

      {/* Footer KPI */}
      <div style={{ padding: "6px 11px", borderTop: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {lastValueLabel && <div style={{ fontSize: 9, color: "rgba(226,232,240,.38)" }}>{lastValueLabel}</div>}
          {lastValue && <div style={{ fontSize: 13, fontWeight: 500, color: accentColor }}>{lastValue}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {trend && (
            <span style={{ fontSize: 10, fontWeight: 500, color: trend.value >= 0 ? "#34d399" : "#fca5a5" }}>
              {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}{trend.label}
            </span>
          )}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title="Expandir gráfica"
              style={{
                fontSize: 10, padding: "3px 7px", border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 6, background: "transparent", color: "rgba(226,232,240,.32)", cursor: "pointer",
              }}
            >
              ⤢
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ExpandedChart — modal de gráfica expandida ────────────────────────────────

function ExpandedChart({
  title, subtitle, series, hiddenSeries, onToggleSerie,
  selector, loading, error,
  onClose, accentColor = "#60a5fa", badgeLabel = "G",
  allAnios, expandedAnios, onToggleExpandedAnio, onSelectAllExpandedAnios,
}: {
  title: string;
  subtitle: string;
  series: GraficoSerie[];
  hiddenSeries: Record<string, boolean>;
  onToggleSerie: (key: string) => void;
  selector?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  accentColor?: string;
  badgeLabel?: string;
  allAnios: number[];
  expandedAnios: number[];
  onToggleExpandedAnio: (anio: number) => void;
  onSelectAllExpandedAnios: () => void;
}) {
  const [containerRef, size] = useElementSize();
  const rows = useMemo(() => buildChartRows(series), [series]);
  const visibleSeries = series.filter((s) => !hiddenSeries[s.serie_key]);
  const canRenderChart = size.width > 50 && rows.length > 0 && visibleSeries.length > 0;

  // KPIs calculados sobre los datos visibles
  const kpis = useMemo(() => {
    if (!canRenderChart) return null;
    const mainKey  = visibleSeries[0]?.serie_key;
    if (!mainKey) return null;
    const values   = rows.map((r) => r[mainKey] as number).filter((v) => typeof v === "number" && !isNaN(v));
    if (!values.length) return null;
    const last     = values[values.length - 1];
    const prev     = values[values.length - 2];
    const max      = Math.max(...values);
    const min      = Math.min(...values);
    const avg      = values.reduce((a, b) => a + b, 0) / values.length;
    const maxRow   = rows.find((r) => r[mainKey] === max);
    const minRow   = rows.find((r) => r[mainKey] === min);
    const pct      = prev && prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null;
    return { last, prev, max, min, avg, maxLabel: maxRow?.period_label, minLabel: minRow?.period_label, pct };
  }, [rows, visibleSeries, canRenderChart]);

  // Shortcuts de rango
  const currentYear = new Date().getFullYear();
  const shortcuts = [
    { label: "4 años (defecto)", anios: [currentYear, currentYear-1, currentYear-2, currentYear-3] },
    { label: "Último año",       anios: [currentYear] },
    { label: "2 años",           anios: [currentYear, currentYear-1] },
    { label: "Todo",             anios: [] },
    ...allAnios.slice(0, 4).map((y) => ({ label: String(y), anios: [y] })),
  ];

  return (
    <div
      className="rounded-xl border"
      style={{ background: "#111f35", borderColor: "rgba(30,58,95,.9)", overflow: "hidden" }}
    >
      {/* Header modal */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 16px 10px", borderBottom: "1px solid rgba(30,58,95,.7)", background: "var(--card-bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: `${accentColor}28`, color: accentColor }}>
              {badgeLabel}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{title}</span>
          </div>
          <div style={{ fontSize: 10, color: "rgba(226,232,240,.4)" }}>
            {subtitle} — vista expandida · filtro ampliado a 4 años
          </div>

          {/* Filtro de año en expandida — últimos 4 + anteriores */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.45)" }}>Año:</span>
            <YearPillsFilter
              allAnios={allAnios}
              selectedAnios={expandedAnios}
              onToggle={onToggleExpandedAnio}
              onSelectAll={onSelectAllExpandedAnios}
            />
          </div>

          {selector && <div style={{ marginTop: 4 }}>{selector}</div>}

          {/* Pills de series */}
          {series.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {series.map((s, i) => {
                const active = !hiddenSeries[s.serie_key];
                return (
                  <button
                    key={s.serie_key}
                    type="button"
                    onClick={() => onToggleSerie(s.serie_key)}
                    style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 20, cursor: "pointer",
                      border: active ? `1px solid ${accentColor}80` : "1px solid rgba(255,255,255,.12)",
                      background: active ? `${accentColor}30` : "transparent",
                      color: active ? accentColor : "rgba(226,232,240,.5)",
                    }}
                  >
                    {s.serie_label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(96,165,250,.7)", background: "rgba(37,99,235,.12)", border: "1px solid rgba(37,99,235,.25)", borderRadius: 7, padding: "4px 10px", whiteSpace: "nowrap" }}>
            ↑ 4 años cargados al expandir
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 11, padding: "5px 12px", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, background: "transparent", color: "rgba(226,232,240,.6)", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            ✕ Volver al grid
          </button>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid rgba(30,58,95,.6)" }}>
          {[
            { label: "Último valor",     val: formatYAxis(kpis.last), sub: kpis.pct != null ? `${kpis.pct >= 0 ? "▲" : "▼"} ${Math.abs(kpis.pct).toFixed(1)}% vs anterior` : "", subColor: kpis.pct != null ? (kpis.pct >= 0 ? "#34d399" : "#fca5a5") : undefined, valColor: accentColor },
            { label: "Máximo histórico", val: formatYAxis(kpis.max),  sub: kpis.maxLabel ?? "",  subColor: undefined, valColor: "#34d399" },
            { label: "Mínimo del período",val: formatYAxis(kpis.min), sub: kpis.minLabel ?? "",  subColor: undefined, valColor: "#fca5a5" },
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

      {/* Gráfica grande */}
      <div ref={containerRef} style={{ padding: "12px 16px 0" }}>
        <div style={{ height: 260, background: "rgba(0,0,0,.15)", borderRadius: 10, overflow: "hidden" }}>
          {loading && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(226,232,240,.35)" }}>
              Cargando...
            </div>
          )}
          {!loading && error && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fca5a5" }}>
              {error}
            </div>
          )}
          {!loading && !error && canRenderChart && (
            <LineChart width={size.width - 32} height={260} data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="period_label" tick={{ fontSize: 9 }} tickFormatter={formatXAxisTick} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={formatYAxis} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={(props) => <CustomTooltip active={props.active} payload={props.payload as readonly CustomTooltipEntry[]} label={typeof props.label === "string" ? props.label : String(props.label ?? "")} />} />
              <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 8, fontSize: 10 }} />
              <Brush dataKey="period_label" height={20} stroke={accentColor} fill="rgba(0,0,0,.3)" travellerWidth={8} />
              {visibleSeries.map((s, i) => (
                <Line
                  key={s.serie_key}
                  type="monotone"
                  dataKey={s.serie_key}
                  name={s.serie_label}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={i === 0 ? 2.5 : 1.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  strokeDasharray={i === 0 ? undefined : i % 2 === 0 ? "5 2" : "3 2"}
                />
              ))}
            </LineChart>
          )}
          {!loading && !error && !canRenderChart && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(226,232,240,.3)" }}>
              Sin datos para el filtro seleccionado
            </div>
          )}
        </div>
      </div>

      {/* Shortcuts de rango */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px 12px", alignItems: "center", borderTop: "1px solid rgba(30,58,95,.5)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "rgba(226,232,240,.38)" }}>Acceso rápido:</span>
        {shortcuts.map((sc) => {
          const isActive = sc.anios.length === 0
            ? expandedAnios.length === 0
            : sc.anios.every((y) => expandedAnios.includes(y)) && expandedAnios.length === sc.anios.length;
          return (
            <button
              key={sc.label}
              type="button"
              onClick={() => {
                if (sc.anios.length === 0) { onSelectAllExpandedAnios(); }
                else {
                  // Seleccionar exactamente esos años
                  sc.anios.forEach((y) => { if (!expandedAnios.includes(y)) onToggleExpandedAnio(y); });
                  expandedAnios.filter((y) => !sc.anios.includes(y)).forEach((y) => onToggleExpandedAnio(y));
                }
              }}
              style={{
                fontSize: 10, padding: "3px 9px", borderRadius: 6, cursor: "pointer",
                border: isActive ? "1px solid rgba(37,99,235,.4)" : "1px solid rgba(255,255,255,.1)",
                background: isActive ? "rgba(37,99,235,.2)" : "transparent",
                color: isActive ? "#93c5fd" : "rgba(226,232,240,.42)",
              }}
            >
              {sc.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Selectores de series (G2, G5, G6) ─────────────────────────────────────────

function TwoFlagsSelector({
  flags, setFlags, labelA, labelB, accentColor,
}: { flags: TwoFlagsState; setFlags: (f: TwoFlagsState) => void; labelA: string; labelB: string; accentColor?: string }) {
  const color = accentColor ?? "#6D5EF8";
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {([{ flag: "a" as const, label: labelA }, { flag: "b" as const, label: labelB }]).map(({ flag, label }) => {
        const active = flags[flag];
        return (
          <button
            key={flag}
            type="button"
            onClick={() => setFlags({ ...flags, [flag]: !flags[flag] })}
            style={{
              fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer",
              border: active ? `1px solid ${color}80` : "1px solid rgba(255,255,255,.1)",
              background: active ? `${color}30` : "transparent",
              color: active ? color : "rgba(226,232,240,.45)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Grafica2Selector({
  active, onChange, accentColor,
}: { active: Set<Grafica2SerieKey>; onChange: (next: Set<Grafica2SerieKey>) => void; accentColor?: string }) {
  const color = accentColor ?? "#fbbf24";
  const toggle = (key: Grafica2SerieKey) => {
    const next = new Set(active);
    if (next.has(key)) { if (next.size > 1) next.delete(key); }
    else next.add(key);
    onChange(next);
  };
  const pcts = GRAFICA2_OPCIONES.filter((o) => o.grupo === "pct");
  const kwhs = GRAFICA2_OPCIONES.filter((o) => o.grupo === "kwh");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {pcts.map((o) => {
          const isActive = active.has(o.key);
          return (
            <button key={o.key} type="button" onClick={() => toggle(o.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: isActive ? `1px solid ${color}80` : "1px solid rgba(255,255,255,.1)", background: isActive ? `${color}30` : "transparent", color: isActive ? color : "rgba(226,232,240,.45)" }}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {kwhs.map((o) => {
          const isActive = active.has(o.key);
          return (
            <button key={o.key} type="button" onClick={() => toggle(o.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: isActive ? `1px solid rgba(96,165,250,.5)` : "1px solid rgba(255,255,255,.1)", background: isActive ? "rgba(96,165,250,.25)" : "transparent", color: isActive ? "#93c5fd" : "rgba(226,232,240,.45)" }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TwoLevelSelector<M extends string, K extends string>({
  modos, modoActivo, onModo,
  items, activoItems, onToggleItem,
  accentColor,
}: {
  modos: { key: M; label: string }[];
  modoActivo: M;
  onModo: (m: M) => void;
  items: { key: K; label: string }[];
  activoItems: Set<K>;
  onToggleItem: (k: K) => void;
  accentColor?: string;
}) {
  const color = accentColor ?? "#a78bfa";
  const toggle = (k: K) => {
    const next = new Set(activoItems);
    if (next.has(k)) { if (next.size > 1) next.delete(k); }
    else next.add(k);
    onToggleItem(k);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {modos.map((m) => {
          const active = modoActivo === m.key;
          return (
            <button key={m.key} type="button" onClick={() => onModo(m.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, cursor: "pointer", border: active ? "1px solid rgba(255,255,255,.2)" : "1px solid rgba(255,255,255,.07)", background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? "var(--text)" : "rgba(226,232,240,.4)" }}>
              {m.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {items.map((item) => {
          const active = activoItems.has(item.key);
          return (
            <button key={item.key} type="button" onClick={() => toggle(item.key)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, cursor: "pointer", border: active ? `1px solid ${color}80` : "1px solid rgba(255,255,255,.1)", background: active ? `${color}30` : "transparent", color: active ? color : "rgba(226,232,240,.45)" }}>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Utilidades de selección ────────────────────────────────────────────────────

function toggleSelection<T>(value: T, setter: React.Dispatch<React.SetStateAction<T[]>>) {
  setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
}

function selectAll<T>(all: T[], current: T[], setter: React.Dispatch<React.SetStateAction<T[]>>) {
  if (current.length === all.length) setter([]);
  else setter(all);
}

// ── GraficosSection — componente principal ────────────────────────────────────

export default function GraficosSection({ token }: Props) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // ── Estados de filtros globales (pantalla inicial — 2 últimos años por defecto)
  const [selectedEmpresas, setSelectedEmpresas] = useState<number[]>([]);
  const [selectedAnios,    setSelectedAnios]    = useState<number[]>([currentYear, currentYear - 1]);
  const [selectedMeses,    setSelectedMeses]    = useState<number[]>([]);

  // ── Estados de datos
  const [filtersData,    setFiltersData]    = useState<GraficoFiltersResponse | null>(null);
  const [seriesData,     setSeriesData]     = useState<GraficosSeriesResponse | null>(null);
  const [psSeriesData,   setPsSeriesData]   = useState<GraficosPsSeriesResponse | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [seriesLoading,  setSeriesLoading]  = useState(false);
  const [psSeriesLoading,setPsSeriesLoading]= useState(false);
  const [filtersError,   setFiltersError]   = useState<string | null>(null);
  const [seriesError,    setSeriesError]    = useState<string | null>(null);
  const [psSeriesError,  setPsSeriesError]  = useState<string | null>(null);

  // ── Estado expandida
  const [expandedGrafica, setExpandedGrafica] = useState<number | null>(null);

  // ── Años en vista expandida — por defecto últimos 4
  const [expandedAnios, setExpandedAnios] = useState<number[]>([
    currentYear, currentYear - 1, currentYear - 2, currentYear - 3,
  ]);

  // ── Series activas G1/G3/G4
  const [g1Flags,  setG1Flags]  = useState<TwoFlagsState>({ a: true, b: false });
  const [g3Flags,  setG3Flags]  = useState<TwoFlagsState>({ a: true, b: false });
  const [g4Flags,  setG4Flags]  = useState<TwoFlagsState>({ a: true, b: false });

  // ── Series activas G2
  const [g2Active, setG2Active] = useState<Set<Grafica2SerieKey>>(new Set(["pct"]));

  // ── G5
  const [g5Modo,       setG5Modo]       = useState<Grafica5Modo>("cups");
  const [g5ActiveTipos,setG5ActiveTipos]= useState<Set<Grafica5TipoKey>>(new Set(["total"]));

  // ── G6
  const [g6Modo,        setG6Modo]        = useState<Grafica6Modo>("cups");
  const [g6ActiveTarifas,setG6ActiveTarifas]= useState<Set<Grafica6TarifaKey>>(new Set(["total"]));

  // ── hiddenSeries global
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const toggleSerie = useCallback((key: string) => {
    setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Cargar filtros
  const loadFilters = useCallback(async () => {
    if (!token) return;
    setFiltersLoading(true); setFiltersError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/graficos/filters`, { headers: getAuthHeaders(token) });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const json = (await response.json()) as GraficoFiltersResponse;
      setFiltersData(json);
    } catch (err) {
      setFiltersError(err instanceof Error ? err.message : "Error cargando filtros");
    } finally {
      setFiltersLoading(false);
    }
  }, [token]);

  // ── Cargar series generales
  const loadSeries = useCallback(async (aniosOverride?: number[]) => {
    if (!token) return;
    setSeriesLoading(true); setSeriesError(null);
    try {
      const searchParams = new URLSearchParams();
      const aniosToUse = aniosOverride ?? selectedAnios;
      for (const id  of selectedEmpresas) searchParams.append("empresa_ids", String(id));
      for (const anio of aniosToUse)      searchParams.append("anios", String(anio));
      for (const mes  of selectedMeses)   searchParams.append("meses", String(mes));
      const response = await fetch(`${API_BASE_URL}/graficos/series?${searchParams.toString()}`, { headers: getAuthHeaders(token) });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const json = (await response.json()) as GraficosSeriesResponse;
      setSeriesData(json);
    } catch (err) {
      setSeriesError(err instanceof Error ? err.message : "Error cargando series");
    } finally {
      setSeriesLoading(false);
    }
  }, [token, selectedEmpresas, selectedAnios, selectedMeses]);

  // ── Cargar series PS
  const loadPsSeries = useCallback(async (aniosOverride?: number[]) => {
    if (!token) return;
    setPsSeriesLoading(true); setPsSeriesError(null);
    try {
      const searchParams = new URLSearchParams();
      const aniosToUse = aniosOverride ?? selectedAnios;
      for (const id  of selectedEmpresas) searchParams.append("empresa_ids", String(id));
      for (const anio of aniosToUse)      searchParams.append("anios", String(anio));
      for (const mes  of selectedMeses)   searchParams.append("meses", String(mes));
      const response = await fetch(`${API_BASE_URL}/graficos/ps-series?${searchParams.toString()}`, { headers: getAuthHeaders(token) });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const json = (await response.json()) as GraficosPsSeriesResponse;
      setPsSeriesData(json);
    } catch (err) {
      setPsSeriesError(err instanceof Error ? err.message : "Error cargando series PS");
    } finally {
      setPsSeriesLoading(false);
    }
  }, [token, selectedEmpresas, selectedAnios, selectedMeses]);

  useEffect(() => { void loadFilters(); }, [loadFilters]);
  useEffect(() => { void loadSeries(); void loadPsSeries(); }, [loadSeries, loadPsSeries]);

  // ── Al abrir expandida — cargar con 4 años
  const handleExpand = useCallback((graficaNum: number) => {
    const anios4 = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].filter((y) =>
      !filtersData || filtersData.anios.includes(y)
    );
    setExpandedAnios(anios4.length > 0 ? anios4 : [currentYear]);
    setExpandedGrafica(graficaNum);
    void loadSeries(anios4);
    void loadPsSeries(anios4);
  }, [currentYear, filtersData, loadSeries, loadPsSeries]);

  const handleCloseExpanded = useCallback(() => {
    setExpandedGrafica(null);
    // Recargar con los filtros originales
    void loadSeries();
    void loadPsSeries();
  }, [loadSeries, loadPsSeries]);

  // ── Opciones para dropdowns/filtros
  const empresaOptions = useMemo<MultiCheckOption[]>(
    () => (filtersData?.empresas ?? []).map((e) => ({ value: e.id, label: `${e.id} – ${e.nombre}` })),
    [filtersData]
  );
  const anioOptions = useMemo<MultiCheckOption[]>(
    () => (filtersData?.anios ?? []).map((y) => ({ value: y, label: String(y) })),
    [filtersData]
  );

  // ── Series para cada gráfica ───────────────────────────────────────────────

  // G1 — E facturada / Adquisición
  const grafica1Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const allPeriodKeys = new Set<string>();
    const m1Serie = seriesData.energia_facturada.series[0];
    if (m1Serie) m1Serie.points.forEach((p) => allPeriodKeys.add(p.period_key));

    const labelByKey: Record<string, string> = {};
    m1Serie?.points.forEach((p) => { labelByKey[p.period_key] = p.period_label; });

    const ventanas = ADQ_VENTANAS;
    const adqVentanasByPeriod: Record<string, Record<string, number>> = {};
    for (const v of ventanas) {
      const serie = seriesData.adquisicion_ventanas.series.find((s) => s.serie_key === `adq_${v.toLowerCase()}`);
      if (!serie) continue;
      for (const pt of serie.points) {
        if (!adqVentanasByPeriod[pt.period_key]) adqVentanasByPeriod[pt.period_key] = {};
        adqVentanasByPeriod[pt.period_key][`adq_${v.toLowerCase()}`] = pt.value;
        labelByKey[pt.period_key] = pt.period_label;
        allPeriodKeys.add(pt.period_key);
      }
    }

    const result: GraficoSerie[] = [];
    if (g1Flags.a && m1Serie) result.push({ ...m1Serie, serie_label: "E neta facturada" });
    if (g1Flags.b) {
      const adqSerie = seriesData.adquisicion.series[0];
      if (adqSerie) result.push({ ...adqSerie, serie_label: "Adquisición" });
    }
    return result;
  }, [seriesData, g1Flags]);

  const grafica1Subtitle = useMemo(() => {
    const labels = [];
    if (g1Flags.a) labels.push("E neta facturada");
    if (g1Flags.b) labels.push("Adquisición (pub. más reciente)");
    return `Histórico de ${labels.join(" y ")}.`;
  }, [g1Flags]);

  // G2 — Pérdidas
  const grafica2Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const result: GraficoSerie[] = [];
    for (const opcion of GRAFICA2_OPCIONES) {
      if (!g2Active.has(opcion.key)) continue;
      if (opcion.grupo === "pct") {
        if (opcion.key === "pct") {
          const s = seriesData.perdidas.series[0];
          if (s) result.push({ ...s, serie_key: "pct", serie_label: "Pérdidas (%)" });
        } else {
          const ventana = opcion.key.replace("pct_", "").toUpperCase();
          const s = seriesData.perdidas_ventanas.series.find((x) => x.serie_key.toUpperCase().includes(ventana));
          if (s) result.push({ ...s, serie_key: opcion.key, serie_label: opcion.label });
        }
      } else {
        if (opcion.key === "kwh") {
          const s = seriesData.perdidas_kwh.series[0];
          if (s) result.push({ ...s, serie_key: "kwh", serie_label: "Pérdidas (kWh)" });
        } else {
          const ventana = opcion.key.replace("kwh_", "").toUpperCase();
          const s = seriesData.perdidas_ventanas.series.find((x) => x.serie_key.toUpperCase().includes(ventana));
          if (s) result.push({ ...s, serie_key: opcion.key, serie_label: opcion.label });
        }
      }
    }
    return result;
  }, [seriesData, g2Active]);

  const grafica2Subtitle = useMemo(() => {
    const labels = [...g2Active].map((k) => GRAFICA2_OPCIONES.find((o) => o.key === k)?.label ?? k);
    return `Histórico de ${labels.join(", ")}.`;
  }, [g2Active]);

  // G3 — Energías publicadas / E PF
  const energiasPfSinFinal = useMemo(
    () => seriesData?.energias_pf.series.filter((s) => !s.serie_key.includes("final")) ?? [],
    [seriesData]
  );
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

  // G4 — Autoconsumo / E generada
  const grafica4Series = useMemo((): GraficoSerie[] => {
    if (!seriesData) return [];
    const result: GraficoSerie[] = [];
    if (g4Flags.a) {
      const s = seriesData.autoconsumo.series[0];
      if (s) result.push({ ...s, serie_label: "E autoconsumo" });
    }
    if (g4Flags.b) {
      const s = seriesData.energia_generada.series[0];
      if (s) result.push({ ...s, serie_label: "E generada" });
    }
    return result;
  }, [seriesData, g4Flags]);

  const grafica4Subtitle = useMemo(() => {
    const parts = [];
    if (g4Flags.a) parts.push("E autoconsumo");
    if (g4Flags.b) parts.push("E generada");
    return `Histórico de ${parts.join(" y ")}.`;
  }, [g4Flags]);

  // G5 — PS por tipo
  const grafica5Series = useMemo((): GraficoSerie[] => {
    if (!psSeriesData) return [];
    const groupKey = GRAFICA5_MODO_CONFIG[g5Modo].groupKey;
    const group = psSeriesData[groupKey] as GraficoSeriesGroup;
    return group.series.filter((s) => {
      const key = s.serie_key as Grafica5TipoKey;
      return g5ActiveTipos.has(key);
    });
  }, [psSeriesData, g5Modo, g5ActiveTipos]);

  const grafica5Subtitle = `${GRAFICA5_MODO_CONFIG[g5Modo].label} PS por tipo — ${[...g5ActiveTipos].map((k) => GRAFICA5_TIPOS.find((t) => t.key === k)?.label ?? k).join(", ")}.`;

  // G6 — PS por tarifa
  const grafica6Series = useMemo((): GraficoSerie[] => {
    if (!psSeriesData) return [];
    const groupKey = GRAFICA6_MODO_CONFIG[g6Modo].groupKey;
    const group = psSeriesData[groupKey] as GraficoSeriesGroup;
    return group.series.filter((s) => {
      const key = s.serie_key as Grafica6TarifaKey;
      return g6ActiveTarifas.has(key);
    });
  }, [psSeriesData, g6Modo, g6ActiveTarifas]);

  const grafica6Subtitle = `${GRAFICA6_MODO_CONFIG[g6Modo].label} PS por tarifa — ${[...g6ActiveTarifas].map((k) => GRAFICA6_TARIFAS.find((t) => t.key === k)?.label ?? k).join(", ")}.`;

  // ── Helpers de último valor / tendencia ──────────────────────────────────────

  function getLastValueInfo(series: GraficoSerie[]): { label: string; value: string; trend: { value: number; label: string } | undefined } {
    const s = series[0];
    if (!s || s.points.length === 0) return { label: "—", value: "—", trend: undefined };
    const pts    = [...s.points].sort((a, b) => a.period_key.localeCompare(b.period_key));
    const last   = pts[pts.length - 1];
    const prev   = pts[pts.length - 2];
    const pct    = prev && prev.value !== 0 ? ((last.value - prev.value) / Math.abs(prev.value)) * 100 : undefined;
    return {
      label: `${s.serie_label} · ${last.period_label}`,
      value: formatYAxis(last.value),
      trend: pct !== undefined ? { value: pct, label: "%" } : undefined,
    };
  }

  const g1Info = useMemo(() => getLastValueInfo(grafica1Series), [grafica1Series]);
  const g2Info = useMemo(() => getLastValueInfo(grafica2Series), [grafica2Series]);
  const g3Info = useMemo(() => getLastValueInfo(grafica3Series), [grafica3Series]);
  const g4Info = useMemo(() => getLastValueInfo(grafica4Series), [grafica4Series]);
  const g5Info = useMemo(() => getLastValueInfo(grafica5Series), [grafica5Series]);
  const g6Info = useMemo(() => getLastValueInfo(grafica6Series), [grafica6Series]);

  // ── Config de cada gráfica para el grid y la expandida ───────────────────────

  const GRAFICAS_MODOS = useMemo(() => [
    { key: "cups" as Grafica5Modo, label: "CUPS" },
    { key: "energia" as Grafica5Modo, label: "Energía" },
    { key: "importe" as Grafica5Modo, label: "Importe" },
  ], []);

  const GRAFICA5_MODOS = GRAFICAS_MODOS;
  const GRAFICA6_MODOS: { key: Grafica6Modo; label: string }[] = [
    { key: "cups", label: "CUPS" }, { key: "energia", label: "Energía" }, { key: "importe", label: "Importe" },
  ];

  // ── Datos de la gráfica expandida actualmente ─────────────────────────────────

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

  const isLoading  = seriesLoading || psSeriesLoading;
  const mainError  = seriesError ?? psSeriesError ?? null;

  // ── Helper toggle expandedAnios
  const handleToggleExpandedAnio = useCallback((anio: number) => {
    setExpandedAnios((prev) =>
      prev.includes(anio) ? prev.filter((y) => y !== anio) : [...prev, anio]
    );
  }, []);

  const handleSelectAllExpandedAnios = useCallback(() => {
    setExpandedAnios((prev) =>
      prev.length === 0 ? [] : []
    );
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <section className="text-sm">
      <div className="flex flex-col gap-6">

        {/* ── Vista expandida ── */}
        {expandedGrafica !== null && expandedData && (
          <ExpandedChart
            title={`Gráfica ${expandedGrafica}. ${["Evolución de energía facturada / Adquisición","Evolución de pérdidas","Evolución de energías publicadas / E PF","Evolución de autoconsumo / energía generada","Evolución PS por tipo","Evolución PS por tarifa"][expandedGrafica - 1]}`}
            subtitle={expandedData.subtitle}
            series={expandedData.series}
            hiddenSeries={hiddenSeries}
            onToggleSerie={toggleSerie}
            selector={expandedData.selector}
            loading={isLoading}
            error={mainError}
            onClose={handleCloseExpanded}
            accentColor={GRAFICA_ACCENT[expandedGrafica]}
            badgeLabel={GRAFICA_BADGE[expandedGrafica]}
            allAnios={filtersData?.anios ?? []}
            expandedAnios={expandedAnios}
            onToggleExpandedAnio={handleToggleExpandedAnio}
            onSelectAllExpandedAnios={handleSelectAllExpandedAnios}
          />
        )}

        {/* ── Filtros + nota (solo visibles cuando NO hay gráfica expandida) ── */}
        {expandedGrafica === null && (
          <>
            {/* Barra de filtros */}
            <div
              className="rounded-xl border"
              style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
            >
              {/* Empresa */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.5)" }}>Empresa</span>
                {filtersLoading ? (
                  <div className="ui-select" style={{ minWidth: 160, color: "rgba(226,232,240,.4)" }}>Cargando...</div>
                ) : (
                  <FilterDropdown
                    title="Empresa"
                    options={empresaOptions}
                    selectedValues={selectedEmpresas}
                    onToggle={(v) => toggleSelection(v, setSelectedEmpresas)}
                    onSelectAll={() => selectAll(empresaOptions.map((e) => e.value), selectedEmpresas, setSelectedEmpresas)}
                    allLabel="Todas"
                  />
                )}
              </div>

              {/* Año — pills híbridas */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.5)" }}>Año</span>
                <YearPillsFilter
                  allAnios={filtersData?.anios ?? [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]}
                  selectedAnios={selectedAnios}
                  onToggle={(v) => toggleSelection(v, setSelectedAnios)}
                  onSelectAll={() => selectAll(filtersData?.anios ?? [], selectedAnios, setSelectedAnios)}
                />
              </div>

              {/* Mes — pills de 3 letras */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,.5)" }}>Mes</span>
                <MonthPillsFilter
                  selectedMeses={selectedMeses}
                  onToggle={(v) => toggleSelection(v, setSelectedMeses)}
                  onSelectAll={() => selectAll(Array.from({ length: 12 }, (_, i) => i + 1), selectedMeses, setSelectedMeses)}
                />
              </div>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                onClick={() => { void loadSeries(); void loadPsSeries(); }}
                disabled={isLoading}
                className="ui-btn ui-btn-primary"
                style={{ height: 28, fontSize: 11 }}
              >
                {isLoading ? "Cargando..." : "Aplicar"}
              </button>
            </div>

            {/* Nota informativa */}
            <div style={{ fontSize: 10, color: "rgba(96,165,250,.7)", background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.2)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#60a5fa", fontSize: 12 }}>i</span>
              Mostrando {selectedAnios.length > 0 ? selectedAnios.sort((a,b)=>b-a).join(", ") : "todos los años"} — pulsa "Todos" para ver el histórico completo · Haz clic en ⤢ para expandir cualquier gráfica con 4 años de datos
            </div>

            {/* Grid 3×2 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>

              {/* G1 */}
              <ChartCard
                badgeLabel="G1" accentColor={GRAFICA_ACCENT[1]}
                title="E facturada / Adquisición"
                subtitle={grafica1Subtitle}
                series={grafica1Series}
                hiddenSeries={hiddenSeries}
                onToggleSerie={toggleSerie}
                selector={<TwoFlagsSelector flags={g1Flags} setFlags={setG1Flags} labelA="E neta fact." labelB="Adquisición" accentColor={GRAFICA_ACCENT[1]} />}
                loading={seriesLoading}
                error={seriesError}
                onExpand={() => handleExpand(1)}
                lastValueLabel={g1Info.label}
                lastValue={g1Info.value}
                trend={g1Info.trend}
              />

              {/* G2 */}
              <ChartCard
                badgeLabel="G2" accentColor={GRAFICA_ACCENT[2]}
                title="Evolución de pérdidas"
                subtitle={grafica2Subtitle}
                series={grafica2Series}
                hiddenSeries={hiddenSeries}
                onToggleSerie={toggleSerie}
                selector={<Grafica2Selector active={g2Active} onChange={setG2Active} accentColor={GRAFICA_ACCENT[2]} />}
                loading={seriesLoading}
                error={seriesError}
                onExpand={() => handleExpand(2)}
                lastValueLabel={g2Info.label}
                lastValue={g2Info.value}
                trend={g2Info.trend}
              />

              {/* G3 */}
              <ChartCard
                badgeLabel="G3" accentColor={GRAFICA_ACCENT[3]}
                title="Energías publicadas / E PF"
                subtitle={grafica3Subtitle}
                series={grafica3Series}
                hiddenSeries={hiddenSeries}
                onToggleSerie={toggleSerie}
                selector={<TwoFlagsSelector flags={g3Flags} setFlags={setG3Flags} labelA="E neta publ." labelB="E PF" accentColor={GRAFICA_ACCENT[3]} />}
                loading={seriesLoading}
                error={seriesError}
                onExpand={() => handleExpand(3)}
                lastValueLabel={g3Info.label}
                lastValue={g3Info.value}
                trend={g3Info.trend}
              />

              {/* G4 */}
              <ChartCard
                badgeLabel="G4" accentColor={GRAFICA_ACCENT[4]}
                title="Autoconsumo / E generada"
                subtitle={grafica4Subtitle}
                series={grafica4Series}
                hiddenSeries={hiddenSeries}
                onToggleSerie={toggleSerie}
                selector={<TwoFlagsSelector flags={g4Flags} setFlags={setG4Flags} labelA="E autoconsumo" labelB="E generada" accentColor={GRAFICA_ACCENT[4]} />}
                loading={seriesLoading}
                error={seriesError}
                onExpand={() => handleExpand(4)}
                lastValueLabel={g4Info.label}
                lastValue={g4Info.value}
                trend={g4Info.trend}
              />

              {/* G5 */}
              <ChartCard
                badgeLabel="G5" accentColor={GRAFICA_ACCENT[5]}
                title="PS por tipo"
                subtitle={grafica5Subtitle}
                series={grafica5Series}
                hiddenSeries={hiddenSeries}
                onToggleSerie={toggleSerie}
                selector={
                  <TwoLevelSelector
                    modos={GRAFICA5_MODOS}
                    modoActivo={g5Modo}
                    onModo={setG5Modo}
                    items={GRAFICA5_TIPOS}
                    activoItems={g5ActiveTipos}
                    onToggleItem={(k) => {
                      setG5ActiveTipos((prev) => {
                        const n = new Set(prev);
                        if (n.has(k)) { if (n.size > 1) n.delete(k); }
                        else n.add(k);
                        return n;
                      });
                    }}
                    accentColor={GRAFICA_ACCENT[5]}
                  />
                }
                loading={psSeriesLoading}
                error={psSeriesError}
                onExpand={() => handleExpand(5)}
                lastValueLabel={g5Info.label}
                lastValue={g5Info.value}
                trend={g5Info.trend}
              />

              {/* G6 */}
              <ChartCard
                badgeLabel="G6" accentColor={GRAFICA_ACCENT[6]}
                title="PS por tarifa"
                subtitle={grafica6Subtitle}
                series={grafica6Series}
                hiddenSeries={hiddenSeries}
                onToggleSerie={toggleSerie}
                selector={
                  <TwoLevelSelector
                    modos={GRAFICA6_MODOS}
                    modoActivo={g6Modo}
                    onModo={setG6Modo}
                    items={GRAFICA6_TARIFAS}
                    activoItems={g6ActiveTarifas}
                    onToggleItem={(k) => {
                      setG6ActiveTarifas((prev) => {
                        const n = new Set(prev);
                        if (n.has(k)) { if (n.size > 1) n.delete(k); }
                        else n.add(k);
                        return n;
                      });
                    }}
                    accentColor={GRAFICA_ACCENT[6]}
                  />
                }
                loading={psSeriesLoading}
                error={psSeriesError}
                onExpand={() => handleExpand(6)}
                lastValueLabel={g6Info.label}
                lastValue={g6Info.value}
                trend={g6Info.trend}
              />

            </div>
          </>
        )}

      </div>
    </section>
  );
}