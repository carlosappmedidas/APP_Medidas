// Panel 2 del módulo Objeciones: Gestión de ficheros y respuestas.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.8a).
// En pasos posteriores (0.8b, 0.8c) se partirá en sub-componentes.

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import ObjecionDetalleModal from "../ObjecionDetalleModal";
import type { ObjecionRow, ObjecionDetalleConfig } from "../ObjecionDetalleModal";
import type { ObjecionTipo, DashData, EmpresaOption, FicheroStats, TabConfig } from "./shared/types";
import { TIPO_RUTA, TIPO_GENERA_ZIP, TIPO_GENERA_ONE, TABS } from "./shared/constants";
import { fmtDate, downloadBlob } from "./shared/helpers";
import { IconDownload, IconEdit, IconTrash } from "./shared/icons";
import { BadgeAceptacion } from "./shared/badges";
import SftpEnvioModal from "./SftpEnvioModal";
import GestionFicherosLista from "./GestionFicherosLista";

// ─── Estilos panel (mismo estilo que los demás paneles de Objeciones) ────────

const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: "10px",
  overflow: "hidden",
  marginBottom: "10px",
};
const panelHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 20px", cursor: "pointer", userSelect: "none",
};
const panelTitleStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text)",
};
const panelDescStyle: React.CSSProperties = {
  fontSize: "11px", color: "var(--text-muted)", marginTop: 3,
};

interface GestionPanelProps {
  token: string | null;
  empresas: EmpresaOption[];
  empresaFiltroId: number | null;
  setEmpresaFiltroId: (id: number | null) => void;
  dash: DashData | null;
  onDashRefresh: () => void;
  onError: (msg: string | null) => void;
}

