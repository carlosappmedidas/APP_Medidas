"use client";
import { useState } from "react";
import MultiSelectDropdown, { type MultiSelectOption } from "./MultiSelectDropdown";

type MedidasFiltersBarProps = {
  isSistema: boolean;
  token: string | null;
  loading: boolean;
  filtroTenant: string;
  setFiltroTenant: (value: string) => void;
  filtroEmpresaIds: string[];
  setFiltroEmpresaIds: (values: string[]) => void;
  filtroAnios: string[];
  setFiltroAnios: (values: string[]) => void;
  filtroMeses: string[];
  setFiltroMeses: (values: string[]) => void;
  filtroPeriodos?: string;
  setFiltroPeriodos?: (value: string) => void;
  ultimoPeriodo?: { anio: number; mes: number } | null;
  opcionesTenant: string[];
  empresaOptions: MultiSelectOption[];
  anioOptions: MultiSelectOption[];
  mesOptions: MultiSelectOption[];
  empresaPlaceholder?: string;
  anioPlaceholder?: string;
  mesPlaceholder?: string;
  compact?: boolean;
  filtrosActivosCount?: number;
  adjustButton?: React.ReactNode;
};

type QuickFilterId = "1m" | "2m" | "6m" | "1y" | "2y" | null;

const QUICK_FILTERS: { id: Exclude<QuickFilterId, null>; label: string }[] = [
  { id: "1m", label: "Último mes" },
  { id: "2m", label: "2 meses"   },
  { id: "6m", label: "6 meses"   },
  { id: "1y", label: "Último año" },
  { id: "2y", label: "2 años"    },
];

/**
 * Genera N periodos hacia atrás empezando desde `ultimo` (último mes con datos).
 * Si no hay ultimo, usa mes actual - 1 como fallback (facturación a mes vencido).
 * "6 meses" con ultimo={2026,2} → Feb 2026, Ene 2026, Dic 2025, Nov 2025, Oct 2025, Sep 2025
 */
function getPeriods(
  filterId: Exclude<QuickFilterId, null>,
  ultimo?: { anio: number; mes: number } | null,
): { anio: number; mes: number }[] {
  let startYear: number;
  let startMonth: number;

  if (ultimo) {
    startYear = ultimo.anio;
    startMonth = ultimo.mes;
  } else {
    // Fallback: mes actual - 1 (facturación a mes vencido)
    const now = new Date();
    startYear = now.getFullYear();
    startMonth = now.getMonth(); // getMonth() es 0-based, así que esto ya es mes_actual - 1
    if (startMonth <= 0) { startMonth = 12; startYear -= 1; }
  }

  const monthCounts: Record<string, number> = { "1m": 1, "2m": 2, "6m": 6, "1y": 12, "2y": 24 };
  const n = monthCounts[filterId] ?? 1;

  const periods: { anio: number; mes: number }[] = [];
  for (let i = 0; i < n; i++) {
    let m = startMonth - i;
    let y = startYear;
    while (m <= 0) { m += 12; y -= 1; }
    periods.push({ anio: y, mes: m });
  }
  return periods;
}

function buildPeriodosString(
  filterId: Exclude<QuickFilterId, null>,
  ultimo?: { anio: number; mes: number } | null,
): string {
  return getPeriods(filterId, ultimo).map((p) => `${p.anio}-${p.mes}`).join(",");
}

function getPeriodLabel(
  filterId: Exclude<QuickFilterId, null>,
  ultimo?: { anio: number; mes: number } | null,
): string {
  const periods = getPeriods(filterId, ultimo);
  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  if (periods.length === 0) return "";
  if (periods.length === 1) {
    const p = periods[0];
    return `${MESES[p.mes - 1]} ${p.anio}`;
  }
  const oldest = periods[periods.length - 1];
  const newest = periods[0];
  return `${MESES[oldest.mes - 1]} ${oldest.anio} – ${MESES[newest.mes - 1]} ${newest.anio}`;
}

