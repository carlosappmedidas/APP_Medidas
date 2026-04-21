// Panel 2 del módulo Objeciones: Gestión de ficheros y respuestas.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.8a).
// En pasos posteriores (0.8b, 0.8c) se partirá en sub-componentes.

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { ObjecionRow } from "../ObjecionDetalleModal";
import type { ObjecionTipo, DashData, EmpresaOption, FicheroStats, TabConfig } from "./shared/types";
import { TIPO_RUTA, TIPO_GENERA_ZIP, TABS } from "./shared/constants";
import { downloadBlob } from "./shared/helpers";
import SftpEnvioModal from "./SftpEnvioModal";
import GestionFicherosLista from "./GestionFicherosLista";
import GestionObjecionesTabla from "./GestionObjecionesTabla";

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
  const [importing, setImporting]         = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [deleting, setDeleting]           = useState(false);

  // Modal SFTP (vive aquí dentro desde Fase 0.8a)
  const [sftpModalOpen, setSftpModalOpen] = useState(false);
  const [sftpFichero,   setSftpFichero]   = useState<string | null>(null);

  // Modal confirmación de borrado de AOB (F8: preguntar si borrar también REOB)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalFichero, setDeleteModalFichero] = useState<string | null>(null);

  const fileInputRef     = useRef<HTMLInputElement>(null);
  const tab              = TABS.find((t) => t.id === activeTab)!;
  const ruta             = TIPO_RUTA[activeTab];
  const empresaIdGestion = empresaFiltroId;

  useEffect(() => {
    setFicheroActivo(null); setFicheros([]); setFilas([]);
    onError(null);
  }, [activeTab, onError]);

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
    onError(null);
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
    }
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
  // F8: primero se abre un modal que pregunta qué hacer con el REOB asociado.
  //     El borrado real se hace en confirmDeleteFichero.

  const handleDeleteFichero = (nombreFichero: string) => {
    setDeleteModalFichero(nombreFichero);
    setDeleteModalOpen(true);
  };

  const confirmDeleteFichero = async (deleteReobAsociado: boolean) => {
    const nombreFichero = deleteModalFichero;
    // Cerrar el modal antes de arrancar la operación
    setDeleteModalOpen(false);
    setDeleteModalFichero(null);

    if (!nombreFichero || !token || !empresaIdGestion) return;
    setDeleting(true); onError(null);
    try {
      const params = new URLSearchParams({
        empresa_id: String(empresaIdGestion),
        delete_reob_asociado: deleteReobAsociado ? "true" : "false",
      });
      const res = await fetch(
        `${API_BASE_URL}/objeciones/${ruta}/ficheros/${encodeURIComponent(nombreFichero)}?${params}`,
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
      if (ficheiroActivo) await cargarFicheros();
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error borrando");
    } finally { setDeleting(false); }
  };

  // ── Borrado en bloque ─────────────────────────────────────────────────────

  const handleBulkDelete = async (ids: number[]) => {
    if (!token || ids.length === 0 || !empresaIdGestion) return;
    const idsSet = new Set(ids);
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/bulk-delete`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids, empresa_id: empresaIdGestion }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => !idsSet.has(Number(r.id))));
      if (ficheiroActivo) await cargarFicheros();
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error borrando");
    } finally { setDeleting(false); }
  };

  const handleSave = async (
    idx: number,
    _fila: ObjecionRow,
    respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string },
  ) => {
    if (!token || !empresaIdGestion) throw new Error("Sin token o empresa");
    const fila = filas[idx];
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
      setFilas((prev) => { const c = [...prev]; c[idx] = actualizada; return c; });
      if (ficheiroActivo) await cargarFicheros();
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error guardando");
      throw e;  // propagar al nivel 2 para que no cierre el modal
    }
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
                <GestionObjecionesTabla
                  tab={tab}
                  activeTab={activeTab}
                  ficheiroActivo={ficheiroActivo}
                  filas={filas}
                  loadingFilas={loadingFilas}
                  generating={generating}
                  deleting={deleting}
                  onVolver={() => setFicheroActivo(null)}
                  onGenerate={handleGenerate}
                  onGenerateOne={handleGenerateOne}
                  onDeleteOne={handleDeleteOne}
                  onBulkDelete={handleBulkDelete}
                  onSaveRespuesta={handleSave}
                />
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

      {/* ── Modal confirmar borrado de AOB (F8) ──────────────────────── */}
      {deleteModalOpen && deleteModalFichero && (
        <div
          onClick={() => { setDeleteModalOpen(false); setDeleteModalFichero(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxWidth: "90vw",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 12, padding: "20px 22px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Eliminar fichero AOB
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
              Vas a eliminar{" "}
              <span style={{ fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>
                {deleteModalFichero}
              </span>{" "}
              y todas sus objeciones.
              <br /><br />
              ¿Qué quieres hacer con el REOB asociado (si existe)?
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                className="ui-btn ui-btn-err ui-btn-xs"
                onClick={() => confirmDeleteFichero(true)}
                style={{ justifyContent: "flex-start", padding: "10px 14px", fontSize: 12 }}
              >
                🗑 Borrar todo (AOB + objeciones + REOB asociado)
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={() => confirmDeleteFichero(false)}
                style={{ justifyContent: "flex-start", padding: "10px 14px", fontSize: 12 }}
              >
                📄 Borrar solo el AOB y sus objeciones (mantener REOB)
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={() => { setDeleteModalOpen(false); setDeleteModalFichero(null); }}
                style={{ justifyContent: "flex-start", padding: "10px 14px", fontSize: 12, marginTop: 4 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}