"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis,
} from "recharts";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = { token: string | null; currentUser?: User | null; };
type GraficoEmpresaOption = { id: number; nombre: string; };
type GraficoFiltersResponse = { empresas: GraficoEmpresaOption[]; anios: number[]; meses: number[]; };
type GraficoPoint = { period_key: string; period_label: string; value: number; };
type GraficoSerie = { serie_key: string; serie_label: string; points: GraficoPoint[]; };
type GraficoSeriesGroup = { series: GraficoSerie[]; };
type GraficosSeriesResponse = {
  filters: { empresa_ids: number[]; anios: number[]; meses: number[]; aggregation: string; };
  scope: { all_empresas_selected: boolean; aggregation: string; };
  energia_facturada: GraficoSeriesGroup;
  perdidas: GraficoSeriesGroup;
  perdidas_kwh: GraficoSeriesGroup;
  perdidas_ventanas: GraficoSeriesGroup;
  energias_publicadas: GraficoSeriesGroup;
  energias_pf: GraficoSeriesGroup;
  autoconsumo: GraficoSeriesGroup;
  energia_generada: GraficoSeriesGroup;
  adquisicion: GraficoSeriesGroup;
};
type GraficosPsSeriesResponse = {
  filters: { empresa_ids: number[]; anios: number[]; meses: number[]; aggregation: string; };
  scope: { all_empresas_selected: boolean; aggregation: string; };
  cups_por_tipo: GraficoSeriesGroup;
  energia_por_tipo: GraficoSeriesGroup;
  importe_por_tipo: GraficoSeriesGroup;
  energia_por_tarifa: GraficoSeriesGroup;
  cups_por_tarifa: GraficoSeriesGroup;
  importe_por_tarifa: GraficoSeriesGroup;
};
type ChartRow = { period_key: string; period_label: string; [key: string]: string | number; };
type CustomTooltipEntry = { value?: number | string; name?: number | string; dataKey?: number | string; };
type CustomTooltipProps = {
  active?: boolean; payload?: readonly CustomTooltipEntry[];
  label?: number | string; extraByLabel?: Record<string, { label: string; value: number }[]>;
};
type MultiCheckOption = { value: number; label: string; };
type ElementSize = { width: number; height: number; };
type FilterDropdownProps = {
  title: string; options: MultiCheckOption[]; selectedValues: number[];
  onToggle: (value: number) => void; onSelectAll: () => void; allLabel?: string;
};
type ChartCardProps = {
  title: string; subtitle: string; data: ChartRow[]; series: GraficoSerie[];
  companyLabel: string; yAxisFormatter?: (value: number) => string;
  headerExtra?: React.ReactNode;
  tooltipExtraByLabel?: Record<string, { label: string; value: number }[]>;
};

// ── Gráfica 2 ────────────────────────────────────────────────────────────
type Grafica2SerieKey = "pct" | "perd_m2" | "perd_m7" | "perd_m11" | "perd_art15";
const GRAFICA2_OPCIONES: { key: Grafica2SerieKey; label: string }[] = [
  { key: "pct",        label: "Pérdidas (%)"      },
  { key: "perd_m2",   label: "Pérdidas M2 (%)"   },
  { key: "perd_m7",   label: "Pérdidas M7 (%)"   },
  { key: "perd_m11",  label: "Pérdidas M11 (%)"  },
  { key: "perd_art15", label: "Pérdidas ART15 (%)" },
];

// ── Gráfica 5 — PS por tipo ───────────────────────────────────────────────
type Grafica5Modo = "cups" | "energia" | "importe";
type Grafica5TipoKey = "t1" | "t2" | "t3" | "t4" | "t5" | "total";
const GRAFICA5_TIPOS: { key: Grafica5TipoKey; label: string }[] = [
  { key: "t1",    label: "Tipo 1" },
  { key: "t2",    label: "Tipo 2" },
  { key: "t3",    label: "Tipo 3" },
  { key: "t4",    label: "Tipo 4" },
  { key: "t5",    label: "Tipo 5" },
  { key: "total", label: "Total"  },
];
const GRAFICA5_MODO_CONFIG: Record<Grafica5Modo, { prefix: string; modeLabel: string; yFormatter?: (v: number) => string }> = {
  cups:    { prefix: "cups_", modeLabel: "CUPS" },
  energia: { prefix: "en_",   modeLabel: "Energía (kWh)" },
  importe: { prefix: "im_",   modeLabel: "Importe (€)", yFormatter: (v) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(v)} €` },
};

// ── Gráfica 6 — PS por tarifa ─────────────────────────────────────────────
type Grafica6Modo = "cups" | "energia" | "importe";
type Grafica6TarifaKey = "20td" | "30td" | "30tdve" | "61td" | "total";
const GRAFICA6_TARIFAS: { key: Grafica6TarifaKey; label: string }[] = [
  { key: "20td",   label: "2.0TD"   },
  { key: "30td",   label: "3.0TD"   },
  { key: "30tdve", label: "3.0TDVE" },
  { key: "61td",   label: "6.1TD"   },
  { key: "total",  label: "Total"   },
];
const GRAFICA6_MODO_CONFIG: Record<Grafica6Modo, { prefix: string; modeLabel: string; yFormatter?: (v: number) => string }> = {
  cups:    { prefix: "ct_", modeLabel: "CUPS" },
  energia: { prefix: "et_", modeLabel: "Energía (kWh)" },
  importe: { prefix: "it_", modeLabel: "Importe (€)", yFormatter: (v) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(v)} €` },
};