export default function MedidasFiltersBar({
  isSistema,
  token,
  loading,
  filtroTenant,
  setFiltroTenant,
  filtroEmpresaIds,
  setFiltroEmpresaIds,
  filtroAnios,
  setFiltroAnios,
  filtroMeses,
  setFiltroMeses,
  filtroPeriodos,
  setFiltroPeriodos,
  ultimoPeriodo,
  opcionesTenant,
  empresaOptions,
  anioOptions,
  mesOptions,
  empresaPlaceholder = "Todas",
  anioPlaceholder = "Todos",
  mesPlaceholder = "Todos",
  compact = false,
  filtrosActivosCount,
  adjustButton,
}: MedidasFiltersBarProps) {
  const [quickOpen,    setQuickOpen]    = useState(false);
  const [activeQuick,  setActiveQuick]  = useState<QuickFilterId>(null);

  const selectStyle = compact
    ? { minHeight: 28, height: 28, paddingTop: 2, paddingBottom: 2, paddingLeft: 8, paddingRight: 8, lineHeight: 1.05 }
    : { minHeight: 30, paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8, lineHeight: 1.15 };

  function applyQuickFilter(id: Exclude<QuickFilterId, null>) {
    const periodosStr = buildPeriodosString(id, ultimoPeriodo);

    if (setFiltroPeriodos) {
      setFiltroAnios([]);
      setFiltroMeses([]);
      setFiltroPeriodos(periodosStr);
    } else {
      // Fallback: usar años/meses separados (comportamiento antiguo)
      const periods = getPeriods(id, ultimoPeriodo);
      const aniosSet = new Set(periods.map((p) => String(p.anio)));
      const mesesSet = new Set(periods.map((p) => String(p.mes)));
      const validAnios = Array.from(aniosSet).filter((a) => anioOptions.some((o) => o.value === a)).sort();
      const validMeses = Array.from(mesesSet).filter((m) => mesOptions.some((o) => o.value === m)).sort((a, b) => Number(a) - Number(b));
      setFiltroAnios(validAnios);
      setFiltroMeses(validMeses);
    }
    setActiveQuick(id);
  }

  function clearQuickFilter() {
    setFiltroAnios([]);
    setFiltroMeses([]);
    if (setFiltroPeriodos) setFiltroPeriodos("");
    setActiveQuick(null);
  }

  function handleAniosChange(values: string[]) {
    setFiltroAnios(values);
    if (setFiltroPeriodos) setFiltroPeriodos("");
    setActiveQuick(null);
  }

  function handleMesesChange(values: string[]) {
    setFiltroMeses(values);
    if (setFiltroPeriodos) setFiltroPeriodos("");
    setActiveQuick(null);
  }

  const pillBase: React.CSSProperties = {
    height: compact ? 28 : 30,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid var(--card-border)",
    background: "transparent",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
  };

  const pillActive: React.CSSProperties = {
    ...pillBase,
    background: "var(--nav-item-bg)",
    border: "1px solid var(--btn-secondary-bg)",
    color: "var(--text)",
    fontWeight: 500,
  };

  const pillClear: React.CSSProperties = {
    ...pillBase,
    borderStyle: "dashed",
    color: "var(--text-muted)",
    fontSize: 10,
  };

  const quickBtnStyle: React.CSSProperties = {
    ...pillBase,
    gap: 5,
    color: quickOpen || activeQuick ? "var(--text)" : "var(--text-muted)",
    background: quickOpen || activeQuick ? "var(--nav-item-bg)" : "transparent",
    border: `1px solid ${activeQuick ? "var(--btn-secondary-bg)" : "var(--card-border)"}`,
  };

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-end gap-2">

        {isSistema && (
          <div style={{ minWidth: 110 }}>
            <label className="ui-label">Cliente</label>
            <select
              className="ui-select w-full text-[10px]"
              style={selectStyle}
              value={filtroTenant}
              onChange={(e) => { setFiltroTenant(e.target.value); setFiltroEmpresaIds([]); }}
              disabled={!token || loading}
            >
              <option value="">Todos</option>
              {opcionesTenant.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ minWidth: 160 }}>
          <MultiSelectDropdown
            label="Empresa"
            options={empresaOptions}
            selectedValues={filtroEmpresaIds}
            onChange={setFiltroEmpresaIds}
            disabled={!token || loading}
            placeholder={empresaPlaceholder}
            compact={compact}
          />
        </div>

        <div style={{ minWidth: 95 }}>
          <MultiSelectDropdown
            label="Año"
            options={anioOptions}
            selectedValues={filtroAnios}
            onChange={handleAniosChange}
            disabled={!token || loading}
            placeholder={anioPlaceholder}
            compact={compact}
          />
        </div>

        <div style={{ minWidth: 95 }}>
          <MultiSelectDropdown
            label="Mes"
            options={mesOptions}
            selectedValues={filtroMeses}
            onChange={handleMesesChange}
            disabled={!token || loading}
            placeholder={mesPlaceholder}
            compact={compact}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="ui-label" style={{ opacity: 0 }}>·</label>
          <button
            type="button"
            style={quickBtnStyle}
            onClick={() => setQuickOpen((v) => !v)}
            disabled={!token || loading}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Acceso rápido
            <span style={{ fontSize: 9, marginLeft: 2 }}>
              {quickOpen ? "▴" : "▾"}
            </span>
          </button>
        </div>

        {adjustButton && (
          <div className="ml-auto flex items-end gap-1">
            {adjustButton}
          </div>
        )}
      </div>

      {quickOpen && (
        <div
          style={{
            marginTop: 6,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 4, flexShrink: 0 }}>
            Selección rápida:
          </span>
          {QUICK_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              style={activeQuick === id ? pillActive : pillBase}
              onClick={() => applyQuickFilter(id)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
          <div
            style={{
              width: 1,
              height: 16,
              background: "var(--card-border)",
              margin: "0 2px",
              flexShrink: 0,
            }}
          />
          <button
            type="button"
            style={pillClear}
            onClick={clearQuickFilter}
            disabled={loading}
          >
            ✕ Limpiar
          </button>
          {activeQuick && (
            <span
              style={{
                fontSize: 10,
                color: "var(--btn-secondary-bg)",
                marginLeft: 4,
                fontWeight: 500,
              }}
            >
              → {getPeriodLabel(activeQuick, ultimoPeriodo)}
            </span>
          )}
        </div>
      )}

      {filtrosActivosCount !== undefined && (
        <div className="mt-1 text-[10px] ui-muted">
          Filtros activos:{" "}
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {filtrosActivosCount}
          </span>
          {activeQuick && (
            <>
              {" · "}
              <span style={{ color: "var(--btn-secondary-bg)" }}>
                Filtro rápido: {QUICK_FILTERS.find((f) => f.id === activeQuick)?.label}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
