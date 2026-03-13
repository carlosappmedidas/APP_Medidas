"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { MedidaGeneral } from "../types";

type MedidasProps = {
  token: string | null;
  scope?: "tenant" | "all";
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;
  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;
};

type EmpresaFilterOption = {
  id: number;
  codigo?: string | null;
  nombre?: string | null;
  tenant_id?: number | null;
};

type GeneralFiltersResponse = {
  empresas: EmpresaFilterOption[];
  anios: number[];
  meses: number[];
};

type PaginatedResponse = {
  items: MedidaGeneral[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const formatNumberEs = (v: number | null | undefined, decimals: number = 2): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

const formatPercentEs = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return `${formatNumberEs(v, 2)} %`;
};

export type ColumnDefGeneral = {
  id: string;
  label: string;
  align: "left" | "right";
  group: string;
  render: (m: MedidaGeneral | any) => any;
};

const ALL_COLUMNS_GENERAL: ColumnDefGeneral[] = [
  { id: "empresa_id", label: "Empresa ID", align: "left", group: "Identificación", render: (m) => m.empresa_id },
  { id: "empresa_codigo", label: "Código empresa", align: "left", group: "Identificación", render: (m) => (m as any).empresa_codigo ?? "-" },
  { id: "punto_id", label: "Punto", align: "left", group: "Identificación", render: (m) => m.punto_id },
  { id: "anio", label: "Año", align: "left", group: "Identificación", render: (m) => m.anio },
  { id: "mes", label: "Mes", align: "left", group: "Identificación", render: (m) => m.mes.toString().padStart(2, "0") },

  { id: "energia_bruta_facturada", label: "E bruta facturada", align: "right", group: "General", render: (m) => formatNumberEs(m.energia_bruta_facturada) },
  { id: "energia_autoconsumo_kwh", label: "E autoconsumo", align: "right", group: "General", render: (m) => formatNumberEs(m.energia_autoconsumo_kwh) },
  { id: "energia_neta_facturada_kwh", label: "E neta facturada", align: "right", group: "General", render: (m) => formatNumberEs(m.energia_neta_facturada_kwh) },
  { id: "energia_generada_kwh", label: "E generada", align: "right", group: "General", render: (m) => formatNumberEs(m.energia_generada_kwh) },
  { id: "energia_frontera_dd_kwh", label: "E frontera DD", align: "right", group: "General", render: (m) => formatNumberEs(m.energia_frontera_dd_kwh) },
  { id: "energia_pf_final_kwh", label: "E PF final", align: "right", group: "General", render: (m) => formatNumberEs(m.energia_pf_final_kwh) },
  { id: "perdidas_e_facturada_kwh", label: "Pérdidas E facturada (kWh)", align: "right", group: "General", render: (m) => formatNumberEs(m.perdidas_e_facturada_kwh) },
  { id: "perdidas_e_facturada_pct", label: "Pérdidas E facturada (%)", align: "right", group: "General", render: (m) => formatPercentEs(m.perdidas_e_facturada_pct) },

  { id: "energia_publicada_m2_kwh", label: "E publ M2", align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_publicada_m2_kwh) },
  { id: "energia_autoconsumo_m2_kwh", label: "E autoc M2", align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_autoconsumo_m2_kwh) },
  { id: "energia_pf_m2_kwh", label: "E PF M2", align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_pf_m2_kwh) },
  { id: "energia_frontera_dd_m2_kwh", label: "E front DD M2", align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_frontera_dd_m2_kwh) },
  { id: "energia_generada_m2_kwh", label: "E gen M2", align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_generada_m2_kwh) },
  { id: "energia_neta_facturada_m2_kwh", label: "E neta M2", align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_neta_facturada_m2_kwh) },
  { id: "perdidas_e_facturada_m2_kwh", label: "Pérdidas M2 (kWh)", align: "right", group: "M2", render: (m) => formatNumberEs(m.perdidas_e_facturada_m2_kwh) },
  { id: "perdidas_e_facturada_m2_pct", label: "Pérdidas M2 (%)", align: "right", group: "M2", render: (m) => formatPercentEs(m.perdidas_e_facturada_m2_pct) },

  { id: "energia_publicada_m7_kwh", label: "E publ M7", align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_publicada_m7_kwh) },
  { id: "energia_autoconsumo_m7_kwh", label: "E autoc M7", align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_autoconsumo_m7_kwh) },
  { id: "energia_pf_m7_kwh", label: "E PF M7", align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_pf_m7_kwh) },
  { id: "energia_frontera_dd_m7_kwh", label: "E front DD M7", align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_frontera_dd_m7_kwh) },
  { id: "energia_generada_m7_kwh", label: "E gen M7", align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_generada_m7_kwh) },
  { id: "energia_neta_facturada_m7_kwh", label: "E neta M7", align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_neta_facturada_m7_kwh) },
  { id: "perdidas_e_facturada_m7_kwh", label: "Pérdidas M7 (kWh)", align: "right", group: "M7", render: (m) => formatNumberEs(m.perdidas_e_facturada_m7_kwh) },
  { id: "perdidas_e_facturada_m7_pct", label: "Pérdidas M7 (%)", align: "right", group: "M7", render: (m) => formatPercentEs(m.perdidas_e_facturada_m7_pct) },

  { id: "energia_publicada_m11_kwh", label: "E publ M11", align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_publicada_m11_kwh) },
  { id: "energia_autoconsumo_m11_kwh", label: "E autoc M11", align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_autoconsumo_m11_kwh) },
  { id: "energia_pf_m11_kwh", label: "E PF M11", align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_pf_m11_kwh) },
  { id: "energia_frontera_dd_m11_kwh", label: "E front DD M11", align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_frontera_dd_m11_kwh) },
  { id: "energia_generada_m11_kwh", label: "E gen M11", align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_generada_m11_kwh) },
  { id: "energia_neta_facturada_m11_kwh", label: "E neta M11", align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_neta_facturada_m11_kwh) },
  { id: "perdidas_e_facturada_m11_kwh", label: "Pérdidas M11 (kWh)", align: "right", group: "M11", render: (m) => formatNumberEs(m.perdidas_e_facturada_m11_kwh) },
  { id: "perdidas_e_facturada_m11_pct", label: "Pérdidas M11 (%)", align: "right", group: "M11", render: (m) => formatPercentEs(m.perdidas_e_facturada_m11_pct) },

  { id: "energia_publicada_art15_kwh", label: "E publ ART15", align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_publicada_art15_kwh) },
  { id: "energia_autoconsumo_art15_kwh", label: "E autoc ART15", align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_autoconsumo_art15_kwh) },
  { id: "energia_pf_art15_kwh", label: "E PF ART15", align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_pf_art15_kwh) },
  { id: "energia_frontera_dd_art15_kwh", label: "E front DD ART15", align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_frontera_dd_art15_kwh) },
  { id: "energia_generada_art15_kwh", label: "E gen ART15", align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_generada_art15_kwh) },
  { id: "energia_neta_facturada_art15_kwh", label: "E neta ART15", align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_neta_facturada_art15_kwh) },
  { id: "perdidas_e_facturada_art15_kwh", label: "Pérdidas ART15 (kWh)", align: "right", group: "ART15", render: (m) => formatNumberEs(m.perdidas_e_facturada_art15_kwh) },
  { id: "perdidas_e_facturada_art15_pct", label: "Pérdidas ART15 (%)", align: "right", group: "ART15", render: (m) => formatPercentEs(m.perdidas_e_facturada_art15_pct) },
];

