"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type {
  CtMapa, CupsMapa, TramoMapa,
  TooltipLineasConfig, TooltipTramosConfig, TooltipCtsConfig, TooltipCupsConfig,
} from "./MapaLeaflet";
import { DEFAULT_TOOLTIP_LINEAS, DEFAULT_TOOLTIP_TRAMOS, DEFAULT_TOOLTIP_CTS, DEFAULT_TOOLTIP_CUPS } from "./MapaLeaflet";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
      Cargando mapa...
    </div>
  ),
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EmpresaOption { id: number; nombre: string; }

interface ImportResult {
  cts_insertados: number; cts_actualizados: number; cts_errores: number;
  trfs_insertados: number; trfs_actualizados: number; trfs_errores: number;
  cups_insertados: number; cups_actualizados: number; cups_errores: number;
  lineas_insertadas: number; lineas_actualizadas: number; lineas_errores: number;
  tramos_insertados: number; tramos_actualizados: number; tramos_errores: number;
  ficheros: string[];
}

interface Props {
  token:         string | null;
  currentUser:   User | null;
  tooltipLineas: TooltipLineasConfig;
  tooltipTramos: TooltipTramosConfig;
  tooltipCts:    TooltipCtsConfig;
  tooltipCups:   TooltipCupsConfig;
}

// ─── Clasificación BT/MT por tensión de explotación ──────────────────────────
// Fuente de verdad: tension_kv del B1. Fallback por prefijo si no hay dato.

function esBTTramo(t: TramoMapa): boolean {
  if (t.tension_kv !== null && t.tension_kv !== undefined)
    return t.tension_kv <= 1;
  const id = t.id_linea ?? "";
  return id.includes("BTV") || id.includes("LBT");
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "10px", overflow: "hidden", marginBottom: "10px",
};
const mapaPanelStyle: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "10px", overflow: "visible", marginBottom: "10px",
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

const FICHEROS_CONFIG = [
  { key: "b2",  label: "B2 — Centros de transformación", desc: "CIR8_2021_B2_R1-XXX_AAAA.txt" },
  { key: "b21", label: "B21 — Transformadores en CT",    desc: "CIR8_2021_B21_R1-XXX_AAAA.txt" },
  { key: "a1",  label: "A1 — Puntos de suministro",      desc: "CIR8_2021_A1_R1-XXX_AAAA.txt" },
  { key: "b1",  label: "B1 — Líneas eléctricas",         desc: "CIR8_2021_B1_R1-XXX_AAAA.txt" },
  { key: "b11", label: "B11 — Tramos GIS de líneas",     desc: "CIR8_2021_B11_R1-XXX_AAAA.txt" },
] as const;

