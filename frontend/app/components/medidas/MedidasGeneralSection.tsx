"use client";
import { useMemo, useState } from "react";
import type { MedidaGeneral } from "../../types";
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
  "Identificación": { background: "rgba(30,58,95,0.4)",   color: "rgba(226,232,240,0.5)",  borderBottom: "none" },
  "General":        { background: "rgba(37,99,235,0.18)", color: "#60a5fa",                 borderBottom: "1px solid rgba(37,99,235,0.4)" },
  "M2":             { background: "rgba(5,150,105,0.18)", color: "#34d399",                 borderBottom: "1px solid rgba(5,150,105,0.4)" },
  "M7":             { background: "rgba(245,158,11,0.18)",color: "#fbbf24",                 borderBottom: "1px solid rgba(245,158,11,0.4)" },
  "M11":            { background: "rgba(168,85,247,0.18)",color: "#c084fc",                 borderBottom: "1px solid rgba(168,85,247,0.4)" },
  "ART15":          { background: "rgba(239,68,68,0.18)", color: "#f87171",                 borderBottom: "1px solid rgba(239,68,68,0.4)" },
};

// ── Umbrales de pérdidas técnicas ─────────────────────────────────────────
// Modificar aquí si cambia el criterio:
//   negativo              → ámbar  (anómalo, no debería haber pérdidas negativas)
//   0 % a NORMAL          → verde  (pérdidas técnicas aceptables)
//   NORMAL % a ALTO       → ámbar  (pérdidas elevadas, vigilar)
//   > ALTO %              → rojo   (pérdidas no normales, revisar)
const PCT_UMBRAL_NORMAL = 8;
const PCT_UMBRAL_ALTO   = 12;

