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
  opcionesTenant: string[];
  empresaOptions: MultiSelectOption[];
  anioOptions: MultiSelectOption[];
  mesOptions: MultiSelectOption[];
  empresaPlaceholder?: string;
  anioPlaceholder?: string;
  mesPlaceholder?: string;
  compact?: boolean;
  filtrosActivosCount?: number;
  /** Slot opcional: botón de ajuste de columnas en la misma línea que los filtros */
  adjustButton?: React.ReactNode;
};

// ── Tipos de filtro rápido ─────────────────────────────────────────────────
type QuickFilterId = "1m" | "2m" | "6m" | "1y" | "2y" | null;

const QUICK_FILTERS: { id: Exclude<QuickFilterId, null>; label: string }[] = [
  { id: "1m", label: "Último mes" },
  { id: "2m", label: "2 meses"   },
  { id: "6m", label: "6 meses"   },
  { id: "1y", label: "Último año" },
  { id: "2y", label: "2 años"    },
];

// Calcula los pares {anio, mes} que cubre un filtro rápido
function getAniosMeses(filterId: Exclude<QuickFilterId, null>): {
  anios: string[];
  meses: string[];
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const periods: { anio: number; mes: number }[] = [];

  // Facturación va a mes vencido: empieza siempre desde el mes ANTERIOR al actual
  // i=1 → mes anterior, i=2 → hace 2 meses, etc.
  const addPrevMonths = (n: number) => {
    for (let i = 1; i <= n; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      while (m <= 0) { m += 12; y -= 1; }
      periods.push({ anio: y, mes: m });
    }
  };

  if (filterId === "1m") addPrevMonths(1);
  if (filterId === "2m") addPrevMonths(2);
  if (filterId === "6m") addPrevMonths(6);
  if (filterId === "1y") addPrevMonths(12);
  if (filterId === "2y") addPrevMonths(24);

  const aniosSet  = new Set(periods.map((p) => String(p.anio)));
  const mesesSet  = new Set(periods.map((p) => String(p.mes)));

  return {
    anios: Array.from(aniosSet).sort(),
    meses: Array.from(mesesSet).sort((a, b) => Number(a) - Number(b)),
  };
}

// Genera una etiqueta legible del período aplicado
function getPeriodLabel(filterId: Exclude<QuickFilterId, null>): string {
  const { anios, meses } = getAniosMeses(filterId);
  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesLabels = meses.map((m) => MESES[Number(m) - 1] ?? m);
  if (anios.length === 1) {
    return `${mesLabels.join(", ")} ${anios[0]}`;
  }
  return `${mesLabels[mesLabels.length - 1]} ${anios[0]} – ${mesLabels[0]} ${anios[anios.length - 1]}`;
}

// ── Componente ─────────────────────────────────────────────────────────────
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
    const { anios, meses } = getAniosMeses(id);
    // Solo aplicar los valores que existen en las opciones disponibles
    const validAnios = anios.filter((a) => anioOptions.some((o) => o.value === a));
    const validMeses = meses.filter((m) => mesOptions.some((o) => o.value === m));
    setFiltroAnios(validAnios);
    setFiltroMeses(validMeses);
    setActiveQuick(id);
  }

  function clearQuickFilter() {
    setFiltroAnios([]);
    setFiltroMeses([]);
    setActiveQuick(null);
  }

  // Si el usuario cambia manualmente año/mes, desactivar el filtro rápido
  function handleAniosChange(values: string[]) {
    setFiltroAnios(values);
    setActiveQuick(null);
  }

  function handleMesesChange(values: string[]) {
    setFiltroMeses(values);
    setActiveQuick(null);
  }

  // Estilo de píldora quick filter
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

  // Botón "Acceso rápido ▾/▴"
  const quickBtnStyle: React.CSSProperties = {
    ...pillBase,
    gap: 5,
    color: quickOpen || activeQuick ? "var(--text)" : "var(--text-muted)",
    background: quickOpen || activeQuick ? "var(--nav-item-bg)" : "transparent",
    border: `1px solid ${activeQuick ? "var(--btn-secondary-bg)" : "var(--card-border)"}`,
  };

  return (
    <div className="mb-3">
      {/* Fila principal de filtros */}
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

        {/* Botón "Acceso rápido" */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="ui-label" style={{ opacity: 0 }}>·</label>
          <button
            type="button"
            style={quickBtnStyle}
            onClick={() => setQuickOpen((v) => !v)}
            disabled={!token || loading}
          >
            {/* icono reloj */}
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

        {/* Botones de ajuste + refresh al extremo derecho */}
        {adjustButton && (
          <div className="ml-auto flex items-end gap-1">
            {adjustButton}
          </div>
        )}
      </div>

      {/* Panel desplegable de filtros rápidos */}
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
          {/* Etiqueta del período activo */}
          {activeQuick && (
            <span
              style={{
                fontSize: 10,
                color: "var(--btn-secondary-bg)",
                marginLeft: 4,
                fontWeight: 500,
              }}
            >
              → {getPeriodLabel(activeQuick)}
            </span>
          )}
        </div>
      )}

      {/* Filtros activos — debajo, pequeño y discreto */}
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
