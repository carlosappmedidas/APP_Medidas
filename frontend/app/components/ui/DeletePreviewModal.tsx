// app/components/ui/DeletePreviewModal.tsx
"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import type {
  DeleteImpactPeriod,
  DeleteImpactPreview,
  DeleteImpactRefactura,
} from "@/app/types";

type Props = {
  open: boolean;
  preview: DeleteImpactPreview | null;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

function formatPeriodo(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function formatKwh(value?: number | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} kWh`;
}

function formatFilterValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function groupPeriodsByEmpresa(periods: DeleteImpactPeriod[]) {
  const map = new Map<string, DeleteImpactPeriod[]>();

  for (const item of periods) {
    const key = `${item.tenant_id}-${item.empresa_id}`;
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([key, values]) => {
      const [tenant_id, empresa_id] = key.split("-").map(Number);
      const sorted = [...values].sort((a, b) => {
        if (a.anio !== b.anio) return a.anio - b.anio;
        return a.mes - b.mes;
      });

      return {
        tenant_id,
        empresa_id,
        periods: sorted,
      };
    })
    .sort((a, b) => a.empresa_id - b.empresa_id || a.tenant_id - b.tenant_id);
}

function groupRefacturasByAffectedPeriod(items: DeleteImpactRefactura[]) {
  const map = new Map<string, DeleteImpactRefactura[]>();

  for (const item of items) {
    const key = `${item.affected_period.anio}-${item.affected_period.mes}`;
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([key, values]) => {
      const [anio, mes] = key.split("-").map(Number);
      const sorted = [...values].sort((a, b) => {
        if (a.source_period.anio !== b.source_period.anio) {
          return a.source_period.anio - b.source_period.anio;
        }
        return a.source_period.mes - b.source_period.mes;
      });

      return {
        affected_period: { anio, mes },
        items: sorted,
      };
    })
    .sort((a, b) => {
      if (a.affected_period.anio !== b.affected_period.anio) {
        return a.affected_period.anio - b.affected_period.anio;
      }
      return a.affected_period.mes - b.affected_period.mes;
    });
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="ui-card ui-card--border">
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function DeletePreviewModal({
  open,
  preview,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  const titleId = useId();
  const descId = useId();

  const [expandedFilters, setExpandedFilters] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState(true);
  const [expandedRefacturas, setExpandedRefacturas] = useState(true);
  const [expandedGeneral, setExpandedGeneral] = useState(true);
  const [expandedPS, setExpandedPS] = useState(false);
  const [expandedOrphans, setExpandedOrphans] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, loading]);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
    }
  }, [open]);

  const generalGrouped = useMemo(
    () => groupPeriodsByEmpresa(preview?.affected_general_periods ?? []),
    [preview]
  );

  const psGrouped = useMemo(
    () => groupPeriodsByEmpresa(preview?.affected_ps_periods ?? []),
    [preview]
  );

  const orphanGeneralGrouped = useMemo(
    () => groupPeriodsByEmpresa(preview?.orphan_medidas_general_candidates ?? []),
    [preview]
  );

  const orphanPSGrouped = useMemo(
    () => groupPeriodsByEmpresa(preview?.orphan_medidas_ps_candidates ?? []),
    [preview]
  );

  const refacturasGrouped = useMemo(
    () => groupRefacturasByAffectedPeriod(preview?.refacturas_m1 ?? []),
    [preview]
  );

  if (!open || !preview) return null;

  const summary = preview.summary;
  const canConfirm = confirmText.trim().toUpperCase() === "BORRAR";

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onMouseDown={handleBackdropClick}
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="ui-card ui-card--border w-full max-w-6xl max-h-[90vh] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 border-b pb-3">
          <h4 id={titleId} className="ui-card-title">
            Vista previa del borrado
          </h4>
          <p id={descId} className="ui-card-subtitle">
            Revisa exactamente qué se va a borrar, qué periodos quedarán afectados
            y si existen refacturas M1 que impacten en otros meses.
          </p>
        </div>

        <div className="overflow-y-auto max-h-[58vh] pr-1">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 mb-4">
            <SummaryCard
              label="Ficheros ingestion"
              value={summary.ingestion_files_count}
            />
            <SummaryCard
              label="Contribuciones M1"
              value={summary.m1_period_contributions_count}
            />
            <SummaryCard
              label="Contribuciones general/BALD"
              value={
                summary.general_period_contributions_count +
                summary.bald_period_contributions_count
              }
            />
            <SummaryCard
              label="Contribuciones PS"
              value={
                summary.ps_period_detail_count +
                summary.ps_period_contributions_count
              }
            />
          </div>

          <div className="ui-card ui-card--border mb-4">
            <h5 className="font-semibold mb-2">Resumen del impacto</h5>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>• Medidas general directas: {summary.medidas_general_direct_count}</div>
              <div>• Medidas PS directas: {summary.medidas_ps_direct_count}</div>
              <div>
                • Periodos generales afectados: {summary.affected_general_periods_count}
              </div>
              <div>• Periodos PS afectados: {summary.affected_ps_periods_count}</div>
              <div>
                • Candidatos huérfanos medidas_general:{" "}
                {summary.orphan_medidas_general_candidate_count}
              </div>
              <div>
                • Candidatos huérfanos medidas_ps:{" "}
                {summary.orphan_medidas_ps_candidate_count}
              </div>
              <div>• Refacturas M1 detectadas: {summary.refacturas_m1_count}</div>
            </div>
          </div>

          <div className="ui-card ui-card--border mb-4">
            <button
              type="button"
              className="w-full text-left font-semibold"
              onClick={() => setExpandedFilters((v) => !v)}
            >
              Filtros aplicados {expandedFilters ? "▲" : "▼"}
            </button>

            {expandedFilters && (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <span className="opacity-70">tenant_id:</span>{" "}
                  <span className="font-mono">
                    {formatFilterValue(preview.filters.tenant_id)}
                  </span>
                </div>
                <div>
                  <span className="opacity-70">empresa_id:</span>{" "}
                  <span className="font-mono">
                    {formatFilterValue(preview.filters.empresa_id)}
                  </span>
                </div>
                <div>
                  <span className="opacity-70">tipo:</span>{" "}
                  <span className="font-mono">
                    {formatFilterValue(preview.filters.tipo)}
                  </span>
                </div>
                <div>
                  <span className="opacity-70">status_:</span>{" "}
                  <span className="font-mono">
                    {formatFilterValue(preview.filters.status_)}
                  </span>
                </div>
                <div>
                  <span className="opacity-70">anio:</span>{" "}
                  <span className="font-mono">
                    {formatFilterValue(preview.filters.anio)}
                  </span>
                </div>
                <div>
                  <span className="opacity-70">mes:</span>{" "}
                  <span className="font-mono">
                    {formatFilterValue(preview.filters.mes)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="ui-card ui-card--border mb-4">
            <button
              type="button"
              className="w-full text-left font-semibold"
              onClick={() => setExpandedFiles((v) => !v)}
            >
              Ficheros que se van a borrar {expandedFiles ? "▲" : "▼"}
            </button>

            {expandedFiles && (
              <div className="mt-3">
                {preview.ingestion_files.length === 0 ? (
                  <p className="opacity-70">
                    No hay ficheros ingestion directos para borrar con ese filtro.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 pr-3">ID</th>
                          <th className="py-2 pr-3">Tenant</th>
                          <th className="py-2 pr-3">Empresa</th>
                          <th className="py-2 pr-3">Tipo</th>
                          <th className="py-2 pr-3">Periodo</th>
                          <th className="py-2 pr-3">Estado</th>
                          <th className="py-2 pr-3">Fichero</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.ingestion_files.map((file) => (
                          <tr key={file.id} className="border-b align-top">
                            <td className="py-2 pr-3">{file.id}</td>
                            <td className="py-2 pr-3">{file.tenant_id}</td>
                            <td className="py-2 pr-3">{file.empresa_id}</td>
                            <td className="py-2 pr-3">{file.tipo}</td>
                            <td className="py-2 pr-3">
                              {formatPeriodo(file.anio, file.mes)}
                            </td>
                            <td className="py-2 pr-3">{file.status ?? "—"}</td>
                            <td className="py-2 pr-3 break-all">{file.filename}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ui-card ui-card--border mb-4">
            <button
              type="button"
              className="w-full text-left font-semibold"
              onClick={() => setExpandedRefacturas((v) => !v)}
            >
              Refacturas M1 afectadas {expandedRefacturas ? "▲" : "▼"}
            </button>

            {expandedRefacturas && (
              <div className="mt-3">
                {refacturasGrouped.length === 0 ? (
                  <p className="opacity-70">
                    No se han detectado refacturas M1 en el alcance del borrado.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {refacturasGrouped.map((group) => (
                      <div
                        key={`${group.affected_period.anio}-${group.affected_period.mes}`}
                      >
                        <div className="font-medium mb-2">
                          Mes afectado:{" "}
                          {formatPeriodo(
                            group.affected_period.anio,
                            group.affected_period.mes
                          )}
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left border-b">
                                <th className="py-2 pr-3">Periodo origen</th>
                                <th className="py-2 pr-3">Periodo afectado</th>
                                <th className="py-2 pr-3">Energía</th>
                                <th className="py-2 pr-3">ID fichero</th>
                                <th className="py-2 pr-3">Fichero</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((item, idx) => (
                                <tr
                                  key={`${group.affected_period.anio}-${group.affected_period.mes}-${idx}`}
                                  className="border-b"
                                >
                                  <td className="py-2 pr-3">
                                    {formatPeriodo(
                                      item.source_period.anio,
                                      item.source_period.mes
                                    )}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {formatPeriodo(
                                      item.affected_period.anio,
                                      item.affected_period.mes
                                    )}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {formatKwh(item.energia_kwh)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {item.ingestion_file_id ?? "—"}
                                  </td>
                                  <td className="py-2 pr-3 break-all">
                                    {item.filename ?? "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ui-card ui-card--border mb-4">
            <button
              type="button"
              className="w-full text-left font-semibold"
              onClick={() => setExpandedGeneral((v) => !v)}
            >
              Periodos generales afectados {expandedGeneral ? "▲" : "▼"}
            </button>

            {expandedGeneral && (
              <div className="mt-3 space-y-3">
                {generalGrouped.length === 0 ? (
                  <p className="opacity-70">No hay periodos generales afectados.</p>
                ) : (
                  generalGrouped.map((group) => (
                    <div key={`${group.tenant_id}-${group.empresa_id}`}>
                      <div className="font-medium mb-1">
                        Empresa {group.empresa_id} · Tenant {group.tenant_id}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.periods.map((p) => (
                          <span
                            key={`${p.tenant_id}-${p.empresa_id}-${p.anio}-${p.mes}`}
                            className="ui-badge"
                          >
                            {formatPeriodo(p.anio, p.mes)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="ui-card ui-card--border mb-4">
            <button
              type="button"
              className="w-full text-left font-semibold"
              onClick={() => setExpandedPS((v) => !v)}
            >
              Periodos PS afectados {expandedPS ? "▲" : "▼"}
            </button>

            {expandedPS && (
              <div className="mt-3 space-y-3">
                {psGrouped.length === 0 ? (
                  <p className="opacity-70">No hay periodos PS afectados.</p>
                ) : (
                  psGrouped.map((group) => (
                    <div key={`${group.tenant_id}-${group.empresa_id}`}>
                      <div className="font-medium mb-1">
                        Empresa {group.empresa_id} · Tenant {group.tenant_id}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.periods.map((p) => (
                          <span
                            key={`${p.tenant_id}-${p.empresa_id}-${p.anio}-${p.mes}`}
                            className="ui-badge"
                          >
                            {formatPeriodo(p.anio, p.mes)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="ui-card ui-card--border mb-2">
            <button
              type="button"
              className="w-full text-left font-semibold"
              onClick={() => setExpandedOrphans((v) => !v)}
            >
              Registros huérfanos que también desaparecerán{" "}
              {expandedOrphans ? "▲" : "▼"}
            </button>

            {expandedOrphans && (
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <div className="font-medium mb-2">medidas_general</div>
                  {orphanGeneralGrouped.length === 0 ? (
                    <p className="opacity-70">No hay candidatos huérfanos.</p>
                  ) : (
                    <div className="space-y-3">
                      {orphanGeneralGrouped.map((group) => (
                        <div key={`${group.tenant_id}-${group.empresa_id}`}>
                          <div className="mb-1">
                            Empresa {group.empresa_id} · Tenant {group.tenant_id}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.periods.map((p) => (
                              <span
                                key={`${p.tenant_id}-${p.empresa_id}-${p.anio}-${p.mes}`}
                                className="ui-badge"
                              >
                                {formatPeriodo(p.anio, p.mes)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-medium mb-2">medidas_ps</div>
                  {orphanPSGrouped.length === 0 ? (
                    <p className="opacity-70">No hay candidatos huérfanos.</p>
                  ) : (
                    <div className="space-y-3">
                      {orphanPSGrouped.map((group) => (
                        <div key={`${group.tenant_id}-${group.empresa_id}`}>
                          <div className="mb-1">
                            Empresa {group.empresa_id} · Tenant {group.tenant_id}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.periods.map((p) => (
                              <span
                                key={`${p.tenant_id}-${p.empresa_id}-${p.anio}-${p.mes}`}
                                className="ui-badge"
                              >
                                {formatPeriodo(p.anio, p.mes)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              Escribe <span className="font-semibold">BORRAR</span> para confirmar
            </label>
            <input
              type="text"
              className="ui-input w-full"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={loading}
              placeholder="BORRAR"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="ui-btn ui-btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="ui-btn ui-btn-danger"
              onClick={() => void onConfirm()}
              disabled={loading || !canConfirm}
            >
              {loading ? "Borrando..." : "Confirmar borrado"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}