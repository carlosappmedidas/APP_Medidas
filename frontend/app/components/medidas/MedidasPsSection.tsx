"use client";
import { useMemo, useState } from "react";
import type { MedidaPS } from "../../types";
import DeletePreviewModal from "../ui/DeletePreviewModal";
import ConfirmDeleteModal from "../ui/ConfirmDeleteModal";
import ColumnVisibilityOrderPanel from "../ui/ColumnVisibilityOrderPanel";
import TablePaginationFooter from "../ui/TablePaginationFooter";
import MedidasFiltersBar from "../ui/MedidasFiltersBar";
import MedidasTableActions from "../ui/MedidasTableActions";
import { useMedidasTable } from "./hooks/useMedidasTable";
import { useDeleteByIngestion } from "../ingestion/hooks/useDeleteByIngestion";
import type { TableAppearance } from "../settings/hooks/useTableSettings";

// ── Colores de cabecera de grupo ──────────────────────────────────────────
const GROUP_HEADER_STYLES: Record<string, { background: string; color: string; borderBottom: string }> = {
  "Identificación":   { background: "rgba(30,58,95,0.4)",   color: "rgba(226,232,240,0.5)",  borderBottom: "none" },
  "Energía PS":       { background: "rgba(37,99,235,0.18)", color: "#60a5fa",                 borderBottom: "1px solid rgba(37,99,235,0.4)" },
  "CUPS PS":          { background: "rgba(30,58,95,0.35)",  color: "rgba(226,232,240,0.55)", borderBottom: "1px solid rgba(30,58,95,0.5)" },
  "Importes PS":      { background: "rgba(5,150,105,0.18)", color: "#34d399",                 borderBottom: "1px solid rgba(5,150,105,0.4)" },
  "Energía Tarifas":  { background: "rgba(245,158,11,0.18)",color: "#fbbf24",                 borderBottom: "1px solid rgba(245,158,11,0.4)" },
  "CUPS Tarifas":     { background: "rgba(30,58,95,0.35)",  color: "rgba(226,232,240,0.55)", borderBottom: "1px solid rgba(30,58,95,0.5)" },
  "Importes Tarifas": { background: "rgba(168,85,247,0.18)",color: "#c084fc",                 borderBottom: "1px solid rgba(168,85,247,0.4)" },
};

// ── Umbrales de pérdidas técnicas ─────────────────────────────────────────
const PCT_UMBRAL_NORMAL = 8;
const PCT_UMBRAL_ALTO   = 12;

// ── Tipos ──────────────────────────────────────────────────────────────────
type MedidasPsProps = {
  token: string | null;
  scope?: "tenant" | "all";
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;
  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;
  onGoToSettings?: () => void;
  appearance?: TableAppearance;
};

const DEFAULT_APPEARANCE: TableAppearance = {
  stripedRows:     true,
  columnGroups:    true,
  pctBadges:       true,
  periodSeparator: false,
};

const formatNumberEs = (v: number | null | undefined, decimals = 2): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

// ── Badge de porcentaje de pérdidas ───────────────────────────────────────
function PctCell({ value, pctBadges }: { value: number | null | undefined; pctBadges: boolean }) {
  const text = value == null || Number.isNaN(value)
    ? "-"
    : `${formatNumberEs(value, 2)} %`;

  if (!pctBadges || text === "-") return <>{text}</>;

  let bg: string;
  let color: string;

  if (typeof value !== "number") {
    bg = "rgba(30,58,95,0.2)";    color = "var(--text-muted)";
  } else if (value < 0) {
    bg = "rgba(245,158,11,0.2)";  color = "#fbbf24";
  } else if (value <= PCT_UMBRAL_NORMAL) {
    bg = "rgba(5,150,105,0.18)";  color = "#34d399";
  } else if (value <= PCT_UMBRAL_ALTO) {
    bg = "rgba(245,158,11,0.2)";  color = "#fbbf24";
  } else {
    bg = "rgba(239,68,68,0.18)";  color = "#f87171";
  }

  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: "inherit", fontWeight: 500, background: bg, color,
    }}>
      {text}
    </span>
  );
}