// ── Tipos ──────────────────────────────────────────────────────────────────
type MedidasProps = {
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

// ── Helpers de formato ────────────────────────────────────────────────────
const formatNumberEs = (v: number | null | undefined, decimals = 2): string => {
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

// ── Badge de porcentaje de pérdidas ───────────────────────────────────────
// negativo          → ámbar  (anómalo)
// 0 a NORMAL        → verde  (pérdidas técnicas aceptables)
// NORMAL a ALTO     → ámbar  (vigilar)
// > ALTO            → rojo   (revisar)
function PctCell({ value, pctBadges }: { value: number | null | undefined; pctBadges: boolean }) {
  const text = formatPercentEs(value);
  if (!pctBadges || text === "-") return <>{text}</>;

  let bg: string;
  let color: string;

  if (typeof value !== "number") {
    bg = "rgba(30,58,95,0.2)";    color = "var(--text-muted)";
  } else if (value < 0) {
    bg = "rgba(245,158,11,0.2)";  color = "#fbbf24";   // ámbar — negativo anómalo
  } else if (value <= PCT_UMBRAL_NORMAL) {
    bg = "rgba(5,150,105,0.18)";  color = "#34d399";   // verde — pérdidas normales
  } else if (value <= PCT_UMBRAL_ALTO) {
    bg = "rgba(245,158,11,0.2)";  color = "#fbbf24";   // ámbar — pérdidas elevadas
  } else {
    bg = "rgba(239,68,68,0.18)";  color = "#f87171";   // rojo — revisar
  }

  return (
    <span style={{
      display: "inline-block",
      padding: "1px 6px",
      borderRadius: 4,
      fontSize: "inherit",
      fontWeight: 500,
      background: bg,
      color,
    }}>
      {text}
    </span>
  );
}

export type ColumnDefGeneral = {
  id: string;
  label: string;
  align: "left" | "right";
  group: string;
  render: (m: MedidaGeneral | any, ap: TableAppearance) => React.ReactNode;
};

const STICKY_COLUMN_IDS = ["empresa_id", "empresa_codigo", "punto_id", "anio", "mes"];
const STICKY_WIDTHS: Record<string, number> = {
  empresa_id: 64, empresa_codigo: 110, punto_id: 64, anio: 52, mes: 44,
};

// Fondo sólido equivalente a var(--sticky-bg) con banda alterna encima
// rgba(30,58,95,0.18) sobre rgb(13,27,42) → rgb(20,35,54) aproximado
const STICKY_STRIPE_BG = "rgb(20,35,54)";

const ALL_COLUMNS_GENERAL: ColumnDefGeneral[] = [
  { id: "empresa_id",      label: "Empresa ID",     align: "left",  group: "Identificación", render: (m) => m.empresa_id },
  { id: "empresa_codigo",  label: "Código empresa", align: "left",  group: "Identificación", render: (m) => (m as any).empresa_codigo ?? "-" },
  { id: "punto_id",        label: "Punto",          align: "left",  group: "Identificación", render: (m) => m.punto_id },
  { id: "anio",            label: "Año",            align: "left",  group: "Identificación", render: (m) => m.anio },
  { id: "mes",             label: "Mes",            align: "left",  group: "Identificación", render: (m) => m.mes.toString().padStart(2, "0") },
  { id: "energia_bruta_facturada",         label: "E bruta fact.",  align: "right", group: "General", render: (m) => formatNumberEs(m.energia_bruta_facturada) },
  { id: "energia_autoconsumo_kwh",         label: "E autoc.",       align: "right", group: "General", render: (m) => formatNumberEs(m.energia_autoconsumo_kwh) },
  { id: "energia_neta_facturada_kwh",      label: "E neta fact.",   align: "right", group: "General", render: (m) => formatNumberEs(m.energia_neta_facturada_kwh) },
  { id: "energia_generada_kwh",            label: "E generada",     align: "right", group: "General", render: (m) => formatNumberEs(m.energia_generada_kwh) },
  { id: "energia_frontera_dd_kwh",         label: "E front. DD",    align: "right", group: "General", render: (m) => formatNumberEs(m.energia_frontera_dd_kwh) },
  { id: "energia_pf_final_kwh",            label: "E PF final",     align: "right", group: "General", render: (m) => formatNumberEs(m.energia_pf_final_kwh) },
  { id: "perdidas_e_facturada_kwh",        label: "Pérd. fact. kWh",align: "right", group: "General", render: (m) => formatNumberEs(m.perdidas_e_facturada_kwh) },
  { id: "perdidas_e_facturada_pct",        label: "Pérd. fact. %",  align: "right", group: "General", render: (m, ap) => <PctCell value={m.perdidas_e_facturada_pct} pctBadges={ap.pctBadges} /> },
  { id: "energia_publicada_m2_kwh",        label: "E publ M2",      align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_publicada_m2_kwh) },
  { id: "energia_autoconsumo_m2_kwh",      label: "E autoc M2",     align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_autoconsumo_m2_kwh) },
  { id: "energia_pf_m2_kwh",              label: "E PF M2",        align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_pf_m2_kwh) },
  { id: "energia_frontera_dd_m2_kwh",      label: "E front M2",     align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_frontera_dd_m2_kwh) },
  { id: "energia_generada_m2_kwh",         label: "E gen M2",       align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_generada_m2_kwh) },
  { id: "energia_neta_facturada_m2_kwh",   label: "E neta M2",      align: "right", group: "M2", render: (m) => formatNumberEs(m.energia_neta_facturada_m2_kwh) },
  { id: "perdidas_e_facturada_m2_kwh",     label: "Pérd. M2 kWh",   align: "right", group: "M2", render: (m) => formatNumberEs(m.perdidas_e_facturada_m2_kwh) },
  { id: "perdidas_e_facturada_m2_pct",     label: "Pérd. M2 %",     align: "right", group: "M2", render: (m, ap) => <PctCell value={m.perdidas_e_facturada_m2_pct} pctBadges={ap.pctBadges} /> },
  { id: "energia_publicada_m7_kwh",        label: "E publ M7",      align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_publicada_m7_kwh) },
  { id: "energia_autoconsumo_m7_kwh",      label: "E autoc M7",     align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_autoconsumo_m7_kwh) },
  { id: "energia_pf_m7_kwh",              label: "E PF M7",        align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_pf_m7_kwh) },
  { id: "energia_frontera_dd_m7_kwh",      label: "E front M7",     align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_frontera_dd_m7_kwh) },
  { id: "energia_generada_m7_kwh",         label: "E gen M7",       align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_generada_m7_kwh) },
  { id: "energia_neta_facturada_m7_kwh",   label: "E neta M7",      align: "right", group: "M7", render: (m) => formatNumberEs(m.energia_neta_facturada_m7_kwh) },
  { id: "perdidas_e_facturada_m7_kwh",     label: "Pérd. M7 kWh",   align: "right", group: "M7", render: (m) => formatNumberEs(m.perdidas_e_facturada_m7_kwh) },
  { id: "perdidas_e_facturada_m7_pct",     label: "Pérd. M7 %",     align: "right", group: "M7", render: (m, ap) => <PctCell value={m.perdidas_e_facturada_m7_pct} pctBadges={ap.pctBadges} /> },
  { id: "energia_publicada_m11_kwh",       label: "E publ M11",     align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_publicada_m11_kwh) },
  { id: "energia_autoconsumo_m11_kwh",     label: "E autoc M11",    align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_autoconsumo_m11_kwh) },
  { id: "energia_pf_m11_kwh",             label: "E PF M11",       align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_pf_m11_kwh) },
  { id: "energia_frontera_dd_m11_kwh",     label: "E front M11",    align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_frontera_dd_m11_kwh) },
  { id: "energia_generada_m11_kwh",        label: "E gen M11",      align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_generada_m11_kwh) },
  { id: "energia_neta_facturada_m11_kwh",  label: "E neta M11",     align: "right", group: "M11", render: (m) => formatNumberEs(m.energia_neta_facturada_m11_kwh) },
  { id: "perdidas_e_facturada_m11_kwh",    label: "Pérd. M11 kWh",  align: "right", group: "M11", render: (m) => formatNumberEs(m.perdidas_e_facturada_m11_kwh) },
  { id: "perdidas_e_facturada_m11_pct",    label: "Pérd. M11 %",    align: "right", group: "M11", render: (m, ap) => <PctCell value={m.perdidas_e_facturada_m11_pct} pctBadges={ap.pctBadges} /> },
  { id: "energia_publicada_art15_kwh",     label: "E publ A15",     align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_publicada_art15_kwh) },
  { id: "energia_autoconsumo_art15_kwh",   label: "E autoc A15",    align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_autoconsumo_art15_kwh) },
  { id: "energia_pf_art15_kwh",           label: "E PF A15",       align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_pf_art15_kwh) },
  { id: "energia_frontera_dd_art15_kwh",   label: "E front A15",    align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_frontera_dd_art15_kwh) },
  { id: "energia_generada_art15_kwh",      label: "E gen A15",      align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_generada_art15_kwh) },
  { id: "energia_neta_facturada_art15_kwh",label: "E neta A15",     align: "right", group: "ART15", render: (m) => formatNumberEs(m.energia_neta_facturada_art15_kwh) },
  { id: "perdidas_e_facturada_art15_kwh",  label: "Pérd. A15 kWh",  align: "right", group: "ART15", render: (m) => formatNumberEs(m.perdidas_e_facturada_art15_kwh) },
  { id: "perdidas_e_facturada_art15_pct",  label: "Pérd. A15 %",    align: "right", group: "ART15", render: (m, ap) => <PctCell value={m.perdidas_e_facturada_art15_pct} pctBadges={ap.pctBadges} /> },
];

