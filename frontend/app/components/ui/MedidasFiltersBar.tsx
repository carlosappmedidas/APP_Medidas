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
}: MedidasFiltersBarProps) {
  return (
    <div className={isSistema ? "mb-4 grid gap-2 md:grid-cols-4" : "mb-4 grid gap-2 md:grid-cols-3"}>
      {isSistema && (
        <div>
          <label className="ui-label">Cliente</label>
          <select
            className="ui-select text-[10px]"
            style={
              compact
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
                  }
            }
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

      <MultiSelectDropdown
        label="Empresa"
        options={empresaOptions}
        selectedValues={filtroEmpresaIds}
        onChange={setFiltroEmpresaIds}
        disabled={!token || loading}
        placeholder={empresaPlaceholder}
        compact={compact}
      />

      <MultiSelectDropdown
        label="Año"
        options={anioOptions}
        selectedValues={filtroAnios}
        onChange={setFiltroAnios}
        disabled={!token || loading}
        placeholder={anioPlaceholder}
        compact={compact}
      />

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
  );
}