export type ColumnDefPs = {
  id: string;
  label: string;
  align: "left" | "right";
  group: string;
  render: (m: MedidaPS | any, ap: TableAppearance) => React.ReactNode;
};

const STICKY_COLUMN_IDS_PS = ["empresa_id", "empresa_codigo", "anio", "mes"];
const STICKY_WIDTHS_PS: Record<string, number> = {
  empresa_id: 64, empresa_codigo: 110, anio: 52, mes: 44,
};

// Fondo sólido para bandas alternas: rgba(30,58,95,0.18) sobre #1a2e45 (card-bg)
const STRIPE_BG = "rgb(27,48,74)";

const ALL_COLUMNS_PS: ColumnDefPs[] = [
  { id: "empresa_id",    label: "Empresa ID",    align: "left",  group: "Identificación", render: (m) => m.empresa_id },
  { id: "empresa_codigo",label: "Código empresa",align: "left",  group: "Identificación", render: (m) => m.empresa_codigo ?? "-" },
  { id: "anio",          label: "Año",           align: "left",  group: "Identificación", render: (m) => m.anio },
  { id: "mes",           label: "Mes",           align: "left",  group: "Identificación", render: (m) => m.mes.toString().padStart(2, "0") },
  { id: "energia_ps_tipo_1_kwh",   label: "E PS T1",    align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_1_kwh) },
  { id: "energia_ps_tipo_2_kwh",   label: "E PS T2",    align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_2_kwh) },
  { id: "energia_ps_tipo_3_kwh",   label: "E PS T3",    align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_3_kwh) },
  { id: "energia_ps_tipo_4_kwh",   label: "E PS T4",    align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_4_kwh) },
  { id: "energia_ps_tipo_5_kwh",   label: "E PS T5",    align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_5_kwh) },
  { id: "energia_ps_total_kwh",    label: "E PS Total", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_total_kwh) },
  { id: "cups_tipo_1",   label: "CUPS T1",    align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_1 ?? "-" },
  { id: "cups_tipo_2",   label: "CUPS T2",    align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_2 ?? "-" },
  { id: "cups_tipo_3",   label: "CUPS T3",    align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_3 ?? "-" },
  { id: "cups_tipo_4",   label: "CUPS T4",    align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_4 ?? "-" },
  { id: "cups_tipo_5",   label: "CUPS T5",    align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_5 ?? "-" },
  { id: "cups_total",    label: "CUPS Total", align: "right", group: "CUPS PS", render: (m) => m.cups_total ?? "-" },
  { id: "importe_tipo_1_eur", label: "Imp. T1",    align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_1_eur) },
  { id: "importe_tipo_2_eur", label: "Imp. T2",    align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_2_eur) },
  { id: "importe_tipo_3_eur", label: "Imp. T3",    align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_3_eur) },
  { id: "importe_tipo_4_eur", label: "Imp. T4",    align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_4_eur) },
  { id: "importe_tipo_5_eur", label: "Imp. T5",    align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_5_eur) },
  { id: "importe_total_eur",  label: "Imp. Total", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_total_eur) },
  { id: "energia_tarifa_20td_kwh",    label: "E 2.0TD",       align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_20td_kwh) },
  { id: "energia_tarifa_30td_kwh",    label: "E 3.0TD",       align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_30td_kwh) },
  { id: "energia_tarifa_30tdve_kwh",  label: "E 3.0TDVE",     align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_30tdve_kwh) },
  { id: "energia_tarifa_61td_kwh",    label: "E 6.1TD",       align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_61td_kwh) },
  { id: "energia_tarifa_total_kwh",   label: "E Tar. Total",  align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_total_kwh) },
  { id: "cups_tarifa_20td",    label: "CUPS 2.0TD",      align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_20td ?? "-" },
  { id: "cups_tarifa_30td",    label: "CUPS 3.0TD",      align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_30td ?? "-" },
  { id: "cups_tarifa_30tdve",  label: "CUPS 3.0TDVE",    align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_30tdve ?? "-" },
  { id: "cups_tarifa_61td",    label: "CUPS 6.1TD",      align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_61td ?? "-" },
  { id: "cups_tarifa_total",   label: "CUPS Tar. Total", align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_total ?? "-" },
  { id: "importe_tarifa_20td_eur",   label: "Imp. 2.0TD",      align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_20td_eur) },
  { id: "importe_tarifa_30td_eur",   label: "Imp. 3.0TD",      align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_30td_eur) },
  { id: "importe_tarifa_30tdve_eur", label: "Imp. 3.0TDVE",    align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_30tdve_eur) },
  { id: "importe_tarifa_61td_eur",   label: "Imp. 6.1TD",      align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_61td_eur) },
  { id: "importe_tarifa_total_eur",  label: "Imp. Tar. Total", align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_total_eur) },
];

