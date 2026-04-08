"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FtpConfig {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  host: string;
  puerto: number;
  usuario: string;
  directorio_remoto: string;
  usar_tls: boolean;
  activo: boolean;
}

interface FtpConfigForm {
  empresa_id: number | "";
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  directorio_remoto: string;
  usar_tls: boolean;
  activo: boolean;
}

interface FtpCarpeta {
  nombre: string;
  path: string;
}

interface FtpFichero {
  nombre: string;
  tamanio: number;
  fecha: string;
}

interface ExplorerResult {
  path_actual: string;
  path_padre: string;
  carpetas: FtpCarpeta[];
  ficheros: FtpFichero[];
  total_ficheros: number;
}

interface FtpLog {
  id: number;
  empresa_nombre: string;
  nombre_fichero: string;
  estado: "ok" | "error";
  mensaje_error: string | null;
  created_at: string;
}

interface EmpresaOption {
  id: number;
  nombre: string;
  codigo_ree: string | null;
}

interface Props {
  token: string | null;
  currentUser: User | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return s; }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const FORM_VACIO: FtpConfigForm = {
  empresa_id: "", host: "www.asemeservicios.com", puerto: 22221,
  usuario: "", password: "", directorio_remoto: "/", usar_tls: true, activo: true,
};

const ANIOS = [2023, 2024, 2025, 2026];
const MESES = [
  { v: "01", l: "Enero" },    { v: "02", l: "Febrero" },   { v: "03", l: "Marzo" },
  { v: "04", l: "Abril" },    { v: "05", l: "Mayo" },       { v: "06", l: "Junio" },
  { v: "07", l: "Julio" },    { v: "08", l: "Agosto" },     { v: "09", l: "Septiembre" },
  { v: "10", l: "Octubre" },  { v: "11", l: "Noviembre" },  { v: "12", l: "Diciembre" },
];

