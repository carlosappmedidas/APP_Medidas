"use client";

import { useMemo } from "react";
import type { MedidaGeneral } from "../types";
import DeletePreviewModal from "./ui/DeletePreviewModal";
import ConfirmDeleteModal from "./ui/ConfirmDeleteModal";
import ColumnVisibilityOrderPanel from "./ui/ColumnVisibilityOrderPanel";
import TablePaginationFooter from "./ui/TablePaginationFooter";
import MedidasFiltersBar from "./ui/MedidasFiltersBar";
import MedidasTableActions from "./ui/MedidasTableActions";
import { useMedidasTable } from "./hooks/useMedidasTable";
import { useDeleteByIngestion } from "./hooks/useDeleteByIngestion";

type MedidasProps = {
  token: string | null;
  scope?: "tenant" | "all";
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;
  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;
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

export default function MedidasGeneralSection({
  token,
  scope = "tenant",
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
}: MedidasProps) {
  const defaultOrder = useMemo(() => ALL_COLUMNS_GENERAL.map((c) => c.id), []);

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
  } = useMedidasTable<MedidaGeneral>({
    token,
    scope,
    filtersEndpointTenant: "/medidas/general/filters",
    filtersEndpointAll: "/medidas/general/all/filters",
    pageEndpointTenant: "/medidas/general/page",
    pageEndpointAll: "/medidas/general/all/page",
    defaultColumnOrder: defaultOrder,
    columnOrder,
    setColumnOrder,
    hiddenColumns,
    setHiddenColumns,
    loadErrorMessage: "Error cargando medidas. Revisa la API y el token.",
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
    resolveTenantId: (_empresaId, _empresas, tenantActual) => tenantActual || null,
    previewTipo: "GENERAL",
    deleteTipo: "GENERAL",
    previewMissingFiltersMessage:
      "Selecciona tenant, empresa, año y mes para habilitar la vista previa.",
    deleteErrorMessage:
      "No se pudo completar el borrado por ingestion de General. Revisa filtros, endpoint y permisos.",
    onAfterDelete: async () => {
      await loadFilters();
      setPage(0);
      await handleLoadData(0);
    },
  });

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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  return (
    <section className="ui-card text-sm">
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">Medidas (General){isSistema ? " · Sistema" : ""}</h4>
          <p className="ui-card-subtitle">Resumen mensual de energía por empresa.</p>
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
          deletePreviewTitleDisabled="Selecciona tenant, empresa, año y mes para ver la vista previa"
          deleteTitleEnabled="Borrar por ingestion de la familia General usando tenant + empresa + año + mes"
          deleteTitleDisabled="Selecciona tenant, empresa, año y mes para borrar"
        />
      </header>

      {error && <div className="ui-alert ui-alert--danger mb-4">{error}</div>}
      {deletePreviewError && <div className="ui-alert ui-alert--danger mb-4">{deletePreviewError}</div>}

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
          En Sistema, el borrado de General se hace siempre por <strong>ingestion</strong> usando
          <strong> tenant + empresa + año + mes</strong> y forzando la familia
          <strong> GENERAL</strong>. Esto no borra PS.
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
      />

      <ColumnVisibilityOrderPanel
        show={showAdjust}
        onToggleShow={() => setShowAdjust((v) => !v)}
        canEdit={canEditAdjustments}
        order={orderForAdjustments}
        hiddenColumns={safeHiddenColumns}
        columnsMeta={
          isSistema
            ? [{ id: "tenant_id", label: "Cliente", group: "Identificación" }, ...COLUMNS_GENERAL_META]
            : COLUMNS_GENERAL_META
        }
        onToggleVisible={toggleVisible}
        onReset={resetOrder}
        onHideAll={hideAllColumns}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

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
        />
      </div>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Borrar por ingestion · General · Sistema"
        description={
          canDeleteByFilters
            ? `Se van a lanzar ${totalDeleteOps} operación(es) de borrado por ingestion de la familia GENERAL usando tenant + empresa + año + mes. Esto elimina contribuciones y medidas derivadas de General, sin tocar PS.`
            : "Selecciona tenant, empresa, año y mes para habilitar el borrado."
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