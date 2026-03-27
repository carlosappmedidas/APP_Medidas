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

type MedidasPsProps = {
  token: string | null;
  scope?: "tenant" | "all";
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;
  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;
};

export type ColumnDefPs = {
  id: string;
  label: string;
  align: "left" | "right";
  group: string;
  render: (m: MedidaPS | any) => any;
};

const formatNumberEs = (v: number | null | undefined, decimals: number = 2): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

// Columnas fijas a la izquierda (PS no tiene punto_id)
const STICKY_COLUMN_IDS_PS = ["empresa_id", "empresa_codigo", "anio", "mes"];
const STICKY_WIDTHS_PS: Record<string, number> = {
  empresa_id: 64,
  empresa_codigo: 110,
  anio: 52,
  mes: 44,
};

const ALL_COLUMNS_PS: ColumnDefPs[] = [
  // ── Identificación ────────────────────────────────────────────────────
  { id: "empresa_id", label: "Empresa ID", align: "left", group: "Identificación", render: (m) => m.empresa_id },
  { id: "empresa_codigo", label: "Código empresa", align: "left", group: "Identificación", render: (m) => m.empresa_codigo ?? "-" },
  { id: "anio", label: "Año", align: "left", group: "Identificación", render: (m) => m.anio },
  { id: "mes", label: "Mes", align: "left", group: "Identificación", render: (m) => m.mes.toString().padStart(2, "0") },
  // ── Energía PS por tipo ───────────────────────────────────────────────
  { id: "energia_ps_tipo_1_kwh", label: "E PS tipo 1", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_1_kwh) },
  { id: "energia_ps_tipo_2_kwh", label: "E PS tipo 2", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_2_kwh) },
  { id: "energia_ps_tipo_3_kwh", label: "E PS tipo 3", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_3_kwh) },
  { id: "energia_ps_tipo_4_kwh", label: "E PS tipo 4", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_4_kwh) },
  { id: "energia_ps_tipo_5_kwh", label: "E PS tipo 5", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_tipo_5_kwh) },
  { id: "energia_ps_total_kwh", label: "E PS total", align: "right", group: "Energía PS", render: (m) => formatNumberEs(m.energia_ps_total_kwh) },
  // ── CUPS PS por tipo ──────────────────────────────────────────────────
  { id: "cups_tipo_1", label: "CUPS tipo 1", align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_1 ?? "-" },
  { id: "cups_tipo_2", label: "CUPS tipo 2", align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_2 ?? "-" },
  { id: "cups_tipo_3", label: "CUPS tipo 3", align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_3 ?? "-" },
  { id: "cups_tipo_4", label: "CUPS tipo 4", align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_4 ?? "-" },
  { id: "cups_tipo_5", label: "CUPS tipo 5", align: "right", group: "CUPS PS", render: (m) => m.cups_tipo_5 ?? "-" },
  { id: "cups_total", label: "CUPS total", align: "right", group: "CUPS PS", render: (m) => m.cups_total ?? "-" },
  // ── Importes PS por tipo ──────────────────────────────────────────────
  { id: "importe_tipo_1_eur", label: "Importe tipo 1", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_1_eur) },
  { id: "importe_tipo_2_eur", label: "Importe tipo 2", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_2_eur) },
  { id: "importe_tipo_3_eur", label: "Importe tipo 3", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_3_eur) },
  { id: "importe_tipo_4_eur", label: "Importe tipo 4", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_4_eur) },
  { id: "importe_tipo_5_eur", label: "Importe tipo 5", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_tipo_5_eur) },
  { id: "importe_total_eur", label: "Importe total", align: "right", group: "Importes PS", render: (m) => formatNumberEs(m.importe_total_eur) },
  // ── Energía por tarifa ────────────────────────────────────────────────
  { id: "energia_tarifa_20td_kwh", label: "E 2.0TD", align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_20td_kwh) },
  { id: "energia_tarifa_30td_kwh", label: "E 3.0TD", align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_30td_kwh) },
  { id: "energia_tarifa_30tdve_kwh", label: "E 3.0TDVE", align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_30tdve_kwh) },
  { id: "energia_tarifa_61td_kwh", label: "E 6.1TD", align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_61td_kwh) },
  { id: "energia_tarifa_total_kwh", label: "E Tarifas Total", align: "right", group: "Energía Tarifas", render: (m) => formatNumberEs(m.energia_tarifa_total_kwh) },
  // ── CUPS por tarifa ───────────────────────────────────────────────────
  { id: "cups_tarifa_20td", label: "CUPS 2.0TD", align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_20td ?? "-" },
  { id: "cups_tarifa_30td", label: "CUPS 3.0TD", align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_30td ?? "-" },
  { id: "cups_tarifa_30tdve", label: "CUPS 3.0TDVE", align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_30tdve ?? "-" },
  { id: "cups_tarifa_61td", label: "CUPS 6.1TD", align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_61td ?? "-" },
  { id: "cups_tarifa_total", label: "CUPS Tarifas Total", align: "right", group: "CUPS Tarifas", render: (m) => m.cups_tarifa_total ?? "-" },
  // ── Importes por tarifa ───────────────────────────────────────────────
  { id: "importe_tarifa_20td_eur", label: "Importe 2.0TD", align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_20td_eur) },
  { id: "importe_tarifa_30td_eur", label: "Importe 3.0TD", align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_30td_eur) },
  { id: "importe_tarifa_30tdve_eur", label: "Importe 3.0TDVE", align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_30tdve_eur) },
  { id: "importe_tarifa_61td_eur", label: "Importe 6.1TD", align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_61td_eur) },
  { id: "importe_tarifa_total_eur", label: "Importe Tarifas Total", align: "right", group: "Importes Tarifas", render: (m) => formatNumberEs(m.importe_tarifa_total_eur) },
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
  const defaultOrder = useMemo(() => ALL_COLUMNS_PS.map((c) => c.id), []);

  // Fila seleccionada (solo visual)
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const {
    isSistema,
    data,
    loading,
    error,
    hasLoadedOnce,
    filtroTenant,
    setFiltroTenant,
    filtroEmpresaIds,
    setFiltroEmpresaIds,
    filtroAnios,
    setFiltroAnios,
    filtroMeses,
    setFiltroMeses,
    opcionesEmpresa,
    opcionesAnio,
    opcionesMes,
    opcionesTenant,
    opcionesEmpresaFiltradas,
    pageSize,
    setPageSize,
    page,
    setPage,
    totalFilas,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
    showAdjust,
    setShowAdjust,
    handleDragStart,
    handleDrop,
    safeColumnOrder,
    safeHiddenColumns,
    canEditAdjustments,
    orderForAdjustments,
    filtrosActivosCount,
    clearFilters,
    loadFilters,
    handleLoadData,
    toggleVisible,
    resetOrder,
    hideAllColumns,
  } = useMedidasTable<MedidaPS>({
    token,
    scope,
    filtersEndpointTenant: "/medidas/ps/filters",
    filtersEndpointAll: "/medidas/ps/all/filters",
    pageEndpointTenant: "/medidas/ps/page",
    pageEndpointAll: "/medidas/ps/all/page",
    defaultColumnOrder: defaultOrder,
    columnOrder,
    setColumnOrder,
    hiddenColumns,
    setHiddenColumns,
    loadErrorMessage: "Error cargando medidas PS. Revisa la API y el token.",
  });

  const {
    deleteOpen,
    deleteBusy,
    deleteError,
    deletePreviewOpen,
    setDeletePreviewOpen,
    deletePreviewLoading,
    deletePreviewError,
    deletePreviewData,
    canDeleteByFilters,
    totalDeleteOps,
    clearDeleteState,
    openDelete,
    closeDelete,
    handleOpenDeletePreview,
    confirmDelete,
  } = useDeleteByIngestion({
    token,
    isSistema,
    filtroTenant,
    filtroEmpresaIds,
    filtroAnios,
    filtroMeses,
    opcionesEmpresa,
    resolveTenantId: (empresaId, empresas, tenantActual) => {
      const empresa = empresas.find((e) => String(e.id) === empresaId);
      if (empresa?.tenant_id != null) return String(empresa.tenant_id);
      return tenantActual || null;
    },
    previewTipo: "PS",
    deleteTipo: "PS",
    previewMissingFiltersMessage:
      "Selecciona al menos empresa, año y mes para habilitar la vista previa.",
    deleteErrorMessage:
      "No se pudo completar el borrado por ingestion de PS. Revisa filtros, endpoint y permisos.",
    onAfterDelete: async () => {
      await loadFilters();
      setPage(0);
      await handleLoadData(0);
    },
  });

  const systemTenantColumn: ColumnDefPs = useMemo(
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
    return isSistema ? [systemTenantColumn, ...ALL_COLUMNS_PS] : ALL_COLUMNS_PS;
  }, [isSistema, systemTenantColumn]);

  const empresaOptions = useMemo(() => {
    const source = isSistema ? opcionesEmpresaFiltradas : opcionesEmpresa;
    return source.map((e) => ({
      value: String(e.id),
      label:
        `${e.nombre ?? e.codigo ?? `Empresa ${e.id}`}` +
        (isSistema && typeof e.tenant_id === "number" ? ` · T${e.tenant_id}` : ""),
    }));
  }, [isSistema, opcionesEmpresa, opcionesEmpresaFiltradas]);

  const anioOptions = useMemo(
    () => opcionesAnio.map((anio) => ({ value: String(anio), label: String(anio) })),
    [opcionesAnio]
  );

  const mesOptions = useMemo(
    () =>
      opcionesMes.map((mes) => ({
        value: String(mes),
        label: mes.toString().padStart(2, "0"),
      })),
    [opcionesMes]
  );

  const columnasPorId = useMemo(() => {
    const map = new Map<string, ColumnDefPs>();
    for (const c of baseColumns) map.set(c.id, c);
    return map;
  }, [baseColumns]);

  const columnasOrdenadas = useMemo(() => {
    const base: ColumnDefPs[] = [];
    if (isSistema) {
      const tcol = columnasPorId.get("tenant_id");
      if (tcol) base.push(tcol);
    }
    for (const id of safeColumnOrder) {
      const col = columnasPorId.get(id);
      if (col && col.id !== "tenant_id") base.push(col);
    }
    const faltantes = ALL_COLUMNS_PS.filter((c) => !safeColumnOrder.includes(c.id));
    const full = [...base, ...faltantes.filter((c) => !base.some((b) => b.id === c.id))];
    if (!safeHiddenColumns || safeHiddenColumns.length === 0) return full;
    return full.filter((c) => !safeHiddenColumns.includes(c.id));
  }, [isSistema, safeColumnOrder, columnasPorId, safeHiddenColumns]);

  // Calcula el `left` acumulado de cada columna sticky visible
  const stickyLeftMap = useMemo(() => {
    const map: Record<string, number> = {};
    let acc = 0;
    for (const col of columnasOrdenadas) {
      if (STICKY_COLUMN_IDS_PS.includes(col.id)) {
        map[col.id] = acc;
        acc += STICKY_WIDTHS_PS[col.id] ?? 80;
      }
    }
    return map;
  }, [columnasOrdenadas]);

  const totalColumnas = columnasOrdenadas.length || 1;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  return (
    <section className="ui-card text-sm">
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">
            Medidas (PS){scope === "all" ? " · Sistema" : ""}
          </h4>
          <p className="ui-card-subtitle">
            Resumen mensual de PS por empresa, tarifa y tipo.
          </p>
        </div>
        <MedidasTableActions
          loading={loading}
          token={token}
          isSistema={isSistema}
          canDeleteByFilters={canDeleteByFilters}
          totalDeleteOps={totalDeleteOps}
          deletePreviewLoading={deletePreviewLoading}
          filtrosActivosCount={filtrosActivosCount}
          onRefresh={() => void handleLoadData(page)}
          onOpenDeletePreview={() => void handleOpenDeletePreview()}
          onOpenDelete={openDelete}
          onClearFilters={() => {
            clearFilters();
            clearDeleteState();
          }}
          deletePreviewTitleEnabled="Ver impacto antes de borrar"
          deletePreviewTitleDisabled="Selecciona al menos empresa, año y mes para ver la vista previa"
          deleteTitleEnabled="Borrar por ingestion de la familia PS usando empresa + año + mes"
          deleteTitleDisabled="Selecciona al menos empresa, año y mes para borrar"
        />
      </header>

      {error && <div className="ui-alert ui-alert--danger mb-4">{error}</div>}
      {deletePreviewError && (
        <div className="ui-alert ui-alert--danger mb-4">{deletePreviewError}</div>
      )}

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
          En Sistema, el borrado de PS se hace siempre por{" "}
          <strong>ingestion</strong> usando los filtros activos y forzando la familia{" "}
          <strong>PS</strong>. Selecciona al menos{" "}
          <strong>empresa + año + mes</strong>. Esto no borra General.
        </div>
      )}

      <MedidasFiltersBar
        isSistema={isSistema}
        token={token}
        loading={loading}
        filtroTenant={filtroTenant}
        setFiltroTenant={setFiltroTenant}
        filtroEmpresaIds={filtroEmpresaIds}
        setFiltroEmpresaIds={setFiltroEmpresaIds}
        filtroAnios={filtroAnios}
        setFiltroAnios={setFiltroAnios}
        filtroMeses={filtroMeses}
        setFiltroMeses={setFiltroMeses}
        opcionesTenant={opcionesTenant}
        empresaOptions={empresaOptions}
        anioOptions={anioOptions}
        mesOptions={mesOptions}
        empresaPlaceholder="Todas"
        anioPlaceholder="Todos"
        mesPlaceholder="Todos"
        compact
      />

      <ColumnVisibilityOrderPanel
        show={showAdjust}
        onToggleShow={() => setShowAdjust((v) => !v)}
        canEdit={canEditAdjustments}
        order={orderForAdjustments}
        hiddenColumns={safeHiddenColumns}
        columnsMeta={
          isSistema
            ? [{ id: "tenant_id", label: "Cliente", group: "Identificación" }, ...COLUMNS_PS_META]
            : COLUMNS_PS_META
        }
        onToggleVisible={toggleVisible}
        onReset={resetOrder}
        onHideAll={hideAllColumns}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      <div className="ui-table-wrap">
        <table
          className="ui-table text-[11px]"
          style={{ borderCollapse: "separate", borderSpacing: 0 }}
        >
          <thead className="ui-thead">
            <tr>
              {columnasOrdenadas.map((col) => {
                const isSticky =
                  STICKY_COLUMN_IDS_PS.includes(col.id) && col.id in stickyLeftMap;
                return (
                  <th
                    key={col.id}
                    className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")}
                    style={
                      isSticky
                        ? {
                            position: "sticky",
                            left: stickyLeftMap[col.id],
                            zIndex: 3,
                            // MEJORA B: fondo opaco para que no se transparente al scrollar
                            background: "var(--sticky-head-bg)",
                            boxShadow: "2px 0 4px rgba(0,0,0,0.3)",
                            minWidth: STICKY_WIDTHS_PS[col.id] ?? 80,
                            maxWidth: STICKY_WIDTHS_PS[col.id] ?? 80,
                            width: STICKY_WIDTHS_PS[col.id] ?? 80,
                          }
                        : undefined
                    }
                  >
                    {col.label}
                  </th>
                );
              })}
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
              data.map((m: any) => {
                const rowKey = `${m.empresa_id}-${m.anio}-${m.mes}-${m.tenant_id ?? "x"}`;
                const isSelected = selectedRowKey === rowKey;
                return (
                  <tr
                    key={rowKey}
                    className="ui-tr"
                    onClick={() => setSelectedRowKey(isSelected ? null : rowKey)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "var(--nav-item-hover)" : undefined,
                      outline: isSelected ? "1px solid var(--btn-secondary-bg)" : undefined,
                    }}
                  >
                    {columnasOrdenadas.map((col) => {
                      const isSticky =
                        STICKY_COLUMN_IDS_PS.includes(col.id) && col.id in stickyLeftMap;
                      return (
                        <td
                          key={col.id}
                          className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")}
                          style={
                            isSticky
                              ? {
                                  position: "sticky",
                                  left: stickyLeftMap[col.id],
                                  zIndex: 1,
                                  // MEJORA B: fondo opaco — respeta selección de fila
                                  background: isSelected
                                    ? "var(--sticky-selected-bg)"
                                    : "var(--sticky-bg)",
                                  boxShadow: "2px 0 4px rgba(0,0,0,0.3)",
                                  minWidth: STICKY_WIDTHS_PS[col.id] ?? 80,
                                  maxWidth: STICKY_WIDTHS_PS[col.id] ?? 80,
                                  width: STICKY_WIDTHS_PS[col.id] ?? 80,
                                }
                              : undefined
                          }
                        >
                          {col.render(m)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
        <TablePaginationFooter
          loading={loading}
          hasLoadedOnce={hasLoadedOnce}
          totalFilas={totalFilas}
          startIndex={startIndex}
          endIndex={endIndex}
          pageSize={pageSize}
          setPageSize={setPageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          setPage={setPage}
          compact
        />
      </div>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Borrar por ingestion · PS · Sistema"
        description={
          canDeleteByFilters
            ? `Se van a lanzar ${totalDeleteOps} operación(es) de borrado por ingestion de la familia PS usando empresa + año + mes. Esto elimina detalles, contribuciones y medidas derivadas de PS, sin tocar General.`
            : "Selecciona al menos empresa, año y mes para habilitar el borrado."
        }
        error={deleteError}
        loading={deleteBusy}
        loadingText="Borrando..."
        confirmText="Borrar definitivamente"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
      <DeletePreviewModal
        open={deletePreviewOpen}
        preview={deletePreviewData}
        loading={deleteBusy}
        onClose={() => {
          if (deleteBusy) return;
          setDeletePreviewOpen(false);
        }}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
