"use client";

import { useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { DeleteImpactPreview } from "../../../types";
import { aggregateDeletePreviews } from "../../utils/deletePreviewAggregation";

type UseDeleteByIngestionParams<TEmpresaOption> = {
  token: string | null;
  isSistema: boolean;
  filtroTenant: string;
  filtroEmpresaIds: string[];
  filtroAnios: string[];
  filtroMeses: string[];
  opcionesEmpresa: TEmpresaOption[];
  resolveTenantId: (
    empresaId: string,
    empresas: TEmpresaOption[],
    filtroTenant: string
  ) => string | null;
  previewTipo?: string;
  deleteTipo?: string;
  previewMissingFiltersMessage: string;
  deleteErrorMessage: string;
  onAfterDelete?: () => Promise<void>;
};

type DeleteTask = {
  tenantId: string;
  empresaId: string;
  anio: string;
  mes: string;
};

export function useDeleteByIngestion<
  TEmpresaOption extends { id: number; tenant_id?: number | null }
>({
  token,
  isSistema,
  filtroTenant,
  filtroEmpresaIds,
  filtroAnios,
  filtroMeses,
  opcionesEmpresa,
  resolveTenantId,
  previewTipo,
  deleteTipo,
  previewMissingFiltersMessage,
  deleteErrorMessage,
  onAfterDelete,
}: UseDeleteByIngestionParams<TEmpresaOption>) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [deletePreviewOpen, setDeletePreviewOpen] = useState(false);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletePreviewError, setDeletePreviewError] = useState<string | null>(null);
  const [deletePreviewData, setDeletePreviewData] = useState<DeleteImpactPreview | null>(null);

  const canDeleteByFilters =
    isSistema &&
    filtroEmpresaIds.length > 0 &&
    filtroAnios.length > 0 &&
    filtroMeses.length > 0;

  const totalDeleteOps = useMemo(() => {
    if (!canDeleteByFilters) return 0;
    return filtroEmpresaIds.length * filtroAnios.length * filtroMeses.length;
  }, [canDeleteByFilters, filtroEmpresaIds, filtroAnios, filtroMeses]);

  const clearDeleteState = () => {
    setDeletePreviewData(null);
    setDeletePreviewError(null);
    setDeleteError(null);
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

  const buildTasks = (): DeleteTask[] => {
    const tasks: DeleteTask[] = [];

    for (const empresaId of filtroEmpresaIds) {
      const tenantId = resolveTenantId(empresaId, opcionesEmpresa, filtroTenant);

      if (!tenantId) {
        throw new Error(`No se pudo resolver tenant_id para empresa ${empresaId}`);
      }

      for (const anio of filtroAnios) {
        for (const mes of filtroMeses) {
          tasks.push({
            tenantId,
            empresaId,
            anio,
            mes,
          });
        }
      }
    }

    return tasks;
  };

  const handleOpenDeletePreview = async () => {
    if (!token || !isSistema) return;

    if (!canDeleteByFilters) {
      setDeletePreviewError(previewMissingFiltersMessage);
      return;
    }

    setDeletePreviewLoading(true);
    setDeletePreviewError(null);
    setDeletePreviewData(null);

    try {
      const previews: DeleteImpactPreview[] = [];
      const tasks = buildTasks();

      for (const task of tasks) {
        const params = new URLSearchParams();
        params.set("tenant_id", task.tenantId);
        params.set("empresa_id", task.empresaId);
        params.set("anio", task.anio);
        params.set("mes", task.mes);

        if (previewTipo) {
          params.set("tipo", previewTipo);
        }

        const res = await fetch(
          `${API_BASE_URL}/ingestion/files/delete-preview?${params.toString()}`,
          {
            headers: getAuthHeaders(token),
          }
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Error ${res.status}`);
        }

        const json = (await res.json()) as DeleteImpactPreview;
        previews.push(json);
      }

      const aggregated = aggregateDeletePreviews(previews);
      setDeletePreviewData(aggregated);
      setDeletePreviewOpen(true);
    } catch (e) {
      console.error("Error cargando preview de borrado por ingestion:", e);
      setDeletePreviewError("No se pudo calcular la vista previa del borrado.");
    } finally {
      setDeletePreviewLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !isSistema) return;
    if (!canDeleteByFilters) return;

    setDeleteBusy(true);
    setDeleteError(null);

    try {
      const tasks = buildTasks();

      for (const task of tasks) {
        const params = new URLSearchParams();
        params.set("tenant_id", task.tenantId);
        params.set("empresa_id", task.empresaId);
        params.set("anio", task.anio);
        params.set("mes", task.mes);

        if (deleteTipo) {
          params.set("tipo", deleteTipo);
        }

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
      setDeletePreviewOpen(false);
      setDeletePreviewData(null);
      setDeletePreviewError(null);
      setDeleteError(null);

      await onAfterDelete?.();
    } catch (e) {
      console.error("Error borrando por ingestion:", e);
      setDeleteError(deleteErrorMessage);
    } finally {
      setDeleteBusy(false);
    }
  };

  return {
    deleteOpen,
    setDeleteOpen,
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
  };
}