// ─── Iconos ───────────────────────────────────────────────────────────────────

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#EF9F27", flexShrink: 0 }}>
    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
  </svg>
);
const IconFile = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);
const IconUp = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconEdit = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ─── Panel styles ─────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "10px", overflow: "hidden", marginBottom: "10px",
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

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ComunicacionesSection({ token }: Props) {

  const [panel1Open, setPanel1Open] = useState(true);
  const [panel2Open, setPanel2Open] = useState(false);
  const [panel3Open, setPanel3Open] = useState(false);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // Panel 1 — Configs
  const [configs, setConfigs]               = useState<FtpConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorConfigs, setErrorConfigs]     = useState<string | null>(null);
  const [showForm, setShowForm]             = useState(false);
  const [editId, setEditId]                 = useState<number | null>(null);
  const [form, setForm]                     = useState<FtpConfigForm>(FORM_VACIO);
  const [savingForm, setSavingForm]         = useState(false);
  const [testingId, setTestingId]           = useState<number | null>(null);
  const [testResult, setTestResult]         = useState<Record<number, { ok: boolean; msg: string }>>({});

  // Panel 2 — Explorador
  const [explorerEmpresaId, setExplorerEmpresaId] = useState<number | "">("");
  const [explorerResult, setExplorerResult]       = useState<ExplorerResult | null>(null);
  const [loadingExplorer, setLoadingExplorer]     = useState(false);
  const [errorExplorer, setErrorExplorer]         = useState<string | null>(null);
  const [selectedFicheros, setSelectedFicheros]   = useState<Set<string>>(new Set());
  const [filtroNombre, setFiltroNombre]           = useState("");
  const [filtroMesNum, setFiltroMesNum]           = useState("");
  const [filtroAnioNum, setFiltroAnioNum]         = useState("");
  const [descargando, setDescargando]             = useState(false);
  const [requiereFiltro, setRequiereFiltro]       = useState(false);

  // Panel 3 — Logs
  const [logs, setLogs]               = useState<FtpLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorLogs, setErrorLogs]     = useState<string | null>(null);

  const anioDefault = new Date().getFullYear().toString();
  const filtroMes = filtroMesNum ? `${filtroAnioNum || anioDefault}-${filtroMesNum}` : "";

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: EmpresaOption[]) => setEmpresas(d))
      .catch(() => {});
  }, [token]);

  const cargarConfigs = useCallback(async () => {
    if (!token) return;
    setLoadingConfigs(true); setErrorConfigs(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConfigs(await res.json());
    } catch (e: unknown) {
      setErrorConfigs(e instanceof Error ? e.message : "Error");
    } finally { setLoadingConfigs(false); }
  }, [token]);

  useEffect(() => { if (panel1Open) cargarConfigs(); }, [panel1Open, cargarConfigs]);

  const handleSaveConfig = async () => {
    if (!token || !form.empresa_id) return;
    setSavingForm(true); setErrorConfigs(null);
    try {
      const url = editId ? `${API_BASE_URL}/ftp/configs/${editId}` : `${API_BASE_URL}/ftp/configs`;
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      await cargarConfigs();
      setShowForm(false); setEditId(null); setForm(FORM_VACIO);
    } catch (e: unknown) {
      setErrorConfigs(e instanceof Error ? e.message : "Error guardando");
    } finally { setSavingForm(false); }
  };

  const handleDeleteConfig = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs/${id}`, { method: "DELETE", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch (e: unknown) {
      setErrorConfigs(e instanceof Error ? e.message : "Error borrando");
    }
  };

  const handleTest = async (id: number) => {
    if (!token) return;
    setTestingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/test/${id}`, { method: "POST", headers: getAuthHeaders(token) });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [id]: { ok: res.ok, msg: data.message || (res.ok ? "Conexión exitosa" : "Error") } }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: { ok: false, msg: "No se pudo conectar" } }));
    } finally { setTestingId(null); }
  };

  const explorarPath = useCallback(async (path: string, nombre?: string, mes?: string) => {
    if (!token || !explorerEmpresaId) return;
    setLoadingExplorer(true); setErrorExplorer(null); setSelectedFicheros(new Set());
    try {
      const params = new URLSearchParams({ path, limite: "5000" });
      if (nombre && nombre.trim()) params.set("filtro_nombre", nombre.trim());
      if (mes && mes.trim()) params.set("filtro_mes", mes.trim());
      const res = await fetch(`${API_BASE_URL}/ftp/explorar/${explorerEmpresaId}?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: ExplorerResult = await res.json();
      setExplorerResult(data);
      setRequiereFiltro(data.total_ficheros >= 5000 && !nombre && !mes);
    } catch (e: unknown) {
      setErrorExplorer(e instanceof Error ? e.message : "Error explorando FTP");
    } finally { setLoadingExplorer(false); }
  }, [token, explorerEmpresaId]);

  const handleCambiarEmpresa = (id: number | "") => {
    setExplorerEmpresaId(id);
    setExplorerResult(null); setErrorExplorer(null);
    setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum("");
    setSelectedFicheros(new Set()); setRequiereFiltro(false);
  };

  const handleIrRaiz = () => {
    if (!explorerEmpresaId) return;
    const config = configs.find(c => c.empresa_id === explorerEmpresaId);
    const raiz = config?.directorio_remoto || "/";
    setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum("");
    explorarPath(raiz);
  };

  const handleBuscar = () => {
    if (!explorerResult) return;
    explorarPath(explorerResult.path_actual, filtroNombre, filtroMes);
  };

  const handleLimpiar = () => {
    if (!explorerResult) return;
    setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum("");
    explorarPath(explorerResult.path_actual);
  };

  const handleDescargar = async () => {
    if (!token || !explorerEmpresaId || selectedFicheros.size === 0 || !explorerResult) return;
    setDescargando(true); setErrorExplorer(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/descargar/${explorerEmpresaId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ path: explorerResult.path_actual, ficheros: Array.from(selectedFicheros) }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      alert(`Descargados ${data.descargados ?? 0} fichero(s) correctamente.`);
      setSelectedFicheros(new Set());
      if (panel3Open) cargarLogs();
    } catch (e: unknown) {
      setErrorExplorer(e instanceof Error ? e.message : "Error descargando");
    } finally { setDescargando(false); }
  };

  const toggleFichero = (nombre: string) => {
    setSelectedFicheros(prev => {
      const s = new Set(prev); s.has(nombre) ? s.delete(nombre) : s.add(nombre); return s;
    });
  };
  const toggleTodos = () => {
    const todos = explorerResult?.ficheros ?? [];
    if (selectedFicheros.size === todos.length) setSelectedFicheros(new Set());
    else setSelectedFicheros(new Set(todos.map(f => f.nombre)));
  };

  const cargarLogs = useCallback(async () => {
    if (!token) return;
    setLoadingLogs(true); setErrorLogs(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/logs`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setLogs(await res.json());
    } catch (e: unknown) {
      setErrorLogs(e instanceof Error ? e.message : "Error");
    } finally { setLoadingLogs(false); }
  }, [token]);

  useEffect(() => { if (panel3Open) cargarLogs(); }, [panel3Open, cargarLogs]);

  const renderBreadcrumb = () => {
    if (!explorerResult) return null;
    const path = explorerResult.path_actual;
    const partes = path.split("/").filter(Boolean);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, flexWrap: "wrap" }}>
        <span style={{ cursor: "pointer", color: "var(--primary, #378ADD)" }}
          onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath("/"); }}>
          /
        </span>
        {partes.map((parte, i) => {
          const subpath = "/" + partes.slice(0, i + 1).join("/");
          const esActual = i === partes.length - 1;
          return (
            <span key={subpath} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-muted)" }}>/</span>
              <span
                style={{ cursor: esActual ? "default" : "pointer", color: esActual ? "var(--text)" : "var(--primary, #378ADD)", fontWeight: esActual ? 500 : 400 }}
                onClick={() => { if (!esActual) { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath(subpath); } }}>
                {parte}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  const hayFiltros = filtroNombre.trim() || filtroMes;

  return (
    <div className="text-sm">

      {/* ── PANEL 1: Configuraciones FTP ── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanel1Open(v => !v)}>
          <div>
            <div style={panelTitleStyle}>Conexiones FTP</div>
            <div style={panelDescStyle}>Configura y gestiona las conexiones FTP/FTPS por empresa</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanel1Open(v => !v); }}>
            {panel1Open ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {panel1Open && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorConfigs && <div className="ui-alert ui-alert--danger mb-3">{errorConfigs}</div>}

            {!showForm && (
              <div style={{ marginBottom: 14 }}>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => { setShowForm(true); setEditId(null); setForm(FORM_VACIO); }}>
                  <IconPlus /> Añadir conexión FTP
                </button>
              </div>
            )}

            {showForm && (
              <div style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {editId ? "Editar conexión" : "Nueva conexión FTP"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.empresa_id}
                      onChange={e => setForm(f => ({ ...f, empresa_id: Number(e.target.value) }))}>
                      <option value="">Selecciona empresa</option>
                      {empresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Host</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                      placeholder="www.servidor.com" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Puerto</label>
                    <input className="ui-input" type="number" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.puerto} onChange={e => setForm(f => ({ ...f, puerto: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Usuario</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.usuario} onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
                      placeholder="usuario" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      {editId ? "Nueva contraseña (vacío = no cambiar)" : "Contraseña"}
                    </label>
                    <input className="ui-input" type="password" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder={editId ? "••••••••" : "Contraseña FTP"} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Directorio raíz</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.directorio_remoto} onChange={e => setForm(f => ({ ...f, directorio_remoto: e.target.value }))}
                      placeholder="/" />
                  </div>
                </div>
                {/* Checkboxes: TLS y Activo */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" id="usar-tls-chk" checked={form.usar_tls}
                      onChange={e => setForm(f => ({ ...f, usar_tls: e.target.checked }))} />
                    <label htmlFor="usar-tls-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Usar TLS/FTPS
                    </label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" id="activo-chk" checked={form.activo}
                      onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                    <label htmlFor="activo-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>Conexión activa</label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={handleSaveConfig} disabled={savingForm || !form.empresa_id}>
                    {savingForm ? "Guardando..." : editId ? "Guardar cambios" : "Crear conexión"}
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                    onClick={() => { setShowForm(false); setEditId(null); setForm(FORM_VACIO); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Empresa</th>
                    <th className="ui-th">Host</th>
                    <th className="ui-th">Puerto</th>
                    <th className="ui-th">Usuario</th>
                    <th className="ui-th">Directorio raíz</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Cifrado</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Estado</th>
                    <th className="ui-th">Test</th>
                    <th className="ui-th">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConfigs ? (
                    <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : configs.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin conexiones · Pulsa &quot;Añadir conexión FTP&quot; para empezar
                    </td></tr>
                  ) : configs.map(c => (
                    <tr key={c.id} className="ui-tr">
                      <td className="ui-td" style={{ fontWeight: 500 }}>{c.empresa_nombre}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.host}</td>
                      <td className="ui-td">{c.puerto}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.usuario}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.directorio_remoto}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>
                        <span className={`ui-badge ${c.usar_tls ? "ui-badge--ok" : "ui-badge--neutral"}`}>
                          {c.usar_tls ? "TLS" : "FTP"}
                        </span>
                      </td>
                      <td className="ui-td" style={{ textAlign: "center" }}>
                        <span className={`ui-badge ${c.activo ? "ui-badge--ok" : "ui-badge--neutral"}`}>
                          {c.activo ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="ui-td">
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}
                            onClick={() => handleTest(c.id)} disabled={testingId === c.id}>
                            <IconCheck /> {testingId === c.id ? "Probando..." : "Probar"}
                          </button>
                          {testResult[c.id] && (
                            <span style={{ fontSize: 9, color: testResult[c.id].ok ? "#1D9E75" : "#E24B4A" }}>
                              {testResult[c.id].msg}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="ui-td">
                        <div style={{ display: "flex", gap: 5 }}>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                            style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}
                            onClick={() => {
                              setEditId(c.id);
                              setForm({ empresa_id: c.empresa_id, host: c.host, puerto: c.puerto, usuario: c.usuario, password: "", directorio_remoto: c.directorio_remoto, usar_tls: c.usar_tls, activo: c.activo });
                              setShowForm(true);
                            }}>
                            <IconEdit />
                          </button>
                          <button type="button" className="ui-btn ui-btn-danger ui-btn-xs"
                            style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}
                            onClick={() => handleDeleteConfig(c.id)}>
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── PANEL 2: Explorador FTP ── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanel2Open(v => !v)}>
          <div>
            <div style={panelTitleStyle}>Explorador FTP remoto</div>
            <div style={panelDescStyle}>Navega por carpetas y descarga ficheros desde el servidor FTP</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanel2Open(v => !v); }}>
            {panel2Open ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {panel2Open && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Empresa:</span>
              <select className="ui-select" style={{ fontSize: 11, height: 28, minWidth: 160 }}
                value={explorerEmpresaId}
                onChange={e => handleCambiarEmpresa(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Selecciona empresa</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>
                ))}
              </select>
              {explorerEmpresaId && (
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                  onClick={handleIrRaiz} disabled={loadingExplorer}>
                  <IconRefresh /> {loadingExplorer ? "Cargando..." : explorerResult ? "Recargar" : "Conectar"}
                </button>
              )}
              {explorerResult && explorerResult.path_actual !== "/" && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath(explorerResult.path_padre); }}>
                  <IconUp /> Subir nivel
                </button>
              )}
              {selectedFicheros.size > 0 && (
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}
                  onClick={handleDescargar} disabled={descargando}>
                  <IconDownload /> {descargando ? "Descargando..." : `Descargar (${selectedFicheros.size})`}
                </button>
              )}
            </div>

            {explorerResult && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Nombre del fichero</label>
                  <input className="ui-input" style={{ fontSize: 11, height: 28, width: 200 }}
                    placeholder="BALD, MAGCLOS, 0148..."
                    value={filtroNombre}
                    onChange={e => setFiltroNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleBuscar(); }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Mes de publicación</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <select className="ui-select" style={{ fontSize: 11, height: 28, width: 110 }}
                      value={filtroMesNum} onChange={e => setFiltroMesNum(e.target.value)}>
                      <option value="">Mes</option>
                      {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                    </select>
                    <select className="ui-select" style={{ fontSize: 11, height: 28, width: 78 }}
                      value={filtroAnioNum} onChange={e => setFiltroAnioNum(e.target.value)}>
                      <option value="">Año</option>
                      {ANIOS.map(a => <option key={a} value={String(a)}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5, height: 28 }}
                  onClick={handleBuscar} disabled={loadingExplorer}>
                  <IconSearch /> Buscar
                </button>
                {hayFiltros && (
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                    style={{ height: 28 }} onClick={handleLimpiar}>
                    Limpiar
                  </button>
                )}
              </div>
            )}

            {requiereFiltro && !hayFiltros && (
              <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--color-background-warning, #FAEEDA)", borderRadius: 6, fontSize: 11, color: "#854F0B", border: "1px solid #FAC775" }}>
                Esta carpeta tiene más de 5.000 ficheros. Usa los filtros para encontrar los que necesitas — por nombre (ej: <strong>BALD</strong>) o por mes de publicación.
              </div>
            )}

            {explorerResult && (
              <div style={{ marginBottom: 10, padding: "6px 10px", background: "var(--field-bg-soft)", borderRadius: 6 }}>
                {renderBreadcrumb()}
              </div>
            )}

            {errorExplorer && <div className="ui-alert ui-alert--danger mb-3">{errorExplorer}</div>}

            {!explorerEmpresaId ? (
              <div className="ui-muted text-center" style={{ padding: "32px 16px", fontSize: 11 }}>
                Selecciona una empresa y pulsa &quot;Conectar&quot;
              </div>
            ) : !explorerResult && !loadingExplorer ? (
              <div className="ui-muted text-center" style={{ padding: "32px 16px", fontSize: 11 }}>
                Pulsa &quot;Conectar&quot; para abrir el explorador FTP
              </div>
            ) : loadingExplorer ? (
              <div className="ui-muted text-center" style={{ padding: "32px 16px", fontSize: 11 }}>
                Conectando al FTP...
              </div>
            ) : explorerResult && (
              <div className="ui-table-wrap">
                <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead className="ui-thead">
                    <tr>
                      <th className="ui-th" style={{ width: 36, textAlign: "center" }}>
                        {explorerResult.ficheros.length > 0 && (
                          <input type="checkbox"
                            checked={selectedFicheros.size === explorerResult.ficheros.length && explorerResult.ficheros.length > 0}
                            onChange={toggleTodos} />
                        )}
                      </th>
                      <th className="ui-th">Nombre</th>
                      <th className="ui-th">Tamaño</th>
                      <th className="ui-th">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorerResult.carpetas.map(c => (
                      <tr key={c.path} className="ui-tr" style={{ cursor: "pointer" }}
                        onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath(c.path); }}>
                        <td className="ui-td" style={{ textAlign: "center" }}><IconFolder /></td>
                        <td className="ui-td" style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>{c.nombre}/</td>
                        <td className="ui-td ui-muted">—</td>
                        <td className="ui-td ui-muted">—</td>
                      </tr>
                    ))}
                    {explorerResult.ficheros.length === 0 && explorerResult.carpetas.length === 0 ? (
                      <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "20px 16px" }}>Carpeta vacía</td></tr>
                    ) : explorerResult.ficheros.length === 0 && hayFiltros ? (
                      <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "20px 16px" }}>
                        Sin resultados con los filtros aplicados · Prueba con otros valores
                      </td></tr>
                    ) : explorerResult.ficheros.length === 0 && requiereFiltro ? (
                      <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "20px 16px" }}>
                        Usa los filtros para buscar ficheros en esta carpeta
                      </td></tr>
                    ) : (
                      explorerResult.ficheros.map(f => (
                        <tr key={f.nombre} className="ui-tr"
                          style={{ cursor: "pointer", background: selectedFicheros.has(f.nombre) ? "var(--nav-item-hover)" : undefined }}
                          onClick={() => toggleFichero(f.nombre)}>
                          <td className="ui-td" style={{ textAlign: "center" }}>
                            <input type="checkbox" checked={selectedFicheros.has(f.nombre)}
                              onChange={() => toggleFichero(f.nombre)}
                              onClick={e => e.stopPropagation()} />
                          </td>
                          <td className="ui-td" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 10 }}>
                            <IconFile /> {f.nombre}
                          </td>
                          <td className="ui-td ui-muted">{fmtSize(f.tamanio)}</td>
                          <td className="ui-td ui-muted">{f.fecha}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {explorerResult.total_ficheros > explorerResult.ficheros.length && (
                  <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--text-muted)", borderTop: "1px solid var(--card-border)" }}>
                    Mostrando {explorerResult.ficheros.length} de {explorerResult.total_ficheros} ficheros · Usa los filtros para acotar resultados
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PANEL 3: Historial ── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanel3Open(v => !v)}>
          <div>
            <div style={panelTitleStyle}>Historial de descargas</div>
            <div style={panelDescStyle}>Log de ficheros descargados con estado y errores</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanel3Open(v => !v); }}>
            {panel3Open ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {panel3Open && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ display: "flex", alignItems: "center", gap: 5 }}
                onClick={cargarLogs} disabled={loadingLogs}>
                <IconRefresh /> {loadingLogs ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
            {errorLogs && <div className="ui-alert ui-alert--danger mb-3">{errorLogs}</div>}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Empresa</th>
                    <th className="ui-th">Fichero</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Estado</th>
                    <th className="ui-th">Detalle</th>
                    <th className="ui-th">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr className="ui-tr"><td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : logs.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Sin descargas registradas</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="ui-tr">
                      <td className="ui-td" style={{ fontWeight: 500 }}>{log.empresa_nombre}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{log.nombre_fichero}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>
                        <span className={`ui-badge ${log.estado === "ok" ? "ui-badge--ok" : "ui-badge--err"}`}>
                          {log.estado === "ok" ? "OK" : "Error"}
                        </span>
                      </td>
                      <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{log.mensaje_error ?? "—"}</td>
                      <td className="ui-td ui-muted">{fmtDate(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
