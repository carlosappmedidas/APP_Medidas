"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { User } from "../../types";
import ObjecionDetalleModal from "./ObjecionDetalleModal";
import type { ObjecionRow, ObjecionDetalleConfig } from "./ObjecionDetalleModal";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type {
  ObjecionTipo,
  FicheroStats,
  DashData,
  EmpresaOption,
} from "./objeciones/shared/types";
import {
  TIPO_RUTA,
  TIPO_GENERA_ZIP,
  TIPO_GENERA_ONE,
  TABS,
} from "./objeciones/shared/constants";
import { fmtDate, downloadBlob } from "./objeciones/shared/helpers";
import {
  IconFolder,
  IconDownload,
  IconEdit,
  IconTrash,
  IconChevron,
  IconSend,
  IconDotsV,
} from "./objeciones/shared/icons";
import { BadgeAceptacion, BadgeNum } from "./objeciones/shared/badges";
import DashboardPanel from "./objeciones/DashboardPanel";
import HistorialPanel from "./objeciones/HistorialPanel";

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

// ─── Estilos panel (estilo Configuración) ─────────────────────────────────────

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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjecionesSection({ token, currentUser }: ObjecionesSectionProps) {

  const [dashOpen, setDashOpen]   = useState(true);
  const [gestOpen, setGestOpen]   = useState(false);

  const [dash, setDash]           = useState<DashData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  const [empresas, setEmpresas]           = useState<EmpresaOption[]>([]);
  const [empresaFiltroId, setEmpresaFiltroId] = useState<number | null>(null);

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
  const [error, setError]                 = useState<string | null>(null);
  const [modalOpen, setModalOpen]         = useState(false);
  const [filaIdx, setFilaIdx]             = useState<number | null>(null);
  const [saving, setSaving]               = useState(false);

  // ── Estado envío SFTP ─────────────────────────────────────────────────────
  const [sftpModalOpen,    setSftpModalOpen]    = useState(false);
  const [sftpFichero,      setSftpFichero]      = useState<string | null>(null);
  const [sftpConfigs,      setSftpConfigs]      = useState<{id: number; nombre: string; host: string; directorio_remoto: string}[]>([]);  const [sftpConfigId,     setSftpConfigId]     = useState<number | null>(null);
  const [sftpPath,         setSftpPath]         = useState<string>("/");
  const [sftpCarpetas,     setSftpCarpetas]     = useState<{nombre: string; path: string}[]>([]);
  const [sftpLoadingPath,  setSftpLoadingPath]  = useState(false);
  const [sftpEnviando,     setSftpEnviando]     = useState(false);
  const [sftpError,        setSftpError]        = useState<string | null>(null);
  const [sftpOk,           setSftpOk]           = useState<string | null>(null);

const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{top: number; right: number}>({top: 0, right: 0});

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const tab           = TABS.find((t) => t.id === activeTab)!;
  const ruta          = TIPO_RUTA[activeTab];
  const empresaIdGestion = empresaFiltroId;

  useEffect(() => {
    setFicheroActivo(null); setFicheros([]); setFilas([]);
    setSelectedIds(new Set()); setError(null);
  }, [activeTab]);

  useEffect(() => { setSelectedIds(new Set()); }, [ficheiroActivo]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-menu-container]")) {
        setMenuAbierto(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);
  // ── Cargar empresas ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) });
        if (!res.ok) return;
        const data: EmpresaOption[] = await res.json();
        setEmpresas(data);
      } catch { /* silencioso */ }
    };
    void fetch_();
  }, [token, currentUser]);

  // ── Cargar dashboard ──────────────────────────────────────────────────────

  const cargarDash = useCallback(async () => {
    if (!token) return;
    setDashLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresaFiltroId) params.set("empresa_id", String(empresaFiltroId));
      const res = await fetch(`${API_BASE_URL}/objeciones/dashboard?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setDash(await res.json());
    } catch { setDash(null); }
    finally { setDashLoading(false); }
  }, [token, empresaFiltroId]);

  useEffect(() => { cargarDash(); }, [cargarDash]);

  // ── Cargar ficheros ───────────────────────────────────────────────────────

  const cargarFicheros = useCallback(async () => {
    if (!token || !empresaIdGestion) return;
    setLoadingFicheros(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/ficheros?empresa_id=${empresaIdGestion}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando ficheros");
    } finally { setLoadingFicheros(false); }
  }, [token, empresaIdGestion, ruta]);

  useEffect(() => {
    if (ficheiroActivo === null) cargarFicheros();
  }, [ficheiroActivo, cargarFicheros]);

  // ── Cargar filas ──────────────────────────────────────────────────────────

  const cargarFilas = useCallback(async (nombre: string) => {
    if (!token || !empresaIdGestion) return;
    setLoadingFilas(true); setError(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaIdGestion), nombre_fichero: nombre });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando objeciones");
    } finally { setLoadingFilas(false); }
  }, [token, empresaIdGestion, ruta]);

  useEffect(() => {
    if (ficheiroActivo !== null) cargarFilas(ficheiroActivo);
  }, [ficheiroActivo, cargarFilas]);

  // ── Importar ──────────────────────────────────────────────────────────────

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !token || !empresaIdGestion) return;
    setImporting(true); setError(null);
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
    await cargarDash();
    if (errores.length) setError(errores.join(" | "));
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Generar ───────────────────────────────────────────────────────────────

  const handleGenerate = async (nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    setGenerating(true); setError(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaIdGestion), nombre_fichero: nombreFichero });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/generate?${params}`, { method: "POST", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await downloadBlob(res, `REOB${activeTab}${TIPO_GENERA_ZIP[activeTab] ? ".zip" : ".bz2"}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error generando fichero");
    } finally { setGenerating(false); }
  };

  const handleGenerateOne = async (row: ObjecionRow, nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    const rowId = Number(row.id);
    setGeneratingOne(rowId); setError(null);
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
      setError(e instanceof Error ? e.message : "Error generando fichero individual");
    } finally { setGeneratingOne(null); }
  };
  
    // ── Abrir modal SFTP ──────────────────────────────────────────────────────

  const abrirSftpModal = async (nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    setSftpFichero(nombreFichero);
    setSftpError(null); setSftpOk(null);
    setSftpConfigId(null); setSftpPath("/"); setSftpCarpetas([]);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) });      if (!res.ok) throw new Error();
      const configs = await res.json();
      const cs = configs.filter((c: {nombre: string; activo: boolean; empresa_id: number}) =>
        c.activo && c.nombre && c.nombre.toUpperCase().startsWith("CS") && c.empresa_id === empresaIdGestion
      );
      setSftpConfigs(cs);
      if (cs.length === 1) {
        setSftpConfigId(cs[0].id);
        const pathInicial = cs[0].directorio_remoto || "/";
        setSftpPath(pathInicial);
        await cargarCarpetasSftp(cs[0].id, pathInicial);
      }
    } catch { setSftpConfigs([]); }
    setSftpModalOpen(true);
  };

  const cargarCarpetasSftp = async (configId: number, path: string) => {
    if (!token) return;
    setSftpLoadingPath(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/explorar/${configId}?path=${encodeURIComponent(path)}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSftpCarpetas(data.carpetas ?? []);
      setSftpPath(path);
    } catch { setSftpCarpetas([]); }
    finally { setSftpLoadingPath(false); }
  };

  const handleEnviarSftp = async () => {
    if (!token || !empresaIdGestion || !sftpFichero || !sftpConfigId) return;
    setSftpEnviando(true); setSftpError(null); setSftpOk(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/enviar-sftp`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaIdGestion,
          nombre_fichero: sftpFichero,
          config_id: sftpConfigId,
          directorio_destino: sftpPath,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as {detail?: string}).detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setSftpOk(`✅ Enviado: ${data.filename}`);
    } catch (e: unknown) {
      setSftpError(e instanceof Error ? e.message : "Error enviando");
    } finally { setSftpEnviando(false); }
  };





  // ── Toggle SFTP manual ────────────────────────────────────────────────────

  const handleToggleSftp = async (nombreFichero: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || !empresaIdGestion) return;
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/toggle-sftp/${ruta}`, {        method: "PATCH",
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
      setError(err instanceof Error ? err.message : "Error actualizando estado SFTP");
    }
  };

  // ── Borrar fichero completo ───────────────────────────────────────────────

  const handleDeleteFichero = async (nombreFichero: string) => {
    if (!token || !empresaIdGestion) return;
    setDeleting(true); setError(null);
    try {
      // empresa_id como query param — el backend verifica acceso
      const res = await fetch(
        `${API_BASE_URL}/objeciones/${ruta}/ficheros/${encodeURIComponent(nombreFichero)}?empresa_id=${empresaIdGestion}`,
        { method: "DELETE", headers: getAuthHeaders(token) },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros((prev) => prev.filter((f) => f.nombre_fichero !== nombreFichero));
      await cargarDash();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando fichero");
    } finally { setDeleting(false); }
  };

  // ── Borrado individual ────────────────────────────────────────────────────

  const handleDeleteOne = async (id: number) => {
    if (!token || !empresaIdGestion) return;
    setDeleting(true);
    try {
      // empresa_id como query param — el backend verifica que la fila pertenece a esta empresa
      const res = await fetch(
        `${API_BASE_URL}/objeciones/${ruta}/${id}?empresa_id=${empresaIdGestion}`,
        { method: "DELETE", headers: getAuthHeaders(token) },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => Number(r.id) !== id));
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      if (ficheiroActivo) await cargarFicheros();
      await cargarDash();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando");
    } finally { setDeleting(false); }
  };

  // ── Borrado en bloque ─────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!token || selectedIds.size === 0 || !empresaIdGestion) return;
    setDeleting(true);
    try {
      // empresa_id en el body — el backend verifica que todos los IDs pertenecen a esta empresa
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/bulk-delete`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), empresa_id: empresaIdGestion }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => !selectedIds.has(Number(r.id))));
      setSelectedIds(new Set());
      if (ficheiroActivo) await cargarFicheros();
      await cargarDash();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando");
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

  // ── Modal ─────────────────────────────────────────────────────────────────

  const filaSeleccionada = filaIdx !== null ? filas[filaIdx] : null;
  const modalConfig: ObjecionDetalleConfig = { tipo: activeTab, camposLectura: tab.camposLectura };

  const handleSave = async (respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string }) => {
    if (filaIdx === null || !token || !empresaIdGestion) return;
    setSaving(true);
    const fila = filas[filaIdx];
    try {
      // empresa_id como query param — el backend verifica que la objeción pertenece a esta empresa
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
      await cargarDash();
      setModalOpen(false); setFilaIdx(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally { setSaving(false); }
  };

  // ── Descripción dashboard ─────────────────────────────────────────────────

  const dashDesc = empresaFiltroId
    ? `${empresas.find((e) => e.id === empresaFiltroId)?.nombre ?? "Empresa"} · ${dash?.total ?? 0} objeciones · ${dash?.pendientes ?? 0} pendientes`
    : `Todas las empresas · ${dash?.total ?? 0} objeciones · ${dash?.pendientes ?? 0} pendientes`;

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
    <div className="text-sm">
      <input ref={fileInputRef} type="file" accept=".0,.1,.2,.3,.4,.5,.6,.7,.8,.9,.csv,.txt" multiple style={{ display: "none" }} onChange={handleFileChange} />
      {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}

      {/* ── PANEL 1: Dashboard ─────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setDashOpen((v) => !v)}>
          <div>
            <div style={panelTitleStyle}>Resumen de objeciones</div>
            <div style={panelDescStyle}>{dashDesc}</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={(e) => { e.stopPropagation(); setDashOpen((v) => !v); }}>
            {dashOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {dashOpen && (
          <DashboardPanel dash={dash} loading={dashLoading} empresaFiltroId={empresaFiltroId} empresas={empresas} />
        )}
      </div>

      {/* ── PANEL 2: Gestión ───────────────────────────────────────────── */}
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
                <div className="flex items-center justify-between gap-2" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none", marginBottom: 1 }}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleImportClick} disabled={importing || !empresaIdGestion}
                      className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}
                      title={!empresaIdGestion ? "Selecciona una empresa para importar" : ""}>
                      <IconFolder />
                      {importing ? "Importando..." : tab.importLabel}
                    </button>
                    {!empresaIdGestion && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Selecciona una empresa para importar</span>
                    )}
                  </div>
                  <span className="ui-muted" style={{ fontSize: "11px" }}>
                    {loadingFicheros ? "Cargando..." : !empresaIdGestion ? "Selecciona empresa" : `${ficheros.length} fichero${ficheros.length !== 1 ? "s" : ""}`}
                  </span>
                </div>

                <div className="ui-table-wrap">
                  <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead className="ui-thead">
                      <tr>
                        <th className="ui-th" style={{ width: 28 }}></th>
                        <th className="ui-th">Fichero</th>
                        <th className="ui-th">Cargado</th>
                        <th className="ui-th" style={{ textAlign: "center" }}>Total</th>
                        <th className="ui-th" style={{ textAlign: "center" }}>Pendientes</th>
                        <th className="ui-th" style={{ textAlign: "center" }}>Aceptadas</th>
                        <th className="ui-th" style={{ textAlign: "center" }}>Rechazadas</th>
                        <th className="ui-th">Estado</th>
                        <th className="ui-th">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!empresaIdGestion ? (
                        <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                          Selecciona una empresa para ver sus ficheros
                        </td></tr>
                      ) : loadingFicheros ? (
                        <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                      ) : ficheros.length === 0 ? (
                        <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                          Sin ficheros importados · Usa &quot;{tab.importLabel}&quot; para cargar
                        </td></tr>
                      ) : (
                        ficheros.map((f) => (
                          <tr key={f.nombre_fichero} className="ui-tr" style={{ cursor: "pointer" }} onClick={() => setFicheroActivo(f.nombre_fichero)}>
                            <td className="ui-td" style={{ width: 28, color: "var(--text-muted)", textAlign: "center" }}><IconChevron /></td>
                            <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "10px" }}>{f.nombre_fichero}</td>
                            <td className="ui-td ui-muted">{fmtDate(f.created_at)}</td>
                            <td className="ui-td" style={{ textAlign: "center", fontWeight: 500 }}>{f.total}</td>
                            <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.pendientes} variant="neutral" /></td>
                            <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.aceptadas} variant="ok" /></td>
                            <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.rechazadas} variant="err" /></td>
                            {/* ── Estado ── */}
                            <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleSftp(f.nombre_fichero, e)}
                                  title={f.enviado_sftp_at ? `Enviado ${fmtDate(f.enviado_sftp_at)} · Click para desmarcar` : "No enviado · Click para marcar"}
                                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 3 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 2, background: f.enviado_sftp_at ? "#378ADD" : "var(--card-border)" }} />
                                  <span style={{ fontSize: 8, color: "var(--text-muted)" }}>sftp</span>
                                </button>
                              </div>
                            </td>
                            {/* ── Acciones (menú 3 puntos) ── */}
                            <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                              <div style={{ position: "relative" }} data-menu-container onClick={(e) => e.stopPropagation()}>
                                <button type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (menuAbierto === f.nombre_fichero) {
                                      setMenuAbierto(null);
                                    } else {
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                      setMenuAbierto(f.nombre_fichero);
                                    }
                                  }}
                                  className="ui-btn ui-btn-ghost ui-btn-xs"
                                  style={{ padding: "4px 7px", display: "flex", alignItems: "center" }}>
                                  <IconDotsV />
                                </button>
                                {menuAbierto === f.nombre_fichero && (
                                  <div style={{
                                    position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 200,
                                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                                    borderRadius: 8, minWidth: 155, overflow: "hidden",
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                  }}>
                                    <button type="button"
                                      onClick={() => { setMenuAbierto(null); handleGenerate(f.nombre_fichero); }}
                                      disabled={generating || (f.aceptadas + f.rechazadas) === 0}
                                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                                      <IconDownload />
                                      {TIPO_GENERA_ZIP[activeTab] ? "Generar ZIP" : "Generar REOB"}
                                    </button>
                                    <button type="button"
                                      onClick={() => { setMenuAbierto(null); abrirSftpModal(f.nombre_fichero); }}
                                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                                      <IconSend />
                                      Enviar al SFTP
                                    </button>
                                    <div style={{ height: "0.5px", background: "var(--card-border)", margin: "2px 0" }} />
                                    <button type="button"
                                      onClick={() => { setMenuAbierto(null); handleDeleteFichero(f.nombre_fichero); }}
                                      disabled={deleting}
                                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "#E24B4A", textAlign: "left" }}>
                                      <IconTrash />
                                      Eliminar fichero
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── NIVEL 2: objeciones del fichero ── */}
            {ficheiroActivo !== null && (
              <>
                {tabBar}

                {/* Breadcrumb */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none", borderBottom: "none" }}>
                  <button type="button" onClick={() => setFicheroActivo(null)} className="ui-btn ui-btn-outline ui-btn-xs">← Volver</button>
                  <span className="ui-muted" style={{ fontSize: 11 }}>{activeTab} ›</span>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--text)" }}>{ficheiroActivo}</span>
                </div>

                {/* Toolbar nivel 2 */}
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

      {/* ── PANEL 3: Historial REOB ───────────────────────────────────── */}
      <HistorialPanel
        token={token}
        empresaFiltroId={empresaFiltroId}
        setEmpresaFiltroId={setEmpresaFiltroId}
        empresas={empresas}
      />

      {/* ── Modal envío SFTP ──────────────────────────────────────────── */}
      {sftpModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSftpModalOpen(false); }}>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 20, width: 460, maxHeight: "80vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Enviar al concentrador secundario</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>{sftpFichero}</div>
              </div>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={() => setSftpModalOpen(false)}>✕</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Conexión SFTP (concentrador secundario)</label>
              {sftpConfigs.length === 0 ? (
                <div style={{ fontSize: 11, color: "#E24B4A", padding: "8px 10px", background: "rgba(226,75,74,0.08)", borderRadius: 6 }}>
                  No hay conexiones CS configuradas para esta empresa
                </div>
              ) : (
                <select className="ui-select" style={{ fontSize: 11, width: "100%" }}
                  value={sftpConfigId ?? ""}
                  onChange={async (e) => {
                    const id = Number(e.target.value);
                    setSftpConfigId(id);
                    const cfg = sftpConfigs.find(c => c.id === id);
                    const pathInicial = cfg?.directorio_remoto || "/";
                    setSftpPath(pathInicial);
                    setSftpCarpetas([]);
                    await cargarCarpetasSftp(id, pathInicial);
                  }}>

                  <option value="">Selecciona conexión...</option>
                  {sftpConfigs.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} — {c.host}</option>
                  ))}
                </select>
              )}
            </div>

            {sftpConfigId && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Carpeta destino</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <input
                    type="text"
                    className="ui-input"
                    style={{ fontSize: 11, fontFamily: "monospace", flex: 1 }}
                    value={sftpPath}
                    onChange={(e) => setSftpPath(e.target.value)}
                    placeholder="/ruta/destino"
                  />
                  {sftpPath !== "/" && (
                    <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10, whiteSpace: "nowrap" }}
                      onClick={() => {
                        const padre = sftpPath.split("/").filter(Boolean).slice(0, -1).join("/");
                        const nuevaRuta = padre ? `/${padre}` : "/";
                        cargarCarpetasSftp(sftpConfigId, nuevaRuta);
                      }}>← Subir</button>
                  )}
                </div>
                {sftpLoadingPath ? (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "6px 0" }}>Cargando carpetas...</div>
                ) : sftpCarpetas.length === 0 ? (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "6px 0" }}>Sin subcarpetas — se enviará a la ruta indicada</div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    {sftpCarpetas.map(c => (
                      <button key={c.path} type="button"
                        onClick={() => cargarCarpetasSftp(sftpConfigId, c.path)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, border: "none", background: "var(--field-bg-soft)", cursor: "pointer", textAlign: "left", fontSize: 11, color: "var(--text)" }}>
                        📁 {c.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sftpError && <div style={{ fontSize: 11, color: "#E24B4A", padding: "8px 10px", background: "rgba(226,75,74,0.08)", borderRadius: 6, marginBottom: 10 }}>{sftpError}</div>}
            {sftpOk    && <div style={{ fontSize: 11, color: "#1D9E75", padding: "8px 10px", background: "rgba(29,158,117,0.08)", borderRadius: 6, marginBottom: 10 }}>{sftpOk}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={() => setSftpModalOpen(false)}>Cancelar</button>
              <button type="button" className="ui-btn ui-btn-primary ui-btn-xs"
                disabled={!sftpConfigId || sftpEnviando}
                onClick={handleEnviarSftp}
                style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconSend />
                {sftpEnviando ? "Enviando..." : "Enviar al SFTP"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ObjecionDetalleModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFilaIdx(null); }}
        onSave={handleSave}
        config={modalConfig}
        fila={filaSeleccionada}
        saving={saving}
      />
    </div>
  );
}
