"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import TablePaginationFooter from "../ui/TablePaginationFooter";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FtpConfig {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  nombre: string | null;
  host: string;
  puerto: number;
  usuario: string;
  directorio_remoto: string;
  usar_tls: boolean;
  activo: boolean;
}

interface FtpConfigForm {
  empresa_id: number | "";
  nombre: string;
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  directorio_remoto: string;
  usar_tls: boolean;
  activo: boolean;
}

interface FtpSyncRule {
  id: number;
  config_id: number;
  config_nombre: string | null;
  empresa_nombre: string;
  nombre: string | null;
  directorio: string;
  patron_nombre: string | null;
  intervalo_horas: number;
  activo: boolean;
  ultima_ejecucion: string | null;
  proxima_ejecucion: string | null;
}

interface FtpSyncRuleForm {
  config_id: number | "";
  nombre: string;
  directorio: string;
  patron_nombre: string;
  intervalo_horas: number;
  activo: boolean;
}

interface FtpCarpeta { nombre: string; path: string; }
interface FtpFichero { nombre: string; tamanio: number; fecha: string; }

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
  config_id: number | null;
  rule_id: number | null;
  origen: string;
  nombre_fichero: string;
  estado: "ok" | "error";
  mensaje_error: string | null;
  created_at: string;
}

interface DashboardConexion {
  id: number;
  nombre: string | null;
  empresa_nombre: string;
  host: string;
  puerto: number;
  usar_tls: boolean;
  activo: boolean;
  sync_auto: boolean;
  reglas_activas: number;
  auto_hoy: number;
  manual_hoy: number;
  errores_hoy: number;
  ultimo_ok: string | null;
  ultimo_fichero: string | null;
  proxima_sync: string | null;
  ultima_ejecucion: string | null;
  ultimo_error: string | null;
  ultimo_error_msg: string | null;
  ultimo_error_fichero: string | null;
}

interface DashboardData {
  scheduler_activo: boolean;
  conexiones_activas: number;
  reglas_activas: number;
  auto_hoy: number;
  manual_hoy: number;
  errores_hoy: number;
  auto_semana: number;
  manual_semana: number;
  errores_semana: number;
  total_descargados_hoy: number;
  total_errores_hoy: number;
  ultima_descarga: string | null;
  ultimo_fichero: string | null;
  proxima_sync_global: string | null;
  conexiones: DashboardConexion[];
}

interface EmpresaOption { id: number; nombre: string; codigo_ree: string | null; }
interface Props { token: string | null; currentUser: User | null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtSizeTotal(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function labelConexion(c: FtpConfig): string {
  return `${c.nombre || c.empresa_nombre} — ${c.host} (${c.usar_tls ? "TLS" : "FTP"})`;
}

const FORM_CONFIG_VACIO: FtpConfigForm = {
  empresa_id: "", nombre: "", host: "www.asemeservicios.com", puerto: 22221,
  usuario: "", password: "", directorio_remoto: "/", usar_tls: true, activo: true,
};

const FORM_RULE_VACIO: FtpSyncRuleForm = {
  config_id: "", nombre: "", directorio: "/01/entradaHistorico",
  patron_nombre: "", intervalo_horas: 1, activo: true,
};

const ANIOS = [2023, 2024, 2025, 2026];
const MESES = [
  { v: "01", l: "Enero" }, { v: "02", l: "Febrero" }, { v: "03", l: "Marzo" },
  { v: "04", l: "Abril" }, { v: "05", l: "Mayo" }, { v: "06", l: "Junio" },
  { v: "07", l: "Julio" }, { v: "08", l: "Agosto" }, { v: "09", l: "Septiembre" },
  { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
];

// ─── Iconos ───────────────────────────────────────────────────────────────────

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#EF9F27", flexShrink: 0 }}>
    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
  </svg>
);
const IconFile = ({ selected }: { selected?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke={selected ? "var(--primary, #378ADD)" : "var(--text-muted)"}
    strokeWidth="2" style={{ flexShrink: 0 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);
const IconChevronUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);
const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="17 11 12 6 7 11"/>
    <line x1="12" y1="18" x2="12" y2="6"/>
  </svg>
);
const IconHome = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IconDownload = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconEdit = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconPlay = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
const subPanelStyle: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: 8, overflow: "hidden",
};
const subPanelHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", cursor: "pointer", userSelect: "none",
  background: "var(--field-bg-soft)",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ComunicacionesSection({ token }: Props) {

  const [panelDashOpen, setPanelDashOpen]     = useState(false);
  const [panelConfigOpen, setPanelConfigOpen] = useState(false);
  const [panelAutoOpen, setPanelAutoOpen]     = useState(false);
  const [panelManualOpen, setPanelManualOpen] = useState(false);

  const [subReglasOpen, setSubReglasOpen]         = useState(false);
  const [subHistAutoOpen, setSubHistAutoOpen]     = useState(false);
  const [subExplorerOpen, setSubExplorerOpen]     = useState(false);
  const [subHistManualOpen, setSubHistManualOpen] = useState(false);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  const [dashboard, setDashboard]     = useState<DashboardData | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [errorDash, setErrorDash]     = useState<string | null>(null);
  const [tooltipId, setTooltipId]     = useState<number | null>(null);

  const [configs, setConfigs]               = useState<FtpConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorConfigs, setErrorConfigs]     = useState<string | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editConfigId, setEditConfigId]     = useState<number | null>(null);
  const [configForm, setConfigForm]         = useState<FtpConfigForm>(FORM_CONFIG_VACIO);
  const [savingConfig, setSavingConfig]     = useState(false);
  const [testingId, setTestingId]           = useState<number | null>(null);
  const [testResult, setTestResult]         = useState<Record<number, { ok: boolean; msg: string }>>({});

