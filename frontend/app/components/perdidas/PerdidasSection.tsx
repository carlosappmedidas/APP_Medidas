"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import TablePaginationFooter from "../ui/TablePaginationFooter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Concentrador {
  id: number;
  tenant_id: number;
  empresa_id: number;
  empresa_nombre: string;
  nombre_ct: string;
  id_concentrador: string;
  id_supervisor: string | null;
  magn_supervisor: number;
  directorio_ftp: string | null;
  ftp_config_id: number | null;
  fecha_ultimo_proceso: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

interface ConcentradorForm {
  empresa_id: number | "";
  nombre_ct: string;
  id_concentrador: string;
  id_supervisor: string;
  magn_supervisor: number;
  directorio_ftp: string;
  ftp_config_id: number | "";
  activo: boolean;
}

interface ConcentradorDescubierto {
  id_concentrador: string;
  id_supervisor: string | null;
  magn_supervisor: number;
  num_contadores: number;
  directorio_ftp: string;
  nombre_fichero: string;
  ftp_config_id: number;
  ftp_config_nombre: string;
  error?: string;
}

interface PerdidaDiaria {
  id: number;
  empresa_id: number;
  concentrador_id: number;
  nombre_ct: string;
  fecha: string;
  nombre_fichero_s02: string | null;
  ai_supervisor: number;
  ae_supervisor: number;
  ai_clientes: number;
  ae_clientes: number;
  energia_neta_wh: number;
  perdida_wh: number;
  perdida_pct: number | null;
  num_contadores: number;
  horas_con_datos: number;
  estado: string;
  created_at: string;
}

interface PerdidaMensual {
  concentrador_id: number;
  nombre_ct: string;
  empresa_id: number;
  anio: number;
  mes: number;
  ai_supervisor: number;
  ae_supervisor: number;
  ai_clientes: number;
  ae_clientes: number;
  energia_neta_wh: number;
  perdida_wh: number;
  perdida_pct: number | null;
  dias_procesados: number;
  dias_completos: number;
}

interface FtpConfig {
  id: number;
  nombre: string | null;
  empresa_id: number;
  empresa_nombre: string;
  host: string;
  usar_tls: boolean;
}

interface EmpresaOption { id: number; nombre: string; }
interface Props { token: string | null; currentUser: User | null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return s; }
}

