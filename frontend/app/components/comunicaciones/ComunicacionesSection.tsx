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
  activo: boolean;
}

interface FtpConfigForm {
  empresa_id: number | "";
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  directorio_remoto: string;
  activo: boolean;
}

interface FtpFichero {
  nombre: string;
  tamanio: number;
  fecha: string;
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

interface ComunicacionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

// ─── Estilos panel ────────────────────────────────────────────────────────────

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

// ─── Iconos ───────────────────────────────────────────────────────────────────

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconEdit = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const FORM_VACIO: FtpConfigForm = {
  empresa_id: "", host: "cs.6eis.es", puerto: 22221,
  usuario: "", password: "", directorio_remoto: "/", activo: true,
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ComunicacionesSection({ token, currentUser: _currentUser }: ComunicacionesSectionProps) {

  // ── Paneles ───────────────────────────────────────────────────────────────
  const [panel1Open, setPanel1Open] = useState(true);
  const [panel2Open, setPanel2Open] = useState(false);
  const [panel3Open, setPanel3Open] = useState(false);

  // ── Empresas ──────────────────────────────────────────────────────────────
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // ── Panel 1: Configuraciones FTP ─────────────────────────────────────────
  const [configs, setConfigs]         = useState<FtpConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorConfigs, setErrorConfigs]     = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState<number | null>(null);
  const [form, setForm]               = useState<FtpConfigForm>(FORM_VACIO);
  const [savingForm, setSavingForm]   = useState(false);
  const [testingId, setTestingId]     = useState<number | null>(null);
  const [testResult, setTestResult]   = useState<Record<number, { ok: boolean; msg: string }>>({});

  // ── Panel 2: Explorador remoto ────────────────────────────────────────────
  const [explorerEmpresaId, setExplorerEmpresaId] = useState<number | "">("");
  const [ficheros, setFicheros]       = useState<FtpFichero[]>([]);
  const [loadingFicheros, setLoadingFicheros] = useState(false);
  const [errorFicheros, setErrorFicheros]     = useState<string | null>(null);
  const [selectedFicheros, setSelectedFicheros] = useState<Set<string>>(new Set());
  const [descargando, setDescargando] = useState(false);
  const [filtroNombre, setFiltroNombre] = useState("");

  // ── Panel 3: Historial ────────────────────────────────────────────────────
  const [logs, setLogs]               = useState<FtpLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorLogs, setErrorLogs]     = useState<string | null>(null);

