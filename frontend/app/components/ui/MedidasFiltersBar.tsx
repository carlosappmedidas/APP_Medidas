"use client";

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

  /** Slot opcional: botón de ajuste de columnas en la misma línea que los filtros */
  adjustButton?: React.ReactNode;
};

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
  adjustButton,
}: MedidasFiltersBarProps) {
  const selectStyle = compact
    ? {
        minHeight: 28,
        height: 28,
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 8,
        paddingRight: 8,
        lineHeight: 1.05,
      }
    : {
        minHeight: 30,
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 8,
        paddingRight: 8,
        lineHeight: 1.15,
      };

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      {isSistema && (
        <div style={{ minWidth: 110 }}>
          <label className="ui-label">Cliente</label>
          <select
            className="ui-select w-full text-[10px]"
            style={selectStyle}
            value={filtroTenant}
            onChange={(e) => {
              setFiltroTenant(e.target.value);
              setFiltroEmpresaIds([]);
            }}
            disabled={!token || loading}
          >
            <option value="">Todos</option>
            {opcionesTenant.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
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

      <div style={{ minWidth: 90 }}>
        <MultiSelectDropdown
          label="Año"
          options={anioOptions}
          selectedValues={filtroAnios}
          onChange={setFiltroAnios}
          disabled={!token || loading}
          placeholder={anioPlaceholder}
          compact={compact}
        />
      </div>

      <div style={{ minWidth: 105 }}>
        <MultiSelectDropdown
          label="Mes"
          options={mesOptions}
          selectedValues={filtroMeses}
          onChange={setFiltroMeses}
          disabled={!token || loading}
          placeholder={mesPlaceholder}
          compact={compact}
        />
      </div>

      {/* Botón ajuste de columnas — empuja al extremo derecho de la misma línea */}
      {adjustButton && (
        <div className="ml-auto flex items-end">
          {adjustButton}
        </div>
      )}
    </div>
  );
}