export const COLUMNS_PS_META = ALL_COLUMNS_PS.map((c) => ({
  id: c.id, label: c.label, group: c.group,
}));

function buildGroupHeaders(cols: ColumnDefPs[]) {
  const groups: { group: string; span: number }[] = [];
  for (const col of cols) {
    if (groups.length > 0 && groups[groups.length - 1].group === col.group) {
      groups[groups.length - 1].span++;
    } else {
      groups.push({ group: col.group, span: 1 });
    }
  }
  return groups;
}

export default function MedidasPsSection({
  token,
  scope = "tenant",
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
  onGoToSettings,
  appearance,
}: MedidasPsProps) {
  const ap = appearance ?? DEFAULT_APPEARANCE;
  const defaultOrder = useMemo(() => ALL_COLUMNS_PS.map((c) => c.id), []);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const {
    isSistema, data, loading, error, hasLoadedOnce,
    filtroTenant, setFiltroTenant,
    filtroEmpresaIds, setFiltroEmpresaIds,
    filtroAnios, setFiltroAnios,
    filtroMeses, setFiltroMeses,
    filtroPeriodos, setFiltroPeriodos,
    ultimoPeriodo,
    opcionesEmpresa, opcionesAnio, opcionesMes, opcionesTenant, opcionesEmpresaFiltradas,
    pageSize, setPageSize, page, setPage,
    totalFilas, totalPages, currentPage, startIndex, endIndex,
    showAdjust, setShowAdjust,
    handleDragStart, handleDrop,
    safeColumnOrder, safeHiddenColumns,
    canEditAdjustments, orderForAdjustments,
    filtrosActivosCount, clearFilters, loadFilters, handleLoadData,
    toggleVisible, resetOrder, hideAllColumns,
  } = useMedidasTable<MedidaPS>({
    token, scope,
    filtersEndpointTenant: "/medidas/ps/filters",
    filtersEndpointAll: "/medidas/ps/all/filters",
    pageEndpointTenant: "/medidas/ps/page",
    pageEndpointAll: "/medidas/ps/all/page",
    defaultColumnOrder: defaultOrder,
    columnOrder, setColumnOrder, hiddenColumns, setHiddenColumns,
    loadErrorMessage: "Error cargando medidas PS. Revisa la API y el token.",
  });

  const {
    deleteOpen, deleteBusy, deleteError,
    deletePreviewOpen, setDeletePreviewOpen,
    deletePreviewLoading, deletePreviewError, deletePreviewData,
    canDeleteByFilters, totalDeleteOps, clearDeleteState,
    openDelete, closeDelete, handleOpenDeletePreview, confirmDelete,
  } = useDeleteByIngestion({
    token, isSistema, filtroTenant, filtroEmpresaIds, filtroAnios, filtroMeses, opcionesEmpresa,
    resolveTenantId: (empresaId, empresas, tenantActual) => {
      const empresa = empresas.find((e) => String(e.id) === empresaId);
      if (empresa?.tenant_id != null) return String(empresa.tenant_id);
      return tenantActual || null;
    },
    previewTipo: "PS",
    deleteTipo: "PS",
    previewMissingFiltersMessage: "Selecciona al menos empresa, año y mes para habilitar la vista previa.",
    deleteErrorMessage: "No se pudo completar el borrado por ingestion de PS. Revisa filtros, endpoint y permisos.",
    onAfterDelete: async () => { await loadFilters(); setPage(0); await handleLoadData(0); },
  });

  const systemTenantColumn: ColumnDefPs = useMemo(
    () => ({ id: "tenant_id", label: "Cliente", align: "left", group: "Identificación", render: (m) => (m as any).tenant_id ?? "-" }),
    []
  );

  const baseColumns = useMemo(
    () => (isSistema ? [systemTenantColumn, ...ALL_COLUMNS_PS] : ALL_COLUMNS_PS),
    [isSistema, systemTenantColumn]
  );

  const empresaOptions = useMemo(() => {
    const source = isSistema ? opcionesEmpresaFiltradas : opcionesEmpresa;
    return source.map((e) => ({
      value: String(e.id),
      label: `${e.nombre ?? e.codigo ?? `Empresa ${e.id}`}` +
        (isSistema && typeof e.tenant_id === "number" ? ` · T${e.tenant_id}` : ""),
    }));
  }, [isSistema, opcionesEmpresa, opcionesEmpresaFiltradas]);

  const anioOptions = useMemo(
    () => opcionesAnio.map((anio) => ({ value: String(anio), label: String(anio) })),
    [opcionesAnio]
  );
  const mesOptions = useMemo(
    () => opcionesMes.map((mes) => ({ value: String(mes), label: mes.toString().padStart(2, "0") })),
    [opcionesMes]
  );

  const columnasPorId = useMemo(() => {
    const map = new Map<string, ColumnDefPs>();
    for (const c of baseColumns) map.set(c.id, c);
    return map;
  }, [baseColumns]);

  const columnasOrdenadas = useMemo(() => {
    const base: ColumnDefPs[] = [];
    if (isSistema) { const tcol = columnasPorId.get("tenant_id"); if (tcol) base.push(tcol); }
    for (const id of safeColumnOrder) {
      const col = columnasPorId.get(id);
      if (col && col.id !== "tenant_id") base.push(col);
    }
    const faltantes = ALL_COLUMNS_PS.filter((c) => !safeColumnOrder.includes(c.id));
    const full = [...base, ...faltantes.filter((c) => !base.some((b) => b.id === c.id))];
    if (!safeHiddenColumns || safeHiddenColumns.length === 0) return full;
    return full.filter((c) => !safeHiddenColumns.includes(c.id));
  }, [isSistema, safeColumnOrder, columnasPorId, safeHiddenColumns]);

  const stickyLeftMap = useMemo(() => {
    const map: Record<string, number> = {};
    let acc = 0;
    for (const col of columnasOrdenadas) {
      if (STICKY_COLUMN_IDS_PS.includes(col.id)) { map[col.id] = acc; acc += STICKY_WIDTHS_PS[col.id] ?? 80; }
    }
    return map;
  }, [columnasOrdenadas]);

  const groupHeaders = useMemo(() => buildGroupHeaders(columnasOrdenadas), [columnasOrdenadas]);

  const totalColumnas = columnasOrdenadas.length || 1;
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const adjustButton = (
    <div className="flex items-center gap-1">
      <MedidasTableActions
        loading={loading} token={token} isSistema={isSistema}
        canDeleteByFilters={canDeleteByFilters} totalDeleteOps={totalDeleteOps}
        deletePreviewLoading={deletePreviewLoading} filtrosActivosCount={filtrosActivosCount}
        onRefresh={() => void handleLoadData(page)}
        onOpenDeletePreview={() => void handleOpenDeletePreview()}
        onOpenDelete={openDelete}
        onClearFilters={() => { clearFilters(); clearDeleteState(); }}
        deletePreviewTitleEnabled="Ver impacto antes de borrar"
        deletePreviewTitleDisabled="Selecciona al menos empresa, año y mes para ver la vista previa"
        deleteTitleEnabled="Borrar por ingestion de la familia PS usando empresa + año + mes"
        deleteTitleDisabled="Selecciona al menos empresa, año y mes para borrar"
      />
      {canEditAdjustments && (
        onGoToSettings ? (
          <button type="button" onClick={onGoToSettings} className="ui-btn ui-btn-outline ui-btn-xs" title="Configurar columnas" style={{ padding: "3px 7px", fontSize: 14 }}>
            ⚙️
          </button>
        ) : (
          <button type="button" onClick={() => setShowAdjust((v) => !v)} className="ui-btn ui-btn-outline ui-btn-xs">
            {showAdjust ? "Ocultar columnas" : "Ajustar columnas"}
          </button>
        )
      )}
    </div>
  );

  const dataRows = useMemo(() => {
    if (!ap.periodSeparator) return data.map((m) => ({ type: "data" as const, m }));
    const rows: ({ type: "separator"; label: string } | { type: "data"; m: MedidaPS })[] = [];
    const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    let lastKey = "";
    for (const m of data as any[]) {
      const key = `${m.anio}-${m.mes}`;
      if (key !== lastKey) {
        rows.push({ type: "separator", label: `${m.anio} · ${MESES[(m.mes ?? 1) - 1] ?? m.mes}` });
        lastKey = key;
      }
      rows.push({ type: "data", m });
    }
    return rows;
  }, [data, ap.periodSeparator]);

  return (
    <section className="ui-card text-sm">

      {error && <div className="ui-alert ui-alert--danger mb-4">{error}</div>}
      {deletePreviewError && <div className="ui-alert ui-alert--danger mb-4">{deletePreviewError}</div>}

      {isSistema && (
        <div className="mb-3 ui-alert ui-alert--warning">
          En Sistema, el borrado de PS se hace siempre por{" "}
          <strong>ingestion</strong> usando los filtros activos y forzando la familia{" "}
          <strong>PS</strong>. Selecciona al menos{" "}
          <strong>empresa + año + mes</strong>. Esto no borra General.
        </div>
      )}

      <MedidasFiltersBar
        isSistema={isSistema} token={token} loading={loading}
        filtroTenant={filtroTenant} setFiltroTenant={setFiltroTenant}
        filtroEmpresaIds={filtroEmpresaIds} setFiltroEmpresaIds={setFiltroEmpresaIds}
        filtroAnios={filtroAnios} setFiltroAnios={setFiltroAnios}
        filtroMeses={filtroMeses} setFiltroMeses={setFiltroMeses}
        filtroPeriodos={filtroPeriodos} setFiltroPeriodos={setFiltroPeriodos}
        ultimoPeriodo={ultimoPeriodo}
        opcionesTenant={opcionesTenant}
        empresaOptions={empresaOptions} anioOptions={anioOptions} mesOptions={mesOptions}
        empresaPlaceholder="Todas" anioPlaceholder="Todos" mesPlaceholder="Todos"
        compact
        filtrosActivosCount={filtrosActivosCount}
        adjustButton={adjustButton}
      />

      {showAdjust && (
        <ColumnVisibilityOrderPanel
          show={showAdjust} onToggleShow={() => setShowAdjust((v) => !v)}
          canEdit={canEditAdjustments} order={orderForAdjustments} hiddenColumns={safeHiddenColumns}
          columnsMeta={isSistema ? [{ id: "tenant_id", label: "Cliente", group: "Identificación" }, ...COLUMNS_PS_META] : COLUMNS_PS_META}
          onToggleVisible={toggleVisible} onReset={resetOrder} onHideAll={hideAllColumns}
          onDragStart={handleDragStart} onDrop={handleDrop} onDragOver={handleDragOver}
        />
      )}

      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="ui-thead">
            {ap.columnGroups && (
              <tr>
                {groupHeaders.map(({ group, span }, i) => {
                  const style = GROUP_HEADER_STYLES[group] ?? GROUP_HEADER_STYLES["Identificación"];
                  return (
                    <th key={`grp-${i}`} colSpan={span} style={{
                      padding: "3px 8px", fontSize: 9, fontWeight: 500,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      textAlign: "center", whiteSpace: "nowrap", ...style,
                    }}>
                      {group}
                    </th>
                  );
                })}
              </tr>
            )}
            <tr>
              {columnasOrdenadas.map((col) => {
                const isSticky = STICKY_COLUMN_IDS_PS.includes(col.id) && col.id in stickyLeftMap;
                return (
                  <th key={col.id}
                    className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")}
                    style={isSticky ? {
                      position: "sticky", left: stickyLeftMap[col.id], zIndex: 3,
                      background: "var(--sticky-head-bg)", boxShadow: "2px 0 4px rgba(0,0,0,0.3)",
                      minWidth: STICKY_WIDTHS_PS[col.id] ?? 80, maxWidth: STICKY_WIDTHS_PS[col.id] ?? 80,
                      width: STICKY_WIDTHS_PS[col.id] ?? 80, whiteSpace: "nowrap",
                    } : { whiteSpace: "nowrap" }}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={`sk-${i}`} className="ui-tr">
                {Array.from({ length: totalColumnas }).map((__, j) => (
                  <td key={`sk-${i}-${j}`} className="ui-td">
                    <span className="inline-block h-3 w-full rounded-md" style={{ background: "var(--field-bg-soft)", border: "1px solid var(--field-border)", opacity: 0.6 }} />
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
            {!loading && dataRows.map((row, rowIdx) => {
              if (row.type === "separator") {
                return (
                  <tr key={`sep-${row.label}`}>
                    <td colSpan={totalColumnas} style={{
                      padding: "4px 10px", fontSize: 9, fontWeight: 500,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      color: "var(--text-muted)", background: "var(--card-bg)",
                      borderTop: "1px solid var(--card-border)", borderBottom: "1px solid var(--card-border)",
                    }}>
                      {row.label}
                    </td>
                  </tr>
                );
              }

              const m = row.m as any;
              const rowKey = `${m.empresa_id}-${m.anio}-${m.mes}-${m.tenant_id ?? "x"}`;
              const isSelected = selectedRowKey === rowKey;
              const dataIdx = dataRows.slice(0, rowIdx + 1).filter((r) => r.type === "data").length - 1;
              const isEven = dataIdx % 2 === 1;
              const hasStripe = ap.stripedRows && isEven && !isSelected;

              // Fondo uniforme para toda la fila — mismo color en sticky y no-sticky
              const cellBg = isSelected
                ? "var(--nav-item-hover)"
                : hasStripe
                  ? STRIPE_BG
                  : "var(--card-bg)";

              return (
                <tr key={rowKey} className="ui-tr"
                  onClick={() => setSelectedRowKey(isSelected ? null : rowKey)}
                  style={{
                    cursor: "pointer",
                    outline: isSelected ? "1px solid var(--btn-secondary-bg)" : undefined,
                  }}
                >
                  {columnasOrdenadas.map((col) => {
                    const isSticky = STICKY_COLUMN_IDS_PS.includes(col.id) && col.id in stickyLeftMap;
                    return (
                      <td key={col.id}
                        className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")}
                        style={isSticky ? {
                          position: "sticky", left: stickyLeftMap[col.id], zIndex: 1,
                          background: cellBg,
                          boxShadow: "2px 0 4px rgba(0,0,0,0.3)",
                          minWidth: STICKY_WIDTHS_PS[col.id] ?? 80, maxWidth: STICKY_WIDTHS_PS[col.id] ?? 80,
                          width: STICKY_WIDTHS_PS[col.id] ?? 80,
                        } : { background: cellBg }}
                      >
                        {col.render(m, ap)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePaginationFooter
        loading={loading} hasLoadedOnce={hasLoadedOnce}
        totalFilas={totalFilas} startIndex={startIndex} endIndex={endIndex}
        pageSize={pageSize} setPageSize={setPageSize}
        currentPage={currentPage} totalPages={totalPages} setPage={setPage}
        compact
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Borrar por ingestion · PS · Sistema"
        description={
          canDeleteByFilters
            ? `Se van a lanzar ${totalDeleteOps} operación(es) de borrado por ingestion de la familia PS usando empresa + año + mes. Esto elimina detalles, contribuciones y medidas derivadas de PS, sin tocar General.`
            : "Selecciona al menos empresa, año y mes para habilitar el borrado."
        }
        error={deleteError} loading={deleteBusy} loadingText="Borrando..."
        confirmText="Borrar definitivamente" onConfirm={confirmDelete} onClose={closeDelete}
      />
      <DeletePreviewModal
        open={deletePreviewOpen} preview={deletePreviewData} loading={deleteBusy}
        onClose={() => { if (deleteBusy) return; setDeletePreviewOpen(false); }}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