const MESES_LABEL: Record<number, string> = {
  1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
};
const LINE_COLORS = [
  "#6D5EF8", "#22C55E", "#F59E0B", "#EF4444",
  "#06B6D4", "#A855F7", "#84CC16", "#F97316",
];

function formatNumberEs(value: number | string | null | undefined): string {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
  if (numericValue === null || Number.isNaN(numericValue)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(numericValue);
}

function buildChartRows(group: GraficoSeriesGroup | null): ChartRow[] {
  if (!group?.series?.length) return [];
  const map = new Map<string, ChartRow>();
  for (const serie of group.series) {
    for (const point of serie.points) {
      const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label };
      current[serie.serie_key] = point.value;
      map.set(point.period_key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
}

function buildChartRowsCombined(groups: (GraficoSeriesGroup | null)[]): ChartRow[] {
  const map = new Map<string, ChartRow>();
  for (const group of groups) {
    if (!group?.series?.length) continue;
    for (const serie of group.series) {
      for (const point of serie.points) {
        const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label };
        current[serie.serie_key] = point.value;
        map.set(point.period_key, current);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
}

function relabelSeries(series: GraficoSerie[], legendLabel: string): GraficoSerie[] {
  if (series.length !== 1) return series;
  return [{ ...series[0], serie_label: legendLabel }];
}

function buildTooltipExtraByLabel(group: GraficoSeriesGroup | null, labelOverride?: string): Record<string, { label: string; value: number }[]> {
  const result: Record<string, { label: string; value: number }[]> = {};
  if (!group?.series?.length) return result;
  for (const serie of group.series) {
    const displayLabel = labelOverride ?? serie.serie_label;
    for (const point of serie.points) {
      if (!result[point.period_label]) result[point.period_label] = [];
      result[point.period_label].push({ label: displayLabel, value: point.value });
    }
  }
  return result;
}

function CustomTooltip({ active, payload, label, extraByLabel }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const labelStr = String(label ?? "—");
  const extras = extraByLabel?.[labelStr] ?? [];
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text)" }}>
      <div className="mb-2 font-semibold">{labelStr}</div>
      <div className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <div key={`${String(entry.dataKey ?? "serie")}-${index}`} className="flex items-center justify-between gap-3">
            <span>{String(entry.name ?? entry.dataKey ?? "Serie")}</span>
            <span className="font-medium">
              {formatNumberEs(typeof entry.value === "number" || typeof entry.value === "string" ? entry.value : null)}
            </span>
          </div>
        ))}
        {extras.length > 0 && (
          <>
            <div className="my-1 border-t" style={{ borderColor: "var(--card-border)" }} />
            {extras.map((extra, i) => (
              <div key={`extra-${i}`} className="flex items-center justify-between gap-3 ui-muted">
                <span>{extra.label}</span>
                <span className="font-medium">{formatNumberEs(extra.value)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const element = ref.current;
    if (!mounted || !element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(0, Math.round(rect.width));
      const nextHeight = Math.max(0, Math.round(rect.height));
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };
    updateSize();
    const observer = new ResizeObserver(() => { updateSize(); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [mounted]);
  return { ref, mounted, width: size.width, height: size.height };
}

function FilterDropdown({ title, options, selectedValues, onToggle, onSelectAll, allLabel = "Todas" }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const allSelected = options.length > 0 && selectedValues.length === options.length;
  const summary = useMemo(() => {
    if (options.length === 0) return "Sin opciones";
    if (allSelected) return allLabel;
    if (selectedValues.length === 0) return "Ninguna";
    if (selectedValues.length === 1) {
      const selected = options.find((o) => o.value === selectedValues[0]);
      return selected?.label ?? "1 seleccionada";
    }
    return `${selectedValues.length} seleccionadas`;
  }, [allLabel, allSelected, options, selectedValues]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target;
      if (!(targetNode instanceof Node)) return;
      if (containerRef.current && !containerRef.current.contains(targetNode)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, []);
  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.04em]">{title}</div>
        <button type="button" onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs"
          style={{ borderColor: "var(--field-border)", background: "var(--field-bg)", color: "var(--field-text)" }}>
          <span className="truncate">{summary}</span>
          <span className="ml-3 shrink-0">{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border p-3 shadow-lg"
          style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={allSelected} onChange={onSelectAll} />
            <span>{allLabel}</span>
          </label>
          <div className="grid gap-1">
            {options.map((option) => (
              <label key={`${title}-${option.value}`} className="ui-muted flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={selectedValues.includes(option.value)} onChange={() => onToggle(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, data, series, companyLabel, yAxisFormatter, headerExtra, tooltipExtraByLabel }: ChartCardProps) {
  const { ref, mounted, width, height } = useElementSize<HTMLDivElement>();
  const canRenderChart = mounted && width > 0 && height > 0;
  return (
    <div className="min-w-0 rounded-xl border p-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="ui-muted mt-1 text-xs">{subtitle}</div>
        </div>
        {headerExtra && <div className="shrink-0">{headerExtra}</div>}
      </div>
      <div className="mb-4 text-center text-xs font-medium" style={{ color: "var(--text)" }}>{companyLabel}</div>
      <div ref={ref} className="h-[320px] min-w-0 w-full">
        {data.length === 0 ? (
          <div className="ui-muted flex h-full items-center justify-center text-sm">Sin datos para los filtros seleccionados.</div>
        ) : !canRenderChart ? (
          <div className="ui-muted flex h-full items-center justify-center text-sm">Preparando gráfica...</div>
        ) : (
          <LineChart width={width} height={height} data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="period_label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={yAxisFormatter} />
            <Tooltip content={(props) => (
              <CustomTooltip active={props.active}
                payload={props.payload as readonly CustomTooltipEntry[] | undefined}
                label={props.label as string | number | undefined}
                extraByLabel={tooltipExtraByLabel} />
            )} />
            <Legend />
            {series.map((serie, index) => (
              <Line key={serie.serie_key} type="monotone" dataKey={serie.serie_key} name={serie.serie_label}
                stroke={LINE_COLORS[index % LINE_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        )}
      </div>
    </div>
  );
}

// ─── Selector genérico de dos opciones toggleables ─────────────────────────
type TwoFlagsState = { a: boolean; b: boolean };
function TwoFlagsSelector({ labelA, labelB, flags, onChange }: {
  labelA: string; labelB: string; flags: TwoFlagsState; onChange: (flags: TwoFlagsState) => void;
}) {
  const toggle = (key: keyof TwoFlagsState) => {
    const next = { ...flags, [key]: !flags[key] };
    if (!next.a && !next.b) { next[key === "a" ? "b" : "a"] = true; }
    onChange(next);
  };
  return (
    <div className="flex rounded-lg border text-[11px] overflow-hidden" style={{ borderColor: "var(--field-border)" }}>
      <button type="button" onClick={() => toggle("a")} className="px-2 py-1 transition-colors"
        style={{ background: flags.a ? "var(--primary)" : "var(--field-bg)", color: flags.a ? "var(--primary-fg, #fff)" : "var(--field-text)" }}
      >{labelA}</button>
      <button type="button" onClick={() => toggle("b")} className="px-2 py-1 transition-colors"
        style={{ background: flags.b ? "var(--primary)" : "var(--field-bg)", color: flags.b ? "var(--primary-fg, #fff)" : "var(--field-text)" }}
      >{labelB}</button>
    </div>
  );
}

// ─── Selector multi para Gráfica 2 ─────────────────────────────────────────
function Grafica2Selector({ active, onChange }: {
  active: Set<Grafica2SerieKey>; onChange: (next: Set<Grafica2SerieKey>) => void;
}) {
  const toggle = (key: Grafica2SerieKey) => {
    const next = new Set(active);
    if (next.has(key)) { if (next.size === 1) return; next.delete(key); } else { next.add(key); }
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border p-1 text-[11px]"
      style={{ borderColor: "var(--field-border)", background: "var(--field-bg)" }}>
      {GRAFICA2_OPCIONES.map((opcion) => {
        const isActive = active.has(opcion.key);
        return (
          <button key={opcion.key} type="button" onClick={() => toggle(opcion.key)}
            className="rounded px-2 py-0.5 transition-colors"
            style={{ background: isActive ? "var(--primary)" : "transparent", color: isActive ? "var(--primary-fg, #fff)" : "var(--field-text)" }}>
            {opcion.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Selector de dos niveles genérico (modo + items) ───────────────────────
function TwoLevelSelector<M extends string, K extends string>({
  modos, activeItems, items, currentModo, onModoChange, onItemToggle,
}: {
  modos: { key: M; label: string }[];
  activeItems: Set<K>;
  items: { key: K; label: string }[];
  currentModo: M;
  onModoChange: (m: M) => void;
  onItemToggle: (k: K) => void;
}) {
  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex rounded-lg border text-[11px] overflow-hidden" style={{ borderColor: "var(--field-border)" }}>
        {modos.map((m) => (
          <button key={m.key} type="button" onClick={() => onModoChange(m.key)}
            className="px-2 py-1 transition-colors"
            style={{ background: currentModo === m.key ? "var(--primary)" : "var(--field-bg)", color: currentModo === m.key ? "var(--primary-fg, #fff)" : "var(--field-text)" }}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border p-1 text-[11px]"
        style={{ borderColor: "var(--field-border)", background: "var(--field-bg)" }}>
        {items.map((item) => {
          const isActive = activeItems.has(item.key);
          return (
            <button key={item.key} type="button" onClick={() => onItemToggle(item.key)}
              className="rounded px-2 py-0.5 transition-colors"
              style={{ background: isActive ? "var(--primary)" : "transparent", color: isActive ? "var(--primary-fg, #fff)" : "var(--field-text)" }}>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
// ───────────────────────────────────────────────────────────────────────────

const GRAFICA5_MODOS: { key: Grafica5Modo; label: string }[] = [
  { key: "cups",    label: "CUPS"    },
  { key: "energia", label: "Energía" },
  { key: "importe", label: "Importe" },
];
const GRAFICA6_MODOS: { key: Grafica6Modo; label: string }[] = [
  { key: "cups",    label: "CUPS"    },
  { key: "energia", label: "Energía" },
  { key: "importe", label: "Importe" },
];

export default function GraficosSection({ token, currentUser }: Props) {
  const [filtersData, setFiltersData] = useState<GraficoFiltersResponse | null>(null);
  const [seriesData, setSeriesData] = useState<GraficosSeriesResponse | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const [psSeriesData, setPsSeriesData] = useState<GraficosPsSeriesResponse | null>(null);
  const [psSeriesLoading, setPsSeriesLoading] = useState(false);
  const [psSeriesError, setPsSeriesError] = useState<string | null>(null);

  const [selectedEmpresas, setSelectedEmpresas] = useState<number[]>([]);
  const [selectedAnios, setSelectedAnios] = useState<number[]>([]);
  const [selectedMeses, setSelectedMeses] = useState<number[]>([]);

  const [grafica1Flags, setGrafica1Flags] = useState<TwoFlagsState>({ a: true, b: false });
  const [grafica2Active, setGrafica2Active] = useState<Set<Grafica2SerieKey>>(new Set(["pct"]));
  const [grafica3Flags, setGrafica3Flags] = useState<TwoFlagsState>({ a: true, b: false });
  const [grafica4Flags, setGrafica4Flags] = useState<TwoFlagsState>({ a: true, b: false });
  const [grafica5Modo, setGrafica5Modo] = useState<Grafica5Modo>("cups");
  const [grafica5Tipos, setGrafica5Tipos] = useState<Set<Grafica5TipoKey>>(new Set(["total"]));
  const [grafica6Modo, setGrafica6Modo] = useState<Grafica6Modo>("cups");
  const [grafica6Tarifas, setGrafica6Tarifas] = useState<Set<Grafica6TarifaKey>>(new Set(["total"]));

  useEffect(() => {
    const loadFilters = async () => {
      if (!token) { setFiltersData(null); return; }
      setFiltersLoading(true); setFiltersError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/medidas-graficos/filters`, { method: "GET", headers: getAuthHeaders(token) });
        if (!response.ok) { const text = await response.text(); throw new Error(text || "No se pudieron cargar los filtros."); }
        const json = (await response.json()) as GraficoFiltersResponse;
        setFiltersData(json);
        setSelectedEmpresas(json.empresas.map((item) => item.id));
        setSelectedAnios(json.anios);
        setSelectedMeses(json.meses);
      } catch (err) {
        setFiltersError(err instanceof Error ? err.message : "No se pudieron cargar los filtros.");
        setFiltersData(null);
      } finally { setFiltersLoading(false); }
    };
    void loadFilters();
  }, [token]);

  useEffect(() => {
    const loadSeries = async () => {
      if (!token) { setSeriesData(null); return; }
      if (!filtersData) return;
      setSeriesLoading(true); setSeriesError(null);
      try {
        const searchParams = new URLSearchParams();
        for (const empresaId of selectedEmpresas) searchParams.append("empresa_ids", String(empresaId));
        for (const anio of selectedAnios) searchParams.append("anios", String(anio));
        for (const mes of selectedMeses) searchParams.append("meses", String(mes));
        // ── FIX: sum cuando hay varias/todas empresas, avg cuando es una sola ──
        const allSelected =
          !filtersData.empresas.length ||
          selectedEmpresas.length === filtersData.empresas.length;
        searchParams.set("aggregation", allSelected || selectedEmpresas.length > 1 ? "sum" : "avg");
        // ─────────────────────────────────────────────────────────────────────
        const response = await fetch(`${API_BASE_URL}/medidas-graficos/series?${searchParams.toString()}`, { method: "GET", headers: getAuthHeaders(token) });
        if (!response.ok) { const text = await response.text(); throw new Error(text || "No se pudieron cargar las gráficas."); }
        const json = (await response.json()) as GraficosSeriesResponse;
        setSeriesData(json);
      } catch (err) {
        setSeriesError(err instanceof Error ? err.message : "No se pudieron cargar las gráficas.");
        setSeriesData(null);
      } finally { setSeriesLoading(false); }
    };
    void loadSeries();
  }, [token, filtersData, selectedEmpresas, selectedAnios, selectedMeses]);

  useEffect(() => {
    const loadPsSeries = async () => {
      if (!token) { setPsSeriesData(null); return; }
      if (!filtersData) return;
      setPsSeriesLoading(true); setPsSeriesError(null);
      try {
        const searchParams = new URLSearchParams();
        for (const empresaId of selectedEmpresas) searchParams.append("empresa_ids", String(empresaId));
        for (const anio of selectedAnios) searchParams.append("anios", String(anio));
        for (const mes of selectedMeses) searchParams.append("meses", String(mes));
        const response = await fetch(`${API_BASE_URL}/medidas-graficos-ps/series-cups?${searchParams.toString()}`, { method: "GET", headers: getAuthHeaders(token) });
        if (!response.ok) { const text = await response.text(); throw new Error(text || "No se pudieron cargar los datos PS."); }
        const json = (await response.json()) as GraficosPsSeriesResponse;
        setPsSeriesData(json);
      } catch (err) {
        setPsSeriesError(err instanceof Error ? err.message : "No se pudieron cargar los datos PS.");
        setPsSeriesData(null);
      } finally { setPsSeriesLoading(false); }
    };
    void loadPsSeries();
  }, [token, filtersData, selectedEmpresas, selectedAnios, selectedMeses]);

  const empresaOptions = useMemo<MultiCheckOption[]>(
    () => (filtersData?.empresas ?? []).map((item) => ({ value: item.id, label: item.nombre })), [filtersData]);
  const anioOptions = useMemo<MultiCheckOption[]>(
    () => (filtersData?.anios ?? []).map((item) => ({ value: item, label: String(item) })), [filtersData]);
  const mesOptions = useMemo<MultiCheckOption[]>(
    () => (filtersData?.meses ?? []).map((item) => ({ value: item, label: MESES_LABEL[item] ?? String(item) })), [filtersData]);

  const selectedEmpresaNames = useMemo(() => {
    if (!filtersData?.empresas?.length) return "Todas las empresas";
    if (selectedEmpresas.length === 0 || selectedEmpresas.length === filtersData.empresas.length) return "Todas las empresas";
    const names = filtersData.empresas.filter((e) => selectedEmpresas.includes(e.id)).map((e) => e.nombre);
    if (names.length === 0) return "Todas las empresas";
    return names.join(" · ");
  }, [filtersData, selectedEmpresas]);

  // ── Gráfica 1: E neta facturada / Adquisición ────────────────────────
  const grafica1Series = useMemo(() => {
    const result: GraficoSerie[] = [];
    if (grafica1Flags.a) {
      result.push(...relabelSeries(
        (seriesData?.energia_facturada.series ?? []).map((s) => ({ ...s, serie_key: `ef_${s.serie_key}` })),
        "E neta facturada"
      ));
    }
    if (grafica1Flags.b) {
      const adq = (seriesData?.adquisicion.series ?? []).find((s) => s.serie_key === "adquisicion");
      if (adq) result.push({ ...adq, serie_label: "Adquisición" });
    }
    return result;
  }, [seriesData, grafica1Flags]);

  const grafica1Rows = useMemo(() => {
    const map = new Map<string, ChartRow>();
    if (grafica1Flags.a) {
      for (const serie of seriesData?.energia_facturada.series ?? []) {
        for (const point of serie.points) {
          const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label };
          current[`ef_${serie.serie_key}`] = point.value;
          map.set(point.period_key, current);
        }
      }
    }
    if (grafica1Flags.b) {
      const adq = (seriesData?.adquisicion.series ?? []).find((s) => s.serie_key === "adquisicion");
      if (adq) {
        for (const point of adq.points) {
          const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label };
          current["adquisicion"] = point.value;
          map.set(point.period_key, current);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  }, [seriesData, grafica1Flags]);

  const grafica1Subtitle = useMemo(() => {
    if (grafica1Flags.a && grafica1Flags.b) return "Histórico de E neta facturada y Adquisición.";
    if (grafica1Flags.a) return "Histórico de E neta facturada.";
    return "Histórico de Adquisición (E PF Final + E generada - E frontera DD).";
  }, [grafica1Flags]);

  // ── Gráfica 2 ────────────────────────────────────────────────────────
  const grafica2Series = useMemo(() => {
    const result: GraficoSerie[] = [];
    if (grafica2Active.has("pct")) result.push(...relabelSeries((seriesData?.perdidas.series ?? []).map((s) => ({ ...s, serie_key: `pct_${s.serie_key}` })), "Pérdidas (%)"));
    for (const opcion of GRAFICA2_OPCIONES.filter((o) => o.key !== "pct")) {
      if (grafica2Active.has(opcion.key)) { const serie = (seriesData?.perdidas_ventanas.series ?? []).find((s) => s.serie_key === opcion.key); if (serie) result.push({ ...serie, serie_label: opcion.label }); }
    }
    return result;
  }, [seriesData, grafica2Active]);

  const grafica2Rows = useMemo(() => {
    const map = new Map<string, ChartRow>();
    if (grafica2Active.has("pct")) { for (const serie of seriesData?.perdidas.series ?? []) { for (const point of serie.points) { const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label }; current[`pct_${serie.serie_key}`] = point.value; map.set(point.period_key, current); } } }
    for (const opcion of GRAFICA2_OPCIONES.filter((o) => o.key !== "pct")) {
      if (grafica2Active.has(opcion.key)) { const serie = (seriesData?.perdidas_ventanas.series ?? []).find((s) => s.serie_key === opcion.key); if (serie) { for (const point of serie.points) { const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label }; current[opcion.key] = point.value; map.set(point.period_key, current); } } }
    }
    return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  }, [seriesData, grafica2Active]);

  const grafica2Subtitle = useMemo(() => {
    const labels = GRAFICA2_OPCIONES.filter((o) => grafica2Active.has(o.key)).map((o) => o.label);
    return `Histórico de ${labels.join(", ")}.`;
  }, [grafica2Active]);

  const perdidasKwhByLabel = useMemo(
    () => buildTooltipExtraByLabel(seriesData?.perdidas_kwh ?? null, "Pérdidas E facturada (kWh)"), [seriesData]);

  // ── Gráfica 3 ────────────────────────────────────────────────────────
  const energiasPfSinFinal = useMemo((): GraficoSeriesGroup => ({
    series: (seriesData?.energias_pf.series ?? []).filter((s) => s.serie_key !== "pf_final"),
  }), [seriesData]);

  const grafica3Series = useMemo(() => {
    const result: GraficoSerie[] = [];
    if (grafica3Flags.a) result.push(...(seriesData?.energias_publicadas.series ?? []));
    if (grafica3Flags.b) result.push(...energiasPfSinFinal.series);
    return result;
  }, [seriesData, grafica3Flags, energiasPfSinFinal]);

  const grafica3Rows = useMemo(() => {
    const groups: (GraficoSeriesGroup | null)[] = [];
    if (grafica3Flags.a) groups.push(seriesData?.energias_publicadas ?? null);
    if (grafica3Flags.b) groups.push(energiasPfSinFinal);
    return buildChartRowsCombined(groups);
  }, [seriesData, grafica3Flags, energiasPfSinFinal]);

  const grafica3Subtitle = useMemo(() => {
    if (grafica3Flags.a && grafica3Flags.b) return "Histórico de E neta publicada (M2, M7, M11, ART15) y E PF (M2, M7, M11, ART15).";
    if (grafica3Flags.a) return "Histórico de E neta publicada M2, M7, M11 y ART15.";
    return "Histórico de E PF M2, M7, M11 y ART15.";
  }, [grafica3Flags]);

  // ── Gráfica 4 ────────────────────────────────────────────────────────
  const grafica4Series = useMemo(() => {
    const result: GraficoSerie[] = [];
    if (grafica4Flags.a) result.push(...(seriesData?.autoconsumo.series ?? []).map((s) => ({ ...s, serie_key: `autoc_${s.serie_key}`, serie_label: seriesData?.autoconsumo.series.length === 1 ? "E autoconsumo" : s.serie_label })));
    if (grafica4Flags.b) result.push(...(seriesData?.energia_generada.series ?? []).map((s) => ({ ...s, serie_key: `gen_${s.serie_key}`, serie_label: seriesData?.energia_generada.series.length === 1 ? "E generada" : s.serie_label })));
    return result;
  }, [seriesData, grafica4Flags]);

  const grafica4Rows = useMemo(() => {
    const map = new Map<string, ChartRow>();
    if (grafica4Flags.a) { for (const serie of seriesData?.autoconsumo.series ?? []) { for (const point of serie.points) { const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label }; current[`autoc_${serie.serie_key}`] = point.value; map.set(point.period_key, current); } } }
    if (grafica4Flags.b) { for (const serie of seriesData?.energia_generada.series ?? []) { for (const point of serie.points) { const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label }; current[`gen_${serie.serie_key}`] = point.value; map.set(point.period_key, current); } } }
    return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  }, [seriesData, grafica4Flags]);

  const grafica4Subtitle = useMemo(() => {
    if (grafica4Flags.a && grafica4Flags.b) return "Histórico de E autoconsumo y E generada.";
    if (grafica4Flags.a) return "Histórico de E autoconsumo.";
    return "Histórico de E generada.";
  }, [grafica4Flags]);

  // ── Gráfica 5: PS por tipo ────────────────────────────────────────────
  const grafica5Group = useMemo((): GraficoSeriesGroup | null => {
    if (!psSeriesData) return null;
    if (grafica5Modo === "cups") return psSeriesData.cups_por_tipo;
    if (grafica5Modo === "energia") return psSeriesData.energia_por_tipo;
    return psSeriesData.importe_por_tipo;
  }, [psSeriesData, grafica5Modo]);

  const grafica5Config = GRAFICA5_MODO_CONFIG[grafica5Modo];

  const grafica5Series = useMemo((): GraficoSerie[] => {
    if (!grafica5Group) return [];
    return GRAFICA5_TIPOS.filter((t) => grafica5Tipos.has(t.key)).map((t) => {
      const serieKey = `${grafica5Config.prefix}${t.key}`;
      const serie = grafica5Group.series.find((s) => s.serie_key === serieKey);
      if (!serie) return null;
      return { ...serie, serie_label: `${grafica5Config.modeLabel} ${t.label}` };
    }).filter((s): s is GraficoSerie => s !== null);
  }, [grafica5Group, grafica5Tipos, grafica5Config]);

  const grafica5Rows = useMemo((): ChartRow[] => {
    if (!grafica5Group) return [];
    const map = new Map<string, ChartRow>();
    for (const tipo of GRAFICA5_TIPOS) {
      if (!grafica5Tipos.has(tipo.key)) continue;
      const serieKey = `${grafica5Config.prefix}${tipo.key}`;
      const serie = grafica5Group.series.find((s) => s.serie_key === serieKey);
      if (!serie) continue;
      for (const point of serie.points) {
        const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label };
        current[serieKey] = point.value;
        map.set(point.period_key, current);
      }
    }
    return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  }, [grafica5Group, grafica5Tipos, grafica5Config]);

  const grafica5Subtitle = useMemo(() => {
    const tipoLabels = GRAFICA5_TIPOS.filter((t) => grafica5Tipos.has(t.key)).map((t) => t.label);
    return `${grafica5Config.modeLabel} — ${tipoLabels.join(", ")}.`;
  }, [grafica5Tipos, grafica5Config]);

  const handleGrafica5TipoToggle = (key: Grafica5TipoKey) => {
    setGrafica5Tipos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size === 1) return prev; next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  // ── Gráfica 6: PS por tarifa ──────────────────────────────────────────
  const grafica6Group = useMemo((): GraficoSeriesGroup | null => {
    if (!psSeriesData) return null;
    if (grafica6Modo === "cups") return psSeriesData.cups_por_tarifa;
    if (grafica6Modo === "energia") return psSeriesData.energia_por_tarifa;
    return psSeriesData.importe_por_tarifa;
  }, [psSeriesData, grafica6Modo]);

  const grafica6Config = GRAFICA6_MODO_CONFIG[grafica6Modo];

  const grafica6Series = useMemo((): GraficoSerie[] => {
    if (!grafica6Group) return [];
    return GRAFICA6_TARIFAS.filter((t) => grafica6Tarifas.has(t.key)).map((t) => {
      const serieKey = `${grafica6Config.prefix}${t.key}`;
      const serie = grafica6Group.series.find((s) => s.serie_key === serieKey);
      if (!serie) return null;
      return { ...serie, serie_label: `${grafica6Config.modeLabel} ${t.label}` };
    }).filter((s): s is GraficoSerie => s !== null);
  }, [grafica6Group, grafica6Tarifas, grafica6Config]);

  const grafica6Rows = useMemo((): ChartRow[] => {
    if (!grafica6Group) return [];
    const map = new Map<string, ChartRow>();
    for (const tarifa of GRAFICA6_TARIFAS) {
      if (!grafica6Tarifas.has(tarifa.key)) continue;
      const serieKey = `${grafica6Config.prefix}${tarifa.key}`;
      const serie = grafica6Group.series.find((s) => s.serie_key === serieKey);
      if (!serie) continue;
      for (const point of serie.points) {
        const current = map.get(point.period_key) ?? { period_key: point.period_key, period_label: point.period_label };
        current[serieKey] = point.value;
        map.set(point.period_key, current);
      }
    }
    return Array.from(map.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  }, [grafica6Group, grafica6Tarifas, grafica6Config]);

  const grafica6Subtitle = useMemo(() => {
    const tarifaLabels = GRAFICA6_TARIFAS.filter((t) => grafica6Tarifas.has(t.key)).map((t) => t.label);
    return `${grafica6Config.modeLabel} — ${tarifaLabels.join(", ")}.`;
  }, [grafica6Tarifas, grafica6Config]);

  const handleGrafica6TarifaToggle = (key: Grafica6TarifaKey) => {
    setGrafica6Tarifas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size === 1) return prev; next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  const toggleSelection = (value: number, setter: React.Dispatch<React.SetStateAction<number[]>>) => {
    setter((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]);
  };
  const selectAll = (values: number[], selected: number[], setter: React.Dispatch<React.SetStateAction<number[]>>) => {
    if (selected.length === values.length) { setter([]); return; }
    setter(values);
  };

  return (
    <section className="ui-card min-w-0 text-sm">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h3 className="ui-card-title text-base md:text-lg">GRÁFICOS</h3>
          <p className="ui-card-subtitle mt-1">Histórico visual de medidas por empresa, año y mes.</p>
          <div className="ui-muted mt-1 text-[11px]">
            Usuario: {currentUser?.email ?? "—"} · Tenant: {currentUser?.tenant_id ?? "—"}
          </div>
        </div>

        {filtersError && <div className="ui-alert ui-alert--danger">Error cargando filtros: {filtersError}</div>}
        {seriesError && <div className="ui-alert ui-alert--danger">Error cargando gráficas: {seriesError}</div>}
        {psSeriesError && <div className="ui-alert ui-alert--danger">Error cargando datos PS: {psSeriesError}</div>}

        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <FilterDropdown title="Empresa" options={empresaOptions} selectedValues={selectedEmpresas}
            onToggle={(value) => toggleSelection(value, setSelectedEmpresas)}
            onSelectAll={() => selectAll(empresaOptions.map((item) => item.value), selectedEmpresas, setSelectedEmpresas)} />
          <FilterDropdown title="Año" options={anioOptions} selectedValues={selectedAnios} allLabel="Todos"
            onToggle={(value) => toggleSelection(value, setSelectedAnios)}
            onSelectAll={() => selectAll(anioOptions.map((item) => item.value), selectedAnios, setSelectedAnios)} />
          <FilterDropdown title="Mes" options={mesOptions} selectedValues={selectedMeses} allLabel="Todos"
            onToggle={(value) => toggleSelection(value, setSelectedMeses)}
            onSelectAll={() => selectAll(mesOptions.map((item) => item.value), selectedMeses, setSelectedMeses)} />
        </div>

        {(filtersLoading || seriesLoading || psSeriesLoading) && (
          <div className="ui-alert ui-alert--info">Cargando gráficos...</div>
        )}

        <div className="grid min-w-0 gap-4">
          <ChartCard
            title="Gráfica 1. Evolución de energía facturada / Adquisición"
            subtitle={grafica1Subtitle} companyLabel={selectedEmpresaNames}
            data={grafica1Rows} series={grafica1Series}
            headerExtra={<TwoFlagsSelector labelA="E neta fact." labelB="Adquisición" flags={grafica1Flags} onChange={setGrafica1Flags} />}
          />
          <ChartCard
            title="Gráfica 2. Evolución de pérdidas"
            subtitle={grafica2Subtitle} companyLabel={selectedEmpresaNames}
            data={grafica2Rows} series={grafica2Series}
            yAxisFormatter={(value) => `${formatNumberEs(value)}%`}
            tooltipExtraByLabel={perdidasKwhByLabel}
            headerExtra={<Grafica2Selector active={grafica2Active} onChange={setGrafica2Active} />}
          />
          <ChartCard
            title="Gráfica 3. Evolución de energías publicadas / E PF"
            subtitle={grafica3Subtitle} companyLabel={selectedEmpresaNames}
            data={grafica3Rows} series={grafica3Series}
            headerExtra={<TwoFlagsSelector labelA="E neta publ." labelB="E PF" flags={grafica3Flags} onChange={setGrafica3Flags} />}
          />
          <ChartCard
            title="Gráfica 4. Evolución de autoconsumo / energía generada"
            subtitle={grafica4Subtitle} companyLabel={selectedEmpresaNames}
            data={grafica4Rows} series={grafica4Series}
            headerExtra={<TwoFlagsSelector labelA="E autoconsumo" labelB="E generada" flags={grafica4Flags} onChange={setGrafica4Flags} />}
          />
          <ChartCard
            title="Gráfica 5. Evolución PS por tipo"
            subtitle={grafica5Subtitle} companyLabel={selectedEmpresaNames}
            data={grafica5Rows} series={grafica5Series}
            yAxisFormatter={grafica5Config.yFormatter}
            headerExtra={
              <TwoLevelSelector
                modos={GRAFICA5_MODOS} currentModo={grafica5Modo}
                items={GRAFICA5_TIPOS} activeItems={grafica5Tipos}
                onModoChange={(m) => { setGrafica5Modo(m); setGrafica5Tipos(new Set(["total"])); }}
                onItemToggle={handleGrafica5TipoToggle}
              />
            }
          />
          <ChartCard
            title="Gráfica 6. Evolución PS por tarifa"
            subtitle={grafica6Subtitle} companyLabel={selectedEmpresaNames}
            data={grafica6Rows} series={grafica6Series}
            yAxisFormatter={grafica6Config.yFormatter}
            headerExtra={
              <TwoLevelSelector
                modos={GRAFICA6_MODOS} currentModo={grafica6Modo}
                items={GRAFICA6_TARIFAS} activeItems={grafica6Tarifas}
                onModoChange={(m) => { setGrafica6Modo(m); setGrafica6Tarifas(new Set(["total"])); }}
                onItemToggle={handleGrafica6TarifaToggle}
              />
            }
          />
        </div>
      </div>
    </section>
  );
}