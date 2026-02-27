// app/components/MedidasGeneralSection.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { MedidaGeneral } from "../types";

type MedidasProps = {
  token: string | null;

  // ✅ mismo componente para Sistema
  // tenant -> /medidas/general/
  // all    -> /medidas/general/all   (solo superuser)
  scope?: "tenant" | "all";

  // ✅ ajustes columnas (pueden venir undefined si lo usas “solo lectura” en Sistema)
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;
  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;
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

// TODAS las columnas de la tabla
const ALL_COLUMNS_GENERAL: ColumnDefGeneral[] = [
  // Identificación
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
    render: (m) => (m as any).empresa_codigo ?? "-",
  },
  {
    id: "punto_id",
    label: "Punto",
    align: "left",
    group: "Identificación",
    render: (m) => m.punto_id,
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

  // Bloque general
  {
    id: "energia_bruta_facturada",
    label: "E bruta facturada",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.energia_bruta_facturada),
  },
  {
    id: "energia_autoconsumo_kwh",
    label: "E autoconsumo",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.energia_autoconsumo_kwh),
  },
  {
    id: "energia_neta_facturada_kwh",
    label: "E neta facturada",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.energia_neta_facturada_kwh),
  },
  {
    id: "energia_generada_kwh",
    label: "E generada",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.energia_generada_kwh),
  },
  {
    id: "energia_frontera_dd_kwh",
    label: "E frontera DD",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.energia_frontera_dd_kwh),
  },
  {
    id: "energia_pf_final_kwh",
    label: "E PF final",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.energia_pf_final_kwh),
  },
  {
    id: "perdidas_e_facturada_kwh",
    label: "Pérdidas E facturada (kWh)",
    align: "right",
    group: "General",
    render: (m) => formatNumberEs(m.perdidas_e_facturada_kwh),
  },
  {
    id: "perdidas_e_facturada_pct",
    label: "Pérdidas E facturada (%)",
    align: "right",
    group: "General",
    render: (m) => formatPercentEs(m.perdidas_e_facturada_pct),
  },

  // M2
  {
    id: "energia_publicada_m2_kwh",
    label: "E publ M2",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.energia_publicada_m2_kwh),
  },
  {
    id: "energia_autoconsumo_m2_kwh",
    label: "E autoc M2",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.energia_autoconsumo_m2_kwh),
  },
  {
    id: "energia_pf_m2_kwh",
    label: "E PF M2",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.energia_pf_m2_kwh),
  },
  {
    id: "energia_frontera_dd_m2_kwh",
    label: "E front DD M2",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.energia_frontera_dd_m2_kwh),
  },
  {
    id: "energia_generada_m2_kwh",
    label: "E gen M2",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.energia_generada_m2_kwh),
  },
  {
    id: "energia_neta_facturada_m2_kwh",
    label: "E neta M2",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.energia_neta_facturada_m2_kwh),
  },
  {
    id: "perdidas_e_facturada_m2_kwh",
    label: "Pérdidas M2 (kWh)",
    align: "right",
    group: "M2",
    render: (m) => formatNumberEs(m.perdidas_e_facturada_m2_kwh),
  },
  {
    id: "perdidas_e_facturada_m2_pct",
    label: "Pérdidas M2 (%)",
    align: "right",
    group: "M2",
    render: (m) => formatPercentEs(m.perdidas_e_facturada_m2_pct),
  },

  // M7
  {
    id: "energia_publicada_m7_kwh",
    label: "E publ M7",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.energia_publicada_m7_kwh),
  },
  {
    id: "energia_autoconsumo_m7_kwh",
    label: "E autoc M7",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.energia_autoconsumo_m7_kwh),
  },
  {
    id: "energia_pf_m7_kwh",
    label: "E PF M7",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.energia_pf_m7_kwh),
  },
  {
    id: "energia_frontera_dd_m7_kwh",
    label: "E front DD M7",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.energia_frontera_dd_m7_kwh),
  },
  {
    id: "energia_generada_m7_kwh",
    label: "E gen M7",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.energia_generada_m7_kwh),
  },
  {
    id: "energia_neta_facturada_m7_kwh",
    label: "E neta M7",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.energia_neta_facturada_m7_kwh),
  },
  {
    id: "perdidas_e_facturada_m7_kwh",
    label: "Pérdidas M7 (kWh)",
    align: "right",
    group: "M7",
    render: (m) => formatNumberEs(m.perdidas_e_facturada_m7_kwh),
  },
  {
    id: "perdidas_e_facturada_m7_pct",
    label: "Pérdidas M7 (%)",
    align: "right",
    group: "M7",
    render: (m) => formatPercentEs(m.perdidas_e_facturada_m7_pct),
  },

  // M11
  {
    id: "energia_publicada_m11_kwh",
    label: "E publ M11",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.energia_publicada_m11_kwh),
  },
  {
    id: "energia_autoconsumo_m11_kwh",
    label: "E autoc M11",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.energia_autoconsumo_m11_kwh),
  },
  {
    id: "energia_pf_m11_kwh",
    label: "E PF M11",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.energia_pf_m11_kwh),
  },
  {
    id: "energia_frontera_dd_m11_kwh",
    label: "E front DD M11",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.energia_frontera_dd_m11_kwh),
  },
  {
    id: "energia_generada_m11_kwh",
    label: "E gen M11",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.energia_generada_m11_kwh),
  },
  {
    id: "energia_neta_facturada_m11_kwh",
    label: "E neta M11",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.energia_neta_facturada_m11_kwh),
  },
  {
    id: "perdidas_e_facturada_m11_kwh",
    label: "Pérdidas M11 (kWh)",
    align: "right",
    group: "M11",
    render: (m) => formatNumberEs(m.perdidas_e_facturada_m11_kwh),
  },
  {
    id: "perdidas_e_facturada_m11_pct",
    label: "Pérdidas M11 (%)",
    align: "right",
    group: "M11",
    render: (m) => formatPercentEs(m.perdidas_e_facturada_m11_pct),
  },

  // ART15
  {
    id: "energia_publicada_art15_kwh",
    label: "E publ ART15",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.energia_publicada_art15_kwh),
  },
  {
    id: "energia_autoconsumo_art15_kwh",
    label: "E autoc ART15",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.energia_autoconsumo_art15_kwh),
  },
  {
    id: "energia_pf_art15_kwh",
    label: "E PF ART15",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.energia_pf_art15_kwh),
  },
  {
    id: "energia_frontera_dd_art15_kwh",
    label: "E front DD ART15",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.energia_frontera_dd_art15_kwh),
  },
  {
    id: "energia_generada_art15_kwh",
    label: "E gen ART15",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.energia_generada_art15_kwh),
  },
  {
    id: "energia_neta_facturada_art15_kwh",
    label: "E neta ART15",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.energia_neta_facturada_art15_kwh),
  },
  {
    id: "perdidas_e_facturada_art15_kwh",
    label: "Pérdidas ART15 (kWh)",
    align: "right",
    group: "ART15",
    render: (m) => formatNumberEs(m.perdidas_e_facturada_art15_kwh),
  },
  {
    id: "perdidas_e_facturada_art15_pct",
    label: "Pérdidas ART15 (%)",
    align: "right",
    group: "ART15",
    render: (m) => formatPercentEs(m.perdidas_e_facturada_art15_pct),
  },
];