  // ── Cargar empresas ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then((r) => r.ok ? r.json() : [])
      .then((data: EmpresaOption[]) => setEmpresas(data))
      .catch(() => {});
  }, [token]);

  // ── Cargar configs FTP ────────────────────────────────────────────────────
  const cargarConfigs = useCallback(async () => {
    if (!token) return;
    setLoadingConfigs(true); setErrorConfigs(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConfigs(await res.json());
    } catch (e: unknown) {
      setErrorConfigs(e instanceof Error ? e.message : "Error cargando configuraciones");
    } finally { setLoadingConfigs(false); }
  }, [token]);

  useEffect(() => { if (panel1Open) cargarConfigs(); }, [panel1Open, cargarConfigs]);

  // ── Guardar config FTP ────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    if (!token || !form.empresa_id) return;
    setSavingForm(true); setErrorConfigs(null);
    try {
      const url = editId
        ? `${API_BASE_URL}/ftp/configs/${editId}`
        : `${API_BASE_URL}/ftp/configs`;
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

  // ── Borrar config FTP ─────────────────────────────────────────────────────
  const handleDeleteConfig = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs/${id}`, { method: "DELETE", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch (e: unknown) {
      setErrorConfigs(e instanceof Error ? e.message : "Error borrando");
    }
  };

  // ── Probar conexión ───────────────────────────────────────────────────────
  const handleTest = async (id: number) => {
    if (!token) return;
    setTestingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/test/${id}`, { method: "POST", headers: getAuthHeaders(token) });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [id]: { ok: res.ok, msg: data.message || (res.ok ? "Conexión exitosa" : "Error de conexión") } }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { ok: false, msg: "No se pudo conectar" } }));
    } finally { setTestingId(null); }
  };

  // ── Listar ficheros remotos ───────────────────────────────────────────────
  const handleListar = async () => {
    if (!token || !explorerEmpresaId) return;
    setLoadingFicheros(true); setErrorFicheros(null); setFicheros([]); setSelectedFicheros(new Set());
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/listar/${explorerEmpresaId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros(await res.json());
    } catch (e: unknown) {
      setErrorFicheros(e instanceof Error ? e.message : "Error listando ficheros");
    } finally { setLoadingFicheros(false); }
  };

  // ── Descargar ficheros seleccionados ──────────────────────────────────────
  const handleDescargar = async () => {
    if (!token || !explorerEmpresaId || selectedFicheros.size === 0) return;
    setDescargando(true); setErrorFicheros(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/descargar/${explorerEmpresaId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ficheros: Array.from(selectedFicheros) }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      alert(`Descargados ${data.descargados ?? 0} fichero(s) correctamente.`);
      setSelectedFicheros(new Set());
      if (panel3Open) cargarLogs();
    } catch (e: unknown) {
      setErrorFicheros(e instanceof Error ? e.message : "Error descargando");
    } finally { setDescargando(false); }
  };

  // ── Cargar historial ──────────────────────────────────────────────────────
  const cargarLogs = useCallback(async () => {
    if (!token) return;
    setLoadingLogs(true); setErrorLogs(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/logs`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setLogs(await res.json());
    } catch (e: unknown) {
      setErrorLogs(e instanceof Error ? e.message : "Error cargando historial");
    } finally { setLoadingLogs(false); }
  }, [token]);

  useEffect(() => { if (panel3Open) cargarLogs(); }, [panel3Open, cargarLogs]);

  // ── Filtro ficheros ───────────────────────────────────────────────────────
  const ficherosFiltrados = ficheros.filter((f) =>
    f.nombre.toLowerCase().includes(filtroNombre.toLowerCase())
  );

  const toggleFichero = (nombre: string) => {
    setSelectedFicheros((prev) => {
      const s = new Set(prev); s.has(nombre) ? s.delete(nombre) : s.add(nombre); return s;
    });
  };
  const toggleTodos = () => {
    if (selectedFicheros.size === ficherosFiltrados.length) setSelectedFicheros(new Set());
    else setSelectedFicheros(new Set(ficherosFiltrados.map((f) => f.nombre)));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="text-sm">

      {/* ── PANEL 1: Configuraciones FTP ──────────────────────────────── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanel1Open((v) => !v)}>
          <div>
            <div style={panelTitleStyle}>Conexiones FTP</div>
            <div style={panelDescStyle}>
              Configura y gestiona las conexiones FTPS por empresa
            </div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={(e) => { e.stopPropagation(); setPanel1Open((v) => !v); }}>
            {panel1Open ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {panel1Open && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>

            {errorConfigs && <div className="ui-alert ui-alert--danger mb-3">{errorConfigs}</div>}

            {/* Botón añadir */}
            {!showForm && (
              <div style={{ marginBottom: 14 }}>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => { setShowForm(true); setEditId(null); setForm(FORM_VACIO); }}>
                  <IconPlus /> Añadir conexión FTP
                </button>
              </div>
            )}

            {/* Formulario añadir/editar */}
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
                      onChange={(e) => setForm((f) => ({ ...f, empresa_id: Number(e.target.value) }))}>
                      <option value="">Selecciona empresa</option>
                      {empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Host</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.host}
                      onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                      placeholder="cs.6eis.es" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Puerto</label>
                    <input className="ui-input" type="number" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.puerto}
                      onChange={(e) => setForm((f) => ({ ...f, puerto: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Usuario</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.usuario}
                      onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))}
                      placeholder="0276" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                      {editId ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
                    </label>
                    <input className="ui-input" type="password" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={editId ? "••••••••" : "Contraseña FTP"} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Directorio remoto</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.directorio_remoto}
                      onChange={(e) => setForm((f) => ({ ...f, directorio_remoto: e.target.value }))}
                      placeholder="/" />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <input type="checkbox" id="activo-chk" checked={form.activo}
                    onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
                  <label htmlFor="activo-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>Conexión activa</label>
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

            {/* Tabla de conexiones */}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Empresa</th>
                    <th className="ui-th">Host</th>
                    <th className="ui-th">Puerto</th>
                    <th className="ui-th">Usuario</th>
                    <th className="ui-th">Directorio</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Estado</th>
                    <th className="ui-th">Test</th>
                    <th className="ui-th">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConfigs ? (
                    <tr className="ui-tr"><td colSpan={8} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : configs.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={8} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin conexiones configuradas · Pulsa &quot;Añadir conexión FTP&quot; para empezar
                    </td></tr>
                  ) : (
                    configs.map((c) => (
                      <tr key={c.id} className="ui-tr">
                        <td className="ui-td" style={{ fontWeight: 500 }}>{c.empresa_nombre}</td>
                        <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>{c.host}</td>
                        <td className="ui-td">{c.puerto}</td>
                        <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>{c.usuario}</td>
                        <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>{c.directorio_remoto}</td>
                        <td className="ui-td" style={{ textAlign: "center" }}>
                          <span className={`ui-badge ${c.activo ? "ui-badge--ok" : "ui-badge--neutral"}`}>
                            {c.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td className="ui-td">
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button type="button"
                              className="ui-btn ui-btn-outline ui-btn-xs"
                              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}
                              onClick={() => handleTest(c.id)}
                              disabled={testingId === c.id}>
                              <IconCheck />
                              {testingId === c.id ? "Probando..." : "Probar"}
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
                                setForm({ empresa_id: c.empresa_id, host: c.host, puerto: c.puerto, usuario: c.usuario, password: "", directorio_remoto: c.directorio_remoto, activo: c.activo });
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── PANEL 2: Explorador remoto ────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanel2Open((v) => !v)}>
          <div>
            <div style={panelTitleStyle}>Explorador FTP remoto</div>
            <div style={panelDescStyle}>Navega y descarga ficheros desde el servidor FTP</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={(e) => { e.stopPropagation(); setPanel2Open((v) => !v); }}>
            {panel2Open ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {panel2Open && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>

            {/* Selector empresa + botón listar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Empresa:</span>
              <select className="ui-select"
                style={{ fontSize: 11, padding: "4px 8px", minWidth: 160, height: 28 }}
                value={explorerEmpresaId}
                onChange={(e) => {
                  setExplorerEmpresaId(e.target.value === "" ? "" : Number(e.target.value));
                  setFicheros([]); setSelectedFicheros(new Set()); setErrorFicheros(null);
                }}>
                <option value="">Selecciona empresa</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>
                ))}
              </select>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ display: "flex", alignItems: "center", gap: 5 }}
                onClick={handleListar}
                disabled={!explorerEmpresaId || loadingFicheros}>
                <IconRefresh /> {loadingFicheros ? "Listando..." : "Listar ficheros"}
              </button>
              {ficheros.length > 0 && (
                <>
                  <input
                    className="ui-input"
                    style={{ fontSize: 11, height: 28, width: 180 }}
                    placeholder="Filtrar por nombre..."
                    value={filtroNombre}
                    onChange={(e) => setFiltroNombre(e.target.value)}
                  />
                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                    style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}
                    onClick={handleDescargar}
                    disabled={selectedFicheros.size === 0 || descargando}>
                    <IconDownload />
                    {descargando ? "Descargando..." : `Descargar${selectedFicheros.size > 0 ? ` (${selectedFicheros.size})` : ""}`}
                  </button>
                </>
              )}
            </div>

            {errorFicheros && <div className="ui-alert ui-alert--danger mb-3">{errorFicheros}</div>}

            {/* Tabla ficheros remotos */}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th" style={{ width: 36, textAlign: "center" }}>
                      {ficherosFiltrados.length > 0 && (
                        <input type="checkbox"
                          checked={selectedFicheros.size === ficherosFiltrados.length && ficherosFiltrados.length > 0}
                          onChange={toggleTodos}
                          style={{ cursor: "pointer" }} />
                      )}
                    </th>
                    <th className="ui-th">Fichero</th>
                    <th className="ui-th">Tamaño</th>
                    <th className="ui-th">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {!explorerEmpresaId ? (
                    <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Selecciona una empresa y pulsa &quot;Listar ficheros&quot;
                    </td></tr>
                  ) : loadingFicheros ? (
                    <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Conectando al FTP...</td></tr>
                  ) : ficherosFiltrados.length === 0 && ficheros.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin ficheros · Pulsa &quot;Listar ficheros&quot; para conectar al FTP
                    </td></tr>
                  ) : ficherosFiltrados.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={4} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin resultados para &quot;{filtroNombre}&quot;
                    </td></tr>
                  ) : (
                    ficherosFiltrados.map((f) => (
                      <tr key={f.nombre} className="ui-tr"
                        style={{ cursor: "pointer", background: selectedFicheros.has(f.nombre) ? "var(--nav-item-hover)" : undefined }}
                        onClick={() => toggleFichero(f.nombre)}>
                        <td className="ui-td" style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={selectedFicheros.has(f.nombre)}
                            onChange={() => toggleFichero(f.nombre)}
                            style={{ cursor: "pointer" }}
                            onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>{f.nombre}</td>
                        <td className="ui-td ui-muted">{fmtSize(f.tamanio)}</td>
                        <td className="ui-td ui-muted">{fmtDate(f.fecha)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── PANEL 3: Historial ────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanel3Open((v) => !v)}>
          <div>
            <div style={panelTitleStyle}>Historial de descargas</div>
            <div style={panelDescStyle}>Log de ficheros descargados desde FTP con estado y errores</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={(e) => { e.stopPropagation(); setPanel3Open((v) => !v); }}>
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
              <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
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
                    <tr className="ui-tr"><td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando historial...</td></tr>
                  ) : logs.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin descargas registradas
                    </td></tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="ui-tr">
                        <td className="ui-td" style={{ fontWeight: 500 }}>{log.empresa_nombre}</td>
                        <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>{log.nombre_fichero}</td>
                        <td className="ui-td" style={{ textAlign: "center" }}>
                          <span className={`ui-badge ${log.estado === "ok" ? "ui-badge--ok" : "ui-badge--err"}`}>
                            {log.estado === "ok" ? "OK" : "Error"}
                          </span>
                        </td>
                        <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{log.mensaje_error ?? "—"}</td>
                        <td className="ui-td ui-muted">{fmtDate(log.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
