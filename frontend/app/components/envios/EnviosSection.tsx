"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import ExploradorFtpPanel, { type FtpConfig } from "../comunicaciones/ExploradorFtpPanel";
import TablePaginationFooter from "../ui/TablePaginationFooter";
import DashboardEnviosSection from "./DashboardEnviosSection";
import CampanaAlertasEnvios from "../medidas/CampanaAlertasEnvios";
import UiCard from "../ui/UiCard";
import InventarioPanel, { type CountInventario } from "./InventarioPanel";

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

// Ya no necesitamos el tipo singular — ahora todo es lista de strings.
type MValue = "M1" | "M2" | "M7";

// Opciones para cada filtro (las usamos en el dropdown multi-select).
const M_OPTIONS: { value: MValue; label: string }[] = [
  { value: "M1", label: "M1" },
  { value: "M2", label: "M2" },
  { value: "M7", label: "M7" },
];
const TIPO_OPTIONS: { value: string; label: string }[] = [
  { value: "AGRECL",     label: "AGRECL" },
  { value: "INMECL",     label: "INMECL" },
  { value: "MAGCL",      label: "MAGCL" },
  { value: "F1",         label: "F1" },
  { value: "F1QH",       label: "F1QH" },
  { value: "MCIL345",    label: "MCIL345" },
  { value: "MCIL345QH",  label: "MCIL345QH" },
];
const ESTADO_OPTIONS: { value: string; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "ok",        label: "OK" },
  { value: "bad",       label: "BAD" },
];

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

  // Pestaña activa dentro de la tarjeta Histórico de envíos.
  // - "envios"     → vista actual (filtros + tabla + paginación)
  // - "inventario" → vista nueva, por ahora placeholder
  type PestañaHistorico = "envios" | "inventario";
  const [pestañaHistorico, setPestañaHistorico] = useState<PestañaHistorico>("envios");

  // Contador y nonce de refresh para la pestaña Inventario.
  // - countInventario: lo recibe el panel hijo y lo muestra arriba en chips/badge
  // - recargarInventarioNonce: incrementar = forzar al panel a recargar
  const [countInventario, setCountInventario] = useState<CountInventario | null>(null);
  const [recargarInventarioNonce, setRecargarInventarioNonce] = useState(0);
  const [revisandoRespuestasInv, setRevisandoRespuestasInv] = useState(false);

  const [configs, setConfigs] = useState<FtpConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorConfigs, setErrorConfigs] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // Histórico M2
  const [envios, setEnvios] = useState<EnvioM[]>([]);
  const [loadingEnvios, setLoadingEnvios] = useState(false);
  const [errorEnvios, setErrorEnvios] = useState<string | null>(null);
  const [countEnvios, setCountEnvios] = useState<CountResult | null>(null);

  // Filtros multi-select. Array vacío = "todos" (sin filtro).
  // Por defecto M2 viene preseleccionado para mantener comportamiento previo.
  const [filtroM, setFiltroM]             = useState<string[]>(["M2"]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string[]>([]);
  const [filtroTipo, setFiltroTipo]       = useState<string[]>([]);
  const [filtroEstado, setFiltroEstado]   = useState<string[]>([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState<string[]>([]); // valores como "2025-8"

  // Para los dropdowns: qué filtro está abierto ahora mismo (solo uno a la vez).
  const [dropdownAbierto, setDropdownAbierto] = useState<string | null>(null);

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
  // Cada vez que cambien los M seleccionados o se abra el panel, refrescamos
  // la lista de periodos disponibles (anio, mes) que tienen al menos un envío.
  useEffect(() => {
    if (!token) return;
    if (!panelHistOpen) return;
    const url = filtroM.length > 0
      ? `${API_BASE_URL}/envios/historico/periodos?m_clasificaciones=${filtroM.join(",")}`
      : `${API_BASE_URL}/envios/historico/periodos`;
    fetch(url, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: { anio: number; mes: number }[]) => setPeriodosDisponibles(d))
      .catch(() => setPeriodosDisponibles([]));
  }, [token, filtroM, panelHistOpen]);

  // ── Cargar histórico ───────────────────────────────────────────────────────
  // Los filtros son arrays multi-select. Cada array no vacío se envía como
  // CSV en el query param plural (m_clasificaciones, empresa_ids, etc.).
  const cargarEnvios = useCallback(async () => {
    if (!token) return;
    setLoadingEnvios(true); setErrorEnvios(null);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (filtroM.length > 0)       params.set("m_clasificaciones", filtroM.join(","));
      if (filtroEmpresa.length > 0) params.set("empresa_ids",       filtroEmpresa.join(","));
      if (filtroTipo.length > 0)    params.set("tipos",             filtroTipo.join(","));
      if (filtroEstado.length > 0)  params.set("estados",           filtroEstado.join(","));
      if (filtroPeriodo.length > 0) params.set("periodos",          filtroPeriodo.join(","));

      // Para count usamos los mismos M seleccionados (si vacío, count global)
      const countUrl = filtroM.length > 0
        ? `${API_BASE_URL}/envios/historico/count?m_clasificaciones=${filtroM.join(",")}`
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

  // ── Revisar respuestas REE de INVENTARIO ───────────────────────────────────
  // Espejo del handler de arriba pero contra el endpoint de inventario. El
  // resultado se muestra en alert y luego forzamos refresh del panel hijo
  // incrementando el nonce.
  const handleRevisarRespuestasInventario = async () => {
    if (!token) return;
    setRevisandoRespuestasInv(true); setErrorEnvios(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios-inventario/buscar-respuestas`, {
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
      alert(`Revisión de inventario completa.\n\n${resumen}.${msgErr}`);
      // Forzar refresh del panel
      setRecargarInventarioNonce(n => n + 1);
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error revisando respuestas inventario");
    } finally {
      setRevisandoRespuestasInv(false);
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

// ── Cerrar dropdown de filtros al hacer click fuera ────────────────────────
  useEffect(() => {
    if (dropdownAbierto === null) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-filter-dropdown]")) {
        setDropdownAbierto(null);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [dropdownAbierto]);

  // ── Componente inline: dropdown multi-select con checkboxes ─────────────
  // Se renderiza tantas veces como filtros tengamos (5 veces).
  // Está inline (no en otro fichero) según preferencia del usuario.
  const renderMultiSelect = (
    id: string,
    label: string,
    selected: string[],
    setSelected: (vs: string[]) => void,
    options: { value: string; label: string }[],
    width: number = 140,
  ) => {
    const isOpen = dropdownAbierto === id;
    const todoSeleccionado = options.length > 0 && selected.length === options.length;

    const buttonText =
      selected.length === 0 ? "Todos"
      : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} seleccionados`;

    const toggleOne = (value: string) => {
      if (selected.includes(value)) {
        setSelected(selected.filter(v => v !== value));
      } else {
        setSelected([...selected, value]);
      }
    };

    const seleccionarTodo = () => setSelected(options.map(o => o.value));
    const limpiar = () => setSelected([]);

    return (
      <div data-filter-dropdown style={{ position: "relative", display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</label>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDropdownAbierto(isOpen ? null : id); }}
          className="ui-select"
          style={{
            fontSize: 11, height: 28, width, textAlign: "left",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 8px", cursor: "pointer",
            background: "var(--field-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 4,
            color: selected.length === 0 ? "var(--text-muted)" : "var(--text)",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buttonText}</span>
          <span style={{ fontSize: 9, marginLeft: 4, color: "var(--text-muted)" }}>▾</span>
        </button>

        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 2,
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              minWidth: width, maxWidth: 280,
              maxHeight: 280, overflowY: "auto",
              padding: 4,
            }}
          >
            <div style={{ display: "flex", gap: 4, padding: "4px 6px", borderBottom: "1px solid var(--card-border)", marginBottom: 4 }}>
              <button type="button"
                onClick={todoSeleccionado ? limpiar : seleccionarTodo}
                className="ui-btn ui-btn-ghost ui-btn-xs"
                style={{ fontSize: 10, padding: "3px 6px", flex: 1 }}>
                {todoSeleccionado ? "✕ Limpiar" : "☑ Todos"}
              </button>
            </div>

            {options.length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 6px", textAlign: "center" }}>
                Sin opciones disponibles
              </div>
            ) : options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 6px", fontSize: 11, cursor: "pointer",
                    borderRadius: 4,
                    background: checked ? "rgba(96,165,250,0.10)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(opt.value)}
                    style={{ cursor: "pointer", margin: 0 }}
                  />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
            {countEnvios && panelHistOpen && pestañaHistorico === "envios" && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span className="ui-badge ui-badge--neutral">{countEnvios.total} total</span>
                {countEnvios.pendiente > 0 && <span className="ui-badge ui-badge--neutral">{countEnvios.pendiente} pendiente</span>}
                {countEnvios.ok > 0 && <span className="ui-badge ui-badge--ok">{countEnvios.ok} OK</span>}
                {countEnvios.bad > 0 && <span className="ui-badge ui-badge--err">{countEnvios.bad} BAD</span>}
              </div>
            )}
            {countInventario && panelHistOpen && pestañaHistorico === "inventario" && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span className="ui-badge ui-badge--neutral">{countInventario.total} total</span>
                {countInventario.pendiente > 0 && <span className="ui-badge ui-badge--neutral">{countInventario.pendiente} pendiente</span>}
                {countInventario.ok > 0 && <span className="ui-badge ui-badge--ok">{countInventario.ok} OK</span>}
                {countInventario.bad > 0 && <span className="ui-badge ui-badge--err">{countInventario.bad} BAD</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {panelHistOpen && pestañaHistorico === "envios" && (
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                onClick={e => { e.stopPropagation(); handleRevisarRespuestas(); }}
                disabled={revisandoRespuestas}
                title="Escanear el SFTP en busca de respuestas .ok/.bad de REE para envíos M">
                <IconRefresh /> {revisandoRespuestas ? "Revisando..." : "Revisar respuestas REE"}
              </button>
            )}
            {panelHistOpen && pestañaHistorico === "inventario" && (
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                onClick={e => { e.stopPropagation(); handleRevisarRespuestasInventario(); }}
                disabled={revisandoRespuestasInv}
                title="Escanear el SFTP en busca de respuestas .ok/.bad de REE para ficheros de inventario">
                <IconRefresh /> {revisandoRespuestasInv ? "Revisando..." : "Revisar respuestas REE"}
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

            {/* ── Pestañas: Envíos / Inventario ─────────────────────────── */}
            <div style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid var(--card-border)",
              padding: "0 14px",
              background: "var(--field-bg-soft)",
            }}>
              <button
                type="button"
                onClick={() => setPestañaHistorico("envios")}
                style={{
                  padding: "9px 18px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: pestañaHistorico === "envios" ? "#85B7EB" : "var(--text-muted)",
                  borderBottom: pestañaHistorico === "envios" ? "2px solid #378ADD" : "2px solid transparent",
                  marginBottom: "-1px",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "color 0.15s ease, border-color 0.15s ease",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                Envíos
                {countEnvios && (
                  <span style={{
                    background: "rgba(55,138,221,0.18)",
                    color: "#85B7EB",
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 8,
                    fontWeight: 500,
                    marginLeft: 2,
                  }}>
                    {countEnvios.total}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPestañaHistorico("inventario")}
                style={{
                  padding: "9px 18px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: pestañaHistorico === "inventario" ? "#85B7EB" : "var(--text-muted)",
                  borderBottom: pestañaHistorico === "inventario" ? "2px solid #378ADD" : "2px solid transparent",
                  marginBottom: "-1px",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "color 0.15s ease, border-color 0.15s ease",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                Inventario
                {countInventario && (
                  <span style={{
                    background: "rgba(55,138,221,0.18)",
                    color: "#85B7EB",
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 8,
                    fontWeight: 500,
                    marginLeft: 2,
                  }}>
                    {countInventario.total}
                  </span>
                )}
              </button>
            </div>

            {/* ── Contenido según pestaña activa ──────────────────────── */}
            {pestañaHistorico === "envios" && (
              <>
                {/* Filtros (multi-select con checkboxes) */}
                <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap", alignItems: "flex-end", background: "var(--field-bg-soft)", borderBottom: "1px solid var(--card-border)" }}>
                  {renderMultiSelect(
                "ventanaM",
                "Ventana M",
                filtroM,
                setFiltroM,
                M_OPTIONS,
                100,
              )}
              {renderMultiSelect(
                "empresa",
                "Empresa",
                filtroEmpresa,
                setFiltroEmpresa,
                empresas.map(emp => ({
                  value: String(emp.id),
                  label: `${emp.nombre}${emp.codigo_ree ? ` (${emp.codigo_ree})` : ""}`,
                })),
                180,
              )}
              {renderMultiSelect(
                "tipo",
                "Tipo",
                filtroTipo,
                setFiltroTipo,
                TIPO_OPTIONS,
                140,
              )}
              {renderMultiSelect(
                "estado",
                "Estado REE",
                filtroEstado,
                setFiltroEstado,
                ESTADO_OPTIONS,
                130,
              )}
              {renderMultiSelect(
                "periodo",
                "Periodo",
                filtroPeriodo,
                setFiltroPeriodo,
                periodosDisponibles.map(p => ({
                  value: `${p.anio}-${p.mes}`,
                  label: fmtPeriodo(p.anio, p.mes),
                })),
                140,
              )}

              {(filtroEmpresa.length > 0 || filtroTipo.length > 0 || filtroEstado.length > 0 || filtroPeriodo.length > 0) && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 28 }}
                  onClick={() => {
                    setFiltroEmpresa([]); setFiltroTipo([]);
                    setFiltroEstado([]); setFiltroPeriodo([]);
                  }}>
                  ✕ Limpiar
                </button>
              )}

              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ height: 28, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}
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
                      Sin envíos {filtroM.length > 0 ? filtroM.join(", ") : "(todos)"} todavía. Sube ficheros desde la tarjeta superior y aparecerán aquí.
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
              </>
            )}

            {/* ── Pestaña INVENTARIO ──────────────────────────────────── */}
            {pestañaHistorico === "inventario" && (
              <InventarioPanel
                token={token}
                empresas={empresas}
                onCountChange={setCountInventario}
                recargarNonce={recargarInventarioNonce}
              />
            )}
          </div>
        )}
      </UiCard>

    </div>
  );
}