// 👉 Meta simple para Ajustes
export const COLUMNS_GENERAL_META = ALL_COLUMNS_GENERAL.map((c) => ({
  id: c.id,
  label: c.label,
  group: c.group,
}));

export default function MedidasGeneralSection({
  token,
  scope = "tenant",
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
}: MedidasProps) {
  const [data, setData] = useState<MedidaGeneral[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");
  const [filtroAnio, setFiltroAnio] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");

  // paginación
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(0);

  // ajustes columnas
  const [showAdjust, setShowAdjust] = useState<boolean>(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // ✅ defaults seguros
  const defaultOrder = useMemo(() => ALL_COLUMNS_GENERAL.map((c) => c.id), []);

  const safeColumnOrder = useMemo(() => {
    if (Array.isArray(columnOrder) && columnOrder.length > 0) return columnOrder;
    return defaultOrder;
  }, [columnOrder, defaultOrder]);

  const safeHiddenColumns = useMemo(() => {
    if (Array.isArray(hiddenColumns)) return hiddenColumns;
    return [];
  }, [hiddenColumns]);

  const canEditAdjustments = !!setColumnOrder && !!setHiddenColumns;

  // ✅ para incluir columnas nuevas si columnOrder viejo
  const orderForAdjustments = useMemo(() => {
    const missing = defaultOrder.filter((id) => !safeColumnOrder.includes(id));
    return [...safeColumnOrder, ...missing];
  }, [safeColumnOrder, defaultOrder]);

  const handleLoadMedidas = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const endpoint =
        scope === "all" ? "/medidas/general/all" : "/medidas/general/";

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
      setPage(0);
    } catch (err: any) {
      console.error("Error cargando medidas_general:", err);
      setError("Error cargando medidas. Revisa la API y el token.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // reset página cuando cambian filtros/pageSize
  useEffect(() => {
    setPage(0);
  }, [filtroEmpresa, filtroAnio, filtroMes, pageSize]);

  // mapa id -> columna
  const columnasPorId = useMemo(() => {
    const map = new Map<string, ColumnDefGeneral>();
    for (const c of ALL_COLUMNS_GENERAL) map.set(c.id, c);
    return map;
  }, []);

  // columnas ordenadas + ocultas
  const columnasOrdenadas = useMemo(() => {
    const base: ColumnDefGeneral[] = [];

    for (const id of safeColumnOrder) {
      const col = columnasPorId.get(id);
      if (col) base.push(col);
    }

    const faltantes = ALL_COLUMNS_GENERAL.filter(
      (c) => !safeColumnOrder.includes(c.id)
    );
    const full = [...base, ...faltantes];

    if (!safeHiddenColumns || safeHiddenColumns.length === 0) return full;
    return full.filter((c) => !safeHiddenColumns.includes(c.id));
  }, [safeColumnOrder, columnasPorId, safeHiddenColumns]);

  const totalColumnas = columnasOrdenadas.length || 1;

  // valores para filtros
  const { opcionesEmpresa, opcionesAnio, opcionesMes } = useMemo(() => {
    const empresas = new Set<string>();
    const anios = new Set<number>();
    const meses = new Set<number>();

    for (const m of data) {
      const cod = (m as any).empresa_codigo as string | undefined;
      if (cod) empresas.add(cod);
      if (typeof m.anio === "number") anios.add(m.anio);
      if (typeof m.mes === "number") meses.add(m.mes);
    }

    return {
      opcionesEmpresa: Array.from(empresas).sort(),
      opcionesAnio: Array.from(anios).sort((a, b) => a - b),
      opcionesMes: Array.from(meses).sort((a, b) => a - b),
    };
  }, [data]);

  // aplicar filtros + ordenar
  const filasVisibles = useMemo(() => {
    const filtradas = data.filter((m) => {
      const empresaCodigo = (m as any).empresa_codigo as string | undefined;

      const matchEmpresa = !filtroEmpresa || empresaCodigo === filtroEmpresa;
      const matchAnio =
        !filtroAnio || m.anio === Number.parseInt(filtroAnio, 10);
      const matchMes = !filtroMes || m.mes === Number.parseInt(filtroMes, 10);

      return matchEmpresa && matchAnio && matchMes;
    });

    return [...filtradas].sort((a, b) => {
      const codA = ((a as any).empresa_codigo ?? "") as string;
      const codB = ((b as any).empresa_codigo ?? "") as string;

      const cmpCod = codA.localeCompare(codB);
      if (cmpCod !== 0) return cmpCod;

      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.mes - b.mes;
    });
  }, [data, filtroEmpresa, filtroAnio, filtroMes]);

  // paginación
  const totalFilas = filasVisibles.length;
  const totalPages = Math.max(1, Math.ceil(totalFilas / pageSize));
  const currentPage = Math.min(page, totalPages - 1);

  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFilas);
  const filasPaginadas =
    totalFilas === 0 ? [] : filasVisibles.slice(startIndex, endIndex);

  // ---- ajustes columnas: drag & drop + checks ----
  const handleDragStart = (index: number) => setDragIndex(index);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

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

  // 3 columnas en ajustes (sobre el order “real” de ajustes)
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

  return (
    <section className="ui-card text-sm">
      {/* HEADER */}
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">
            Medidas general{scope === "all" ? " (Sistema)" : ""}
          </h4>
          <p className="ui-card-subtitle">Medidas agregadas por empresa y mes.</p>
        </div>

        <button
          onClick={handleLoadMedidas}
          disabled={loading || !token}
          className="ui-btn ui-btn-primary"
        >
          {loading ? "Cargando..." : "Cargar medidas"}
        </button>
      </header>

      {error && <p className="mb-4 text-[11px] text-red-400">{error}</p>}

      {/* FILTROS */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div>
          <label className="ui-label">Código empresa</label>
          <select
            className="ui-select"
            value={filtroEmpresa}
            onChange={(e) => setFiltroEmpresa(e.target.value)}
          >
            <option value="">Todas</option>
            {opcionesEmpresa.map((cod) => (
              <option key={cod} value={cod}>
                {cod}
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
          >
            <option value="">Todos</option>
            {opcionesAnio.map((anio) => (
              <option key={anio} value={anio}>
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
          >
            <option value="">Todos</option>
            {opcionesMes.map((mes) => (
              <option key={mes} value={mes}>
                {mes.toString().padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AJUSTES DE COLUMNAS (solo si hay setters) */}
      {canEditAdjustments && (
        <div className="mb-4 rounded-xl border border-[var(--card-border)] bg-[var(--field-bg-soft)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h5 className="text-xs font-semibold">Ajustes de columnas</h5>
              <p className="mt-1 text-[10px] ui-muted">
                Marca las columnas que quieres ver y arrástralas para cambiar el
                orden.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={hideAllColumns}
                className="ui-btn ui-btn-outline ui-btn-xs"
              >
                Quitar todo
              </button>
              <button
                type="button"
                onClick={resetOrder}
                className="ui-btn ui-btn-outline ui-btn-xs"
              >
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
            <div
              className="border-t border-[var(--card-border)] px-4 py-3 text-[11px]"
              onDragOver={handleDragOver}
            >
              <div className="mb-2 text-[10px] ui-muted">
                ☰ = arrastrar para reordenar · ✓ = mostrar columna en la tabla.
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  {firstIds.map((id, idx) => renderAdjustItem(id, idx))}
                </div>
                <div className="flex-1 space-y-1">
                  {secondIds.map((id, idx) => renderAdjustItem(id, third + idx))}
                </div>
                <div className="flex-1 space-y-1">
                  {thirdIds.map((id, idx) =>
                    renderAdjustItem(id, 2 * third + idx)
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABLA */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              {columnasOrdenadas.map((col) => (
                <th
                  key={col.id}
                  className={[
                    "ui-th",
                    col.align === "right" ? "ui-th-right" : "",
                  ].join(" ")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {totalFilas === 0 ? (
              <tr className="ui-tr">
                <td
                  colSpan={totalColumnas}
                  className="ui-td text-center ui-muted"
                >
                  No hay medidas que cumplan los filtros.
                </td>
              </tr>
            ) : (
              filasPaginadas.map((m) => (
                <tr
                  key={`${m.empresa_id}-${m.punto_id}-${m.anio}-${m.mes}`}
                  className="ui-tr"
                >
                  {columnasOrdenadas.map((col) => (
                    <td
                      key={col.id}
                      className={[
                        "ui-td",
                        col.align === "right" ? "ui-td-right" : "",
                      ].join(" ")}
                    >
                      {col.render(m)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* FOOTER PAGINACIÓN */}
        {totalFilas > 0 && (
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