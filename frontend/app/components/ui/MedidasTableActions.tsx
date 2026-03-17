"use client";

type MedidasTableActionsProps = {
  loading: boolean;
  token: string | null;
  isSistema: boolean;

  canDeleteByFilters: boolean;
  totalDeleteOps: number;
  deletePreviewLoading: boolean;

  filtrosActivosCount: number;

  onRefresh: () => void;
  onOpenDeletePreview: () => void;
  onOpenDelete: () => void;
  onClearFilters: () => void;

  refreshText?: string;
  refreshLoadingText?: string;
  deletePreviewText?: string;
  deletePreviewLoadingText?: string;
  deleteText?: string;

  deletePreviewTitleEnabled?: string;
  deletePreviewTitleDisabled?: string;
  deleteTitleEnabled?: string;
  deleteTitleDisabled?: string;
  clearFiltersTitle?: string;
};

export default function MedidasTableActions({
  loading,
  token,
  isSistema,

  canDeleteByFilters,
  totalDeleteOps,
  deletePreviewLoading,

  filtrosActivosCount,

  onRefresh,
  onOpenDeletePreview,
  onOpenDelete,
  onClearFilters,

  refreshText = "Actualizar",
  refreshLoadingText = "Actualizando...",
  deletePreviewText = "Vista previa borrado",
  deletePreviewLoadingText = "Calculando preview...",
  deleteText = "Borrar…",

  deletePreviewTitleEnabled = "Ver impacto antes de borrar",
  deletePreviewTitleDisabled = "Completa los filtros necesarios para ver la vista previa",
  deleteTitleEnabled = "Borrar por ingestion usando los filtros activos",
  deleteTitleDisabled = "Completa los filtros necesarios para borrar",
  clearFiltersTitle = "Limpiar filtros",
}: MedidasTableActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onRefresh}
        disabled={loading || !token}
        className="ui-btn ui-btn-primary"
        type="button"
      >
        {loading ? refreshLoadingText : refreshText}
      </button>

      {isSistema && (
        <>
          <button
            onClick={onOpenDeletePreview}
            disabled={loading || !token || deletePreviewLoading || !canDeleteByFilters}
            className="ui-btn ui-btn-outline"
            type="button"
            title={canDeleteByFilters ? deletePreviewTitleEnabled : deletePreviewTitleDisabled}
          >
            {deletePreviewLoading ? deletePreviewLoadingText : deletePreviewText}
          </button>

          <button
            onClick={onOpenDelete}
            disabled={loading || !token || !canDeleteByFilters}
            className="ui-btn ui-btn-danger"
            type="button"
            title={canDeleteByFilters ? deleteTitleEnabled : deleteTitleDisabled}
          >
            {deleteText}
            {totalDeleteOps > 0 ? (
              <span className="ui-badge ui-badge--neutral" style={{ marginLeft: 6 }}>
                {totalDeleteOps}
              </span>
            ) : null}
          </button>
        </>
      )}

      {filtrosActivosCount > 0 && (
        <button
          type="button"
          onClick={onClearFilters}
          disabled={loading}
          className="ui-btn ui-btn-outline"
          title={clearFiltersTitle}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}