export default function GestionPanel({
  token, empresas, empresaFiltroId, setEmpresaFiltroId,
  dash, onDashRefresh, onError,
}: GestionPanelProps) {
  const [gestOpen, setGestOpen]           = useState(false);
  const [activeTab, setActiveTab]         = useState<ObjecionTipo>("AOBAGRECL");
  const [ficheiroActivo, setFicheroActivo] = useState<string | null>(null);
  const [ficheros, setFicheros]           = useState<FicheroStats[]>([]);
  const [loadingFicheros, setLoadingFicheros] = useState(false);
  const [filas, setFilas]                 = useState<ObjecionRow[]>([]);
  const [loadingFilas, setLoadingFilas]   = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [importing, setImporting]         = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [generatingOne, setGeneratingOne] = useState<number | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [modalOpen, setModalOpen]         = useState(false);
  const [filaIdx, setFilaIdx]             = useState<number | null>(null);
  const [saving, setSaving]               = useState(false);

  // Modal SFTP (vive aquí dentro desde Fase 0.8a)
  const [sftpModalOpen, setSftpModalOpen] = useState(false);
  const [sftpFichero,   setSftpFichero]   = useState<string | null>(null);

  const fileInputRef     = useRef<HTMLInputElement>(null);
  const tab              = TABS.find((t) => t.id === activeTab)!;
  const ruta             = TIPO_RUTA[activeTab];
  const empresaIdGestion = empresaFiltroId;

  useEffect(() => {
    setFicheroActivo(null); setFicheros([]); setFilas([]);
    setSelectedIds(new Set()); onError(null);
  }, [activeTab, onError]);

  useEffect(() => { setSelectedIds(new Set()); }, [ficheiroActivo]);

  // ── Cargar ficheros ───────────────────────────────────────────────────────

  const cargarFicheros = useCallback(async () => {
    if (!token || !empresaIdGestion) return;
    setLoadingFicheros(true); onError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/ficheros?empresa_id=${empresaIdGestion}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros(await res.json());
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error cargando ficheros");
    } finally { setLoadingFicheros(false); }
  }, [token, empresaIdGestion, ruta, onError]);

  useEffect(() => {
    if (ficheiroActivo === null) cargarFicheros();
  }, [ficheiroActivo, cargarFicheros]);

  // ── Cargar filas ──────────────────────────────────────────────────────────

  const cargarFilas = useCallback(async (nombre: string) => {
    if (!token || !empresaIdGestion) return;
    setLoadingFilas(true); onError(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaIdGestion), nombre_fichero: nombre });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas(await res.json());
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error cargando objeciones");
    } finally { setLoadingFilas(false); }
  }, [token, empresaIdGestion, ruta, onError]);

  useEffect(() => {
    if (ficheiroActivo !== null) cargarFilas(ficheiroActivo);
  }, [ficheiroActivo, cargarFilas]);

  // ── Importar ──────────────────────────────────────────────────────────────

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !token || !empresaIdGestion) return;
    setImporting(true); onError(null);
    const errores: string[] = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/import?empresa_id=${empresaIdGestion}`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          errores.push(`${file.name}: ${(err as { detail?: string }).detail || `Error ${res.status}`}`);
        }
      } catch (e: unknown) {
        errores.push(`${file.name}: ${e instanceof Error ? e.message : "Error desconocido"}`);
      }
    }
    await cargarFicheros();
    onDashRefresh();
    if (errores.length) onError(errores.join(" | "));
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Generar ───────────────────────────────────────────────────────────────

  const handleGenerate = async (nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    setGenerating(true); onError(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaIdGestion), nombre_fichero: nombreFichero });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/generate?${params}`, { method: "POST", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await downloadBlob(res, `REOB${activeTab}${TIPO_GENERA_ZIP[activeTab] ? ".zip" : ".bz2"}`);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error generando fichero");
    } finally { setGenerating(false); }
  };

  const handleGenerateOne = async (row: ObjecionRow, nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    const rowId = Number(row.id);
    setGeneratingOne(rowId); onError(null);
    try {
      const params = new URLSearchParams({
        empresa_id: String(empresaIdGestion),
        objecion_id: String(rowId),
        nombre_fichero: nombreFichero,
      });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/generate-one?${params}`, { method: "POST", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await downloadBlob(res, `REOBAGRECL_${rowId}.bz2`);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error generando fichero individual");
    } finally { setGeneratingOne(null); }
  };

  // ── Abrir modal SFTP ──────────────────────────────────────────────────────

  const abrirSftpModal = (nombreFichero: string) => {
    setSftpFichero(nombreFichero);
    setSftpModalOpen(true);
  };

  // ── Toggle SFTP manual ────────────────────────────────────────────────────

  const handleToggleSftp = async (nombreFichero: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || !empresaIdGestion) return;
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/toggle-sftp/${ruta}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaIdGestion, nombre_fichero: nombreFichero }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setFicheros((prev) => prev.map((f) =>
        f.nombre_fichero === nombreFichero
          ? { ...f, enviado_sftp_at: data.enviado_sftp_at }
          : f
      ));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error actualizando estado SFTP");
    }
  };

  // ── Borrar fichero completo ───────────────────────────────────────────────

  const handleDeleteFichero = async (nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    setDeleting(true); onError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/objeciones/${ruta}/ficheros/${encodeURIComponent(nombreFichero)}?empresa_id=${empresaIdGestion}`,
        { method: "DELETE", headers: getAuthHeaders(token) },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros((prev) => prev.filter((f) => f.nombre_fichero !== nombreFichero));
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error borrando fichero");
    } finally { setDeleting(false); }
  };

  // ── Borrado individual ────────────────────────────────────────────────────

  const handleDeleteOne = async (id: number) => {
    if (!token || !empresaIdGestion) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/objeciones/${ruta}/${id}?empresa_id=${empresaIdGestion}`,
        { method: "DELETE", headers: getAuthHeaders(token) },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => Number(r.id) !== id));
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      if (ficheiroActivo) await cargarFicheros();
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error borrando");
    } finally { setDeleting(false); }
  };

  // ── Borrado en bloque ─────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!token || selectedIds.size === 0 || !empresaIdGestion) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/bulk-delete`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), empresa_id: empresaIdGestion }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => !selectedIds.has(Number(r.id))));
      setSelectedIds(new Set());
      if (ficheiroActivo) await cargarFicheros();
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error borrando");
    } finally { setDeleting(false); }
  };

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

  // ── Modal detalle ─────────────────────────────────────────────────────────

  const filaSeleccionada = filaIdx !== null ? filas[filaIdx] : null;
  const modalConfig: ObjecionDetalleConfig = { tipo: activeTab, camposLectura: tab.camposLectura };

  const handleSave = async (respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string }) => {
    if (filaIdx === null || !token || !empresaIdGestion) return;
    setSaving(true);
    const fila = filas[filaIdx];
    try {
      const res = await fetch(
        `${API_BASE_URL}/objeciones/${ruta}/${fila.id}?empresa_id=${empresaIdGestion}`,
        {
          method: "PATCH",
          headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify(respuesta),
        },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const actualizada: ObjecionRow = await res.json();
      setFilas((prev) => { const c = [...prev]; c[filaIdx] = actualizada; return c; });
      if (ficheiroActivo) await cargarFicheros();
      onDashRefresh();
      setModalOpen(false); setFilaIdx(null);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error guardando");
    } finally { setSaving(false); }
  };

  // ── Tabs con contadores del dashboard ────────────────────────────────────

  const tabCounts: Record<ObjecionTipo, number> = { AOBAGRECL: 0, OBJEINCL: 0, AOBCUPS: 0, AOBCIL: 0 };
  if (dash) {
    for (const t of dash.por_tipo) {
      const key = t.tipo as ObjecionTipo;
      if (key in tabCounts) tabCounts[key] = t.total;
    }
  }

  const tabBar = (
    <div style={{ display: "flex", backgroundColor: "#1a2332", borderRadius: "6px 6px 0 0", paddingLeft: "8px", gap: "2px" }}>
      {TABS.map((t) => {
        const isActive = t.id === activeTab;
        const count = tabCounts[t.id];
        return (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "9px 16px", fontSize: "11px", fontWeight: 500,
            color: isActive ? "white" : "rgba(255,255,255,0.4)",
            background: "transparent", border: "none",
            borderBottom: isActive ? "2px solid #60a5fa" : "2px solid transparent",
            cursor: "pointer", letterSpacing: "0.06em",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            {t.label}
            {count > 0 && (
              <span style={{
                fontSize: "10px",
                background: isActive ? "#60a5fa" : "rgba(255,255,255,0.15)",
                color: "white", borderRadius: "10px", padding: "1px 6px", fontWeight: 600,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".0,.1,.2,.3,.4,.5,.6,.7,.8,.9,.csv,.txt" multiple style={{ display: "none" }} onChange={handleFileChange} />

      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setGestOpen((v) => !v)}>
          <div>
            <div style={panelTitleStyle}>Gestión de ficheros y respuestas</div>
            <div style={panelDescStyle}>Importar, revisar y generar ficheros REOB por tipo</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={(e) => { e.stopPropagation(); setGestOpen((v) => !v); }}>
            {gestOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {gestOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "14px 20px" }}>

            {/* Selector empresa */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Empresa:</span>
              <select
                className="ui-select"
                value={empresaFiltroId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmpresaFiltroId(val === "" ? null : Number(val));
                  setFicheroActivo(null); setFicheros([]); setFilas([]);
                }}
                style={{ fontSize: "11px", padding: "4px 8px", minWidth: 160, height: 28 }}
              >
                <option value="">Todas las empresas</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}
                  </option>
                ))}
              </select>
            </div>

            {/* ── NIVEL 1: lista de ficheros ── */}
            {ficheiroActivo === null && (
              <>
                {tabBar}
                <GestionFicherosLista
                  tab={tab}
                  activeTab={activeTab}
                  ficheros={ficheros}
                  loadingFicheros={loadingFicheros}
                  empresaIdGestion={empresaIdGestion}
                  importing={importing}
                  generating={generating}
                  deleting={deleting}
                  onImportClick={handleImportClick}
                  onFicheroClick={setFicheroActivo}
                  onGenerate={handleGenerate}
                  onAbrirSftpModal={abrirSftpModal}
                  onToggleSftp={handleToggleSftp}
                  onDeleteFichero={handleDeleteFichero}
                />
              </>
            )}

            {/* ── NIVEL 2: objeciones del fichero ── */}
            {ficheiroActivo !== null && (
              <>
                {tabBar}

                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none", borderBottom: "none" }}>
                  <button type="button" onClick={() => setFicheroActivo(null)} className="ui-btn ui-btn-outline ui-btn-xs">← Volver</button>
                  <span className="ui-muted" style={{ fontSize: 11 }}>{activeTab} ›</span>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--text)" }}>{ficheiroActivo}</span>
                </div>

                <div className="flex items-center justify-between gap-2" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "0.5px solid var(--card-border)", marginBottom: 1 }}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleGenerate(ficheiroActivo)}
                      disabled={generating || filas.length === 0}
                      className="ui-btn ui-btn-outline ui-btn-xs"
                      style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <IconDownload />
                      {generating ? "Generando..." : TIPO_GENERA_ZIP[activeTab] ? "Generar ZIP (por ID)" : "Generar REOB"}
                    </button>
                    {selectedIds.size > 0 && (
                      <button type="button" onClick={handleBulkDelete} disabled={deleting}
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
                                          onClick={() => handleGenerateOne(row, ficheiroActivo)}
                                          disabled={isGeneratingThis || !tieneRespuesta}
                                          className="ui-btn ui-btn-outline ui-btn-xs"
                                          style={{ padding: "4px 6px", display: "flex", alignItems: "center", opacity: tieneRespuesta ? 1 : 0.4 }}>
                                          {isGeneratingThis ? "…" : <IconDownload />}
                                        </button>
                                      )}
                                      <button type="button" onClick={() => handleDeleteOne(rowId)}
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
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal envío SFTP ──────────────────────────────────────────── */}
      <SftpEnvioModal
        open={sftpModalOpen}
        fichero={sftpFichero}
        empresaId={empresaIdGestion}
        ruta={ruta}
        token={token}
        onClose={() => setSftpModalOpen(false)}
      />

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