"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import ExploradorFtpPanel, { type FtpConfig } from "../comunicaciones/ExploradorFtpPanel";
import TablePaginationFooter from "../ui/TablePaginationFooter";
import DashboardEnviosSection from "./DashboardEnviosSection";
import CampanaAlertasEnvios from "../medidas/CampanaAlertasEnvios";
import UiCard from "../ui/UiCard";

interface Props { token: string | null; }

// ─── Tipos del histórico ──────────────────────────────────────────────────────

interface EnvioM {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  codigo_ree_empresa: string;
  tipo: string;                          // AGRECL / INMECL / MAGCL
  comercializadora_codigo: string | null;
  periodo_anio: number | null;
  periodo_mes: number | null;
  fecha_generacion: string;              // ISO date
  version: number;
  m_clasificacion: string;
  nombre_fichero: string;
  subido_sftp_at: string;
  estado_ree: string;                    // 'pendiente' | 'ok' | 'bad'
  estado_ree_n: number | null;
  respuesta_recibida_at: string | null;
  respuesta_nombre_fichero: string | null;
  reintentos: number;
  created_at: string;
  updated_at: string;
}

interface CountResult {
  total: number;
  pendiente: number;
  ok: number;
  bad: number;
}

interface EmpresaOption { id: number; nombre: string; codigo_ree: string | null; }

type MClass = "" | "M1" | "M2" | "M7";

// ─── Estilos compartidos ──────────────────────────────────────────────────────

// panelStyle eliminado — ahora usamos <UiCard padding="none">
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

function fmtFechaSimple(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return s; }
}