type FicheroKey = typeof FICHEROS_CONFIG[number]["key"];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TopologiaSection({ token, tooltipLineas, tooltipTramos, tooltipCts, tooltipCups }: Props) {

  const [panelImportOpen, setPanelImportOpen] = useState(false);
  const [panelMapaOpen,   setPanelMapaOpen]   = useState(true);
  const [capasOpen,       setCapasOpen]       = useState(true);

  const [empresas,  setEmpresas]  = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId] = useState<number | "">("");
  const [anioDecl,  setAnioDecl]  = useState<string>(String(new Date().getFullYear()));

  const [ficheros,     setFicheros]     = useState<Record<FicheroKey, File | null>>({ b2: null, b21: null, a1: null, b1: null, b11: null });
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);

  const [cts,    setCts]    = useState<CtMapa[]>([]);
  const [cups,   setCups]   = useState<CupsMapa[]>([]);
  const [tramos, setTramos] = useState<TramoMapa[]>([]);

  // Mapa id_linea → tension_kv para clasificar el selector de líneas
  const [tensionPorLinea, setTensionPorLinea] = useState<Map<string, number | null>>(new Map());
  const [lineas,          setLineas]          = useState<string[]>([]);

  const [loadingCts,    setLoadingCts]    = useState(false);
  const [loadingCups,   setLoadingCups]   = useState(false);
  const [loadingTramos, setLoadingTramos] = useState(false);

  const [mostrarCts,  setMostrarCts]  = useState(true);
  const [mostrarCups, setMostrarCups] = useState(true);
  const [mostrarBT,   setMostrarBT]   = useState(true);
  const [mostrarMT,   setMostrarMT]   = useState(true);

  const [ctSeleccionado,    setCtSeleccionado]    = useState<string>("");
  const [lineaSeleccionada, setLineaSeleccionada] = useState<string | null>(null);

  // ── Búsqueda de línea ──────────────────────────────────────────────────────
  const [busquedaLinea,          setBusquedaLinea]          = useState<string>("");
  const [busquedaLineaPendiente, setBusquedaLineaPendiente] = useState<string>("");
  const inputBusquedaLineaRef = useRef<HTMLInputElement>(null);

  // ── Búsqueda de CT ────────────────────────────────────────────────────────
  const [busquedaCt,          setBusquedaCt]          = useState<string>("");
  const [busquedaCtPendiente, setBusquedaCtPendiente] = useState<string>("");
  const inputBusquedaCtRef = useRef<HTMLInputElement>(null);

  const mostrarLineas = mostrarBT || mostrarMT;

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then(setEmpresas)
      .catch(() => {});
  }, [token]);

  const cargarCts = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingCts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/mapa/cts?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      setCts(await res.json());
    } catch { setCts([]); }
    finally { setLoadingCts(false); }
  }, [token, empresaId]);

  const cargarCups = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingCups(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (ctSeleccionado) params.set("id_ct", ctSeleccionado);
      const res = await fetch(`${API_BASE_URL}/topologia/mapa/cups?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      setCups(await res.json());
    } catch { setCups([]); }
    finally { setLoadingCups(false); }
  }, [token, empresaId, ctSeleccionado]);

  const cargarTramos = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingTramos(true);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/mapa/tramos?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data: TramoMapa[] = await res.json();
      setTramos(data);

      // Construir mapa id_linea → tension_kv (primer tramo con dato gana)
      const mapa = new Map<string, number | null>();
      data.forEach(t => {
        if (t.id_linea && !mapa.has(t.id_linea)) {
          mapa.set(t.id_linea, t.tension_kv);
        }
      });
      setTensionPorLinea(mapa);

      const lineasUnicas = Array.from(new Set(data.map(t => t.id_linea).filter(Boolean) as string[])).sort();
      setLineas(lineasUnicas);
    } catch { setTramos([]); setLineas([]); setTensionPorLinea(new Map()); }
    finally { setLoadingTramos(false); }
  }, [token, empresaId]);

  useEffect(() => {
    if (empresaId) { cargarCts(); cargarCups(); cargarTramos(); }
  }, [empresaId, cargarCts, cargarCups, cargarTramos]);

  useEffect(() => {
    if (empresaId) cargarCups();
  }, [ctSeleccionado, empresaId, cargarCups]);

  // ── Filtrado por capa — usa tension_kv como fuente de verdad ──────────────
  const tramosFiltrados = tramos.filter(t => {
    if (esBTTramo(t)) return mostrarBT;
    return mostrarMT;
  });

  const numBT = tramos.filter(t =>  esBTTramo(t)).length;
  const numMT = tramos.filter(t => !esBTTramo(t)).length;

  // Clasificar líneas usando el mapa tension_kv acumulado en cargarTramos
  const esBTLinea = (id: string): boolean => {
    const tension = tensionPorLinea.get(id);
    if (tension !== null && tension !== undefined) return tension <= 1;
    return id.includes("BTV") || id.includes("LBT");
  };

  const lineasFiltradas = lineas.filter(id => {
    if (esBTLinea(id)) return mostrarBT;
    return mostrarMT;
  });

  const hayAlgunFichero = Object.values(ficheros).some(f => f !== null);

  const handleImportar = async () => {
    if (!token || !empresaId || !hayAlgunFichero) return;
    setImporting(true); setImportError(null); setImportResult(null);
    const fd = new FormData();
    fd.append("empresa_id", String(empresaId));
    fd.append("anio_declaracion", anioDecl);
    (Object.entries(ficheros) as [FicheroKey, File | null][]).forEach(([key, file]) => {
      if (file) fd.append(key, file);
    });
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/importar`, {
        method: "POST", headers: getAuthHeaders(token), body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      setImportResult(await res.json() as ImportResult);
      cargarCts(); cargarCups(); cargarTramos();
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Error importando");
    } finally { setImporting(false); }
  };

  // Líneas filtradas por búsqueda activa
  const lineasEnSelect = busquedaLinea
    ? lineasFiltradas.filter(id => id.toUpperCase().includes(busquedaLinea.toUpperCase()))
    : lineasFiltradas;

  // CTs filtrados por búsqueda activa
  const ctsFiltrados = busquedaCt
    ? cts.filter(ct =>
        ct.id_ct.toUpperCase().includes(busquedaCt.toUpperCase()) ||
        ct.nombre.toUpperCase().includes(busquedaCt.toUpperCase())
      )
    : cts;

  // ── Handlers búsqueda línea ───────────────────────────────────────────────
  const handleBuscarLinea = () => {
    const q = busquedaLineaPendiente.trim();
    setBusquedaLinea(q);
    const coincidencias = lineasFiltradas.filter(id => id.toUpperCase().includes(q.toUpperCase()));
    if (coincidencias.length === 1) setLineaSeleccionada(coincidencias[0]);
    else setLineaSeleccionada(null);
  };
  const handleBusquedaLineaKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleBuscarLinea(); };
  const handleLimpiarLinea = () => {
    setBusquedaLinea(""); setBusquedaLineaPendiente(""); setLineaSeleccionada(null);
    inputBusquedaLineaRef.current?.focus();
  };

  // ── Handlers búsqueda CT ──────────────────────────────────────────────────
  const handleBuscarCt = () => {
    const q = busquedaCtPendiente.trim();
    setBusquedaCt(q);
    const coincidencias = cts.filter(ct =>
      ct.id_ct.toUpperCase().includes(q.toUpperCase()) ||
      ct.nombre.toUpperCase().includes(q.toUpperCase())
    );
    if (coincidencias.length === 1) setCtSeleccionado(coincidencias[0].id_ct);
    else setCtSeleccionado("");
  };
  const handleBusquedaCtKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleBuscarCt(); };
  const handleLimpiarCt = () => {
    setBusquedaCt(""); setBusquedaCtPendiente(""); setCtSeleccionado("");
    inputBusquedaCtRef.current?.focus();
  };

  const handleLineaClick = (id: string | null) => {
    setLineaSeleccionada(id);
    if (id) { setBusquedaLineaPendiente(""); setBusquedaLinea(""); }
  };

  // ── Subcomponente desplegable ─────────────────────────────────────────────
  const SeccionLabel = ({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: "none", border: "none", cursor: "pointer",
        padding: 0, marginBottom: open ? 8 : 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{open ? "▾" : "▸"}</span>
    </button>
  );

  return (
    <div className="text-sm">

      {/* ══ PANEL 1 — IMPORTACIÓN ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelImportOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📥 Importar inventario CNMC 8/2021</div>
            <div style={panelDescStyle}>Carga los ficheros B2, B21, A1, B1 y B11 para poblar el mapa topológico</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelImportOpen(v => !v); }}>
            {panelImportOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelImportOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {importError && <div className="ui-alert ui-alert--danger mb-3">{importError}</div>}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 200 }}
                  value={empresaId} onChange={e => setEmpresaId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Selecciona empresa</option>
                  {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Año declaración</label>
                <input className="ui-input" type="number" style={{ fontSize: 11, height: 30, width: 80 }}
                  value={anioDecl} onChange={e => setAnioDecl(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              {FICHEROS_CONFIG.slice(0, 3).map(({ key, label, desc }) => (
                <div key={key} style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{desc}</div>
                  <input type="file" accept=".txt,.csv" style={{ fontSize: 10 }}
                    onChange={e => setFicheros(f => ({ ...f, [key]: e.target.files?.[0] ?? null }))} />
                  {ficheros[key] && <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 4 }}>✓ {ficheros[key]!.name}</div>}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {FICHEROS_CONFIG.slice(3).map(({ key, label, desc }) => (
                <div key={key} style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{desc}</div>
                  <input type="file" accept=".txt,.csv" style={{ fontSize: 10 }}
                    onChange={e => setFicheros(f => ({ ...f, [key]: e.target.files?.[0] ?? null }))} />
                  {ficheros[key] && <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 4 }}>✓ {ficheros[key]!.name}</div>}
                </div>
              ))}
              <div />
            </div>
            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={handleImportar} disabled={importing || !empresaId || !hayAlgunFichero}>
              {importing ? "Importando..." : "Importar ficheros"}
            </button>
            {importResult && (
              <div style={{ marginTop: 16, background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
                  Resultado — ficheros: {importResult.ficheros.join(", ")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { label: "CTs (B2)",              ins: importResult.cts_insertados,    act: importResult.cts_actualizados,    err: importResult.cts_errores },
                    { label: "Transformadores (B21)", ins: importResult.trfs_insertados,   act: importResult.trfs_actualizados,   err: importResult.trfs_errores },
                    { label: "CUPS (A1)",             ins: importResult.cups_insertados,   act: importResult.cups_actualizados,   err: importResult.cups_errores },
                    { label: "Líneas (B1)",           ins: importResult.lineas_insertadas, act: importResult.lineas_actualizadas, err: importResult.lineas_errores },
                    { label: "Tramos GIS (B11)",      ins: importResult.tramos_insertados, act: importResult.tramos_actualizados, err: importResult.tramos_errores },
                  ].map(({ label, ins, act, err }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 11 }}>✅ {ins} nuevos</div>
                      <div style={{ fontSize: 11 }}>🔄 {act} actualizados</div>
                      {err > 0 && <div style={{ fontSize: 11, color: "#E24B4A" }}>❌ {err} errores</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ PANEL 2 — MAPA ══ */}
      <div style={mapaPanelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelMapaOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>🗺️ Mapa topológico</div>
            <div style={panelDescStyle}>
              {cts.length > 0 || cups.length > 0 || tramos.length > 0
                ? `${cts.length} CTs · ${cups.length} CUPS · ${numBT} seg. BT · ${numMT} seg. MT · ${lineas.length} líneas`
                : "Selecciona una empresa para cargar el mapa"}
            </div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelMapaOpen(v => !v); }}>
            {panelMapaOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {panelMapaOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)" }}>
            <div style={{ display: "flex", height: 580 }}>

              {/* ── Panel lateral ── */}
              <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--card-border)", padding: "14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Empresa */}
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                  <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                    value={empresaId}
                    onChange={e => {
                      setEmpresaId(e.target.value === "" ? "" : Number(e.target.value));
                      setCtSeleccionado(""); setLineaSeleccionada(null);
                      setBusquedaLinea(""); setBusquedaLineaPendiente("");
                      setBusquedaCt(""); setBusquedaCtPendiente("");
                      setCts([]); setCups([]); setTramos([]); setLineas([]);
                      setTensionPorLinea(new Map());
                    }}>
                    <option value="">Selecciona empresa</option>
                    {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                  </select>
                </div>

                {/* ── Capas — desplegable ── */}
                <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                  <SeccionLabel label="Capas" open={capasOpen} onToggle={() => setCapasOpen(v => !v)} />
                  {capasOpen && (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", marginBottom: 6 }}>
                        <input type="checkbox" checked={mostrarMT} onChange={e => setMostrarMT(e.target.checked)} />
                        <span style={{ width: 16, height: 3, background: "#A855F7", display: "inline-block", borderRadius: 2 }} />
                        Red MT {loadingTramos ? "…" : `(${numMT})`}
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", marginBottom: 6 }}>
                        <input type="checkbox" checked={mostrarBT} onChange={e => setMostrarBT(e.target.checked)} />
                        <span style={{ width: 16, height: 3, background: "#F59E0B", display: "inline-block", borderRadius: 2 }} />
                        Red BT {loadingTramos ? "…" : `(${numBT})`}
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", marginBottom: 6 }}>
                        <input type="checkbox" checked={mostrarCts} onChange={e => setMostrarCts(e.target.checked)} />
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E24B4A", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", display: "inline-block" }} />
                        CTs {loadingCts ? "…" : `(${cts.length})`}
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                        <input type="checkbox" checked={mostrarCups} onChange={e => setMostrarCups(e.target.checked)} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#378ADD", border: "1px solid rgba(255,255,255,0.8)", display: "inline-block" }} />
                        CUPS {loadingCups ? "…" : `(${cups.length})`}
                      </label>
                    </>
                  )}
                </div>

                {/* ── Selector de línea ── */}
                {lineasFiltradas.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Seleccionar línea
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      <input
                        ref={inputBusquedaLineaRef}
                        className="ui-input"
                        style={{ flex: 1, fontSize: 11, height: 28, fontFamily: "monospace" }}
                        placeholder="Buscar ID..."
                        value={busquedaLineaPendiente}
                        onChange={e => setBusquedaLineaPendiente(e.target.value)}
                        onKeyDown={handleBusquedaLineaKeyDown}
                      />
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                        style={{ height: 28, padding: "0 8px", fontSize: 13, flexShrink: 0 }}
                        onClick={handleBuscarLinea} title="Buscar (Enter)">
                        🔍
                      </button>
                    </div>
                    {busquedaLinea && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                        {lineasEnSelect.length} resultado{lineasEnSelect.length !== 1 ? "s" : ""}
                        {lineasEnSelect.length === 0 && " — no encontrada"}
                      </div>
                    )}
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={lineaSeleccionada ?? ""}
                      onChange={e => setLineaSeleccionada(e.target.value || null)}>
                      <option value="">Todas las líneas</option>
                      {lineasEnSelect.map(id => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                    {(lineaSeleccionada || busquedaLinea) && (
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ marginTop: 6, fontSize: 10 }}
                        onClick={handleLimpiarLinea}>
                        ✕ Limpiar
                      </button>
                    )}
                    {lineaSeleccionada && (
                      <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>
                        <div>▶ = inicio del tramo</div>
                        <div>■ = fin del tramo</div>
                        <div style={{ marginTop: 4 }}>Clic en línea para seleccionar</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Filtro CUPS por CT ── */}
                {cts.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Filtrar CUPS por CT
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      <input
                        ref={inputBusquedaCtRef}
                        className="ui-input"
                        style={{ flex: 1, fontSize: 11, height: 28 }}
                        placeholder="Buscar CT..."
                        value={busquedaCtPendiente}
                        onChange={e => setBusquedaCtPendiente(e.target.value)}
                        onKeyDown={handleBusquedaCtKeyDown}
                      />
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                        style={{ height: 28, padding: "0 8px", fontSize: 13, flexShrink: 0 }}
                        onClick={handleBuscarCt} title="Buscar (Enter)">
                        🔍
                      </button>
                    </div>
                    {busquedaCt && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                        {ctsFiltrados.length} resultado{ctsFiltrados.length !== 1 ? "s" : ""}
                        {ctsFiltrados.length === 0 && " — no encontrado"}
                      </div>
                    )}
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={ctSeleccionado}
                      onChange={e => setCtSeleccionado(e.target.value)}>
                      <option value="">Todos los CTs</option>
                      {ctsFiltrados.map(ct => (
                        <option key={ct.id_ct} value={ct.id_ct}>{ct.nombre}</option>
                      ))}
                    </select>
                    {(ctSeleccionado || busquedaCt) && (
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ marginTop: 6, fontSize: 10 }}
                        onClick={handleLimpiarCt}>
                        ✕ Limpiar
                      </button>
                    )}
                  </div>
                )}

                {/* ── Leyenda ── */}
                <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Leyenda</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                    <span style={{ width: 16, height: 3, background: "#A855F7", display: "inline-block", borderRadius: 2 }} />Línea MT
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                    <span style={{ width: 16, height: 3, background: "#F59E0B", display: "inline-block", borderRadius: 2 }} />Línea BT
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E24B4A", border: "2px solid #fff", display: "inline-block" }} />Centro de transformación
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#378ADD", display: "inline-block" }} />Punto de suministro
                  </div>
                </div>
              </div>

              {/* ── Mapa ── */}
              <div style={{ flex: 1, position: "relative", minHeight: 580 }}>
                {!empresaId && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.85)", fontSize: 12, color: "var(--text-muted)", borderRadius: "0 10px 10px 0" }}>
                    Selecciona una empresa para cargar el mapa
                  </div>
                )}
                <MapaLeaflet
                  cts={cts}
                  cups={cups}
                  tramos={tramosFiltrados}
                  mostrarCts={mostrarCts}
                  mostrarCups={mostrarCups}
                  mostrarLineas={mostrarLineas}
                  lineaSeleccionada={lineaSeleccionada}
                  tooltipLineas={tooltipLineas}
                  tooltipTramos={tooltipTramos}
                  tooltipCts={tooltipCts}
                  tooltipCups={tooltipCups}
                  onLineaClick={handleLineaClick}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_TOOLTIP_LINEAS, DEFAULT_TOOLTIP_TRAMOS, DEFAULT_TOOLTIP_CTS, DEFAULT_TOOLTIP_CUPS };
export type { TooltipLineasConfig, TooltipTramosConfig, TooltipCtsConfig, TooltipCupsConfig };