  const [rules, setRules]               = useState<FtpSyncRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [errorRules, setErrorRules]     = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editRuleId, setEditRuleId]     = useState<number | null>(null);
  const [ruleForm, setRuleForm]         = useState<FtpSyncRuleForm>(FORM_RULE_VACIO);
  const [savingRule, setSavingRule]     = useState(false);
  const [executingRuleId, setExecutingRuleId] = useState<number | null>(null);

  const [logsAuto, setLogsAuto]               = useState<FtpLog[]>([]);
  const [loadingLogsAuto, setLoadingLogsAuto] = useState(false);
  const [errorLogsAuto, setErrorLogsAuto]     = useState<string | null>(null);
  const [pageLogsAuto, setPageLogsAuto]       = useState(0);
  const [pageSizeLogsAuto, setPageSizeLogsAuto] = useState(20);
  const [diasBorradoAuto, setDiasBorradoAuto] = useState<string>("todos");

  const [explorerConfigId, setExplorerConfigId]   = useState<number | "">("");
  const [explorerResult, setExplorerResult]       = useState<ExplorerResult | null>(null);
  const [loadingExplorer, setLoadingExplorer]     = useState(false);
  const [errorExplorer, setErrorExplorer]         = useState<string | null>(null);
  const [selectedFicheros, setSelectedFicheros]   = useState<Set<string>>(new Set());
  const [filtroNombre, setFiltroNombre]           = useState("");
  const [filtroMesNum, setFiltroMesNum]           = useState("");
  const [filtroAnioNum, setFiltroAnioNum]         = useState("");
  const [descargando, setDescargando]             = useState(false);
  const [requiereFiltro, setRequiereFiltro]       = useState(false);
  const [pageExplorer, setPageExplorer]           = useState(0);
  const [pageSizeExplorer, setPageSizeExplorer]   = useState(20);

  const [logsManual, setLogsManual]               = useState<FtpLog[]>([]);
  const [loadingLogsManual, setLoadingLogsManual] = useState(false);
  const [errorLogsManual, setErrorLogsManual]     = useState<string | null>(null);
  const [pageLogsManual, setPageLogsManual]       = useState(0);
  const [pageSizeLogsManual, setPageSizeLogsManual] = useState(20);
  const [diasBorradoManual, setDiasBorradoManual] = useState<string>("todos");

  const anioDefault = new Date().getFullYear().toString();
  const filtroMes = filtroMesNum ? `${filtroAnioNum || anioDefault}-${filtroMesNum}` : "";
  const hayFiltros = filtroNombre.trim() || filtroMes;
  const conexionesActivas = configs.filter(c => c.activo);

  const ficherosPagina = explorerResult
    ? explorerResult.ficheros.slice(pageExplorer * pageSizeExplorer, (pageExplorer + 1) * pageSizeExplorer)
    : [];
  const totalPagesExplorer = explorerResult
    ? Math.ceil(explorerResult.ficheros.length / pageSizeExplorer)
    : 0;

  const logsAutoPagina     = logsAuto.slice(pageLogsAuto * pageSizeLogsAuto, (pageLogsAuto + 1) * pageSizeLogsAuto);
  const totalPagesLogsAuto = Math.ceil(logsAuto.length / pageSizeLogsAuto);

  const logsManualPagina     = logsManual.slice(pageLogsManual * pageSizeLogsManual, (pageLogsManual + 1) * pageSizeLogsManual);
  const totalPagesLogsManual = Math.ceil(logsManual.length / pageSizeLogsManual);

  const tamanoSeleccionados = explorerResult
    ? explorerResult.ficheros.filter(f => selectedFicheros.has(f.nombre)).reduce((a, f) => a + f.tamanio, 0)
    : 0;

  const todosEnPaginaSeleccionados = ficherosPagina.length > 0 && ficherosPagina.every(f => selectedFicheros.has(f.nombre));

  // ── Empresas ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: EmpresaOption[]) => setEmpresas(d))
      .catch(() => {});
  }, [token]);

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  const cargarDashboard = useCallback(async () => {
    if (!token) return;
    setLoadingDash(true); setErrorDash(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/dashboard`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setDashboard(await res.json());
    } catch (e: unknown) {
      setErrorDash(e instanceof Error ? e.message : "Error");
    } finally { setLoadingDash(false); }
  }, [token]);

  useEffect(() => { if (panelDashOpen) cargarDashboard(); }, [panelDashOpen, cargarDashboard]);

  // ── Configs ───────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (panelConfigOpen || panelAutoOpen || panelManualOpen) cargarConfigs();
  }, [panelConfigOpen, panelAutoOpen, panelManualOpen, cargarConfigs]);

  const handleSaveConfig = async () => {
    if (!token || !configForm.empresa_id) return;
    setSavingConfig(true); setErrorConfigs(null);
    try {
      const url = editConfigId ? `${API_BASE_URL}/ftp/configs/${editConfigId}` : `${API_BASE_URL}/ftp/configs`;
      const method = editConfigId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ...configForm, nombre: configForm.nombre || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      await cargarConfigs();
      setShowConfigForm(false); setEditConfigId(null); setConfigForm(FORM_CONFIG_VACIO);
    } catch (e: unknown) {
      setErrorConfigs(e instanceof Error ? e.message : "Error guardando");
    } finally { setSavingConfig(false); }
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
      setTestResult(prev => ({ ...prev, [id]: { ok: res.ok, msg: data.message || (res.ok ? "OK" : "Error") } }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: { ok: false, msg: "No se pudo conectar" } }));
    } finally { setTestingId(null); }
  };

  // ── Reglas ────────────────────────────────────────────────────────────────────
  const cargarRules = useCallback(async () => {
    if (!token) return;
    setLoadingRules(true); setErrorRules(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/rules`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setRules(await res.json());
    } catch (e: unknown) {
      setErrorRules(e instanceof Error ? e.message : "Error");
    } finally { setLoadingRules(false); }
  }, [token]);

  useEffect(() => {
    if (panelAutoOpen) { cargarConfigs(); cargarRules(); }
  }, [panelAutoOpen, cargarConfigs, cargarRules]);

  const handleSaveRule = async () => {
    if (!token || !ruleForm.config_id) return;
    setSavingRule(true); setErrorRules(null);
    try {
      const url = editRuleId ? `${API_BASE_URL}/ftp/rules/${editRuleId}` : `${API_BASE_URL}/ftp/rules`;
      const method = editRuleId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ruleForm,
          nombre: ruleForm.nombre || null,
          patron_nombre: ruleForm.patron_nombre || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      await cargarRules();
      setShowRuleForm(false); setEditRuleId(null); setRuleForm(FORM_RULE_VACIO);
    } catch (e: unknown) {
      setErrorRules(e instanceof Error ? e.message : "Error guardando");
    } finally { setSavingRule(false); }
  };

  const handleDeleteRule = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/rules/${id}`, { method: "DELETE", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (e: unknown) {
      setErrorRules(e instanceof Error ? e.message : "Error borrando");
    }
  };

  const handleExecuteRule = async (id: number) => {
    if (!token) return;
    setExecutingRuleId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/rules/${id}/ejecutar`, { method: "POST", headers: getAuthHeaders(token) });
      const data = await res.json();
      alert(`Ejecutado: ${data.descargados ?? 0} descargados, ${data.errores ?? 0} errores.`);
      await cargarRules();
      cargarLogsAuto();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error ejecutando regla");
    } finally { setExecutingRuleId(null); }
  };

  // ── Logs automáticos ──────────────────────────────────────────────────────────
  const cargarLogsAuto = useCallback(async () => {
    if (!token) return;
    setLoadingLogsAuto(true); setErrorLogsAuto(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/logs?origen=auto&limit=500`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setLogsAuto(await res.json());
      setPageLogsAuto(0);
    } catch (e: unknown) {
      setErrorLogsAuto(e instanceof Error ? e.message : "Error");
    } finally { setLoadingLogsAuto(false); }
  }, [token]);

  useEffect(() => {
    if (panelAutoOpen && subHistAutoOpen) cargarLogsAuto();
  }, [panelAutoOpen, subHistAutoOpen, cargarLogsAuto]);

  // ── Borrado de logs ───────────────────────────────────────────────────────────
  const handleDeleteLog = async (logId: number, origen: "auto" | "manual") => {
    if (!token) return;
    if (!confirm("¿Eliminar este registro? Si es automático, el scheduler lo olvidará y podría volver a descargarlo.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/logs/${logId}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      if (origen === "auto") setLogsAuto(prev => prev.filter(l => l.id !== logId));
      else setLogsManual(prev => prev.filter(l => l.id !== logId));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error borrando registro");
    }
  };

  const handleLimpiarHistorial = async (origen: "auto" | "manual") => {
    if (!token) return;
    const dias = origen === "auto" ? diasBorradoAuto : diasBorradoManual;
    const diasNum = dias === "todos" ? null : Number(dias);
    const msg = diasNum
      ? `¿Borrar registros de ${origen === "auto" ? "descarga automática" : "descarga manual"} con más de ${diasNum} días?`
      : `¿Borrar TODO el historial de ${origen === "auto" ? "descarga automática" : "descarga manual"}?\n\n${origen === "auto" ? "⚠️ El scheduler olvidará todos los ficheros y los volverá a descargar." : ""}`;
    if (!confirm(msg)) return;
    try {
      const params = new URLSearchParams({ origen });
      if (diasNum) params.set("dias", String(diasNum));
      const res = await fetch(`${API_BASE_URL}/ftp/logs?${params}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      alert(`Borrados ${data.deleted} registros.`);
      if (origen === "auto") { setLogsAuto([]); setPageLogsAuto(0); }
      else { setLogsManual([]); setPageLogsManual(0); }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error limpiando historial");
    }
  };

  // ── Explorador ────────────────────────────────────────────────────────────────
  const explorarPath = useCallback(async (path: string, nombre?: string, mes?: string) => {
    if (!token || !explorerConfigId) return;
    setLoadingExplorer(true); setErrorExplorer(null);
    setSelectedFicheros(new Set()); setPageExplorer(0);
    try {
      const params = new URLSearchParams({ path, limite: "5000" });
      if (nombre && nombre.trim()) params.set("filtro_nombre", nombre.trim());
      if (mes && mes.trim()) params.set("filtro_mes", mes.trim());
      const res = await fetch(`${API_BASE_URL}/ftp/explorar/${explorerConfigId}?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: ExplorerResult = await res.json();
      setExplorerResult(data);
      setRequiereFiltro(data.total_ficheros >= 5000 && !nombre && !mes);
    } catch (e: unknown) {
      setErrorExplorer(e instanceof Error ? e.message : "Error explorando FTP");
    } finally { setLoadingExplorer(false); }
  }, [token, explorerConfigId]);

  const handleCambiarConexion = (id: number | "") => {
    setExplorerConfigId(id);
    setExplorerResult(null); setErrorExplorer(null);
    setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum("");
    setSelectedFicheros(new Set()); setRequiereFiltro(false); setPageExplorer(0);
  };

  const handleIrRaiz = () => {
    if (!explorerConfigId) return;
    const config = configs.find(c => c.id === explorerConfigId);
    const raiz = config?.directorio_remoto || "/";
    setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum("");
    explorarPath(raiz);
  };

  // ── Descarga individual al PC + registra en log via backend ───────────────────
  const handleDescargarArchivo = async (fichero: string) => {
    if (!token || !explorerConfigId || !explorerResult) return;
    try {
      const params = new URLSearchParams({ path: explorerResult.path_actual, fichero });
      const res = await fetch(
        `${API_BASE_URL}/ftp/descargar-archivo/${explorerConfigId}?${params}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fichero;
      a.click();
      URL.revokeObjectURL(url);
      // El log se registra en el backend (leer_fichero_ftp ya llama a _log)
      if (subHistManualOpen) cargarLogsManual();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error descargando fichero");
    }
  };

  // ── Descarga múltiple: servidor + PC ──────────────────────────────────────────
  const handleDescargar = async () => {
    if (!token || !explorerConfigId || selectedFicheros.size === 0 || !explorerResult) return;
    setDescargando(true); setErrorExplorer(null);
    try {
      // 1. Descargar al servidor + registrar en log
      const res = await fetch(`${API_BASE_URL}/ftp/descargar/${explorerConfigId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ path: explorerResult.path_actual, ficheros: Array.from(selectedFicheros) }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();

      // 2. Descargar también al navegador (uno a uno, sin duplicar log)
      for (const nombre of Array.from(selectedFicheros)) {
        try {
          const params = new URLSearchParams({ path: explorerResult.path_actual, fichero: nombre, registrar: "false" });
          const resPC = await fetch(
            `${API_BASE_URL}/ftp/descargar-archivo/${explorerConfigId}?${params}`,
            { headers: getAuthHeaders(token) }
          );
          if (resPC.ok) {
            const blob = await resPC.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = nombre;
            a.click();
            URL.revokeObjectURL(url);
          }
        } catch { /* si falla uno, continuamos con el resto */ }
      }

      alert(`${data.descargados ?? 0} fichero(s) descargados al servidor y al PC.`);
      setSelectedFicheros(new Set());
      if (subHistManualOpen) cargarLogsManual();
    } catch (e: unknown) {
      setErrorExplorer(e instanceof Error ? e.message : "Error descargando");
    } finally { setDescargando(false); }
  };

  const toggleFichero = (nombre: string) => {
    setSelectedFicheros(prev => {
      const s = new Set(prev);
      s.has(nombre) ? s.delete(nombre) : s.add(nombre);
      return s;
    });
  };

  const toggleTodos = () => {
    const todos = ficherosPagina.map(f => f.nombre);
    const todosSeleccionados = todos.every(n => selectedFicheros.has(n));
    setSelectedFicheros(prev => {
      const s = new Set(prev);
      if (todosSeleccionados) todos.forEach(n => s.delete(n));
      else todos.forEach(n => s.add(n));
      return s;
    });
  };

  // ── Logs manuales ─────────────────────────────────────────────────────────────
  const cargarLogsManual = useCallback(async () => {
    if (!token) return;
    setLoadingLogsManual(true); setErrorLogsManual(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/logs?origen=manual&limit=500`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setLogsManual(await res.json());
      setPageLogsManual(0);
    } catch (e: unknown) {
      setErrorLogsManual(e instanceof Error ? e.message : "Error");
    } finally { setLoadingLogsManual(false); }
  }, [token]);

  useEffect(() => {
    if (panelManualOpen) cargarConfigs();
    if (panelManualOpen && subHistManualOpen) cargarLogsManual();
  }, [panelManualOpen, subHistManualOpen, cargarConfigs, cargarLogsManual]);

  // ── Breadcrumb ────────────────────────────────────────────────────────────────
  const renderBreadcrumb = () => {
    if (!explorerResult) return null;
    const partes = explorerResult.path_actual.split("/").filter(Boolean);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, flexWrap: "wrap" }}>
        <span style={{ cursor: "pointer", color: "var(--primary, #378ADD)", fontWeight: 500 }}
          onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath("/"); }}>
          /
        </span>
        {partes.map((parte, i) => {
          const subpath = "/" + partes.slice(0, i + 1).join("/");
          const esActual = i === partes.length - 1;
          return (
            <span key={subpath} style={{ display: "flex", alignItems: "center", gap: 3 }}>
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

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="text-sm">

      {/* ══ PANEL 1 — DASHBOARD ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelDashOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📊 Dashboard</div>
            <div style={panelDescStyle}>Estado global de conexiones y sincronización</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelDashOpen(v => !v); }}>
            {panelDashOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelDashOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorDash && <div className="ui-alert ui-alert--danger mb-3">{errorDash}</div>}
            {loadingDash && <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>Cargando...</div>}
            {dashboard && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--field-bg-soft)", borderRadius: 8, padding: "8px 16px", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#1D9E75" }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>Scheduler activo</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{dashboard.conexiones_activas} conexiones · {dashboard.reglas_activas} reglas</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Próxima sync: <strong style={{ color: "var(--text)" }}>{dashboard.proxima_sync_global ? fmtDate(dashboard.proxima_sync_global) : "—"}</strong>
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{dashboard.ultima_descarga ? `Última: ${fmtDate(dashboard.ultima_descarga)}` : ""}</span>
                    <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }} onClick={cargarDashboard} disabled={loadingDash}>
                      <IconRefresh /> Actualizar
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, marginBottom: 14 }}>
                  <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>Descarga automática</span>
                      <span style={{ fontSize: 10, background: "var(--color-background-success, #E1F5EE)", color: "var(--color-text-success, #0F6E56)", padding: "2px 8px", borderRadius: 6 }}>
                        {dashboard.reglas_activas} regla{dashboard.reglas_activas !== 1 ? "s" : ""} ON
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[["Hoy", dashboard.auto_hoy, dashboard.errores_hoy > 0 ? `${dashboard.errores_hoy} err.` : "sin errores", dashboard.errores_hoy > 0],
                        ["Semana", dashboard.auto_semana, dashboard.errores_semana > 0 ? `${dashboard.errores_semana} err.` : "sin errores", dashboard.errores_semana > 0],
                        ["Total", (dashboard.auto_hoy + dashboard.auto_semana).toLocaleString(), "acumulado", false]
                      ].map(([label, val, sub, isErr]) => (
                        <div key={String(label)} style={{ background: "var(--field-bg-soft)", borderRadius: 6, padding: "10px" }}>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: 500, color: "var(--text)" }}>{val}</div>
                          <div style={{ fontSize: 10, color: isErr ? "#E24B4A" : "var(--text-muted)", marginTop: 2 }}>{sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5 }}>Últimas ejecuciones</div>
                    {dashboard.conexiones.filter(c => c.sync_auto && c.ultima_ejecucion).slice(0, 2).map(c => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: "var(--text)" }}>{c.nombre || c.empresa_nombre}</span>
                        <span style={{ color: "var(--text-muted)" }}>{fmtDate(c.ultima_ejecucion)} · {c.auto_hoy} ficheros</span>
                      </div>
                    ))}
                    {dashboard.conexiones.filter(c => c.sync_auto).length === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin reglas automáticas configuradas</div>}
                  </div>

                  <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>Descarga manual</span>
                      <span style={{ fontSize: 10, background: "var(--field-bg-soft)", color: "var(--text-muted)", padding: "2px 8px", borderRadius: 6, border: "0.5px solid var(--card-border)" }}>Bajo demanda</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[["Hoy", dashboard.manual_hoy, "ficheros"], ["Semana", dashboard.manual_semana, "ficheros"], ["Total", (dashboard.manual_hoy + dashboard.manual_semana).toLocaleString(), "acumulado"]].map(([label, val, sub]) => (
                        <div key={String(label)} style={{ background: "var(--field-bg-soft)", borderRadius: 6, padding: "10px" }}>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: 500, color: "var(--text)" }}>{val}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5 }}>Últimas descargas manuales</div>
                    {dashboard.conexiones.filter(c => c.manual_hoy > 0).slice(0, 2).map(c => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: "var(--text)" }}>{c.nombre || c.empresa_nombre}</span>
                        <span style={{ color: "var(--text-muted)" }}>{c.manual_hoy} ficheros hoy</span>
                      </div>
                    ))}
                    {dashboard.ultimo_fichero && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Último: {dashboard.ultimo_fichero}</div>}
                    {dashboard.manual_hoy === 0 && dashboard.manual_semana === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin descargas manuales esta semana</div>}
                  </div>
                </div>

                <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "10px 1fr 1fr 60px 60px 60px 110px 140px", gap: 10, padding: "8px 14px", background: "var(--field-bg-soft)", borderBottom: "1px solid var(--card-border)", alignItems: "center" }}>
                    <div /><span style={{ fontSize: 10, color: "var(--text-muted)" }}>Empresa</span><span style={{ fontSize: 10, color: "var(--text-muted)" }}>Conexión</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}>Auto</span><span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}>Manual</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}>Errores</span><span style={{ fontSize: 10, color: "var(--text-muted)" }}>Sync</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Próxima / Estado</span>
                  </div>
                  {dashboard.conexiones.length === 0 ? (
                    <div style={{ padding: "20px 14px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Sin conexiones configuradas</div>
                  ) : dashboard.conexiones.map(c => {
                    const tieneError = c.errores_hoy > 0 || (c.ultimo_error_msg !== null && c.ultimo_ok === null);
                    const dotColor = !c.activo ? "#888" : tieneError ? "#E24B4A" : "#1D9E75";
                    return (
                      <div key={c.id} style={{ display: "grid", gridTemplateColumns: "10px 1fr 1fr 60px 60px 60px 110px 140px", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--card-border)", alignItems: "center", background: tieneError ? "var(--color-background-danger, #FCEBEB)" : undefined }}>
                        <div style={{ position: "relative" }} onMouseEnter={() => c.ultimo_error_msg ? setTooltipId(c.id) : undefined} onMouseLeave={() => setTooltipId(null)}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, cursor: c.ultimo_error_msg ? "help" : "default" }} />
                          {tooltipId === c.id && c.ultimo_error_msg && (
                            <div style={{ position: "absolute", left: 14, top: -4, zIndex: 50, background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 6, padding: "8px 10px", minWidth: 220, maxWidth: 320, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#E24B4A", marginBottom: 4 }}>Último error · {fmtDate(c.ultimo_error)}</div>
                              {c.ultimo_error_fichero && <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)", marginBottom: 4, wordBreak: "break-all" }}>{c.ultimo_error_fichero}</div>}
                              <div style={{ fontSize: 11, color: "var(--text)", wordBreak: "break-word" }}>{c.ultimo_error_msg}</div>
                            </div>
                          )}
                        </div>
                        <div><div style={{ fontSize: 11, fontWeight: 500, color: tieneError ? "#E24B4A" : "var(--text)" }}>{c.empresa_nombre}</div></div>
                        <div style={{ fontSize: 10, color: tieneError ? "#E24B4A" : "var(--text-muted)" }}>{c.nombre || `${c.host}:${c.puerto}`} · {c.usar_tls ? "TLS" : "FTP"}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: tieneError ? "#E24B4A" : "var(--text)", textAlign: "right" }}>{c.auto_hoy}</div>
                        <div style={{ fontSize: 12, color: tieneError ? "#E24B4A" : "var(--text)", textAlign: "right" }}>{c.manual_hoy}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: c.errores_hoy > 0 ? "#E24B4A" : "var(--text-muted)", textAlign: "right" }}>{c.errores_hoy}</div>
                        <div style={{ fontSize: 10 }}>
                          {c.sync_auto ? <span style={{ color: tieneError ? "#E24B4A" : "#1D9E75" }}>Auto · {c.reglas_activas}h</span> : <span style={{ color: "var(--text-muted)" }}>Solo manual</span>}
                          {c.ultima_ejecucion && <div style={{ color: "var(--text-muted)", marginTop: 2, fontSize: 9 }}>Ejec: {fmtDate(c.ultima_ejecucion)}</div>}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {c.proxima_sync ? <div>Próx: {fmtDate(c.proxima_sync)}</div> : c.ultimo_ok ? <div>Última OK: {fmtDate(c.ultimo_ok)}</div> : <span style={{ color: "#E24B4A" }}>Sin descargas OK</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ PANEL 2 — CONEXIONES FTP ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelConfigOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📡 Conexiones FTP</div>
            <div style={panelDescStyle}>Configura y gestiona las conexiones FTP/FTPS por empresa</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={e => { e.stopPropagation(); setPanelConfigOpen(v => !v); }}>
            {panelConfigOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelConfigOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorConfigs && <div className="ui-alert ui-alert--danger mb-3">{errorConfigs}</div>}
            {!showConfigForm && (
              <div style={{ marginBottom: 14 }}>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => { setShowConfigForm(true); setEditConfigId(null); setConfigForm(FORM_CONFIG_VACIO); }}>
                  <IconPlus /> Añadir conexión FTP
                </button>
              </div>
            )}
            {showConfigForm && (
              <div style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {editConfigId ? "Editar conexión" : "Nueva conexión FTP"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.empresa_id} onChange={e => setConfigForm(f => ({ ...f, empresa_id: Number(e.target.value) }))}>
                      <option value="">Selecciona empresa</option>
                      {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Nombre <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.nombre} onChange={e => setConfigForm(f => ({ ...f, nombre: e.target.value }))} placeholder="ej: GISCE, DATADIS..." />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Host</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.host} onChange={e => setConfigForm(f => ({ ...f, host: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Puerto</label>
                    <input className="ui-input" type="number" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.puerto} onChange={e => setConfigForm(f => ({ ...f, puerto: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Usuario</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.usuario} onChange={e => setConfigForm(f => ({ ...f, usuario: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{editConfigId ? "Contraseña (vacío = no cambiar)" : "Contraseña"}</label>
                    <input className="ui-input" type="password" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.password} onChange={e => setConfigForm(f => ({ ...f, password: e.target.value }))} placeholder={editConfigId ? "••••••••" : "Contraseña FTP"} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Directorio raíz</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={configForm.directorio_remoto} onChange={e => setConfigForm(f => ({ ...f, directorio_remoto: e.target.value }))} placeholder="/" />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" id="usar-tls-chk" checked={configForm.usar_tls} onChange={e => setConfigForm(f => ({ ...f, usar_tls: e.target.checked }))} />
                    <label htmlFor="usar-tls-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>Usar TLS/FTPS</label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" id="activo-config-chk" checked={configForm.activo} onChange={e => setConfigForm(f => ({ ...f, activo: e.target.checked }))} />
                    <label htmlFor="activo-config-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>Conexión activa</label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={handleSaveConfig} disabled={savingConfig || !configForm.empresa_id}>
                    {savingConfig ? "Guardando..." : editConfigId ? "Guardar cambios" : "Crear conexión"}
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={() => { setShowConfigForm(false); setEditConfigId(null); setConfigForm(FORM_CONFIG_VACIO); }}>Cancelar</button>
                </div>
              </div>
            )}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Nombre</th><th className="ui-th">Empresa</th><th className="ui-th">Host</th>
                    <th className="ui-th">Puerto</th><th className="ui-th">Usuario</th><th className="ui-th">Dir. raíz</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Cifrado</th><th className="ui-th" style={{ textAlign: "center" }}>Estado</th>
                    <th className="ui-th">Test</th><th className="ui-th">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConfigs ? (
                    <tr className="ui-tr"><td colSpan={10} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : configs.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={10} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Sin conexiones · Pulsa &quot;Añadir conexión FTP&quot; para empezar</td></tr>
                  ) : configs.map(c => (
                    <tr key={c.id} className="ui-tr">
                      <td className="ui-td" style={{ fontWeight: 600 }}>{c.nombre || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin nombre</span>}</td>
                      <td className="ui-td">{c.empresa_nombre}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.host}</td>
                      <td className="ui-td">{c.puerto}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.usuario}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.directorio_remoto}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}><span className={`ui-badge ${c.usar_tls ? "ui-badge--ok" : "ui-badge--neutral"}`}>{c.usar_tls ? "TLS" : "FTP"}</span></td>
                      <td className="ui-td" style={{ textAlign: "center" }}><span className={`ui-badge ${c.activo ? "ui-badge--ok" : "ui-badge--neutral"}`}>{c.activo ? "Activa" : "Inactiva"}</span></td>
                      <td className="ui-td">
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }} onClick={() => handleTest(c.id)} disabled={testingId === c.id}>
                            <IconCheck /> {testingId === c.id ? "Probando..." : "Probar"}
                          </button>
                          {testResult[c.id] && <span style={{ fontSize: 9, color: testResult[c.id].ok ? "#1D9E75" : "#E24B4A" }}>{testResult[c.id].msg}</span>}
                        </div>
                      </td>
                      <td className="ui-td">
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}
                            onClick={() => { setEditConfigId(c.id); setConfigForm({ empresa_id: c.empresa_id, nombre: c.nombre || "", host: c.host, puerto: c.puerto, usuario: c.usuario, password: "", directorio_remoto: c.directorio_remoto, usar_tls: c.usar_tls, activo: c.activo }); setShowConfigForm(true); }}>
                            <IconEdit />
                          </button>
                          <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" style={{ padding: "4px 6px", display: "flex", alignItems: "center" }} onClick={() => handleDeleteConfig(c.id)}><IconTrash /></button>
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

      {/* ══ PANEL 3 — DESCARGA AUTOMÁTICA ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelAutoOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>🤖 Descarga automática</div>
            <div style={panelDescStyle}>Configura reglas de sync y consulta el historial automático</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={e => { e.stopPropagation(); setPanelAutoOpen(v => !v); }}>
            {panelAutoOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelAutoOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={subPanelStyle}>
              <div style={subPanelHeaderStyle} onClick={() => setSubReglasOpen(v => !v)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Reglas de sincronización</span>
                  <span className="ui-badge ui-badge--ok">{rules.filter(r => r.activo).length} activas</span>
                  <span className="ui-badge ui-badge--neutral">{rules.length} total</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {subReglasOpen && (
                    <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4 }}
                      onClick={e => { e.stopPropagation(); setShowRuleForm(true); setEditRuleId(null); setRuleForm(FORM_RULE_VACIO); }}>
                      <IconPlus /> Añadir
                    </button>
                  )}
                  <span style={{ color: "var(--text-muted)" }}>{subReglasOpen ? <IconChevronUp /> : <IconChevronDown />}</span>
                </div>
              </div>
              {subReglasOpen && (
                <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 14px" }}>
                  {errorRules && <div className="ui-alert ui-alert--danger mb-3">{errorRules}</div>}
                  {showRuleForm && (
                    <div style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px", marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {editRuleId ? "Editar regla" : "Nueva regla de sync"}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Conexión FTP</label>
                          <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }} value={ruleForm.config_id} onChange={e => setRuleForm(f => ({ ...f, config_id: Number(e.target.value) }))}>
                            <option value="">Selecciona conexión</option>
                            {conexionesActivas.map(c => <option key={c.id} value={c.id}>{labelConexion(c)}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Nombre <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                          <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={ruleForm.nombre} onChange={e => setRuleForm(f => ({ ...f, nombre: e.target.value }))} placeholder="ej: Descarga BALD diaria" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Directorio FTP</label>
                          <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={ruleForm.directorio} onChange={e => setRuleForm(f => ({ ...f, directorio: e.target.value }))} placeholder="/01/entradaHistorico" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Patrón <span style={{ fontWeight: 400 }}>(vacío = todos)</span></label>
                          <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }} value={ruleForm.patron_nombre} onChange={e => setRuleForm(f => ({ ...f, patron_nombre: e.target.value }))} placeholder="ej: BALD_, MAGCLOS_" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Intervalo</label>
                          <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }} value={ruleForm.intervalo_horas} onChange={e => setRuleForm(f => ({ ...f, intervalo_horas: Number(e.target.value) }))}>
                            <option value={1}>Cada 1 hora</option><option value={2}>Cada 2 horas</option><option value={6}>Cada 6 horas</option><option value={12}>Cada 12 horas</option><option value={24}>Cada 24 horas (diario)</option>
                          </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" id="activo-rule-chk" checked={ruleForm.activo} onChange={e => setRuleForm(f => ({ ...f, activo: e.target.checked }))} />
                            <label htmlFor="activo-rule-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>Regla activa</label>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={handleSaveRule} disabled={savingRule || !ruleForm.config_id}>
                          {savingRule ? "Guardando..." : editRuleId ? "Guardar cambios" : "Crear regla"}
                        </button>
                        <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={() => { setShowRuleForm(false); setEditRuleId(null); setRuleForm(FORM_RULE_VACIO); }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  <div className="ui-table-wrap">
                    <table className="ui-table text-[11px]">
                      <thead className="ui-thead">
                        <tr>
                          <th className="ui-th">Nombre</th><th className="ui-th">Conexión</th><th className="ui-th">Directorio</th>
                          <th className="ui-th">Patrón</th><th className="ui-th">Intervalo</th><th className="ui-th" style={{ textAlign: "center" }}>Estado</th>
                          <th className="ui-th">Última ejec.</th><th className="ui-th">Próxima</th><th className="ui-th">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingRules ? (
                          <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>Cargando...</td></tr>
                        ) : rules.length === 0 ? (
                          <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>Sin reglas · Pulsa &quot;Añadir&quot; para configurar la sync automática</td></tr>
                        ) : rules.map(r => (
                          <tr key={r.id} className="ui-tr">
                            <td className="ui-td" style={{ fontWeight: 500 }}>{r.nombre || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin nombre</span>}</td>
                            <td className="ui-td" style={{ fontSize: 10 }}>{r.config_nombre || r.empresa_nombre}</td>
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{r.directorio}</td>
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{r.patron_nombre || <span style={{ color: "var(--text-muted)" }}>todos</span>}</td>
                            <td className="ui-td">{r.intervalo_horas}h</td>
                            <td className="ui-td" style={{ textAlign: "center" }}><span className={`ui-badge ${r.activo ? "ui-badge--ok" : "ui-badge--neutral"}`}>{r.activo ? "Activa" : "Pausada"}</span></td>
                            <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtDate(r.ultima_ejecucion)}</td>
                            <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtDate(r.proxima_ejecucion)}</td>
                            <td className="ui-td">
                              <div style={{ display: "flex", gap: 4 }}>
                                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ padding: "3px 7px", display: "flex", alignItems: "center", gap: 3, fontSize: 10 }} onClick={() => handleExecuteRule(r.id)} disabled={executingRuleId === r.id}>
                                  <IconPlay /> {executingRuleId === r.id ? "..." : "Ejecutar"}
                                </button>
                                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ padding: "3px 5px", display: "flex", alignItems: "center" }}
                                  onClick={() => { setEditRuleId(r.id); setRuleForm({ config_id: r.config_id, nombre: r.nombre || "", directorio: r.directorio, patron_nombre: r.patron_nombre || "", intervalo_horas: r.intervalo_horas, activo: r.activo }); setShowRuleForm(true); }}>
                                  <IconEdit />
                                </button>
                                <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" style={{ padding: "3px 5px", display: "flex", alignItems: "center" }} onClick={() => handleDeleteRule(r.id)}><IconTrash /></button>
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

            <div style={subPanelStyle}>
              <div style={subPanelHeaderStyle} onClick={() => setSubHistAutoOpen(v => !v)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Historial automático</span>
                  {logsAuto.length > 0 && <span className="ui-badge ui-badge--ok">{logsAuto.filter(l => l.estado === "ok").length} OK</span>}
                  {logsAuto.filter(l => l.estado === "error").length > 0 && <span className="ui-badge ui-badge--err">{logsAuto.filter(l => l.estado === "error").length} errores</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {subHistAutoOpen && (
                    <>
                      <select className="ui-select" style={{ fontSize: 10, height: 26, width: 140 }} value={diasBorradoAuto} onChange={e => setDiasBorradoAuto(e.target.value)} onClick={e => e.stopPropagation()}>
                        <option value="todos">Todos los registros</option><option value="7">Más de 7 días</option><option value="30">Más de 30 días</option><option value="90">Más de 90 días</option>
                      </select>
                      <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => { e.stopPropagation(); handleLimpiarHistorial("auto"); }}><IconTrash /> Limpiar</button>
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => { e.stopPropagation(); cargarLogsAuto(); }}><IconRefresh /> Actualizar</button>
                    </>
                  )}
                  <span style={{ color: "var(--text-muted)" }}>{subHistAutoOpen ? <IconChevronUp /> : <IconChevronDown />}</span>
                </div>
              </div>
              {subHistAutoOpen && (
                <div style={{ borderTop: "1px solid var(--card-border)" }}>
                  {errorLogsAuto && <div className="ui-alert ui-alert--danger" style={{ margin: "12px 14px" }}>{errorLogsAuto}</div>}
                  <div className="ui-table-wrap">
                    <table className="ui-table text-[11px]">
                      <thead className="ui-thead">
                        <tr><th className="ui-th">Empresa</th><th className="ui-th">Fichero</th><th className="ui-th" style={{ textAlign: "center" }}>Estado</th><th className="ui-th">Detalle</th><th className="ui-th">Fecha</th><th className="ui-th" style={{ width: 36 }}></th></tr>
                      </thead>
                      <tbody>
                        {loadingLogsAuto ? (
                          <tr className="ui-tr"><td colSpan={6} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>Cargando...</td></tr>
                        ) : logsAuto.length === 0 ? (
                          <tr className="ui-tr"><td colSpan={6} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>Sin descargas automáticas registradas aún</td></tr>
                        ) : logsAutoPagina.map(log => (
                          <tr key={log.id} className="ui-tr">
                            <td className="ui-td" style={{ fontWeight: 500 }}>{log.empresa_nombre}</td>
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{log.nombre_fichero}</td>
                            <td className="ui-td" style={{ textAlign: "center" }}><span className={`ui-badge ${log.estado === "ok" ? "ui-badge--ok" : "ui-badge--err"}`}>{log.estado === "ok" ? "OK" : "Error"}</span></td>
                            <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{log.mensaje_error ?? "—"}</td>
                            <td className="ui-td ui-muted">{fmtDate(log.created_at)}</td>
                            <td className="ui-td" style={{ textAlign: "center" }}>
                              <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" style={{ padding: "3px 5px", display: "flex", alignItems: "center" }} title="Eliminar este registro (el scheduler lo olvidará)" onClick={() => handleDeleteLog(log.id, "auto")}><IconTrash /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePaginationFooter loading={loadingLogsAuto} hasLoadedOnce={logsAuto.length > 0 || !loadingLogsAuto} totalFilas={logsAuto.length} startIndex={pageLogsAuto * pageSizeLogsAuto} endIndex={Math.min((pageLogsAuto + 1) * pageSizeLogsAuto, logsAuto.length)} pageSize={pageSizeLogsAuto} setPageSize={(v) => { setPageSizeLogsAuto(v); setPageLogsAuto(0); }} currentPage={pageLogsAuto} totalPages={totalPagesLogsAuto} setPage={setPageLogsAuto} compact />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══ PANEL 4 — DESCARGA MANUAL ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelManualOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>🔧 Descarga manual</div>
            <div style={panelDescStyle}>Explora carpetas y descarga ficheros manualmente</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={e => { e.stopPropagation(); setPanelManualOpen(v => !v); }}>
            {panelManualOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelManualOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Sub-panel: Explorador */}
            <div style={subPanelStyle}>
              <div style={subPanelHeaderStyle} onClick={() => setSubExplorerOpen(v => !v)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Explorador FTP</span>
                  {explorerResult && <span className="ui-badge ui-badge--neutral">{explorerResult.ficheros.length} ficheros</span>}
                  {selectedFicheros.size > 0 && <span className="ui-badge ui-badge--ok">{selectedFicheros.size} seleccionados · {fmtSizeTotal(tamanoSeleccionados)}</span>}
                </div>
                <span style={{ color: "var(--text-muted)" }}>{subExplorerOpen ? <IconChevronUp /> : <IconChevronDown />}</span>
              </div>
              {subExplorerOpen && (
                <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Conexión</label>
                      <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 240 }} value={explorerConfigId} onChange={e => handleCambiarConexion(e.target.value === "" ? "" : Number(e.target.value))}>
                        <option value="">Selecciona una conexión FTP</option>
                        {conexionesActivas.map(c => <option key={c.id} value={c.id}>{labelConexion(c)}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 30, display: "flex", alignItems: "center", gap: 5 }} onClick={handleIrRaiz} disabled={!explorerConfigId || loadingExplorer}>
                        <IconRefresh /> {loadingExplorer ? "Cargando..." : explorerResult ? "Recargar" : "Conectar"}
                      </button>
                      {explorerResult && explorerResult.path_actual !== "/" && (
                        <>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 30, width: 30, display: "flex", alignItems: "center", justifyContent: "center" }} title="Subir nivel" onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath(explorerResult.path_padre); }}><IconUp /></button>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 30, width: 30, display: "flex", alignItems: "center", justifyContent: "center" }} title="Ir al raíz" onClick={handleIrRaiz}><IconHome /></button>
                        </>
                      )}
                    </div>
                    {selectedFicheros.size > 0 && (
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                        style={{ height: 30, display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}
                        onClick={handleDescargar} disabled={descargando}
                        title="Descarga al servidor + al PC y registra en historial">
                        <IconDownload /> {descargando ? "Descargando..." : `Servidor + PC (${selectedFicheros.size}) · ${fmtSizeTotal(tamanoSeleccionados)}`}
                      </button>
                    )}
                  </div>

                  {explorerResult && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 6, padding: "6px 12px", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>{renderBreadcrumb()}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                        <input className="ui-input" style={{ fontSize: 11, height: 26, width: 140 }} placeholder="Buscar fichero..." value={filtroNombre} onChange={e => setFiltroNombre(e.target.value)} onKeyDown={e => { if (e.key === "Enter") explorarPath(explorerResult.path_actual, filtroNombre, filtroMes); }} />
                        <select className="ui-select" style={{ fontSize: 11, height: 26, width: 88 }} value={filtroMesNum} onChange={e => setFiltroMesNum(e.target.value)}>
                          <option value="">Mes</option>
                          {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                        </select>
                        <select className="ui-select" style={{ fontSize: 11, height: 26, width: 60 }} value={filtroAnioNum} onChange={e => setFiltroAnioNum(e.target.value)}>
                          <option value="">Año</option>
                          {ANIOS.map(a => <option key={a} value={String(a)}>{a}</option>)}
                        </select>
                        <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 26, display: "flex", alignItems: "center", gap: 4 }} onClick={() => explorarPath(explorerResult.path_actual, filtroNombre, filtroMes)} disabled={loadingExplorer}><IconSearch /></button>
                        {hayFiltros && <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 26 }} onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath(explorerResult.path_actual); }}>✕</button>}
                      </div>
                    </div>
                  )}

                  {requiereFiltro && !hayFiltros && (
                    <div style={{ marginBottom: 8, padding: "7px 12px", background: "var(--color-background-warning, #FAEEDA)", borderRadius: 6, fontSize: 11, color: "#854F0B", border: "1px solid #FAC775" }}>
                      Esta carpeta tiene más de 5.000 ficheros. Usa los filtros para acotar los resultados.
                    </div>
                  )}

                  {errorExplorer && <div className="ui-alert ui-alert--danger mb-3">{errorExplorer}</div>}

                  {!explorerConfigId ? (
                    <div className="ui-muted text-center" style={{ padding: "32px 16px", fontSize: 11 }}>Selecciona una conexión FTP y pulsa &quot;Conectar&quot;</div>
                  ) : !explorerResult && !loadingExplorer ? (
                    <div className="ui-muted text-center" style={{ padding: "32px 16px", fontSize: 11 }}>Pulsa &quot;Conectar&quot; para abrir el explorador FTP</div>
                  ) : loadingExplorer ? (
                    <div className="ui-muted text-center" style={{ padding: "32px 16px", fontSize: 11 }}>Conectando al FTP...</div>
                  ) : explorerResult && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10, color: "var(--text-muted)", padding: "0 2px" }}>
                        <span>
                          {explorerResult.carpetas.length} carpetas · {explorerResult.ficheros.length} ficheros
                          {explorerResult.total_ficheros > explorerResult.ficheros.length && ` (de ${explorerResult.total_ficheros} total)`}
                        </span>
                        {selectedFicheros.size > 0 && <span style={{ color: "var(--primary, #378ADD)", fontWeight: 500 }}>{selectedFicheros.size} seleccionados · {fmtSizeTotal(tamanoSeleccionados)}</span>}
                      </div>
                      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, overflow: "hidden" }}>
                        <table className="ui-table text-[11px]" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                          <thead className="ui-thead">
                            <tr>
                              <th className="ui-th" style={{ width: 32, textAlign: "center" }}>
                                {ficherosPagina.length > 0 && <input type="checkbox" checked={todosEnPaginaSeleccionados} onChange={toggleTodos} />}
                              </th>
                              <th className="ui-th">Nombre</th>
                              <th className="ui-th" style={{ textAlign: "right", width: 80 }}>Tamaño</th>
                              <th className="ui-th" style={{ textAlign: "right", width: 110 }}>Fecha</th>
                              <th className="ui-th" style={{ width: 36 }} title="Descargar al PC (registra en historial)"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {explorerResult.carpetas.map(c => (
                              <tr key={c.path} className="ui-tr" style={{ cursor: "pointer" }}
                                onClick={() => { setFiltroNombre(""); setFiltroMesNum(""); setFiltroAnioNum(""); explorarPath(c.path); }}>
                                <td className="ui-td" style={{ textAlign: "center" }}><IconFolder /></td>
                                <td className="ui-td" style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>{c.nombre}/</td>
                                <td className="ui-td ui-muted" style={{ textAlign: "right" }}>—</td>
                                <td className="ui-td ui-muted" style={{ textAlign: "right" }}>—</td>
                                <td className="ui-td"></td>
                              </tr>
                            ))}
                            {ficherosPagina.length === 0 && explorerResult.carpetas.length === 0 ? (
                              <tr className="ui-tr"><td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "20px 16px" }}>Carpeta vacía</td></tr>
                            ) : ficherosPagina.length === 0 && hayFiltros ? (
                              <tr className="ui-tr"><td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "20px 16px" }}>Sin resultados con los filtros aplicados</td></tr>
                            ) : (
                              ficherosPagina.map(f => {
                                const sel = selectedFicheros.has(f.nombre);
                                return (
                                  <tr key={f.nombre} className="ui-tr" style={{ cursor: "pointer", background: sel ? "var(--nav-item-hover)" : undefined }} onClick={() => toggleFichero(f.nombre)}>
                                    <td className="ui-td" style={{ textAlign: "center" }}>
                                      <input type="checkbox" checked={sel} onChange={() => toggleFichero(f.nombre)} onClick={e => e.stopPropagation()} />
                                    </td>
                                    <td className="ui-td" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 10, color: sel ? "var(--primary, #378ADD)" : undefined }}>
                                      <IconFile selected={sel} /> {f.nombre}
                                    </td>
                                    <td className="ui-td ui-muted" style={{ textAlign: "right", fontSize: 10 }}>{fmtSize(f.tamanio)}</td>
                                    <td className="ui-td ui-muted" style={{ textAlign: "right", fontSize: 10 }}>{f.fecha}</td>
                                    {/* ── Botón descarga individual al PC + registra en log ── */}
                                    <td className="ui-td" style={{ textAlign: "center" }}>
                                      <button
                                        type="button"
                                        className="ui-btn ui-btn-ghost ui-btn-xs"
                                        style={{ padding: "3px 5px", display: "inline-flex", alignItems: "center" }}
                                        title="Descargar al PC (registra en historial)"
                                        onClick={e => { e.stopPropagation(); handleDescargarArchivo(f.nombre); }}
                                      >
                                        <IconDownload />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                        <TablePaginationFooter loading={loadingExplorer} hasLoadedOnce={explorerResult !== null} totalFilas={explorerResult.ficheros.length} startIndex={pageExplorer * pageSizeExplorer} endIndex={Math.min((pageExplorer + 1) * pageSizeExplorer, explorerResult.ficheros.length)} pageSize={pageSizeExplorer} setPageSize={(v) => { setPageSizeExplorer(v); setPageExplorer(0); }} currentPage={pageExplorer} totalPages={totalPagesExplorer} setPage={setPageExplorer} compact />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Sub-panel: Historial manual */}
            <div style={subPanelStyle}>
              <div style={subPanelHeaderStyle} onClick={() => setSubHistManualOpen(v => !v)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Historial manual</span>
                  {logsManual.length > 0 && <span className="ui-badge ui-badge--ok">{logsManual.filter(l => l.estado === "ok").length} OK</span>}
                  {logsManual.filter(l => l.estado === "error").length > 0 && <span className="ui-badge ui-badge--err">{logsManual.filter(l => l.estado === "error").length} errores</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {subHistManualOpen && (
                    <>
                      <select className="ui-select" style={{ fontSize: 10, height: 26, width: 140 }} value={diasBorradoManual} onChange={e => setDiasBorradoManual(e.target.value)} onClick={e => e.stopPropagation()}>
                        <option value="todos">Todos los registros</option><option value="7">Más de 7 días</option><option value="30">Más de 30 días</option><option value="90">Más de 90 días</option>
                      </select>
                      <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => { e.stopPropagation(); handleLimpiarHistorial("manual"); }}><IconTrash /> Limpiar</button>
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => { e.stopPropagation(); cargarLogsManual(); }}><IconRefresh /> Actualizar</button>
                    </>
                  )}
                  <span style={{ color: "var(--text-muted)" }}>{subHistManualOpen ? <IconChevronUp /> : <IconChevronDown />}</span>
                </div>
              </div>
              {subHistManualOpen && (
                <div style={{ borderTop: "1px solid var(--card-border)" }}>
                  {errorLogsManual && <div className="ui-alert ui-alert--danger" style={{ margin: "12px 14px" }}>{errorLogsManual}</div>}
                  <div className="ui-table-wrap">
                    <table className="ui-table text-[11px]">
                      <thead className="ui-thead">
                        <tr><th className="ui-th">Empresa</th><th className="ui-th">Fichero</th><th className="ui-th" style={{ textAlign: "center" }}>Estado</th><th className="ui-th">Detalle</th><th className="ui-th">Fecha</th><th className="ui-th" style={{ width: 36 }}></th></tr>
                      </thead>
                      <tbody>
                        {loadingLogsManual ? (
                          <tr className="ui-tr"><td colSpan={6} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>Cargando...</td></tr>
                        ) : logsManual.length === 0 ? (
                          <tr className="ui-tr"><td colSpan={6} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>Sin descargas manuales registradas</td></tr>
                        ) : logsManualPagina.map(log => (
                          <tr key={log.id} className="ui-tr">
                            <td className="ui-td" style={{ fontWeight: 500 }}>{log.empresa_nombre}</td>
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{log.nombre_fichero}</td>
                            <td className="ui-td" style={{ textAlign: "center" }}><span className={`ui-badge ${log.estado === "ok" ? "ui-badge--ok" : "ui-badge--err"}`}>{log.estado === "ok" ? "OK" : "Error"}</span></td>
                            <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{log.mensaje_error ?? "—"}</td>
                            <td className="ui-td ui-muted">{fmtDate(log.created_at)}</td>
                            <td className="ui-td" style={{ textAlign: "center" }}>
                              <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" style={{ padding: "3px 5px", display: "flex", alignItems: "center" }} title="Eliminar este registro" onClick={() => handleDeleteLog(log.id, "manual")}><IconTrash /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePaginationFooter loading={loadingLogsManual} hasLoadedOnce={logsManual.length > 0 || !loadingLogsManual} totalFilas={logsManual.length} startIndex={pageLogsManual * pageSizeLogsManual} endIndex={Math.min((pageLogsManual + 1) * pageSizeLogsManual, logsManual.length)} pageSize={pageSizeLogsManual} setPageSize={(v) => { setPageSizeLogsManual(v); setPageLogsManual(0); }} currentPage={pageLogsManual} totalPages={totalPagesLogsManual} setPage={setPageLogsManual} compact />
                </div>
              )}
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