function fmtPeriodo(anio: number | null, mes: number | null): string {
  if (!anio || !mes) return "—";
  const meses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${meses[mes] || mes}/${anio}`;
}

function badgeEstadoClass(estado: string): string {
  if (estado === "ok")  return "ui-badge ui-badge--ok";
  if (estado === "bad") return "ui-badge ui-badge--err";
  return "ui-badge ui-badge--neutral";
}

function badgeEstadoLabel(estado: string, n: number | null): string {
  if (estado === "ok")  return "OK";
  if (estado === "bad") return n ? `BAD${n}` : "BAD";
  return "Pendiente";
}

const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EnviosSection({ token }: Props) {
  const [panelEnvioOpen, setPanelEnvioOpen] = useState(false);
  const [panelHistOpen, setPanelHistOpen]   = useState(false);

  const [configs, setConfigs] = useState<FtpConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorConfigs, setErrorConfigs] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // Histórico M2
  const [envios, setEnvios] = useState<EnvioM[]>([]);
  const [loadingEnvios, setLoadingEnvios] = useState(false);
  const [errorEnvios, setErrorEnvios] = useState<string | null>(null);
  const [countEnvios, setCountEnvios] = useState<CountResult | null>(null);

  const [filtroM, setFiltroM]             = useState<MClass>("M2");    // M1 / M2 / M7
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");      // "" o id
  const [filtroTipo, setFiltroTipo]       = useState<string>("");      // "" / AGRECL / INMECL / MAGCL
  const [filtroEstado, setFiltroEstado]   = useState<string>("");      // "" / pendiente / ok / bad
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("");      // "" o "anio-mes" (ej: "2026-3")

  const [periodosDisponibles, setPeriodosDisponibles] = useState<{ anio: number; mes: number }[]>([]);

  const [pageEnvios, setPageEnvios]         = useState(0);
  const [pageSizeEnvios, setPageSizeEnvios] = useState(20);

  const [revisandoRespuestas, setRevisandoRespuestas] = useState(false);
  const [borrandoId, setBorrandoId]                   = useState<number | null>(null);
  const [descargandoId, setDescargandoId]             = useState<number | null>(null);
  const [menuAbiertoId, setMenuAbiertoId]             = useState<number | null>(null);

  // ── Cargar configs FTP (para tarjeta Envío) ────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (!panelEnvioOpen && !panelHistOpen) return;
    let cancelled = false;
    setLoadingConfigs(true); setErrorConfigs(null);
    fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((d: FtpConfig[]) => { if (!cancelled) setConfigs(d); })
      .catch((e: unknown) => {
        if (!cancelled) setErrorConfigs(e instanceof Error ? e.message : "Error cargando conexiones");
      })
      .finally(() => { if (!cancelled) setLoadingConfigs(false); });
    return () => { cancelled = true; };
  }, [token, panelEnvioOpen, panelHistOpen]);

  // ── Cargar empresas (para filtro del histórico) ────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: EmpresaOption[]) => setEmpresas(d))
      .catch(() => {});
  }, [token]);

  // ── Cargar periodos disponibles para el filtro Periodo ─────────────────────
  // Cada vez que cambie filtroM o se abra el panel, refrescamos la lista de
  // periodos disponibles (anio, mes) que tienen al menos un envío.
  useEffect(() => {
    if (!token) return;
    if (!panelHistOpen) return;
    const url = filtroM
      ? `${API_BASE_URL}/envios/historico/periodos?m_clasificacion=${filtroM}`
      : `${API_BASE_URL}/envios/historico/periodos`;
    fetch(url, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: { anio: number; mes: number }[]) => setPeriodosDisponibles(d))
      .catch(() => setPeriodosDisponibles([]));
  }, [token, filtroM, panelHistOpen]);

  // ── Cargar histórico (M1 / M2 / M7) ────────────────────────────────────────
  const cargarEnvios = useCallback(async () => {
    if (!token) return;
    setLoadingEnvios(true); setErrorEnvios(null);
    try {
      // Filtramos por la ventana M seleccionada (vacío = todos)
      const params = new URLSearchParams({ limit: "500" });
      if (filtroM)       params.set("m_clasificacion", filtroM);
      if (filtroEmpresa) params.set("empresa_id", filtroEmpresa);
      if (filtroTipo)    params.set("tipo", filtroTipo);
      if (filtroEstado)  params.set("estado", filtroEstado);
      if (filtroPeriodo) {
        const [anioStr, mesStr] = filtroPeriodo.split("-");
        if (anioStr) params.set("periodo_anio", anioStr);
        if (mesStr)  params.set("periodo_mes", mesStr);
      }

      // Para count usamos el mismo filtro M (si está vacío, count global)
      const countUrl = filtroM
        ? `${API_BASE_URL}/envios/historico/count?m_clasificacion=${filtroM}`
        : `${API_BASE_URL}/envios/historico/count`;
      const [resList, resCount] = await Promise.all([
        fetch(`${API_BASE_URL}/envios/historico?${params}`, { headers: getAuthHeaders(token) }),
        fetch(countUrl, { headers: getAuthHeaders(token) }),
      ]);
      if (!resList.ok) throw new Error(`Error ${resList.status}`);
      const list: EnvioM[] = await resList.json();
      setEnvios(list);
      setPageEnvios(0);
      if (resCount.ok) {
        const c: CountResult = await resCount.json();
        setCountEnvios(c);
      }
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error cargando histórico");
    } finally { setLoadingEnvios(false); }
  }, [token, filtroM, filtroEmpresa, filtroTipo, filtroEstado, filtroPeriodo]);

  // Recargar al abrir tarjeta o cambiar filtros
  useEffect(() => {
    if (panelHistOpen) cargarEnvios();
  }, [panelHistOpen, cargarEnvios]);

  // ── Paginación cliente ─────────────────────────────────────────────────────
  const enviosPagina = envios.slice(pageEnvios * pageSizeEnvios, (pageEnvios + 1) * pageSizeEnvios);
  const totalPagesEnvios = Math.ceil(envios.length / pageSizeEnvios);

  // ── Revisar respuestas REE ─────────────────────────────────────────────────
  const handleRevisarRespuestas = async () => {
    if (!token) return;
    setRevisandoRespuestas(true); setErrorEnvios(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios/buscar-respuestas`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const data = await res.json();
      const partes: string[] = [];
      if (data.ok_marcados > 0)  partes.push(`${data.ok_marcados} marcados como OK`);
      if (data.bad_marcados > 0) partes.push(`${data.bad_marcados} marcados como BAD`);
      if (data.bad_borrados > 0) partes.push(`${data.bad_borrados} BAD obsoletos borrados`);
      const resumen = partes.length > 0 ? partes.join(", ") : "Sin cambios";
      const errs = (data.errores || []) as string[];
      const msgErr = errs.length > 0 ? `\n\nAvisos:\n${errs.join("\n")}` : "";
      alert(`Revisión completa.\n\n${resumen}.${msgErr}`);
      // Recargar el histórico para reflejar los cambios
      await cargarEnvios();
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error revisando respuestas");
    } finally {
      setRevisandoRespuestas(false);
    }
  };

  // ── Descargar fichero enviado o respuesta REE (con "Guardar como...") ──────
  const handleDescargarEnvio = async (envio: EnvioM, tipo: "original" | "respuesta") => {
    if (!token) return;
    setMenuAbiertoId(null);
    setDescargandoId(envio.id);
    setErrorEnvios(null);

    // Nombre sugerido según tipo
    const nombreSugerido = tipo === "original"
      ? envio.nombre_fichero
      : (envio.respuesta_nombre_fichero || `${envio.nombre_fichero}.respuesta`);

    // PASO 1: pedir destino al usuario ANTES del fetch (diálogo nativo si soporta API)
    type SaveFilePickerOptions = { suggestedName?: string };
    type FileSystemWritableFileStreamLike = {
      write: (data: Blob | ArrayBuffer | string) => Promise<void>;
      close: () => Promise<void>;
    };
    type FileSystemFileHandleLike = {
      createWritable: () => Promise<FileSystemWritableFileStreamLike>;
    };
    const win = window as unknown as {
      showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
    };

    let fileHandle: FileSystemFileHandleLike | null = null;
    if (typeof win.showSaveFilePicker === "function") {
      try {
        fileHandle = await win.showSaveFilePicker({ suggestedName: nombreSugerido });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setDescargandoId(null);
          return;
        }
      }
    }

    try {
      // PASO 2: fetch del fichero al backend
      const res = await fetch(`${API_BASE_URL}/envios/${envio.id}/descargar/${tipo}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const blob = await res.blob();

      // PASO 3: escribir en destino o fallback <a download>
      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreSugerido;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error descargando fichero");
    } finally {
      setDescargandoId(null);
    }
  };

  // ── Borrar envío del histórico (solo BD, no toca SFTP) ─────────────────────
  const handleBorrarEnvio = async (envio: EnvioM) => {
    if (!token) return;
    setMenuAbiertoId(null);
    if (!confirm(`¿Borrar este envío del histórico?\n\nFichero: ${envio.nombre_fichero}\n\nEsto NO toca el SFTP — el fichero seguirá allí.`)) return;

    setBorrandoId(envio.id);
    setErrorEnvios(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios/${envio.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      // Refrescar histórico
      await cargarEnvios();
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error borrando envío");
    } finally {
      setBorrandoId(null);
    }
  };

  // ── Cerrar menú "⋯" al hacer click fuera ───────────────────────────────────
  useEffect(() => {
    if (menuAbiertoId === null) return;
    const onClick = () => setMenuAbiertoId(null);
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [menuAbiertoId]);

  return (
    <div className="text-sm">

      {/* ══ DASHBOARD DE ENVÍOS ═════════════════════════════════════════════ */}
      <DashboardEnviosSection token={token} />

      {/* ══ TARJETA 1 — ENVÍO DE FICHEROS ══════════════════════════════════ */}
      <UiCard padding="none" style={{ overflow: "hidden", marginBottom: "10px" }}>
        <div style={panelHeaderStyle} onClick={() => setPanelEnvioOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📤 Envío de ficheros</div>
            <div style={panelDescStyle}>
              Sube F1, F1QH, AGRECL, INMECL, MAGCL, MCIL345 y MCIL345QH al SFTP REE.
              Se registran automáticamente en el histórico al subirlos.
            </div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelEnvioOpen(v => !v); }}>
            {panelEnvioOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelEnvioOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 16px" }}>
            {errorConfigs && <div className="ui-alert ui-alert--danger mb-3">{errorConfigs}</div>}
            {loadingConfigs && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
                Cargando conexiones FTP...
              </div>
            )}
            {!loadingConfigs && configs.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
                Sin conexiones FTP configuradas. Configura una en la pestaña Comunicaciones primero.
              </div>
            )}
            {!loadingConfigs && configs.length > 0 && (
              <ExploradorFtpPanel
                token={token}
                configs={configs}
                titulo="Explorador SFTP"
                inicialAbierto
                onUploadCompleted={(r) => {
                  console.log("Subidos al SFTP:", r);
                  // Si la tarjeta del histórico está abierta → recargar para ver los nuevos
                  if (panelHistOpen) cargarEnvios();
                }}
              />
            )}
          </div>
        )}
      </UiCard>

      {/* ══ TARJETA 2 — HISTÓRICO DE ENVÍOS ════════════════════════════════ */}
      <UiCard padding="none" style={{ overflow: "hidden", marginBottom: "10px" }}>
        <div style={panelHeaderStyle} onClick={() => setPanelHistOpen(v => !v)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={panelTitleStyle}>📋 Histórico de envíos</div>
              <div style={panelDescStyle}>
                Envíos F1, F1QH, AGRECL, INMECL, MAGCL, MCIL345 y MCIL345QH con estado de respuesta REE. Selecciona la ventana M (M1, M2 o M7).
              </div>
            </div>
            {countEnvios && panelHistOpen && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span className="ui-badge ui-badge--neutral">{countEnvios.total} total</span>
                {countEnvios.pendiente > 0 && <span className="ui-badge ui-badge--neutral">{countEnvios.pendiente} pendiente</span>}
                {countEnvios.ok > 0 && <span className="ui-badge ui-badge--ok">{countEnvios.ok} OK</span>}
                {countEnvios.bad > 0 && <span className="ui-badge ui-badge--err">{countEnvios.bad} BAD</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {panelHistOpen && (
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                onClick={e => { e.stopPropagation(); handleRevisarRespuestas(); }}
                disabled={revisandoRespuestas}
                title="Escanear el SFTP en busca de respuestas .ok/.bad de REE">
                <IconRefresh /> {revisandoRespuestas ? "Revisando..." : "Revisar respuestas REE"}
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={e => { e.stopPropagation(); setPanelHistOpen(v => !v); }}>
              {panelHistOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        {panelHistOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)" }}>
            {/* Filtros */}
            <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap", alignItems: "flex-end", background: "var(--field-bg-soft)", borderBottom: "1px solid var(--card-border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Ventana M</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, width: 90 }} value={filtroM} onChange={e => setFiltroM(e.target.value as MClass)}>
                  <option value="">Todos</option>
                  <option value="M1">M1</option>
                  <option value="M2">M2</option>
                  <option value="M7">M7</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, minWidth: 160 }} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                  <option value="">Todas</option>
                  {empresas.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}{emp.codigo_ree ? ` (${emp.codigo_ree})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Tipo</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, width: 130 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="AGRECL">AGRECL</option>
                  <option value="INMECL">INMECL</option>
                  <option value="MAGCL">MAGCL</option>
                  <option value="F1">F1</option>
                  <option value="F1QH">F1QH</option>
                  <option value="MCIL345">MCIL345</option>
                  <option value="MCIL345QH">MCIL345QH</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Estado REE</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, width: 120 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="ok">OK</option>
                  <option value="bad">BAD</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Periodo</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, width: 130 }} value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}>
                  <option value="">Todos</option>
                  {periodosDisponibles.map(p => (
                    <option key={`${p.anio}-${p.mes}`} value={`${p.anio}-${p.mes}`}>
                      {fmtPeriodo(p.anio, p.mes)}
                    </option>
                  ))}
                </select>
              </div>
              {(filtroEmpresa || filtroTipo || filtroEstado || filtroPeriodo) && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 28 }}
                  onClick={() => { setFiltroEmpresa(""); setFiltroTipo(""); setFiltroEstado(""); setFiltroPeriodo(""); }}>
                  ✕ Limpiar
                </button>
              )}
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 28, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}
                onClick={cargarEnvios} disabled={loadingEnvios}>
                <IconRefresh /> {loadingEnvios ? "Cargando..." : "Actualizar"}
              </button>
            </div>

            {errorEnvios && <div className="ui-alert ui-alert--danger" style={{ margin: "12px 14px" }}>{errorEnvios}</div>}

            {/* Tabla */}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Empresa</th>
                    <th className="ui-th">Tipo</th>
                    <th className="ui-th">Comerc.</th>
                    <th className="ui-th" style={{ textAlign: "center", width: 50 }}>M</th>
                    <th className="ui-th">Periodo</th>
                    <th className="ui-th">Fecha gen.</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Ver.</th>
                    <th className="ui-th">Nombre fichero</th>
                    <th className="ui-th">Subido SFTP</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Estado REE</th>
                    <th className="ui-th">Respuesta</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Reint.</th>
                    <th className="ui-th" style={{ textAlign: "center", width: 50 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEnvios ? (
                    <tr className="ui-tr"><td colSpan={13} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : envios.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={13} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin envíos {filtroM || "(todos)"} todavía. Sube ficheros AGRECL, INMECL o MAGCL desde la tarjeta superior y aparecerán aquí.
                    </td></tr>
                  ) : enviosPagina.map(e => (
                    <tr key={e.id} className="ui-tr">
                      <td className="ui-td">
                        <div style={{ fontWeight: 500 }}>{e.empresa_nombre}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>{e.codigo_ree_empresa}</div>
                      </td>
                      <td className="ui-td"><span className="ui-badge ui-badge--neutral" style={{ fontSize: 9 }}>{e.tipo}</span></td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{e.comercializadora_codigo ?? "—"}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}><span className="ui-badge ui-badge--neutral" style={{ fontSize: 9 }}>{e.m_clasificacion}</span></td>
                      <td className="ui-td">{fmtPeriodo(e.periodo_anio, e.periodo_mes)}</td>
                      <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtFechaSimple(e.fecha_generacion)}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>{e.version}</td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 9, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.nombre_fichero}>
                        {e.nombre_fichero}
                      </td>
                      <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtDate(e.subido_sftp_at)}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>
                        <span className={badgeEstadoClass(e.estado_ree)} style={{ fontSize: 9 }}>{badgeEstadoLabel(e.estado_ree, e.estado_ree_n)}</span>
                      </td>
                      <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtDate(e.respuesta_recibida_at)}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>{e.reintentos}</td>
                      <td className="ui-td" style={{ textAlign: "center", position: "relative" }}>
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-xs"
                          style={{ padding: "2px 8px", fontWeight: 700, fontSize: 14, lineHeight: "14px" }}
                          title="Acciones"
                          disabled={borrandoId === e.id || descargandoId === e.id}
                          onClick={ev => { ev.stopPropagation(); setMenuAbiertoId(menuAbiertoId === e.id ? null : e.id); }}>
                          {borrandoId === e.id || descargandoId === e.id ? "…" : "⋯"}
                        </button>
                        {menuAbiertoId === e.id && (
                          <div
                            onClick={ev => ev.stopPropagation()}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "100%",
                              zIndex: 50,
                              background: "var(--card-bg)",
                              border: "1px solid var(--card-border)",
                              borderRadius: 6,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                              minWidth: 220,
                              padding: 4,
                              textAlign: "left",
                            }}>
                            <button
                              type="button"
                              className="ui-btn ui-btn-ghost ui-btn-xs"
                              style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "6px 10px" }}
                              onClick={() => handleDescargarEnvio(e, "original")}>
                              ⬇ Descargar fichero enviado
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn-ghost ui-btn-xs"
                              style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "6px 10px" }}
                              disabled={!e.respuesta_nombre_fichero}
                              title={e.respuesta_nombre_fichero ? undefined : "Aún no hay respuesta REE"}
                              onClick={() => handleDescargarEnvio(e, "respuesta")}>
                              ⬇ Descargar respuesta REE
                            </button>
                            <div style={{ borderTop: "1px solid var(--card-border)", margin: "4px 0" }} />
                            <button
                              type="button"
                              className="ui-btn ui-btn-ghost ui-btn-xs"
                              style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "6px 10px", color: "#E24B4A" }}
                              onClick={() => handleBorrarEnvio(e)}>
                              🗑 Borrar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter
              loading={loadingEnvios}
              hasLoadedOnce={!loadingEnvios}
              totalFilas={envios.length}
              startIndex={pageEnvios * pageSizeEnvios}
              endIndex={Math.min((pageEnvios + 1) * pageSizeEnvios, envios.length)}
              pageSize={pageSizeEnvios}
              setPageSize={(v) => { setPageSizeEnvios(v); setPageEnvios(0); }}
              currentPage={pageEnvios}
              totalPages={totalPagesEnvios}
              setPage={setPageEnvios}
              compact
            />
          </div>
        )}
      </UiCard>

    </div>
  );
}