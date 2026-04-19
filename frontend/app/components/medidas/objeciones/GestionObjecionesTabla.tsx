// Nivel 2 de Gestión: tabla de objeciones de un fichero + toolbar + modal detalle.
// Extraído de GestionPanel.tsx (Fase 0 · Paso 0.8c).

"use client";

import { useState, useEffect } from "react";
import ObjecionDetalleModal from "../ObjecionDetalleModal";
import type { ObjecionRow, ObjecionDetalleConfig } from "../ObjecionDetalleModal";
import type { ObjecionTipo, TabConfig } from "./shared/types";
import { TIPO_GENERA_ZIP, TIPO_GENERA_ONE } from "./shared/constants";
import { IconDownload, IconEdit, IconTrash } from "./shared/icons";
import { BadgeAceptacion } from "./shared/badges";

interface GestionObjecionesTablaProps {
  tab: TabConfig;
  activeTab: ObjecionTipo;
  ficheiroActivo: string;
  filas: ObjecionRow[];
  loadingFilas: boolean;
  generating: boolean;
  deleting: boolean;
  onVolver: () => void;
  onGenerate: (nombreFichero: string) => void;
  onGenerateOne: (row: ObjecionRow, nombreFichero: string) => Promise<void>;
  onDeleteOne: (id: number) => void;
  onBulkDelete: (ids: number[]) => Promise<void>;
  onSaveRespuesta: (
    idx: number,
    fila: ObjecionRow,
    respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string },
  ) => Promise<void>;
}

export default function GestionObjecionesTabla({
  tab, activeTab, ficheiroActivo,
  filas, loadingFilas, generating, deleting,
  onVolver, onGenerate, onGenerateOne, onDeleteOne, onBulkDelete, onSaveRespuesta,
}: GestionObjecionesTablaProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generatingOne, setGeneratingOne] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filaIdx, setFilaIdx]     = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);

  // Reset selección cuando cambia el fichero activo
  useEffect(() => { setSelectedIds(new Set()); }, [ficheiroActivo]);

  // ── Selección ─────────────────────────────────────────────────────────────

  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === filas.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filas.map((r) => Number(r.id))));
  };
  const allSelected  = filas.length > 0 && selectedIds.size === filas.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filas.length;

  // ── Generar individual (spinner local por fila) ──────────────────────────

  const handleGenerateOneLocal = async (row: ObjecionRow) => {
    const rowId = Number(row.id);
    setGeneratingOne(rowId);
    try {
      await onGenerateOne(row, ficheiroActivo);
    } finally {
      setGeneratingOne(null);
    }
  };

  // ── Borrado en bloque ────────────────────────────────────────────────────

  const handleBulkDeleteLocal = async () => {
    if (selectedIds.size === 0) return;
    await onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  // ── Modal detalle ────────────────────────────────────────────────────────

  const filaSeleccionada = filaIdx !== null ? filas[filaIdx] : null;
  const modalConfig: ObjecionDetalleConfig = { tipo: activeTab, camposLectura: tab.camposLectura };

  const handleSave = async (respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string }) => {
    if (filaIdx === null) return;
    const fila = filas[filaIdx];
    setSaving(true);
    try {
      await onSaveRespuesta(filaIdx, fila, respuesta);
      // Si el padre no lanzó, cerramos modal
      setModalOpen(false); setFilaIdx(null);
    } catch {
      // El padre ya notificó el error via onError; el modal queda abierto
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none", borderBottom: "none" }}>
        <button type="button" onClick={onVolver} className="ui-btn ui-btn-outline ui-btn-xs">← Volver</button>
        <span className="ui-muted" style={{ fontSize: 11 }}>{activeTab} ›</span>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--text)" }}>{ficheiroActivo}</span>
      </div>

      {/* Toolbar nivel 2 */}
      <div className="flex items-center justify-between gap-2" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "0.5px solid var(--card-border)", marginBottom: 1 }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onGenerate(ficheiroActivo)}
            disabled={generating || filas.length === 0}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IconDownload />
            {generating ? "Generando..." : TIPO_GENERA_ZIP[activeTab] ? "Generar ZIP (por ID)" : "Generar REOB"}
          </button>
          {selectedIds.size > 0 && (
            <button type="button" onClick={handleBulkDeleteLocal} disabled={deleting}
              className="ui-btn ui-btn-danger ui-btn-xs"
              style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <IconTrash />
              {deleting ? "Borrando..." : `Borrar ${selectedIds.size} seleccionada${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
        <span className="ui-muted" style={{ fontSize: "11px" }}>
          {loadingFilas ? "Cargando..." : `${filas.length} objeción${filas.length !== 1 ? "es" : ""}`}
        </span>
      </div>

      {/* Tabla objeciones */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="ui-thead">
            <tr>
              <th className="ui-th" style={{ width: 36, padding: "8px 10px", textAlign: "center" }}>
                <input type="checkbox" checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  style={{ cursor: "pointer", accentColor: "#1a2332" }} />
              </th>
              {tab.columns.map((col) => (
                <th key={col.id} className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")} style={{ whiteSpace: "nowrap" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingFilas ? (
              <tr className="ui-tr"><td colSpan={tab.columns.length + 1} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
            ) : filas.length === 0 ? (
              <tr className="ui-tr"><td colSpan={tab.columns.length + 1} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Sin objeciones en este fichero</td></tr>
            ) : (
              filas.map((row, ri) => {
                const rowId = Number(row.id);
                const isSel = selectedIds.has(rowId);
                const isGeneratingThis = generatingOne === rowId;
                const tieneRespuesta = row.aceptacion === "S" || row.aceptacion === "N";
                const generaOne = TIPO_GENERA_ONE[activeTab];
                return (
                  <tr key={ri} className="ui-tr" style={{ background: isSel ? "var(--nav-item-hover)" : undefined }}>
                    <td className="ui-td" style={{ width: 36, padding: "6px 10px", textAlign: "center" }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(rowId)}
                        style={{ cursor: "pointer", accentColor: "#1a2332" }} />
                    </td>
                    {tab.columns.map((col) => {
                      if (col.id === "_acciones") return (
                        <td key="_acciones" className="ui-td" style={{ width: generaOne ? 88 : 64, padding: "6px 8px" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button type="button" onClick={() => { setFilaIdx(ri); setModalOpen(true); }}
                              className="ui-btn ui-btn-ghost ui-btn-xs"
                              style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}>
                              <IconEdit />
                            </button>
                            {generaOne && (
                              <button type="button"
                                onClick={() => handleGenerateOneLocal(row)}
                                disabled={isGeneratingThis || !tieneRespuesta}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                                style={{ padding: "4px 6px", display: "flex", alignItems: "center", opacity: tieneRespuesta ? 1 : 0.4 }}>
                                {isGeneratingThis ? "…" : <IconDownload />}
                              </button>
                            )}
                            <button type="button" onClick={() => onDeleteOne(rowId)}
                              disabled={deleting} className="ui-btn ui-btn-danger ui-btn-xs"
                              style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}>
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      );
                      if (col.id === "aceptacion") return (
                        <td key={col.id} className="ui-td" style={{ whiteSpace: "nowrap" }}>
                          <BadgeAceptacion valor={row.aceptacion ?? ""} />
                        </td>
                      );
                      return (
                        <td key={col.id} className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")} style={{ whiteSpace: "nowrap" }}>
                          {row[col.id] || <span className="ui-muted">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ObjecionDetalleModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFilaIdx(null); }}
        onSave={handleSave}
        config={modalConfig}
        fila={filaSeleccionada}
        saving={saving}
      />
    </>
  );
}