function fmtWh(wh: number): string {
  if (Math.abs(wh) >= 1_000_000) return `${(wh / 1_000_000).toFixed(2)} MWh`;
  if (Math.abs(wh) >= 1_000) return `${(wh / 1_000).toFixed(2)} kWh`;
  return `${wh} Wh`;
}

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${Number(pct).toFixed(2)}%`;
}

function estadoBadge(estado: string, horas: number) {
  if (estado === "ok") return <span className="ui-badge ui-badge--ok">OK ({horas}/24h)</span>;
  if (estado === "incompleto") return <span className="ui-badge ui-badge--warn">Incompleto ({horas}/24h)</span>;
  return <span className="ui-badge ui-badge--err">Sin datos</span>;
}

function nombreMes(mes: number): string {
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return meses[mes - 1] || String(mes);
}

const FORM_VACIO: ConcentradorForm = {
  empresa_id: "", nombre_ct: "", id_concentrador: "", id_supervisor: "",
  magn_supervisor: 1000, directorio_ftp: "", ftp_config_id: "", activo: true,
};

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

// ─── Iconos ───────────────────────────────────────────────────────────────────

const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PerdidasSection({ token }: Props) {

  const [panelConfigOpen,    setPanelConfigOpen]    = useState(false);
  const [panelProcesarOpen,  setPanelProcesarOpen]  = useState(false);
  const [panelDiariasOpen,   setPanelDiariasOpen]   = useState(false);
  const [panelMensualesOpen, setPanelMensualesOpen] = useState(false);

  const [empresas,   setEmpresas]   = useState<EmpresaOption[]>([]);
  const [ftpConfigs, setFtpConfigs] = useState<FtpConfig[]>([]);

  // ── Concentradores ────────────────────────────────────────────────────────
  const [concentradores, setConcentradores] = useState<Concentrador[]>([]);
  const [loadingConcs,   setLoadingConcs]   = useState(false);
  const [errorConcs,     setErrorConcs]     = useState<string | null>(null);
  const [showForm,       setShowForm]       = useState(false);
  const [editId,         setEditId]         = useState<number | null>(null);
  const [form,           setForm]           = useState<ConcentradorForm>(FORM_VACIO);
  const [saving,         setSaving]         = useState(false);

  // ── Descubrimiento ────────────────────────────────────────────────────────
  const [descFtpConfigId, setDescFtpConfigId] = useState<number | "">("");
  const [descDirectorio,  setDescDirectorio]  = useState("");
  const [descubriendo,    setDescubriendo]    = useState(false);
  const [descubiertos,    setDescubiertos]    = useState<ConcentradorDescubierto[]>([]);
  const [errorDesc,       setErrorDesc]       = useState<string | null>(null);
  const [analizando,      setAnalizando]      = useState<Record<string, string>>({});
  const [analizandoTodos, setAnalizandoTodos] = useState(false);
  const [anadiendoTodos,  setAnadiendoTodos]  = useState(false);

  // Empresa inferida de la conexión FTP seleccionada
  const ftpConfigSeleccionada = ftpConfigs.find(c => c.id === descFtpConfigId);
  const empresaInferida = ftpConfigSeleccionada
    ? { id: ftpConfigSeleccionada.empresa_id, nombre: ftpConfigSeleccionada.empresa_nombre }
    : null;

  // ── Procesamiento ─────────────────────────────────────────────────────────
  const [procFechaDesde,      setProcFechaDesde]      = useState("");
  const [procFechaHasta,      setProcFechaHasta]      = useState("");
  const [procConcentradorIds, setProcConcentradorIds] = useState<number[]>([]);
  const [procesando,          setProcesando]          = useState(false);
  const [procResultado,       setProcResultado]       = useState<{procesados:number;errores:number;omitidos:number;detalle:string[]} | null>(null);
  const [errorProc,           setErrorProc]           = useState<string | null>(null);

  // ── Pérdidas diarias ──────────────────────────────────────────────────────
  const [perdidas,            setPerdidas]            = useState<PerdidaDiaria[]>([]);
  const [loadingPerdidas,     setLoadingPerdidas]     = useState(false);
  const [errorPerdidas,       setErrorPerdidas]       = useState<string | null>(null);
  const [filtroEmpresaD,      setFiltroEmpresaD]      = useState<number | "">("");
  const [filtroConcentradorD, setFiltroConcentradorD] = useState<number | "">("");
  const [filtroDesdeD,        setFiltroDesdeD]        = useState("");
  const [filtroHastaD,        setFiltroHastaD]        = useState("");
  const [pageDiarias,         setPageDiarias]         = useState(0);
  const [pageSizeDiarias,     setPageSizeDiarias]     = useState(20);

  // ── Pérdidas mensuales ────────────────────────────────────────────────────
  const [mensuales,            setMensuales]            = useState<PerdidaMensual[]>([]);
  const [loadingMensuales,     setLoadingMensuales]     = useState(false);
  const [errorMensuales,       setErrorMensuales]       = useState<string | null>(null);
  const [filtroEmpresaM,       setFiltroEmpresaM]       = useState<number | "">("");
  const [filtroConcentradorM,  setFiltroConcentradorM]  = useState<number | "">("");
  const [filtroAnioM,          setFiltroAnioM]          = useState<string>("");

  // Derivados
  const perdidasPagina    = perdidas.slice(pageDiarias * pageSizeDiarias, (pageDiarias + 1) * pageSizeDiarias);
  const totalPagesDiarias = Math.ceil(perdidas.length / pageSizeDiarias);

  // Descubiertos analizados (con supervisor o sin error)
  const descubiertosAnalizados = descubiertos.filter(
    d => !d.error && analizando[d.id_concentrador] === "ok"
  );

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then(setEmpresas).catch(() => {});
    fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then(setFtpConfigs).catch(() => {});
  }, [token]);

  // ── Concentradores ────────────────────────────────────────────────────────
  const cargarConcentradores = useCallback(async () => {
    if (!token) return;
    setLoadingConcs(true); setErrorConcs(null);
    try {
      const res = await fetch(`${API_BASE_URL}/perdidas/concentradores`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConcentradores(await res.json());
    } catch (e: unknown) {
      setErrorConcs(e instanceof Error ? e.message : "Error");
    } finally { setLoadingConcs(false); }
  }, [token]);

  useEffect(() => {
    if (panelConfigOpen) cargarConcentradores();
  }, [panelConfigOpen, cargarConcentradores]);

  const handleSave = async () => {
    if (!token || !form.empresa_id || !form.nombre_ct || !form.id_concentrador) return;
    setSaving(true); setErrorConcs(null);
    try {
      const url = editId
        ? `${API_BASE_URL}/perdidas/concentradores/${editId}`
        : `${API_BASE_URL}/perdidas/concentradores`;
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id:      form.empresa_id,
          nombre_ct:       form.nombre_ct,
          id_concentrador: form.id_concentrador,
          id_supervisor:   form.id_supervisor || null,
          magn_supervisor: form.magn_supervisor,
          directorio_ftp:  form.directorio_ftp || null,
          ftp_config_id:   form.ftp_config_id || null,
          activo:          form.activo,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      await cargarConcentradores();
      setShowForm(false); setEditId(null); setForm(FORM_VACIO);
    } catch (e: unknown) {
      setErrorConcs(e instanceof Error ? e.message : "Error guardando");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm("¿Eliminar este concentrador y todas sus pérdidas?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/perdidas/concentradores/${id}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConcentradores(prev => prev.filter(c => c.id !== id));
    } catch (e: unknown) {
      setErrorConcs(e instanceof Error ? e.message : "Error borrando");
    }
  };

  // ── Descubrimiento ────────────────────────────────────────────────────────
  const handleDescubrir = async () => {
    if (!token || !descFtpConfigId || !descDirectorio) return;
    setDescubriendo(true); setErrorDesc(null); setDescubiertos([]); setAnalizando({});
    try {
      const params = new URLSearchParams({
        ftp_config_id: String(descFtpConfigId),
        directorio: descDirectorio,
      });
      const res = await fetch(`${API_BASE_URL}/perdidas/concentradores/descubrir?${params}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setDescubiertos(await res.json());
    } catch (e: unknown) {
      setErrorDesc(e instanceof Error ? e.message : "Error escaneando FTP");
    } finally { setDescubriendo(false); }
  };

  // ── Analizar un S02 concreto ──────────────────────────────────────────────
  const handleAnalizar = async (d: ConcentradorDescubierto) => {
    if (!token) return;
    setAnalizando(prev => ({ ...prev, [d.id_concentrador]: "loading" }));
    try {
      const params = new URLSearchParams({
        ftp_config_id: String(d.ftp_config_id),
        directorio:    d.directorio_ftp,
        fichero:       d.nombre_fichero,
      });
      const res = await fetch(`${API_BASE_URL}/perdidas/concentradores/analizar?${params}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const datos = await res.json() as { id_supervisor: string | null; magn_supervisor: number; num_contadores: number };
      setDescubiertos(prev => prev.map(c =>
        c.id_concentrador === d.id_concentrador
          ? { ...c, id_supervisor: datos.id_supervisor, magn_supervisor: datos.magn_supervisor, num_contadores: datos.num_contadores }
          : c
      ));
      setAnalizando(prev => ({ ...prev, [d.id_concentrador]: "ok" }));
    } catch {
      setAnalizando(prev => ({ ...prev, [d.id_concentrador]: "error" }));
    }
  };

  // ── Analizar todos secuencialmente ────────────────────────────────────────
  const handleAnalizarTodos = async () => {
    setAnalizandoTodos(true);
    for (const d of descubiertos) {
      if (d.error) continue;
      if (analizando[d.id_concentrador] === "ok") continue;
      await handleAnalizar(d);
    }
    setAnalizandoTodos(false);
  };

  // ── Añadir todos los analizados con la empresa de la conexión FTP ─────────
  const handleAnadirTodos = async () => {
    if (!token || !empresaInferida) return;
    const candidatos = descubiertos.filter(d => !d.error && analizando[d.id_concentrador] === "ok");
    if (candidatos.length === 0) {
      alert("No hay concentradores analizados. Pulsa 'Analizar todos' primero.");
      return;
    }
    if (!confirm(`¿Añadir ${candidatos.length} concentrador(es) a la empresa "${empresaInferida.nombre}"?\nEl nombre CT se establecerá como el ID del concentrador — puedes editarlo después.`)) return;
    setAnadiendoTodos(true);
    let ok = 0; let err = 0;
    for (const d of candidatos) {
      try {
        const res = await fetch(`${API_BASE_URL}/perdidas/concentradores`, {
          method: "POST",
          headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_id:      empresaInferida.id,
            nombre_ct:       d.id_concentrador,  // nombre provisional = ID
            id_concentrador: d.id_concentrador,
            id_supervisor:   d.id_supervisor || null,
            magn_supervisor: d.magn_supervisor,
            directorio_ftp:  d.directorio_ftp,
            ftp_config_id:   d.ftp_config_id,
            activo:          true,
          }),
        });
        if (res.ok) ok++; else err++;
      } catch { err++; }
    }
    setAnadiendoTodos(false);
    alert(`${ok} añadidos correctamente${err > 0 ? `, ${err} errores` : ""}.`);
    await cargarConcentradores();
  };

  const handleConfirmarDescubierto = (d: ConcentradorDescubierto) => {
    setForm({
      empresa_id:      empresaInferida?.id || "",
      nombre_ct:       d.id_concentrador,  // nombre provisional = ID
      id_concentrador: d.id_concentrador,
      id_supervisor:   d.id_supervisor || "",
      magn_supervisor: d.magn_supervisor,
      directorio_ftp:  d.directorio_ftp,
      ftp_config_id:   d.ftp_config_id,
      activo:          true,
    });
    setEditId(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Procesamiento ─────────────────────────────────────────────────────────
  const handleProcesar = async () => {
    if (!token || !procFechaDesde || !procFechaHasta) return;
    setProcesando(true); setErrorProc(null); setProcResultado(null);
    try {
      const res = await fetch(`${API_BASE_URL}/perdidas/procesar`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          concentrador_ids: procConcentradorIds.length > 0 ? procConcentradorIds : null,
          fecha_desde: procFechaDesde,
          fecha_hasta: procFechaHasta,
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setProcResultado(await res.json());
    } catch (e: unknown) {
      setErrorProc(e instanceof Error ? e.message : "Error procesando");
    } finally { setProcesando(false); }
  };

  // ── Pérdidas diarias ──────────────────────────────────────────────────────
  const cargarPerdidas = useCallback(async () => {
    if (!token) return;
    setLoadingPerdidas(true); setErrorPerdidas(null);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (filtroEmpresaD)      params.set("empresa_id",      String(filtroEmpresaD));
      if (filtroConcentradorD) params.set("concentrador_id", String(filtroConcentradorD));
      if (filtroDesdeD)        params.set("fecha_desde",     filtroDesdeD);
      if (filtroHastaD)        params.set("fecha_hasta",     filtroHastaD);
      const res = await fetch(`${API_BASE_URL}/perdidas/diarias?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setPerdidas(await res.json());
      setPageDiarias(0);
    } catch (e: unknown) {
      setErrorPerdidas(e instanceof Error ? e.message : "Error");
    } finally { setLoadingPerdidas(false); }
  }, [token, filtroEmpresaD, filtroConcentradorD, filtroDesdeD, filtroHastaD]);

  useEffect(() => {
    if (panelDiariasOpen) cargarPerdidas();
  }, [panelDiariasOpen, cargarPerdidas]);

  // ── Pérdidas mensuales ────────────────────────────────────────────────────
  const cargarMensuales = useCallback(async () => {
    if (!token) return;
    setLoadingMensuales(true); setErrorMensuales(null);
    try {
      const params = new URLSearchParams();
      if (filtroEmpresaM)      params.set("empresa_id",      String(filtroEmpresaM));
      if (filtroConcentradorM) params.set("concentrador_id", String(filtroConcentradorM));
      if (filtroAnioM)         params.set("anio",            filtroAnioM);
      const res = await fetch(`${API_BASE_URL}/perdidas/mensuales?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setMensuales(await res.json());
    } catch (e: unknown) {
      setErrorMensuales(e instanceof Error ? e.message : "Error");
    } finally { setLoadingMensuales(false); }
  }, [token, filtroEmpresaM, filtroConcentradorM, filtroAnioM]);

  useEffect(() => {
    if (panelMensualesOpen) cargarMensuales();
  }, [panelMensualesOpen, cargarMensuales]);

  // ── Datos para gráficos ───────────────────────────────────────────────────
  const datosGraficoDiario = perdidas.slice().reverse().map(p => ({
    fecha:       p.fecha,
    perdida_wh:  p.perdida_wh,
    perdida_pct: p.perdida_pct !== null ? Number(p.perdida_pct) : 0,
    nombre_ct:   p.nombre_ct,
  }));

  const datosGraficoMensual = mensuales.slice().reverse().map(m => ({
    periodo:     `${nombreMes(m.mes)} ${m.anio}`,
    perdida_wh:  m.perdida_wh,
    perdida_pct: m.perdida_pct !== null ? Number(m.perdida_pct) : 0,
    nombre_ct:   m.nombre_ct,
  }));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="text-sm">

      {/* ══ PANEL 1 — CONFIGURACIÓN DE CTs ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelConfigOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>⚙️ Configuración de Centros de Transformación</div>
            <div style={panelDescStyle}>Gestiona los concentradores y sus contadores supervisor por empresa</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelConfigOpen(v => !v); }}>
            {panelConfigOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelConfigOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorConcs && <div className="ui-alert ui-alert--danger mb-3">{errorConcs}</div>}

            {/* Descubrimiento automático */}
            <div style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                🔍 Descubrimiento automático
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Conexión FTP</label>
                  <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 220 }}
                    value={descFtpConfigId}
                    onChange={e => {
                      setDescFtpConfigId(e.target.value === "" ? "" : Number(e.target.value));
                      setDescubiertos([]); setAnalizando({});
                    }}>
                    <option value="">Selecciona conexión FTP</option>
                    {ftpConfigs.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre || c.empresa_nombre} — {c.host}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Directorio FTP</label>
                  <input className="ui-input" style={{ fontSize: 11, height: 30, width: 140 }}
                    value={descDirectorio}
                    onChange={e => setDescDirectorio(e.target.value)}
                    placeholder="/202604/" />
                </div>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ height: 30, display: "flex", alignItems: "center", gap: 5 }}
                  onClick={handleDescubrir} disabled={!descFtpConfigId || !descDirectorio || descubriendo}>
                  <IconSearch /> {descubriendo ? "Escaneando..." : "Descubrir concentradores"}
                </button>
              </div>

              {/* Empresa inferida de la conexión FTP */}
              {empresaInferida && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Empresa:</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary, #378ADD)" }}>
                    {empresaInferida.nombre}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    (los concentradores se asignarán a esta empresa)
                  </span>
                </div>
              )}

              {errorDesc && <div className="ui-alert ui-alert--danger mt-3">{errorDesc}</div>}

              {descubiertos.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {/* Cabecera con conteo y botones de acción masiva */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {descubiertos.length} concentrador(es) encontrado(s)
                      {descubiertosAnalizados.length > 0 && (
                        <span style={{ color: "#1D9E75", marginLeft: 6 }}>
                          · {descubiertosAnalizados.length} analizados
                        </span>
                      )}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                        onClick={handleAnalizarTodos}
                        disabled={analizandoTodos || descubriendo}>
                        🔬 {analizandoTodos ? "Analizando..." : "Analizar todos"}
                      </button>
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                        onClick={handleAnadirTodos}
                        disabled={anadiendoTodos || descubiertosAnalizados.length === 0 || !empresaInferida}>
                        <IconPlus /> {anadiendoTodos ? "Añadiendo..." : `Añadir todos (${descubiertosAnalizados.length})`}
                      </button>
                    </div>
                  </div>

                  <div className="ui-table-wrap">
                    <table className="ui-table text-[11px]">
                      <thead className="ui-thead">
                        <tr>
                          <th className="ui-th">ID Concentrador</th>
                          <th className="ui-th">Supervisor detectado</th>
                          <th className="ui-th" style={{ textAlign: "center" }}>Magn</th>
                          <th className="ui-th" style={{ textAlign: "right" }}>Contadores</th>
                          <th className="ui-th">Directorio</th>
                          <th className="ui-th">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {descubiertos.map(d => (
                          <tr key={d.id_concentrador} className="ui-tr">
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{d.id_concentrador}</td>
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>
                              {d.id_supervisor
                                ? <span style={{ color: "#1D9E75" }}>{d.id_supervisor}</span>
                                : <span style={{ color: "var(--text-muted)" }}>
                                    {analizando[d.id_concentrador] === "ok" ? "Sin supervisor (Kaifa)" : "No analizado"}
                                  </span>
                              }
                            </td>
                            <td className="ui-td" style={{ textAlign: "center" }}>{d.magn_supervisor}</td>
                            <td className="ui-td" style={{ textAlign: "right" }}>
                              {d.num_contadores > 0 ? d.num_contadores : <span style={{ color: "var(--text-muted)" }}>—</span>}
                            </td>
                            <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{d.directorio_ftp}</td>
                            <td className="ui-td">
                              {d.error ? (
                                <span style={{ fontSize: 10, color: "#E24B4A" }}>Error</span>
                              ) : (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                                    disabled={analizando[d.id_concentrador] === "loading" || analizandoTodos}
                                    onClick={() => handleAnalizar(d)}
                                    title="Descargar S02 y detectar supervisor">
                                    {analizando[d.id_concentrador] === "loading"
                                      ? "..."
                                      : analizando[d.id_concentrador] === "error"
                                      ? "⚠️"
                                      : analizando[d.id_concentrador] === "ok"
                                      ? "✅"
                                      : "🔬"}
                                  </button>
                                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                                    onClick={() => handleConfirmarDescubierto(d)}>
                                    Añadir
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Botón añadir manual */}
            {!showForm && (
              <div style={{ marginBottom: 14 }}>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => { setShowForm(true); setEditId(null); setForm(FORM_VACIO); }}>
                  <IconPlus /> Añadir CT manualmente
                </button>
              </div>
            )}

            {/* Formulario */}
            {showForm && (
              <div style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {editId ? "Editar CT" : "Nuevo CT"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.empresa_id}
                      onChange={e => setForm(f => ({ ...f, empresa_id: Number(e.target.value) }))}>
                      <option value="">Selecciona empresa</option>
                      {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Nombre CT</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.nombre_ct}
                      onChange={e => setForm(f => ({ ...f, nombre_ct: e.target.value }))}
                      placeholder="ej: CT Juncosa" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>ID Concentrador</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.id_concentrador}
                      onChange={e => setForm(f => ({ ...f, id_concentrador: e.target.value }))}
                      placeholder="ej: CIR4622509200" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>ID Supervisor (cabecera)</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.id_supervisor}
                      onChange={e => setForm(f => ({ ...f, id_supervisor: e.target.value }))}
                      placeholder="ej: CIR2082514122" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Magn supervisor</label>
                    <input className="ui-input" type="number" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.magn_supervisor}
                      onChange={e => setForm(f => ({ ...f, magn_supervisor: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Directorio FTP</label>
                    <input className="ui-input" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.directorio_ftp}
                      onChange={e => setForm(f => ({ ...f, directorio_ftp: e.target.value }))}
                      placeholder="ej: /202604/" />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Conexión FTP</label>
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={form.ftp_config_id}
                      onChange={e => setForm(f => ({ ...f, ftp_config_id: e.target.value === "" ? "" : Number(e.target.value) }))}>
                      <option value="">Sin conexión FTP</option>
                      {ftpConfigs.map(c => <option key={c.id} value={c.id}>{c.nombre || c.empresa_nombre} — {c.host}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" id="activo-ct-chk" checked={form.activo}
                        onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                      <label htmlFor="activo-ct-chk" style={{ fontSize: 11, color: "var(--text-muted)" }}>Activo</label>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={handleSave} disabled={saving || !form.empresa_id || !form.nombre_ct || !form.id_concentrador}>
                    {saving ? "Guardando..." : editId ? "Guardar cambios" : "Crear CT"}
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                    onClick={() => { setShowForm(false); setEditId(null); setForm(FORM_VACIO); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Tabla de concentradores configurados */}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Nombre CT</th>
                    <th className="ui-th">Empresa</th>
                    <th className="ui-th">ID Concentrador</th>
                    <th className="ui-th">Supervisor</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Magn</th>
                    <th className="ui-th">Directorio FTP</th>
                    <th className="ui-th">Último proceso</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Estado</th>
                    <th className="ui-th">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConcs ? (
                    <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : concentradores.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin CTs configurados · Usa el descubrimiento automático o añade uno manualmente
                    </td></tr>
                  ) : concentradores.map(c => (
                    <tr key={c.id} className="ui-tr">
                      <td className="ui-td" style={{ fontWeight: 600 }}>{c.nombre_ct}</td>
                      <td className="ui-td">{c.empresa_nombre}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.id_concentrador}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>
                        {c.id_supervisor || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No definido</span>}
                      </td>
                      <td className="ui-td" style={{ textAlign: "center" }}>{c.magn_supervisor}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{c.directorio_ftp || "—"}</td>
                      <td className="ui-td ui-muted">{fmtDate(c.fecha_ultimo_proceso)}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>
                        <span className={`ui-badge ${c.activo ? "ui-badge--ok" : "ui-badge--neutral"}`}>
                          {c.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="ui-td">
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                            style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}
                            onClick={() => {
                              setEditId(c.id);
                              setForm({
                                empresa_id:      c.empresa_id,
                                nombre_ct:       c.nombre_ct,
                                id_concentrador: c.id_concentrador,
                                id_supervisor:   c.id_supervisor || "",
                                magn_supervisor: c.magn_supervisor,
                                directorio_ftp:  c.directorio_ftp || "",
                                ftp_config_id:   c.ftp_config_id || "",
                                activo:          c.activo,
                              });
                              setShowForm(true);
                            }}>
                            <IconEdit />
                          </button>
                          <button type="button" className="ui-btn ui-btn-danger ui-btn-xs"
                            style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}
                            onClick={() => handleDelete(c.id)}>
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

      {/* ══ PANEL 2 — PROCESAMIENTO ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelProcesarOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>⚡ Procesamiento de S02</div>
            <div style={panelDescStyle}>Calcula pérdidas procesando los ficheros S02 descargados</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelProcesarOpen(v => !v); }}>
            {panelProcesarOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelProcesarOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorProc && <div className="ui-alert ui-alert--danger mb-3">{errorProc}</div>}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Fecha desde</label>
                <input className="ui-input" type="date" style={{ fontSize: 11, height: 30 }}
                  value={procFechaDesde} onChange={e => setProcFechaDesde(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Fecha hasta</label>
                <input className="ui-input" type="date" style={{ fontSize: 11, height: 30 }}
                  value={procFechaHasta} onChange={e => setProcFechaHasta(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>CTs (vacío = todos)</label>
                <select className="ui-select" multiple style={{ fontSize: 11, height: 60, minWidth: 200 }}
                  value={procConcentradorIds.map(String)}
                  onChange={e => {
                    const vals = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                    setProcConcentradorIds(vals);
                  }}>
                  {concentradores.filter(c => c.activo).map(c => (
                    <option key={c.id} value={c.id}>{c.nombre_ct} — {c.empresa_nombre}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ height: 30, display: "flex", alignItems: "center", gap: 5 }}
                onClick={handleProcesar} disabled={procesando || !procFechaDesde || !procFechaHasta}>
                <IconRefresh /> {procesando ? "Procesando..." : "Procesar S02 pendientes"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
              ⚠️ Asegúrate de que los ficheros S02 estén descargados en el servidor antes de procesar.
              Si ya existe un registro para una fecha → se sobreescribe.
            </div>
            {procResultado && (
              <div style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
                  <div style={{ fontSize: 11 }}>✅ <strong style={{ color: "#1D9E75" }}>{procResultado.procesados}</strong> procesados</div>
                  <div style={{ fontSize: 11 }}>❌ <strong style={{ color: "#E24B4A" }}>{procResultado.errores}</strong> errores</div>
                  <div style={{ fontSize: 11 }}>⏭️ <strong style={{ color: "var(--text-muted)" }}>{procResultado.omitidos}</strong> omitidos</div>
                </div>
                <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {procResultado.detalle.map((d, i) => (
                    <div key={i} style={{ color: d.startsWith("ERROR") ? "#E24B4A" : d.startsWith("AVISO") ? "#EF9F27" : "var(--text-muted)" }}>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ PANEL 3 — PÉRDIDAS DIARIAS ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelDiariasOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📅 Pérdidas diarias</div>
            <div style={panelDescStyle}>Pérdidas calculadas por CT y día</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelDiariasOpen(v => !v); }}>
            {panelDiariasOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelDiariasOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorPerdidas && <div className="ui-alert ui-alert--danger mb-3">{errorPerdidas}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 160 }}
                  value={filtroEmpresaD}
                  onChange={e => setFiltroEmpresaD(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Todas</option>
                  {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>CT</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 180 }}
                  value={filtroConcentradorD}
                  onChange={e => setFiltroConcentradorD(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Todos</option>
                  {concentradores.map(c => <option key={c.id} value={c.id}>{c.nombre_ct}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Desde</label>
                <input className="ui-input" type="date" style={{ fontSize: 11, height: 30 }}
                  value={filtroDesdeD} onChange={e => setFiltroDesdeD(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Hasta</label>
                <input className="ui-input" type="date" style={{ fontSize: 11, height: 30 }}
                  value={filtroHastaD} onChange={e => setFiltroHastaD(e.target.value)} />
              </div>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ height: 30, display: "flex", alignItems: "center", gap: 5 }}
                onClick={cargarPerdidas} disabled={loadingPerdidas}>
                <IconRefresh /> Buscar
              </button>
            </div>
            {datosGraficoDiario.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Evolución de pérdidas diarias (%)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={datosGraficoDiario} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Pérdida"]} />
                    <Legend />
                    <Line type="monotone" dataKey="perdida_pct" stroke="#378ADD" strokeWidth={2} dot={false} name="Pérdida %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">CT</th>
                    <th className="ui-th">Fecha</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>E. supervisor</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>E. clientes neta</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>Pérdida</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>% Pérdida</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Calidad</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingPerdidas ? (
                    <tr className="ui-tr"><td colSpan={7} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : perdidas.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={7} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Sin datos · Procesa los ficheros S02 primero</td></tr>
                  ) : perdidasPagina.map(p => (
                    <tr key={p.id} className="ui-tr">
                      <td className="ui-td" style={{ fontWeight: 500 }}>{p.nombre_ct}</td>
                      <td className="ui-td">{p.fecha}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>{fmtWh(p.energia_neta_wh)}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>{fmtWh(p.ai_clientes - p.ae_clientes)}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10, color: p.perdida_wh < 0 ? "#E24B4A" : "var(--text)" }}>{fmtWh(p.perdida_wh)}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontWeight: 500, color: p.perdida_pct !== null && Number(p.perdida_pct) > 5 ? "#E24B4A" : "var(--text)" }}>{fmtPct(p.perdida_pct)}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>{estadoBadge(p.estado, p.horas_con_datos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter
              loading={loadingPerdidas}
              hasLoadedOnce={perdidas.length > 0 || !loadingPerdidas}
              totalFilas={perdidas.length}
              startIndex={pageDiarias * pageSizeDiarias}
              endIndex={Math.min((pageDiarias + 1) * pageSizeDiarias, perdidas.length)}
              pageSize={pageSizeDiarias}
              setPageSize={v => { setPageSizeDiarias(v); setPageDiarias(0); }}
              currentPage={pageDiarias}
              totalPages={totalPagesDiarias}
              setPage={setPageDiarias}
              compact
            />
          </div>
        )}
      </div>

      {/* ══ PANEL 4 — PÉRDIDAS MENSUALES ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelMensualesOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📊 Pérdidas mensuales</div>
            <div style={panelDescStyle}>Agregado mensual de pérdidas por CT</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelMensualesOpen(v => !v); }}>
            {panelMensualesOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelMensualesOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {errorMensuales && <div className="ui-alert ui-alert--danger mb-3">{errorMensuales}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 160 }}
                  value={filtroEmpresaM}
                  onChange={e => setFiltroEmpresaM(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Todas</option>
                  {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>CT</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 180 }}
                  value={filtroConcentradorM}
                  onChange={e => setFiltroConcentradorM(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Todos</option>
                  {concentradores.map(c => <option key={c.id} value={c.id}>{c.nombre_ct}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Año</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, width: 80 }}
                  value={filtroAnioM} onChange={e => setFiltroAnioM(e.target.value)}>
                  <option value="">Todos</option>
                  {[2024, 2025, 2026].map(a => <option key={a} value={String(a)}>{a}</option>)}
                </select>
              </div>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ height: 30, display: "flex", alignItems: "center", gap: 5 }}
                onClick={cargarMensuales} disabled={loadingMensuales}>
                <IconRefresh /> Buscar
              </button>
            </div>
            {datosGraficoMensual.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Evolución de pérdidas mensuales (%)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={datosGraficoMensual} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Pérdida"]} />
                    <Legend />
                    <Bar dataKey="perdida_pct" fill="#378ADD" name="Pérdida %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">CT</th>
                    <th className="ui-th">Periodo</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>E. supervisor</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>E. clientes neta</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>Pérdida</th>
                    <th className="ui-th" style={{ textAlign: "right" }}>% Pérdida</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Días OK / Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMensuales ? (
                    <tr className="ui-tr"><td colSpan={7} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : mensuales.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={7} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Sin datos mensuales</td></tr>
                  ) : mensuales.map((m, i) => (
                    <tr key={i} className="ui-tr">
                      <td className="ui-td" style={{ fontWeight: 500 }}>{m.nombre_ct}</td>
                      <td className="ui-td">{nombreMes(m.mes)} {m.anio}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>{fmtWh(m.energia_neta_wh)}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>{fmtWh(m.ai_clientes - m.ae_clientes)}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10, color: m.perdida_wh < 0 ? "#E24B4A" : "var(--text)" }}>{fmtWh(m.perdida_wh)}</td>
                      <td className="ui-td" style={{ textAlign: "right", fontWeight: 500, color: m.perdida_pct !== null && Number(m.perdida_pct) > 5 ? "#E24B4A" : "var(--text)" }}>{fmtPct(m.perdida_pct)}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>
                        <span style={{ fontSize: 10, color: m.dias_completos < m.dias_procesados ? "#EF9F27" : "#1D9E75" }}>
                          {m.dias_completos} / {m.dias_procesados}
                        </span>
                      </td>
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