export const COLUMNS_GENERAL_META = ALL_COLUMNS_GENERAL.map((c) => ({
  id: c.id, label: c.label, group: c.group,
}));

function buildGroupHeaders(cols: ColumnDefGeneral[]) {
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

export default function MedidasGeneralSection({
  token,
  scope = "tenant",
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
  onGoToSettings,
  appearance,
}: MedidasProps) {
  const ap = appearance ?? DEFAULT_APPEARANCE;
  const defaultOrder = useMemo(() => ALL_COLUMNS_GENERAL.map((c) => c.id), []);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const {
    isSistema, data, loading, error, hasLoadedOnce,
    filtroTenant, setFiltroTenant,
    filtroEmpresaIds, setFiltroEmpresaIds,
    filtroAnios, setFiltroAnios,
    filtroMeses, setFiltroMeses,
    opcionesEmpresa, opcionesAnio, opcionesMes, opcionesTenant, opcionesEmpresaFiltradas,
    pageSize, setPageSize, page, setPage,
    totalFilas, totalPages, currentPage, startIndex, endIndex,
    showAdjust, setShowAdjust,
    handleDragStart, handleDrop,
    safeColumnOrder, safeHiddenColumns,
    canEditAdjustments, orderForAdjustments,
    filtrosActivosCount, clearFilters, loadFilters, handleLoadData,
    toggleVisible, resetOrder, hideAllColumns,
  } = useMedidasTable<MedidaGeneral>({
    token, scope,
    filtersEndpointTenant: "/medidas/general/filters",
    filtersEndpointAll: "/medidas/general/all/filters",
    pageEndpointTenant: "/medidas/general/page",
    pageEndpointAll: "/medidas/general/all/page",
    defaultColumnOrder: defaultOrder,
    columnOrder, setColumnOrder, hiddenColumns, setHiddenColumns,
    loadErrorMessage: "Error cargando medidas. Revisa la API y el token.",
  });

  const {
    deleteOpen, deleteBusy, deleteError,
    deletePreviewOpen, setDeletePreviewOpen,
    deletePreviewLoading, deletePreviewError, deletePreviewData,
    canDeleteByFilters, totalDeleteOps, clearDeleteState,
    openDelete, closeDelete, handleOpenDeletePreview, confirmDelete,
  } = useDeleteByIngestion({
    token, isSistema, filtroTenant, filtroEmpresaIds, filtroAnios, filtroMeses, opcionesEmpresa,
    resolveTenantId: (_empresaId, _empresas, tenantActual) => tenantActual || null,
    previewTipo: "GENERAL",
    deleteTipo: "GENERAL",
    previewMissingFiltersMessage: "Selecciona tenant, empresa, año y mes para habilitar la vista previa.",
    deleteErrorMessage: "No se pudo completar el borrado por ingestion de General. Revisa filtros, endpoint y permisos.",
    onAfterDelete: async () => { await loadFilters(); setPage(0); await handleLoadData(0); },
  });

  const systemTenantColumn: ColumnDefGeneral = useMemo(
    () => ({ id: "tenant_id", label: "Cliente", align: "left", group: "Identificación", render: (m) => (m as any).tenant_id ?? "-" }),
    []
  );

  const baseColumns = useMemo(
    () => (isSistema ? [systemTenantColumn, ...ALL_COLUMNS_GENERAL] : ALL_COLUMNS_GENERAL),
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
    const map = new Map<string, ColumnDefGeneral>();
    for (const c of baseColumns) map.set(c.id, c);
    return map;
  }, [baseColumns]);

  const columnasOrdenadas = useMemo(() => {
    const base: ColumnDefGeneral[] = [];
    if (isSistema) { const tcol = columnasPorId.get("tenant_id"); if (tcol) base.push(tcol); }
    for (const id of safeColumnOrder) {
      const col = columnasPorId.get(id);
      if (col && col.id !== "tenant_id") base.push(col);
    }
    const faltantes = ALL_COLUMNS_GENERAL.filter((c) => !safeColumnOrder.includes(c.id));
    const full = [...base, ...faltantes.filter((c) => !base.some((b) => b.id === c.id))];
    if (!safeHiddenColumns || safeHiddenColumns.length === 0) return full;
    return full.filter((c) => !safeHiddenColumns.includes(c.id));
  }, [isSistema, safeColumnOrder, columnasPorId, safeHiddenColumns]);

  const stickyLeftMap = useMemo(() => {
    const map: Record<string, number> = {};
    let acc = 0;
    for (const col of columnasOrdenadas) {
      if (STICKY_COLUMN_IDS.includes(col.id)) { map[col.id] = acc; acc += STICKY_WIDTHS[col.id] ?? 80; }
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
        deletePreviewTitleDisabled="Selecciona tenant, empresa, año y mes para ver la vista previa"
        deleteTitleEnabled="Borrar por ingestion de la familia General usando tenant + empresa + año + mes"
        deleteTitleDisabled="Selecciona tenant, empresa, año y mes para borrar"
      />
      {canEditAdjustments && (
        onGoToSettings ? (
          <button type="button" onClick={onGoToSettings} className="ui-btn ui-btn-outline ui-btn-xs">
            Configurar columnas
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
    const rows: ({ type: "separator"; label: string } | { type: "data"; m: MedidaGeneral })[] = [];
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
          En Sistema, el borrado de General se hace siempre por <strong>ingestion</strong> usando{" "}
          <strong>tenant + empresa + año + mes</strong> y forzando la familia{" "}
          <strong>GENERAL</strong>. Esto no borra PS.
        </div>
      )}

      <MedidasFiltersBar
        isSistema={isSistema} token={token} loading={loading}
        filtroTenant={filtroTenant} setFiltroTenant={setFiltroTenant}
        filtroEmpresaIds={filtroEmpresaIds} setFiltroEmpresaIds={setFiltroEmpresaIds}
        filtroAnios={filtroAnios} setFiltroAnios={setFiltroAnios}
        filtroMeses={filtroMeses} setFiltroMeses={setFiltroMeses}
        opcionesTenant={opcionesTenant}
        empresaOptions={empresaOptions} anioOptions={anioOptions} mesOptions={mesOptions}
        empresaPlaceholder="Todas" anioPlaceholder="Todos" mesPlaceholder="Todos"
        filtrosActivosCount={filtrosActivosCount}
        adjustButton={adjustButton}
      />

      {showAdjust && (
        <ColumnVisibilityOrderPanel
          show={showAdjust} onToggleShow={() => setShowAdjust((v) => !v)}
          canEdit={canEditAdjustments} order={orderForAdjustments} hiddenColumns={safeHiddenColumns}
          columnsMeta={isSistema ? [{ id: "tenant_id", label: "Cliente", group: "Identificación" }, ...COLUMNS_GENERAL_META] : COLUMNS_GENERAL_META}
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
                const isSticky = STICKY_COLUMN_IDS.includes(col.id) && col.id in stickyLeftMap;
                return (
                  <th key={col.id}
                    className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")}
                    style={isSticky ? {
                      position: "sticky", left: stickyLeftMap[col.id], zIndex: 3,
                      background: "var(--sticky-head-bg)", boxShadow: "2px 0 4px rgba(0,0,0,0.3)",
                      minWidth: STICKY_WIDTHS[col.id] ?? 80, maxWidth: STICKY_WIDTHS[col.id] ?? 80,
                      width: STICKY_WIDTHS[col.id] ?? 80, whiteSpace: "nowrap",
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
                  No hay medidas que cumplan los filtros.
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
              const rowKey = `${m.empresa_id}-${m.punto_id}-${m.anio}-${m.mes}-${m.tenant_id ?? "x"}`;
              const isSelected = selectedRowKey === rowKey;
              const dataIdx = dataRows.slice(0, rowIdx + 1).filter((r) => r.type === "data").length - 1;
              const isEven = dataIdx % 2 === 1;
              const hasStripe = ap.stripedRows && isEven && !isSelected;
              const stripeBg = hasStripe ? "rgba(30,58,95,0.18)" : undefined;

              return (
                <tr key={rowKey} className="ui-tr"
                  onClick={() => setSelectedRowKey(isSelected ? null : rowKey)}
                  style={{
                    cursor: "pointer",
                    background: isSelected ? "var(--nav-item-hover)" : stripeBg,
                    outline: isSelected ? "1px solid var(--btn-secondary-bg)" : undefined,
                  }}
                >
                  {columnasOrdenadas.map((col) => {
                    const isSticky = STICKY_COLUMN_IDS.includes(col.id) && col.id in stickyLeftMap;
                    // Las celdas sticky necesitan fondo sólido para no transparentarse
                    const stickyBg = isSelected
                      ? "var(--sticky-selected-bg)"
                      : hasStripe
                        ? STICKY_STRIPE_BG
                        : "var(--sticky-bg)";
                    return (
                      <td key={col.id}
                        className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")}
                        style={isSticky ? {
                          position: "sticky", left: stickyLeftMap[col.id], zIndex: 1,
                          background: stickyBg,
                          boxShadow: "2px 0 4px rgba(0,0,0,0.3)",
                          minWidth: STICKY_WIDTHS[col.id] ?? 80, maxWidth: STICKY_WIDTHS[col.id] ?? 80,
                          width: STICKY_WIDTHS[col.id] ?? 80,
                        } : undefined}
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
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Borrar por ingestion · General · Sistema"
        description={
          canDeleteByFilters
            ? `Se van a lanzar ${totalDeleteOps} operación(es) de borrado por ingestion de la familia GENERAL usando tenant + empresa + año + mes. Esto elimina contribuciones y medidas derivadas de General, sin tocar PS.`
            : "Selecciona tenant, empresa, año y mes para habilitar el borrado."
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
