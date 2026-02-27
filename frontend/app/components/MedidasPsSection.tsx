// app/components/MedidasPsSection.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { MedidaPS } from "../types";

type MedidasPsProps = {
  token: string | null;

  // ✅ mismo componente para Sistema
  // tenant -> /medidas/ps/
  // all    -> /medidas/ps/all   (solo superuser)
  scope?: "tenant" | "all";

  // ajustes columnas (pueden venir undefined en SistemaSection)
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;

  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;
};

// Formateo numérico en formato español: 1.234.567,89
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

// 🔹 Definimos TODAS las columnas PS (esta es la “tabla real”)
const ALL_COLUMNS_PS: ColumnDefPs[] = [
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

  // Energía por tipo PS
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

  // CUPS por tipo
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

  // Importes por tipo
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

  // ✅ Tarifas
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

// 👉 Meta simple para Ajustes
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

  // Filtros
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");
  const [filtroAnio, setFiltroAnio] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");
  const [filtroTarifa, setFiltroTarifa] = useState<string>("");

  // Paginación
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(0);

  // Ajustes columnas
  const [showAdjust, setShowAdjust] = useState<boolean>(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // ✅ defaults seguros
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

  // ✅ para incluir columnas nuevas si columnOrder viejo
  const orderForAdjustments = useMemo(() => {
    const missing = defaultOrder.filter((id) => !safeColumnOrder.includes(id));
    return [...safeColumnOrder, ...missing];
  }, [safeColumnOrder, defaultOrder]);

  const handleLoadMedidas = async () => {
    if (!token) return; // ✅ NO cargar sin token

    setLoading(true);
    setError(null);
    try {
      const endpoint = scope === "all" ? "/medidas/ps/all" : "/medidas/ps/";

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
      console.error("Error cargando medidas_ps:", err);
      setError("Error cargando medidas PS. Revisa la API y el token.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // reset página cuando cambian filtros/pageSize
  useEffect(() => {
    setPage(0);
  }, [filtroEmpresa, filtroAnio, filtroMes, filtroTarifa, pageSize]);

  // mapa id -> columna
  const columnasPorId = useMemo(() => {
    const map = new Map<string, ColumnDefPs>();
    for (const c of ALL_COLUMNS_PS) map.set(c.id, c);
    return map;
  }, []);

  // columnas ordenadas + ocultas
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

  // valores únicos para filtros
  const { opcionesEmpresa, opcionesAnio, opcionesMes, opcionesTarifa } =
    useMemo(() => {
      const empresas = new Set<string>();
      const anios = new Set<number>();
      const meses = new Set<number>();
      const tarifas = new Set<string>();

      for (const m of data) {
        if (m.empresa_codigo) empresas.add(m.empresa_codigo);
        if (typeof m.anio === "number") anios.add(m.anio);
        if (typeof m.mes === "number") meses.add(m.mes);

        const has20 =
          m.energia_tarifa_20td_kwh != null ||
          m.cups_tarifa_20td != null ||
          m.importe_tarifa_20td_eur != null;
        if (has20) tarifas.add("20td");

        const has30 =
          m.energia_tarifa_30td_kwh != null ||
          m.cups_tarifa_30td != null ||
          m.importe_tarifa_30td_eur != null;
        if (has30) tarifas.add("30td");

        const has30ve =
          m.energia_tarifa_30tdve_kwh != null ||
          m.cups_tarifa_30tdve != null ||
          m.importe_tarifa_30tdve_eur != null;
        if (has30ve) tarifas.add("30tdve");

        const has61 =
          m.energia_tarifa_61td_kwh != null ||
          m.cups_tarifa_61td != null ||
          m.importe_tarifa_61td_eur != null;
        if (has61) tarifas.add("61td");

        const has62 =
          m.energia_tarifa_62td_kwh != null ||
          m.cups_tarifa_62td != null ||
          m.importe_tarifa_62td_eur != null;
        if (has62) tarifas.add("62td");

        const has63 =
          m.energia_tarifa_63td_kwh != null ||
          m.cups_tarifa_63td != null ||
          m.importe_tarifa_63td_eur != null;
        if (has63) tarifas.add("63td");

        const has64 =
          m.energia_tarifa_64td_kwh != null ||
          m.cups_tarifa_64td != null ||
          m.importe_tarifa_64td_eur != null;
        if (has64) tarifas.add("64td");
      }

      const ordenTarifas = [
        "20td",
        "30td",
        "30tdve",
        "61td",
        "62td",
        "63td",
        "64td",
      ];
      const opcionesTarifa = ordenTarifas.filter((t) => tarifas.has(t));

      return {
        opcionesEmpresa: Array.from(empresas).sort(),
        opcionesAnio: Array.from(anios).sort((a, b) => a - b),
        opcionesMes: Array.from(meses).sort((a, b) => a - b),
        opcionesTarifa,
      };
    }, [data]);

  // aplicar filtros + ordenar por empresa -> año -> mes
  const filasVisibles = useMemo(() => {
    const filtradas = data.filter((m) => {
      const empresaCodigo = m.empresa_codigo ?? undefined;

      const matchEmpresa = !filtroEmpresa || empresaCodigo === filtroEmpresa;
      const matchAnio =
        !filtroAnio || m.anio === Number.parseInt(filtroAnio, 10);
      const matchMes = !filtroMes || m.mes === Number.parseInt(filtroMes, 10);

      let matchTarifa = true;
      if (filtroTarifa) {
        const hasTarifa =
          filtroTarifa === "20td"
            ? m.energia_tarifa_20td_kwh != null ||
              m.cups_tarifa_20td != null ||
              m.importe_tarifa_20td_eur != null
            : filtroTarifa === "30td"
            ? m.energia_tarifa_30td_kwh != null ||
              m.cups_tarifa_30td != null ||
              m.importe_tarifa_30td_eur != null
            : filtroTarifa === "30tdve"
            ? m.energia_tarifa_30tdve_kwh != null ||
              m.cups_tarifa_30tdve != null ||
              m.importe_tarifa_30tdve_eur != null
            : filtroTarifa === "61td"
            ? m.energia_tarifa_61td_kwh != null ||
              m.cups_tarifa_61td != null ||
              m.importe_tarifa_61td_eur != null
            : filtroTarifa === "62td"
            ? m.energia_tarifa_62td_kwh != null ||
              m.cups_tarifa_62td != null ||
              m.importe_tarifa_62td_eur != null
            : filtroTarifa === "63td"
            ? m.energia_tarifa_63td_kwh != null ||
              m.cups_tarifa_63td != null ||
              m.importe_tarifa_63td_eur != null
            : filtroTarifa === "64td"
            ? m.energia_tarifa_64td_kwh != null ||
              m.cups_tarifa_64td != null ||
              m.importe_tarifa_64td_eur != null
            : true;

        matchTarifa = !!hasTarifa;
      }

      return matchEmpresa && matchAnio && matchMes && matchTarifa;
    });

    return [...filtradas].sort((a, b) => {
      const codA = (a.empresa_codigo ?? "") as string;
      const codB = (b.empresa_codigo ?? "") as string;

      const cmpCod = codA.localeCompare(codB);
      if (cmpCod !== 0) return cmpCod;

      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.mes - b.mes;
    });
  }, [data, filtroEmpresa, filtroAnio, filtroMes, filtroTarifa]);

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

  // 3 columnas en ajustes
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
      {/* HEADER */}
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">
            Medidas PS{scope === "all" ? " (Sistema)" : ""}
          </h4>
          <p className="ui-card-subtitle">
            Medidas agregadas por empresa y mes de los ficheros PS_*.
          </p>
        </div>

        <button
          onClick={handleLoadMedidas}
          disabled={loading || !token} // ✅ NO cargar sin token
          className="ui-btn ui-btn-primary"
        >
          {loading ? "Cargando..." : "Cargar medidas PS"}
        </button>
      </header>

      {error && <p className="mb-4 text-[11px] text-red-400">{error}</p>}

      {/* FILTROS */}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
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

        <div>
          <label className="ui-label">Tarifa</label>
          <select
            className="ui-select"
            value={filtroTarifa}
            onChange={(e) => setFiltroTarifa(e.target.value)}
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
                  {secondIds.map((id, idx) =>
                    renderAdjustItem(id, third + idx)
                  )}
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
                  No hay medidas PS que cumplan los filtros.
                </td>
              </tr>
            ) : (
              filasPaginadas.map((m) => (
                <tr
                  key={`${m.empresa_id}-${m.anio}-${m.mes}`}
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
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
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