export const COLUMNS_GENERAL_META = ALL_COLUMNS_GENERAL.map((c) => ({
  id: c.id,
  label: c.label,
  group: c.group,
}));

function ConfirmDeleteModalInline({
  open,
  title,
  subtitle,
  confirmText = "Borrar",
  cancelText = "Cancelar",
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={() => !busy && onClose()}
      />
      <div className="relative w-full max-w-lg ui-card ui-card--border">
        <div className="mb-2">
          <div className="ui-card-title">{title}</div>
          {subtitle ? <div className="ui-card-subtitle">{subtitle}</div> : null}
        </div>

        {error ? <div className="ui-alert ui-alert--danger mb-3">{error}</div> : null}

        <div className="flex items-center justify-end gap-2">
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose} disabled={!!busy}>
            {cancelText}
          </button>
          <button type="button" className="ui-btn ui-btn-danger" onClick={onConfirm} disabled={!!busy}>
            {busy ? "Borrando..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

type MultiSelectOption = {
  value: string;
  label: string;
};

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  disabled = false,
  placeholder = "Todas",
}: {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = useMemo(() => {
    const selectedSet = new Set(selectedValues);
    return options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);
  }, [options, selectedValues]);

  const buttonText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length <= 2) return selectedLabels.join(", ");
    return `${selectedValues.length} seleccionados`;
  }, [placeholder, selectedLabels, selectedValues.length]);

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const allSelected = options.length > 0 && selectedValues.length === options.length;

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map((o) => o.value));
  };

  return (
    <div className="relative" ref={rootRef}>
      <label className="ui-label">{label}</label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="ui-select flex w-full items-center justify-between text-left text-[10px]"
        style={{
          minHeight: 30,
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 8,
          paddingRight: 8,
          lineHeight: 1.15,
        }}
      >
        <span className="truncate">{buttonText}</span>
        <span className="ml-2 shrink-0 ui-muted text-[10px]">{open ? "▴" : "▾"}</span>
      </button>

      {open && !disabled && (
        <div
          className="absolute z-30 mt-1.5 w-full rounded-xl border p-2 shadow-lg"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="mb-2 border-b pb-2" style={{ borderColor: "var(--card-border)" }}>
            <label className="flex cursor-pointer items-center gap-2 text-[10px]">
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={allSelected}
                onChange={toggleAll}
              />
              <span>Seleccionar todo</span>
            </label>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {options.length === 0 ? (
              <div className="px-2 py-2 text-[10px] ui-muted">Sin opciones</div>
            ) : (
              options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[10px] hover:bg-[var(--field-bg-soft)]"
                >
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={selectedValues.includes(opt.value)}
                    onChange={() => toggleValue(opt.value)}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>

          <div
            className="mt-2 flex items-center justify-end gap-2 border-t pt-2"
            style={{ borderColor: "var(--card-border)" }}
          >
            <button
              type="button"
              className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-xs"
              onClick={() => setOpen(false)}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MedidasGeneralSection({
  token,
  scope = "tenant",
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
}: MedidasProps) {
  const isSistema = scope === "all";

  const [data, setData] = useState<MedidaGeneral[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [filtroTenant, setFiltroTenant] = useState<string>("");
  const [filtroEmpresaIds, setFiltroEmpresaIds] = useState<string[]>([]);
  const [filtroAnios, setFiltroAnios] = useState<string[]>([]);
  const [filtroMeses, setFiltroMeses] = useState<string[]>([]);

  const [opcionesEmpresa, setOpcionesEmpresa] = useState<EmpresaFilterOption[]>([]);
  const [opcionesAnio, setOpcionesAnio] = useState<number[]>([]);
  const [opcionesMes, setOpcionesMes] = useState<number[]>([]);

  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(0);
  const [totalFilas, setTotalFilas] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [showAdjust, setShowAdjust] = useState<boolean>(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const defaultOrder = useMemo(() => ALL_COLUMNS_GENERAL.map((c) => c.id), []);

  const systemTenantColumn: ColumnDefGeneral = useMemo(
    () => ({
      id: "tenant_id",
      label: "Cliente",
      align: "left",
      group: "Identificación",
      render: (m) => (m as any).tenant_id ?? "-",
    }),
    []
  );

  const baseColumns = useMemo(() => {
    return isSistema ? [systemTenantColumn, ...ALL_COLUMNS_GENERAL] : ALL_COLUMNS_GENERAL;
  }, [isSistema, systemTenantColumn]);

  const safeColumnOrder = useMemo(() => {
    if (Array.isArray(columnOrder) && columnOrder.length > 0) return columnOrder;
    return defaultOrder;
  }, [columnOrder, defaultOrder]);

  const safeHiddenColumns = useMemo(() => {
    if (Array.isArray(hiddenColumns)) return hiddenColumns;
    return [];
  }, [hiddenColumns]);

  const canEditAdjustments = !!setColumnOrder && !!setHiddenColumns;

  const orderForAdjustments = useMemo(() => {
    const missing = defaultOrder.filter((id) => !safeColumnOrder.includes(id));
    return [...safeColumnOrder, ...missing];
  }, [safeColumnOrder, defaultOrder]);

  const filtrosActivosCount =
    (isSistema && filtroTenant ? 1 : 0) +
    (filtroEmpresaIds.length > 0 ? 1 : 0) +
    (filtroAnios.length > 0 ? 1 : 0) +
    (filtroMeses.length > 0 ? 1 : 0);

  const canDeleteByFilters =
    isSistema &&
    !!filtroTenant &&
    filtroEmpresaIds.length > 0 &&
    filtroAnios.length > 0 &&
    filtroMeses.length > 0;

  const totalDeleteOps = useMemo(() => {
    if (!canDeleteByFilters) return 0;
    return filtroEmpresaIds.length * filtroAnios.length * filtroMeses.length;
  }, [canDeleteByFilters, filtroEmpresaIds, filtroAnios, filtroMeses]);

  const clearFilters = () => {
    setFiltroTenant("");
    setFiltroEmpresaIds([]);
    setFiltroAnios([]);
    setFiltroMeses([]);
    setPage(0);
  };

  const loadFilters = async () => {
    if (!token) return;

    try {
      const endpoint = isSistema ? "/medidas/general/all/filters" : "/medidas/general/filters";

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;

      const json = (await res.json()) as GeneralFiltersResponse;
      setOpcionesEmpresa(Array.isArray(json?.empresas) ? json.empresas : []);
      setOpcionesAnio(Array.isArray(json?.anios) ? json.anios : []);
      setOpcionesMes(Array.isArray(json?.meses) ? json.meses : []);
    } catch (e) {
      console.error("Error cargando filtros general:", e);
    }
  };

  const handleLoadMedidas = async (nextPage?: number) => {
    if (!token) return;

    const effectivePage = typeof nextPage === "number" ? nextPage : page;

    setLoading(true);
    setError(null);

    try {
      const endpoint = isSistema ? "/medidas/general/all/page" : "/medidas/general/page";

      const params = new URLSearchParams();
      params.set("page", String(effectivePage));
      params.set("page_size", String(pageSize));

      if (isSistema && filtroTenant) params.set("tenant_id", filtroTenant);
      if (filtroEmpresaIds.length > 0) params.set("empresa_ids", filtroEmpresaIds.join(","));
      if (filtroAnios.length > 0) params.set("anios", filtroAnios.join(","));
      if (filtroMeses.length > 0) params.set("meses", filtroMeses.join(","));

      const res = await fetch(`${API_BASE_URL}${endpoint}?${params.toString()}`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const json = (await res.json()) as PaginatedResponse;

      setData(Array.isArray(json?.items) ? json.items : []);
      setTotalFilas(typeof json?.total === "number" ? json.total : 0);
      setTotalPages(typeof json?.total_pages === "number" ? json.total_pages : 1);

      setHasLoadedOnce(true);
    } catch (err) {
      console.error("Error cargando medidas_general paginadas:", err);
      setError("Error cargando medidas. Revisa la API y el token.");
      setData([]);
      setTotalFilas(0);
      setTotalPages(1);
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  };

  const bootKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) {
      bootKeyRef.current = "";
      setHasLoadedOnce(false);
      setError(null);

      setData([]);
      setOpcionesEmpresa([]);
      setOpcionesAnio([]);
      setOpcionesMes([]);

      setFiltroTenant("");
      setFiltroEmpresaIds([]);
      setFiltroAnios([]);
      setFiltroMeses([]);

      setPage(0);
      setTotalFilas(0);
      setTotalPages(1);
      return;
    }

    const key = `${token}::${scope}`;
    if (bootKeyRef.current === key) return;
    bootKeyRef.current = key;

    setPage(0);
    void loadFilters().then(() => void handleLoadMedidas(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope]);

  const filterKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) return;

    const key = `${scope}::${filtroTenant}::${filtroEmpresaIds.join(",")}::${filtroAnios.join(",")}::${filtroMeses.join(",")}::${pageSize}`;
    if (filterKeyRef.current === key) return;
    filterKeyRef.current = key;

    setPage(0);
    void handleLoadMedidas(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope, filtroTenant, filtroEmpresaIds, filtroAnios, filtroMeses, pageSize]);

  const pageKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) return;

    const key = `${scope}::${page}`;
    if (pageKeyRef.current === key) return;
    pageKeyRef.current = key;

    void handleLoadMedidas(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page]);

  const opcionesTenant = useMemo(() => {
    if (!isSistema) return [];
    const tenants = new Set<number>();
    for (const e of opcionesEmpresa) {
      if (typeof e?.tenant_id === "number") tenants.add(e.tenant_id);
    }
    return Array.from(tenants).sort((a, b) => a - b).map(String);
  }, [isSistema, opcionesEmpresa]);

  const opcionesEmpresaFiltradas = useMemo(() => {
    if (!isSistema) return opcionesEmpresa;
    if (!filtroTenant) return opcionesEmpresa;
    const t = Number.parseInt(filtroTenant, 10);
    if (Number.isNaN(t)) return opcionesEmpresa;
    return opcionesEmpresa.filter((e) => e.tenant_id === t);
  }, [isSistema, opcionesEmpresa, filtroTenant]);

  const empresaOptions = useMemo<MultiSelectOption[]>(() => {
    const source = isSistema ? opcionesEmpresaFiltradas : opcionesEmpresa;
    return source.map((e) => ({
      value: String(e.id),
      label:
        `${e.nombre ?? e.codigo ?? `Empresa ${e.id}`}` +
        (isSistema && typeof e.tenant_id === "number" ? ` · T${e.tenant_id}` : ""),
    }));
  }, [isSistema, opcionesEmpresa, opcionesEmpresaFiltradas]);

  const anioOptions = useMemo<MultiSelectOption[]>(
    () => opcionesAnio.map((anio) => ({ value: String(anio), label: String(anio) })),
    [opcionesAnio]
  );

  const mesOptions = useMemo<MultiSelectOption[]>(
    () =>
      opcionesMes.map((mes) => ({
        value: String(mes),
        label: mes.toString().padStart(2, "0"),
      })),
    [opcionesMes]
  );

  const columnasPorId = useMemo(() => {
    const map = new Map<string, ColumnDefGeneral>();
    for (const c of baseColumns) map.set(c.id, c);
    return map;
  }, [baseColumns]);

  const columnasOrdenadas = useMemo(() => {
    const base: ColumnDefGeneral[] = [];

    if (isSistema) {
      const tcol = columnasPorId.get("tenant_id");
      if (tcol) base.push(tcol);
    }

    for (const id of safeColumnOrder) {
      const col = columnasPorId.get(id);
      if (col && col.id !== "tenant_id") base.push(col);
    }

    const faltantes = ALL_COLUMNS_GENERAL.filter((c) => !safeColumnOrder.includes(c.id));
    const full = [...base, ...faltantes.filter((c) => !base.some((b) => b.id === c.id))];

    if (!safeHiddenColumns || safeHiddenColumns.length === 0) return full;
    return full.filter((c) => !safeHiddenColumns.includes(c.id));
  }, [isSistema, safeColumnOrder, columnasPorId, safeHiddenColumns]);

  const totalColumnas = columnasOrdenadas.length || 1;

  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const startIndex = totalFilas === 0 ? 0 : currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFilas);

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const handleDrop = (index: number) => {
    if (!canEditAdjustments) return;
    if (dragIndex === null || dragIndex === index) return;

    const copy = [...orderForAdjustments];
    const [item] = copy.splice(dragIndex, 1);
    copy.splice(index, 0, item);

    setColumnOrder?.(copy);
    setDragIndex(null);
  };

  const toggleVisible = (id: string) => {
    if (!canEditAdjustments) return;

    if (safeHiddenColumns.includes(id)) setHiddenColumns?.(safeHiddenColumns.filter((c) => c !== id));
    else setHiddenColumns?.([...safeHiddenColumns, id]);
  };

  const resetOrder = () => {
    if (!canEditAdjustments) return;
    setColumnOrder?.(defaultOrder);
    setHiddenColumns?.([]);
  };

  const hideAllColumns = () => {
    if (!canEditAdjustments) return;
    setHiddenColumns?.(defaultOrder);
  };

  const third = Math.ceil(orderForAdjustments.length / 3) || 1;
  const firstIds = orderForAdjustments.slice(0, third);
  const secondIds = orderForAdjustments.slice(third, 2 * third);
  const thirdIds = orderForAdjustments.slice(2 * third);

  const renderAdjustItem = (id: string, index: number) => {
    const meta = ALL_COLUMNS_GENERAL.find((c) => c.id === id);
    const label = meta?.label ?? id;
    const group = meta?.group ?? "-";
    const isChecked = !safeHiddenColumns.includes(id);

    return (
      <div
        key={id}
        draggable={canEditAdjustments}
        onDragStart={() => canEditAdjustments && handleDragStart(index)}
        onDrop={() => canEditAdjustments && handleDrop(index)}
        className={[
          "flex items-center justify-between rounded-lg px-2 py-1.5",
          "border border-[var(--field-border)] bg-[var(--field-bg-soft)]",
          canEditAdjustments ? "cursor-move hover:opacity-90" : "opacity-80",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={isChecked}
            onChange={() => toggleVisible(id)}
            onClick={(e) => e.stopPropagation()}
            disabled={!canEditAdjustments}
          />
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--field-border)] bg-[var(--field-bg)] text-[9px]">
            {index + 1}
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium">{label}</span>
            <span className="text-[9px] ui-muted">{group}</span>
          </div>
        </div>
        <span className="text-[13px] ui-muted">☰</span>
      </div>
    );
  };

  const openDelete = () => {
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!token || !isSistema) return;
    if (!canDeleteByFilters) return;
    if (!filtroTenant) return;

    setDeleteBusy(true);
    setDeleteError(null);

    try {
      const tasks: Array<{ tenantId: string; empresaId: string; anio: string; mes: string }> = [];

      for (const empresaId of filtroEmpresaIds) {
        for (const anio of filtroAnios) {
          for (const mes of filtroMeses) {
            tasks.push({
              tenantId: filtroTenant,
              empresaId,
              anio,
              mes,
            });
          }
        }
      }

      for (const task of tasks) {
        const params = new URLSearchParams();
        params.set("tenant_id", task.tenantId);
        params.set("empresa_id", task.empresaId);
        params.set("anio", task.anio);
        params.set("mes", task.mes);

        const res = await fetch(`${API_BASE_URL}/ingestion/files?${params.toString()}`, {
          method: "DELETE",
          headers: getAuthHeaders(token),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Error ${res.status}`);
        }
      }

      setDeleteOpen(false);
      await loadFilters();
      setPage(0);
      await handleLoadMedidas(0);
    } catch (e) {
      console.error("Error borrando ingestion desde General Sistema:", e);
      setDeleteError(
        "No se pudo completar el borrado por ingestion. Revisa filtros, endpoint y permisos."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section className="ui-card text-sm">
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">Medidas (General){isSistema ? " · Sistema" : ""}</h4>
          <p className="ui-card-subtitle">Resumen mensual de energía por empresa.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void handleLoadMedidas(page)}
            disabled={loading || !token}
            className="ui-btn ui-btn-primary"
            type="button"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          {isSistema && (
            <button
              onClick={openDelete}
              disabled={loading || !token || !canDeleteByFilters}
              className="ui-btn ui-btn-danger"
              type="button"
              title={
                canDeleteByFilters
                  ? "Borrar por ingestion usando tenant + empresa + año + mes"
                  : "Selecciona tenant, empresa, año y mes para borrar"
              }
            >
              Borrar…
              {totalDeleteOps > 0 ? (
                <span className="ui-badge ui-badge--neutral" style={{ marginLeft: 6 }}>
                  {totalDeleteOps}
                </span>
              ) : null}
            </button>
          )}

          {filtrosActivosCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              disabled={loading}
              className="ui-btn ui-btn-outline"
              title="Limpiar filtros"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </header>

      {error && <div className="ui-alert ui-alert--danger mb-4">{error}</div>}

      <div className="mb-3 flex items-center justify-between gap-3 text-[11px]">
        <div className="ui-muted">
          Filtros activos:{" "}
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {filtrosActivosCount}
          </span>
        </div>

        {hasLoadedOnce && (
          <div className="ui-muted">
            Total filas:{" "}
            <span className="font-medium" style={{ color: "var(--text)" }}>
              {totalFilas}
            </span>
          </div>
        )}
      </div>

      {isSistema && (
        <div className="mb-3 ui-alert ui-alert--warning">
          En Sistema, el borrado se hace siempre por <strong>ingestion</strong> usando
          <strong> tenant + empresa + año + mes</strong>. Así evitamos borrar datos de otro tenant por error.
        </div>
      )}

      <div className={isSistema ? "mb-4 grid gap-2 md:grid-cols-4" : "mb-4 grid gap-2 md:grid-cols-3"}>
        {isSistema && (
          <div>
            <label className="ui-label">Cliente</label>
            <select
              className="ui-select text-[10px]"
              style={{
                minHeight: 30,
                paddingTop: 4,
                paddingBottom: 4,
                paddingLeft: 8,
                paddingRight: 8,
                lineHeight: 1.15,
              }}
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
          placeholder="Todas"
        />

        <MultiSelectDropdown
          label="Año"
          options={anioOptions}
          selectedValues={filtroAnios}
          onChange={setFiltroAnios}
          disabled={!token || loading}
          placeholder="Todos"
        />

        <MultiSelectDropdown
          label="Mes"
          options={mesOptions}
          selectedValues={filtroMeses}
          onChange={setFiltroMeses}
          disabled={!token || loading}
          placeholder="Todos"
        />
      </div>

      {canEditAdjustments && (
        <div className="mb-4 rounded-xl border border-[var(--card-border)] bg-[var(--field-bg-soft)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h5 className="text-xs font-semibold">Ajustes de columnas</h5>
              <p className="mt-1 text-[10px] ui-muted">
                Marca las columnas que quieres ver y arrástralas para cambiar el orden.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={hideAllColumns} className="ui-btn ui-btn-outline ui-btn-xs">
                Quitar todo
              </button>
              <button type="button" onClick={resetOrder} className="ui-btn ui-btn-outline ui-btn-xs">
                Reset
              </button>
              <button
                type="button"
                onClick={() => setShowAdjust((v) => !v)}
                className="ui-btn ui-btn-outline ui-btn-xs"
              >
                {showAdjust ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {showAdjust && (
            <div className="border-t border-[var(--card-border)] px-4 py-3 text-[11px]" onDragOver={handleDragOver}>
              <div className="mb-2 text-[10px] ui-muted">☰ = arrastrar · ✓ = mostrar</div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1">{firstIds.map((id, idx) => renderAdjustItem(id, idx))}</div>
                <div className="flex-1 space-y-1">{secondIds.map((id, idx) => renderAdjustItem(id, third + idx))}</div>
                <div className="flex-1 space-y-1">{thirdIds.map((id, idx) => renderAdjustItem(id, 2 * third + idx))}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              {columnasOrdenadas.map((col) => (
                <th
                  key={col.id}
                  className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="ui-tr">
                  {Array.from({ length: totalColumnas }).map((__, j) => (
                    <td key={`sk-${i}-${j}`} className="ui-td">
                      <span
                        className="inline-block h-3 w-full rounded-md"
                        style={{
                          background: "var(--field-bg-soft)",
                          border: "1px solid var(--field-border)",
                          opacity: 0.6,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && hasLoadedOnce && totalFilas === 0 && (
              <tr className="ui-tr">
                <td colSpan={totalColumnas} className="ui-td text-center ui-muted">
                  No hay medidas que cumplan los filtros.
                </td>
              </tr>
            )}

            {!loading &&
              data.map((m: any) => (
                <tr key={`${m.empresa_id}-${m.punto_id}-${m.anio}-${m.mes}-${m.tenant_id ?? "x"}`} className="ui-tr">
                  {columnasOrdenadas.map((col) => (
                    <td
                      key={col.id}
                      className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")}
                    >
                      {col.render(m)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>

        {!loading && hasLoadedOnce && totalFilas > 0 && (
          <div className="flex flex-col gap-2 border-t border-[var(--card-border)] px-4 py-3 text-[11px] ui-muted md:flex-row md:items-center md:justify-between">
            <div>
              Mostrando{" "}
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {startIndex + 1}
              </span>{" "}
              -{" "}
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {endIndex}
              </span>{" "}
              de{" "}
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {totalFilas}
              </span>{" "}
              filas
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span>Filas por página:</span>
                <select
                  className="ui-select w-auto text-[10px]"
                  style={{
                    minHeight: 28,
                    paddingTop: 3,
                    paddingBottom: 3,
                    paddingLeft: 8,
                    paddingRight: 8,
                    lineHeight: 1.1,
                  }}
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 20)}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="ui-btn ui-btn-outline ui-btn-xs"
                >
                  ← Anterior
                </button>

                <span>
                  Página{" "}
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {currentPage + 1}
                  </span>{" "}
                  /{" "}
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {totalPages}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="ui-btn ui-btn-outline ui-btn-xs"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDeleteModalInline
        open={deleteOpen}
        title="Borrar por ingestion · General · Sistema"
        subtitle={
          canDeleteByFilters
            ? `Se van a lanzar ${totalDeleteOps} operación(es) de borrado por ingestion usando tenant + empresa + año + mes. Esto elimina también contribuciones, detalles y medidas derivadas asociadas.`
            : "Selecciona tenant, empresa, año y mes para habilitar el borrado."
        }
        busy={deleteBusy}
        error={deleteError}
        confirmText="Borrar definitivamente"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
}