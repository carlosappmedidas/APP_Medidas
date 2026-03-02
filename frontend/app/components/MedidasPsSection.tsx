// app/components/MedidasPsSection.tsx
"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { MedidaPS } from "../types";

type MedidasPsProps = {
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
  tenant_id?: number | null; // solo scope=all
};

type PsFiltersResponse = {
  empresas: EmpresaFilterOption[];
  anios: number[];
  meses: number[];
  tarifas: string[];
};

type PaginatedResponse = {
  items: MedidaPS[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

// Formateo numérico
const formatNumberEs = (
  v: number | null | undefined,
  decimals: number = 2
): string => {
  if (v == null || Number.isNaN(v)) return "-";

  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

export type ColumnDefPs = {
  id: string;
  label: string;
  align: "left" | "right";
  group: string;
  render: (m: MedidaPS | any) => any;
};

const ALL_COLUMNS_PS: ColumnDefPs[] = [
  {
    id: "empresa_id",
    label: "Empresa ID",
    align: "left",
    group: "Identificación",
    render: (m) => m.empresa_id,
  },
  {
    id: "empresa_codigo",
    label: "Código empresa",
    align: "left",
    group: "Identificación",
    render: (m) => m.empresa_codigo ?? "-",
  },
  {
    id: "anio",
    label: "Año",
    align: "left",
    group: "Identificación",
    render: (m) => m.anio,
  },
  {
    id: "mes",
    label: "Mes",
    align: "left",
    group: "Identificación",
    render: (m) => m.mes.toString().padStart(2, "0"),
  },

  {
    id: "energia_ps_tipo_1_kwh",
    label: "E PS tipo 1",
    align: "right",
    group: "Energía PS",
    render: (m) => formatNumberEs(m.energia_ps_tipo_1_kwh),
  },
  {
    id: "energia_ps_tipo_2_kwh",
    label: "E PS tipo 2",
    align: "right",
    group: "Energía PS",
    render: (m) => formatNumberEs(m.energia_ps_tipo_2_kwh),
  },
  {
    id: "energia_ps_tipo_3_kwh",
    label: "E PS tipo 3",
    align: "right",
    group: "Energía PS",
    render: (m) => formatNumberEs(m.energia_ps_tipo_3_kwh),
  },
  {
    id: "energia_ps_tipo_4_kwh",
    label: "E PS tipo 4",
    align: "right",
    group: "Energía PS",
    render: (m) => formatNumberEs(m.energia_ps_tipo_4_kwh),
  },
  {
    id: "energia_ps_tipo_5_kwh",
    label: "E PS tipo 5",
    align: "right",
    group: "Energía PS",
    render: (m) => formatNumberEs(m.energia_ps_tipo_5_kwh),
  },
  {
    id: "energia_ps_total_kwh",
    label: "E PS total",
    align: "right",
    group: "Energía PS",
    render: (m) => formatNumberEs(m.energia_ps_total_kwh),
  },

  {
    id: "cups_tipo_1",
    label: "CUPS tipo 1",
    align: "right",
    group: "CUPS PS",
    render: (m) => m.cups_tipo_1 ?? "-",
  },
  {
    id: "cups_tipo_2",
    label: "CUPS tipo 2",
    align: "right",
    group: "CUPS PS",
    render: (m) => m.cups_tipo_2 ?? "-",
  },
  {
    id: "cups_tipo_3",
    label: "CUPS tipo 3",
    align: "right",
    group: "CUPS PS",
    render: (m) => m.cups_tipo_3 ?? "-",
  },
  {
    id: "cups_tipo_4",
    label: "CUPS tipo 4",
    align: "right",
    group: "CUPS PS",
    render: (m) => m.cups_tipo_4 ?? "-",
  },
  {
    id: "cups_tipo_5",
    label: "CUPS tipo 5",
    align: "right",
    group: "CUPS PS",
    render: (m) => m.cups_tipo_5 ?? "-",
  },
  {
    id: "cups_total",
    label: "CUPS total",
    align: "right",
    group: "CUPS PS",
    render: (m) => m.cups_total ?? "-",
  },

  {
    id: "importe_tipo_1_eur",
    label: "Importe tipo 1",
    align: "right",
    group: "Importes PS",
    render: (m) => formatNumberEs(m.importe_tipo_1_eur),
  },
  {
    id: "importe_tipo_2_eur",
    label: "Importe tipo 2",
    align: "right",
    group: "Importes PS",
    render: (m) => formatNumberEs(m.importe_tipo_2_eur),
  },
  {
    id: "importe_tipo_3_eur",
    label: "Importe tipo 3",
    align: "right",
    group: "Importes PS",
    render: (m) => formatNumberEs(m.importe_tipo_3_eur),
  },
  {
    id: "importe_tipo_4_eur",
    label: "Importe tipo 4",
    align: "right",
    group: "Importes PS",
    render: (m) => formatNumberEs(m.importe_tipo_4_eur),
  },
  {
    id: "importe_tipo_5_eur",
    label: "Importe tipo 5",
    align: "right",
    group: "Importes PS",
    render: (m) => formatNumberEs(m.importe_tipo_5_eur),
  },
  {
    id: "importe_total_eur",
    label: "Importe total",
    align: "right",
    group: "Importes PS",
    render: (m) => formatNumberEs(m.importe_total_eur),
  },

  {
    id: "energia_tarifa_20td_kwh",
    label: "E 2.0TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_20td_kwh),
  },
  {
    id: "cups_tarifa_20td",
    label: "CUPS 2.0TD",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_20td ?? "-",
  },
  {
    id: "importe_tarifa_20td_eur",
    label: "Importe 2.0TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_20td_eur),
  },

  {
    id: "energia_tarifa_30td_kwh",
    label: "E 3.0TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_30td_kwh),
  },
  {
    id: "cups_tarifa_30td",
    label: "CUPS 3.0TD",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_30td ?? "-",
  },
  {
    id: "importe_tarifa_30td_eur",
    label: "Importe 3.0TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_30td_eur),
  },

  {
    id: "energia_tarifa_30tdve_kwh",
    label: "E 3.0TDVE",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_30tdve_kwh),
  },
  {
    id: "cups_tarifa_30tdve",
    label: "CUPS 3.0TDVE",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_30tdve ?? "-",
  },
  {
    id: "importe_tarifa_30tdve_eur",
    label: "Importe 3.0TDVE",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_30tdve_eur),
  },

  {
    id: "energia_tarifa_61td_kwh",
    label: "E 6.1TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_61td_kwh),
  },
  {
    id: "cups_tarifa_61td",
    label: "CUPS 6.1TD",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_61td ?? "-",
  },
  {
    id: "importe_tarifa_61td_eur",
    label: "Importe 6.1TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_61td_eur),
  },

  {
    id: "energia_tarifa_62td_kwh",
    label: "E 6.2TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_62td_kwh),
  },
  {
    id: "cups_tarifa_62td",
    label: "CUPS 6.2TD",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_62td ?? "-",
  },
  {
    id: "importe_tarifa_62td_eur",
    label: "Importe 6.2TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_62td_eur),
  },

  {
    id: "energia_tarifa_63td_kwh",
    label: "E 6.3TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_63td_kwh),
  },
  {
    id: "cups_tarifa_63td",
    label: "CUPS 6.3TD",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_63td ?? "-",
  },
  {
    id: "importe_tarifa_63td_eur",
    label: "Importe 6.3TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_63td_eur),
  },

  {
    id: "energia_tarifa_64td_kwh",
    label: "E 6.4TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.energia_tarifa_64td_kwh),
  },
  {
    id: "cups_tarifa_64td",
    label: "CUPS 6.4TD",
    align: "right",
    group: "Tarifas",
    render: (m) => m.cups_tarifa_64td ?? "-",
  },
  {
    id: "importe_tarifa_64td_eur",
    label: "Importe 6.4TD",
    align: "right",
    group: "Tarifas",
    render: (m) => formatNumberEs(m.importe_tarifa_64td_eur),
  },
];

export const COLUMNS_PS_META = ALL_COLUMNS_PS.map((c) => ({
  id: c.id,
  label: c.label,
  group: c.group,
}));

export default function MedidasPsSection({
  token,
  scope = "tenant",
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
}: MedidasPsProps) {
  const [data, setData] = useState<MedidaPS[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // filtros
  const [filtroEmpresaId, setFiltroEmpresaId] = useState<string>("");
  const [filtroAnio, setFiltroAnio] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");
  const [filtroTarifa, setFiltroTarifa] = useState<string>("");

  // opciones PRO (backend)
  const [opcionesEmpresa, setOpcionesEmpresa] = useState<EmpresaFilterOption[]>(
    []
  );
  const [opcionesAnio, setOpcionesAnio] = useState<number[]>([]);
  const [opcionesMes, setOpcionesMes] = useState<number[]>([]);
  const [opcionesTarifa, setOpcionesTarifa] = useState<string[]>([]);

  // paginación real
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(0);
  const [totalFilas, setTotalFilas] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // ajustes columnas
  const [showAdjust, setShowAdjust] = useState<boolean>(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const defaultOrder = useMemo(() => ALL_COLUMNS_PS.map((c) => c.id), []);

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
    (filtroEmpresaId ? 1 : 0) +
    (filtroAnio ? 1 : 0) +
    (filtroMes ? 1 : 0) +
    (filtroTarifa ? 1 : 0);

  const clearFilters = () => {
    setFiltroEmpresaId("");
    setFiltroAnio("");
    setFiltroMes("");
    setFiltroTarifa("");
    setPage(0);
  };

  const loadFilters = async () => {
    if (!token) return;

    try {
      const endpoint =
        scope === "all" ? "/medidas/ps/all/filters" : "/medidas/ps/filters";

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;

      const json = (await res.json()) as PsFiltersResponse;

      setOpcionesEmpresa(Array.isArray(json?.empresas) ? json.empresas : []);
      setOpcionesAnio(Array.isArray(json?.anios) ? json.anios : []);
      setOpcionesMes(Array.isArray(json?.meses) ? json.meses : []);
      setOpcionesTarifa(Array.isArray(json?.tarifas) ? json.tarifas : []);
    } catch (e) {
      console.error("Error cargando filtros PS:", e);
    }
  };

  const handleLoadMedidas = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const endpoint =
        scope === "all" ? "/medidas/ps/all/page" : "/medidas/ps/page";

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      if (filtroEmpresaId) params.set("empresa_id", filtroEmpresaId);
      if (filtroAnio) params.set("anio", filtroAnio);
      if (filtroMes) params.set("mes", filtroMes);
      if (filtroTarifa) params.set("tarifa", filtroTarifa);

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
      console.error("Error cargando medidas_ps paginadas:", err);
      setError("Error cargando medidas PS. Revisa la API y el token.");
      setData([]);
      setTotalFilas(0);
      setTotalPages(1);
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  };

  // boot: token/scope
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
      setOpcionesTarifa([]);

      setPage(0);
      setTotalFilas(0);
      setTotalPages(1);
      return;
    }

    const key = `${token}::${scope}`;
    if (bootKeyRef.current === key) return;
    bootKeyRef.current = key;

    setPage(0);
    void loadFilters().then(() => {
      void handleLoadMedidas();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope]);

  // filtros/pageSize -> reset page 0 + reload
  const filterKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) return;

    const key = `${scope}::${filtroEmpresaId}::${filtroAnio}::${filtroMes}::${filtroTarifa}::${pageSize}`;
    if (filterKeyRef.current === key) return;
    filterKeyRef.current = key;

    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void handleLoadMedidas();
  }, [token, scope, filtroEmpresaId, filtroAnio, filtroMes, filtroTarifa, pageSize]);

  // page -> reload
  const pageKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) return;

    const key = `${scope}::${page}::${pageSize}::${filtroEmpresaId}::${filtroAnio}::${filtroMes}::${filtroTarifa}`;
    if (pageKeyRef.current === key) return;
    pageKeyRef.current = key;

    void handleLoadMedidas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page]);

  const columnasPorId = useMemo(() => {
    const map = new Map<string, ColumnDefPs>();
    for (const c of ALL_COLUMNS_PS) map.set(c.id, c);
    return map;
  }, []);

  const columnasOrdenadas = useMemo(() => {
    const base: ColumnDefPs[] = [];

    for (const id of safeColumnOrder) {
      const col = columnasPorId.get(id);
      if (col) base.push(col);
    }

    const faltantes = ALL_COLUMNS_PS.filter(
      (c) => !safeColumnOrder.includes(c.id)
    );
    const full = [...base, ...faltantes];

    if (!safeHiddenColumns || safeHiddenColumns.length === 0) return full;
    return full.filter((c) => !safeHiddenColumns.includes(c.id));
  }, [safeColumnOrder, columnasPorId, safeHiddenColumns]);

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

    if (safeHiddenColumns.includes(id)) {
      setHiddenColumns?.(safeHiddenColumns.filter((c) => c !== id));
    } else {
      setHiddenColumns?.([...safeHiddenColumns, id]);
    }
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
    const meta = ALL_COLUMNS_PS.find((c) => c.id === id);
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

  const labelTarifa = (t: string) => {
    if (t === "20td") return "2.0TD";
    if (t === "30td") return "3.0TD";
    if (t === "30tdve") return "3.0TDVE";
    if (t === "61td") return "6.1TD";
    if (t === "62td") return "6.2TD";
    if (t === "63td") return "6.3TD";
    if (t === "64td") return "6.4TD";
    return t;
  };

  return (
    <section className="ui-card text-sm">
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">
            Medidas (PS){scope === "all" ? " · Sistema" : ""}
          </h4>
          <p className="ui-card-subtitle">Resumen mensual de PS por empresa, tarifa y tipo.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleLoadMedidas()}
            disabled={loading || !token}
            className="ui-btn ui-btn-primary"
            type="button"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

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

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div>
          <label className="ui-label">Empresa</label>
          <select
            className="ui-select"
            value={filtroEmpresaId}
            onChange={(e) => setFiltroEmpresaId(e.target.value)}
            disabled={!token || loading}
          >
            <option value="">Todas</option>
            {opcionesEmpresa.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {(e.codigo ?? `Empresa ${e.id}`) + ` (ID ${e.id})`}
                {scope === "all" && typeof e.tenant_id === "number"
                  ? ` · T${e.tenant_id}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ui-label">Año</label>
          <select
            className="ui-select"
            value={filtroAnio}
            onChange={(e) => setFiltroAnio(e.target.value)}
            disabled={!token || loading}
          >
            <option value="">Todos</option>
            {opcionesAnio.map((anio) => (
              <option key={anio} value={String(anio)}>
                {anio}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ui-label">Mes</label>
          <select
            className="ui-select"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            disabled={!token || loading}
          >
            <option value="">Todos</option>
            {opcionesMes.map((mes) => (
              <option key={mes} value={String(mes)}>
                {mes.toString().padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ui-label">Tarifa</label>
          <select
            className="ui-select"
            value={filtroTarifa}
            onChange={(e) => setFiltroTarifa(e.target.value)}
            disabled={!token || loading}
          >
            <option value="">Todas</option>
            {opcionesTarifa.map((t) => (
              <option key={t} value={t}>
                {labelTarifa(t)}
              </option>
            ))}
          </select>
        </div>
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
                <div className="flex-1 space-y-1">
                  {secondIds.map((id, idx) => renderAdjustItem(id, third + idx))}
                </div>
                <div className="flex-1 space-y-1">
                  {thirdIds.map((id, idx) => renderAdjustItem(id, 2 * third + idx))}
                </div>
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
                  No hay medidas PS que cumplan los filtros.
                </td>
              </tr>
            )}

            {!loading &&
              data.map((m) => (
                <tr key={`${m.empresa_id}-${m.anio}-${m.mes}`} className="ui-tr">
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
                  className="ui-select w-auto px-2 py-1 text-[11px]"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 10)}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
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
    </section>
  );
}