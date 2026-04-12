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
import TablePaginationFooter from "../ui/TablePaginationFooter";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
      Cargando mapa...
    </div>
  ),
});

interface EmpresaOption { id: number; nombre: string; }

interface ImportResult {
  cts_insertados: number; cts_actualizados: number; cts_errores: number;
  trfs_insertados: number; trfs_actualizados: number; trfs_errores: number;
  cups_insertados: number; cups_actualizados: number; cups_errores: number;
  lineas_insertadas: number; lineas_actualizadas: number; lineas_errores: number;
  tramos_insertados: number; tramos_actualizados: number; tramos_errores: number;
  ficheros: string[];
}

interface CalcCtResult {
  lineas_bfs: number; lineas_proximidad: number; lineas_sin_asoc: number; lineas_total: number;
  cups_asignados: number; cups_sin_asoc: number; cups_total: number;
}

interface LineaTabla {
  id_tramo: string; nudo_inicio: string | null; nudo_fin: string | null;
  tension_kv: number | null; longitud_km: number | null; codigo_ccuu: string | null;
  operacion: number | null; fecha_aps: string | null;
  id_ct: string | null; metodo_asignacion_ct: string | null;
}

interface CupsTabla {
  cups: string; id_ct: string | null; tarifa: string | null;
  tension_kv: number | null; potencia_contratada_kw: number | null;
  municipio: string | null; conexion: string | null;
  id_ct_asignado: string | null; metodo_asignacion_ct: string | null;
  fase: string | null;   // ← R/S/T/RST
}

interface Props {
  token: string | null; currentUser: User | null;
  tooltipLineas: TooltipLineasConfig; tooltipTramos: TooltipTramosConfig;
  tooltipCts: TooltipCtsConfig; tooltipCups: TooltipCupsConfig;
}

function esBTTramo(t: TramoMapa): boolean {
  if (t.tension_kv !== null && t.tension_kv !== undefined) return t.tension_kv <= 1;
  const id = t.id_linea ?? "";
  return id.includes("BTV") || id.includes("LBT");
}

const PALETA_CT = [
  "#E24B4A", "#2563EB", "#16A34A", "#F59E0B", "#7C3AED",
  "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#0284C7",
];

function generarColoresCt(ids: string[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  ids.forEach((id, i) => { mapa[id] = PALETA_CT[i % PALETA_CT.length]; });
  return mapa;
}

// ─── Colores y etiquetas de fase ──────────────────────────────────────────────
const FASE_COLOR: Record<string, string> = {
  R:   "#E24B4A",
  S:   "#F59E0B",
  T:   "#2563EB",
  RST: "#1D9E75",
};

// ─── Overlay de carga ─────────────────────────────────────────────────────────
const TableLoadingOverlay = () => (
  <div style={{
    position: "absolute", inset: 0, zIndex: 5,
    display: "flex", alignItems: "center", justifyContent: "center",
    pointerEvents: "none",
  }}>
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      borderRadius: 6, padding: "6px 14px",
      fontSize: 10, color: "var(--text-muted)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      Cargando...
    </div>
  </div>
);

const panelStyle: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "10px", overflow: "hidden", marginBottom: "10px" };
const mapaPanelStyle: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "10px", overflow: "visible", marginBottom: "10px" };
const panelHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", userSelect: "none" };
const panelTitleStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text)" };
const panelDescStyle: React.CSSProperties = { fontSize: "11px", color: "var(--text-muted)", marginTop: 3 };

const FICHEROS_CONFIG = [
  { key: "b2",  label: "B2 — Centros de transformación", desc: "CIR8_2021_B2_R1-XXX_AAAA.txt" },
  { key: "b21", label: "B21 — Transformadores en CT",    desc: "CIR8_2021_B21_R1-XXX_AAAA.txt" },
  { key: "a1",  label: "A1 — Puntos de suministro",      desc: "CIR8_2021_A1_R1-XXX_AAAA.txt" },
  { key: "b1",  label: "B1 — Líneas eléctricas",         desc: "CIR8_2021_B1_R1-XXX_AAAA.txt" },
  { key: "b11", label: "B11 — Tramos GIS de líneas",     desc: "CIR8_2021_B11_R1-XXX_AAAA.txt" },
] as const;

type FicheroKey = typeof FICHEROS_CONFIG[number]["key"];

const METODO_LABEL: Record<string, string> = { bfs: "Topológico", proximidad: "Proximidad", nudo_linea: "Nudo→Línea", manual: "Manual" };
const METODO_COLOR: Record<string, string> = { bfs: "#1D9E75", proximidad: "#F59E0B", nudo_linea: "#378ADD", manual: "#A855F7" };

export default function TopologiaSection({ token, tooltipLineas, tooltipTramos, tooltipCts, tooltipCups }: Props) {

  const [panelImportOpen, setPanelImportOpen] = useState(false);
  const [panelMapaOpen,   setPanelMapaOpen]   = useState(true);
  const [panelTablasOpen, setPanelTablasOpen] = useState(false);
  const [capasOpen,       setCapasOpen]       = useState(true);

  const [empresas,  setEmpresas]  = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId] = useState<number | "">("");
  const [anioDecl,  setAnioDecl]  = useState<string>(String(new Date().getFullYear()));
  const [ficheros,  setFicheros]  = useState<Record<FicheroKey, File | null>>({ b2: null, b21: null, a1: null, b1: null, b11: null });
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);

  const [cts,    setCts]    = useState<CtMapa[]>([]);
  const [cups,   setCups]   = useState<CupsMapa[]>([]);
  const [tramos, setTramos] = useState<TramoMapa[]>([]);
  const [tensionPorLinea, setTensionPorLinea] = useState<Map<string, number | null>>(new Map());
  const [lineas,          setLineas]          = useState<string[]>([]);

  const [loadingCts,    setLoadingCts]    = useState(false);
  const [loadingCups,   setLoadingCups]   = useState(false);
  const [loadingTramos, setLoadingTramos] = useState(false);
  const [mostrarCts,  setMostrarCts]  = useState(true);
  const [mostrarCups, setMostrarCups] = useState(true);
  const [mostrarBT,   setMostrarBT]   = useState(true);
  const [mostrarMT,   setMostrarMT]   = useState(true);

  const [ctsSeleccionados, setCtsSeleccionados] = useState<string[]>([]);
  const [busquedaCtFiltro, setBusquedaCtFiltro] = useState<string>("");
  const [ctListaOpen,      setCtListaOpen]      = useState(true);

  const coloresCt = ctsSeleccionados.length >= 2 ? generarColoresCt(ctsSeleccionados) : {};

  const [lineaSeleccionada, setLineaSeleccionada] = useState<string | null>(null);
  const [busquedaLinea,          setBusquedaLinea]          = useState<string>("");
  const [busquedaLineaPendiente, setBusquedaLineaPendiente] = useState<string>("");
  const inputBusquedaLineaRef = useRef<HTMLInputElement>(null);

  const [tablaActiva,    setTablaActiva]    = useState<"lineas" | "cups">("lineas");
  const [calcCt,         setCalcCt]         = useState(false);
  const [calcCtResult,   setCalcCtResult]   = useState<CalcCtResult | null>(null);
  const [calcCtError,    setCalcCtError]    = useState<string | null>(null);
  const [lineasTabla,    setLineasTabla]    = useState<LineaTabla[]>([]);
  const [cupsTabla,      setCupsTabla]      = useState<CupsTabla[]>([]);
  const [totalLineas,    setTotalLineas]    = useState(0);
  const [totalCups,      setTotalCups]      = useState(0);
  const [loadingTabla,   setLoadingTabla]   = useState(false);
  const [hasLoadedTabla, setHasLoadedTabla] = useState(false);
  const [filtroCtTabla,  setFiltroCtTabla]  = useState<string>("");
  const [filtroSinCt,    setFiltroSinCt]    = useState(false);
  const [filtroMetodo,   setFiltroMetodo]   = useState<string>("");

  const [pageLineas,     setPageLineas]     = useState(0);
  const [pageSizeLineas, setPageSizeLineas] = useState(50);
  const [pageCups,       setPageCups]       = useState(0);
  const [pageSizeCups,   setPageSizeCups]   = useState(50);

  const [editandoLinea,  setEditandoLinea]  = useState<string | null>(null);
  const [editandoCups,   setEditandoCups]   = useState<string | null>(null);
  const [editandoFase,   setEditandoFase]   = useState<string | null>(null);  // cups en edición de fase
  const [editValor,      setEditValor]      = useState<string>("");
  const [editFaseValor,  setEditFaseValor]  = useState<string>("");
  const [guardando,      setGuardando]      = useState(false);

  // ── Refs para fijar altura durante cambio de página ───────────────────────
  const tablaLineasRef = useRef<HTMLDivElement>(null);
  const tablaCupsRef   = useRef<HTMLDivElement>(null);
  const [minHLineas, setMinHLineas] = useState<number | undefined>(undefined);
  const [minHCups,   setMinHCups]   = useState<number | undefined>(undefined);

  const mostrarLineas = mostrarBT || mostrarMT;

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : []).then(setEmpresas).catch(() => {});
  }, [token]);

  const cargarCts = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingCts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/mapa/cts?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      setCts(await res.json());
    } catch { setCts([]); } finally { setLoadingCts(false); }
  }, [token, empresaId]);

  const cargarCups = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingCups(true);
    try {
      if (ctsSeleccionados.length === 0) {
        const res = await fetch(`${API_BASE_URL}/topologia/mapa/cups?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
        if (!res.ok) throw new Error();
        setCups(await res.json());
      } else {
        const results = await Promise.all(
          ctsSeleccionados.map(id =>
            fetch(`${API_BASE_URL}/topologia/mapa/cups?empresa_id=${empresaId}&id_ct=${id}`, { headers: getAuthHeaders(token) })
              .then(r => r.ok ? r.json() : [])
          )
        );
        const vistos = new Set<string>(); const merged: CupsMapa[] = [];
        for (const arr of results) for (const c of arr) if (!vistos.has(c.cups)) { vistos.add(c.cups); merged.push(c); }
        setCups(merged);
      }
    } catch { setCups([]); } finally { setLoadingCups(false); }
  }, [token, empresaId, ctsSeleccionados]);

  const cargarTramos = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingTramos(true);
    try {
      if (ctsSeleccionados.length === 0) {
        const res = await fetch(`${API_BASE_URL}/topologia/mapa/tramos?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
        if (!res.ok) throw new Error();
        const data: TramoMapa[] = await res.json();
        setTramos(data);
        const mapa = new Map<string, number | null>();
        data.forEach(t => { if (t.id_linea && !mapa.has(t.id_linea)) mapa.set(t.id_linea, t.tension_kv); });
        setTensionPorLinea(mapa);
        setLineas(Array.from(new Set(data.map(t => t.id_linea).filter(Boolean) as string[])).sort());
      } else {
        const results = await Promise.all(
          ctsSeleccionados.map(id =>
            fetch(`${API_BASE_URL}/topologia/mapa/tramos?empresa_id=${empresaId}&id_ct=${id}`, { headers: getAuthHeaders(token) })
              .then(r => r.ok ? r.json() : [])
          )
        );
        const vistos = new Set<string>(); const merged: TramoMapa[] = [];
        for (const arr of results) for (const t of arr) if (!vistos.has(t.id_tramo)) { vistos.add(t.id_tramo); merged.push(t); }
        setTramos(merged);
      }
    } catch { setTramos([]); } finally { setLoadingTramos(false); }
  }, [token, empresaId, ctsSeleccionados]);

  const cargarTablaLineas = useCallback(async (page = pageLineas, size = pageSizeLineas) => {
    if (!token || !empresaId) return;
    if (tablaLineasRef.current) setMinHLineas(tablaLineasRef.current.offsetHeight);
    setLoadingTabla(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), limit: String(size), offset: String(page * size) });
      if (filtroCtTabla) params.set("id_ct",  filtroCtTabla);
      if (filtroSinCt)   params.set("sin_ct", "true");
      if (filtroMetodo)  params.set("metodo",  filtroMetodo);
      const res = await fetch(`${API_BASE_URL}/topologia/tabla/lineas?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLineasTabla(data.items ?? []);
      setTotalLineas(data.total ?? 0);
      setHasLoadedTabla(true);
    } catch { setLineasTabla([]); setTotalLineas(0); }
    finally { setLoadingTabla(false); setMinHLineas(undefined); }
  }, [token, empresaId, filtroCtTabla, filtroSinCt, filtroMetodo, pageLineas, pageSizeLineas]);

  const cargarTablaCups = useCallback(async (page = pageCups, size = pageSizeCups) => {
    if (!token || !empresaId) return;
    if (tablaCupsRef.current) setMinHCups(tablaCupsRef.current.offsetHeight);
    setLoadingTabla(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), limit: String(size), offset: String(page * size) });
      if (filtroCtTabla) params.set("id_ct",  filtroCtTabla);
      if (filtroSinCt)   params.set("sin_ct", "true");
      if (filtroMetodo)  params.set("metodo",  filtroMetodo);
      const res = await fetch(`${API_BASE_URL}/topologia/tabla/cups?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCupsTabla(data.items ?? []);
      setTotalCups(data.total ?? 0);
      setHasLoadedTabla(true);
    } catch { setCupsTabla([]); setTotalCups(0); }
    finally { setLoadingTabla(false); setMinHCups(undefined); }
  }, [token, empresaId, filtroCtTabla, filtroSinCt, filtroMetodo, pageCups, pageSizeCups]);

  useEffect(() => {
    if (empresaId) { cargarCts(); cargarTramos(); cargarCups(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    if (empresaId) { cargarCups(); cargarTramos(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctsSeleccionados]);

  useEffect(() => {
    if (empresaId && panelTablasOpen) {
      if (tablaActiva === "lineas") cargarTablaLineas(0, pageSizeLineas);
      else cargarTablaCups(0, pageSizeCups);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, panelTablasOpen, tablaActiva]);

  useEffect(() => {
    if (empresaId && panelTablasOpen && tablaActiva === "lineas" && hasLoadedTabla)
      cargarTablaLineas(pageLineas, pageSizeLineas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLineas, pageSizeLineas]);

  useEffect(() => {
    if (empresaId && panelTablasOpen && tablaActiva === "cups" && hasLoadedTabla)
      cargarTablaCups(pageCups, pageSizeCups);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCups, pageSizeCups]);

  const tramosFiltrados = tramos.filter(t => esBTTramo(t) ? mostrarBT : mostrarMT);
  const numBT = tramos.filter(t =>  esBTTramo(t)).length;
  const numMT = tramos.filter(t => !esBTTramo(t)).length;

  const esBTLinea = (id: string): boolean => {
    const tension = tensionPorLinea.get(id);
    if (tension !== null && tension !== undefined) return tension <= 1;
    return id.includes("BTV") || id.includes("LBT");
  };

  const lineasFiltradas  = lineas.filter(id => esBTLinea(id) ? mostrarBT : mostrarMT);
  const hayAlgunFichero  = Object.values(ficheros).some(f => f !== null);
  const lineasEnSelect   = busquedaLinea
    ? lineasFiltradas.filter(id => id.toUpperCase().includes(busquedaLinea.toUpperCase()))
    : lineasFiltradas;
  const ctsFiltradosLista = busquedaCtFiltro
    ? cts.filter(ct => ct.id_ct.toUpperCase().includes(busquedaCtFiltro.toUpperCase()) || ct.nombre.toUpperCase().includes(busquedaCtFiltro.toUpperCase()))
    : cts;
  const ctsPintados = ctsSeleccionados.length > 0
    ? cts.filter(ct => ctsSeleccionados.includes(ct.id_ct))
    : cts;

  const totalPagLineas = Math.max(1, Math.ceil(totalLineas / pageSizeLineas));
  const totalPagCups   = Math.max(1, Math.ceil(totalCups   / pageSizeCups));
  const startLineas    = pageLineas * pageSizeLineas + 1;
  const endLineas      = Math.min(pageLineas * pageSizeLineas + lineasTabla.length, totalLineas);
  const startCups      = pageCups  * pageSizeCups  + 1;
  const endCups        = Math.min(pageCups  * pageSizeCups  + cupsTabla.length,   totalCups);

  const toggleCt = (id: string) => {
    setCtsSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCalcularCt = async () => {
    if (!token || !empresaId) return;
    setCalcCt(true); setCalcCtError(null); setCalcCtResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/calcular-ct?empresa_id=${empresaId}`, { method: "POST", headers: getAuthHeaders(token) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { detail?: string }).detail || `Error ${res.status}`); }
      setCalcCtResult(await res.json());
      await fetch(`${API_BASE_URL}/topologia/calcular-ct-mt?empresa_id=${empresaId}`, { method: "POST", headers: getAuthHeaders(token) });
      cargarCups(); cargarTramos();
      if (tablaActiva === "lineas") cargarTablaLineas(0, pageSizeLineas); else cargarTablaCups(0, pageSizeCups);
    } catch (e) { setCalcCtError(e instanceof Error ? e.message : "Error calculando CT"); }
    finally { setCalcCt(false); }
  };

  const handleGuardarLinea = async (id_tramo: string, id_ct_nuevo?: string | null) => {
    if (!token || !empresaId) return;
    setGuardando(true);
    const valor = id_ct_nuevo !== undefined ? id_ct_nuevo : (editValor || null);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/lineas/${encodeURIComponent(id_tramo)}/ct?empresa_id=${empresaId}`, {
        method: "PATCH", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ id_ct: valor }),
      });
      if (!res.ok) throw new Error();
      setEditandoLinea(null);
      cargarTramos();
      if (panelTablasOpen && tablaActiva === "lineas") cargarTablaLineas(pageLineas, pageSizeLineas);
    } catch { } finally { setGuardando(false); }
  };

  const handleGuardarCups = async (cups: string) => {
    if (!token || !empresaId) return;
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/cups/${encodeURIComponent(cups)}/ct?empresa_id=${empresaId}`, {
        method: "PATCH", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ id_ct: editValor || null }),
      });
      if (!res.ok) throw new Error();
      setEditandoCups(null);
      cargarTablaCups(pageCups, pageSizeCups);
    } catch { } finally { setGuardando(false); }
  };

  const handleGuardarFaseCups = async (cups: string) => {
    if (!token || !empresaId) return;
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/cups/${encodeURIComponent(cups)}/fase?empresa_id=${empresaId}`, {
        method: "PATCH", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ fase: editFaseValor || null }),
      });
      if (!res.ok) throw new Error();
      setEditandoFase(null);
      cargarCups();
      cargarTablaCups(pageCups, pageSizeCups);
    } catch { } finally { setGuardando(false); }
  };

  const handleReasignarCtMapa = useCallback(async (id_tramo: string, id_ct: string | null) => {
    if (!token || !empresaId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/topologia/lineas/${encodeURIComponent(id_tramo)}/ct?empresa_id=${empresaId}`,
        { method: "PATCH", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ id_ct }) }
      );
      if (!res.ok) throw new Error();
      cargarTramos();
      if (panelTablasOpen && tablaActiva === "lineas") cargarTablaLineas(pageLineas, pageSizeLineas);
    } catch { console.error("Error reasignando CT desde mapa"); }
  }, [token, empresaId, cargarTramos, panelTablasOpen, tablaActiva, cargarTablaLineas, pageLineas, pageSizeLineas]);

  const handleReasignarFaseMapa = useCallback(async (cupsId: string, fase: string | null) => {
    if (!token || !empresaId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/topologia/cups/${encodeURIComponent(cupsId)}/fase?empresa_id=${empresaId}`,
        { method: "PATCH", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ fase }) }
      );
      if (!res.ok) throw new Error();
      cargarCups();
      if (panelTablasOpen && tablaActiva === "cups") cargarTablaCups(pageCups, pageSizeCups);
    } catch { console.error("Error asignando fase desde mapa"); }
  }, [token, empresaId, cargarCups, panelTablasOpen, tablaActiva, cargarTablaCups, pageCups, pageSizeCups]);

  const handleImportar = async () => {
    if (!token || !empresaId || !hayAlgunFichero) return;
    setImporting(true); setImportError(null); setImportResult(null);
    const fd = new FormData();
    fd.append("empresa_id", String(empresaId)); fd.append("anio_declaracion", anioDecl);
    (Object.entries(ficheros) as [FicheroKey, File | null][]).forEach(([key, file]) => { if (file) fd.append(key, file); });
    try {
      const res = await fetch(`${API_BASE_URL}/topologia/importar`, { method: "POST", headers: getAuthHeaders(token), body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { detail?: string }).detail || `Error ${res.status}`); }
      setImportResult(await res.json() as ImportResult);
      cargarCts(); cargarCups(); cargarTramos();
      if (panelTablasOpen) { if (tablaActiva === "lineas") cargarTablaLineas(0, pageSizeLineas); else cargarTablaCups(0, pageSizeCups); }
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Error importando"); }
    finally { setImporting(false); }
  };

  const handleBuscarLinea = () => {
    const q = busquedaLineaPendiente.trim(); setBusquedaLinea(q);
    const c = lineasFiltradas.filter(id => id.toUpperCase().includes(q.toUpperCase()));
    if (c.length === 1) setLineaSeleccionada(c[0]); else setLineaSeleccionada(null);
  };
  const handleLimpiarLinea = () => { setBusquedaLinea(""); setBusquedaLineaPendiente(""); setLineaSeleccionada(null); inputBusquedaLineaRef.current?.focus(); };
  const handleLineaClick   = (id: string | null) => { setLineaSeleccionada(id); if (id) { setBusquedaLineaPendiente(""); setBusquedaLinea(""); } };

  const SeccionLabel = ({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: open ? 8 : 0 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{open ? "▾" : "▸"}</span>
    </button>
  );

  const BadgeMetodo = ({ metodo }: { metodo: string | null }) => {
    if (!metodo) return <span style={{ color: "var(--text-muted)", fontSize: 10 }}>—</span>;
    return <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: `${METODO_COLOR[metodo] ?? "#888"}22`, color: METODO_COLOR[metodo] ?? "#888", border: `1px solid ${METODO_COLOR[metodo] ?? "#888"}44` }}>{METODO_LABEL[metodo] ?? metodo}</span>;
  };

  const BadgeFase = ({ fase }: { fase: string | null }) => {
    if (!fase) return <span style={{ color: "var(--text-muted)", fontSize: 10 }}>—</span>;
    const color = FASE_COLOR[fase] ?? "#888";
    return (
      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}44` }}>
        {fase}
      </span>
    );
  };

  return (
    <div className="text-sm">

      {/* ══ PANEL 1 — IMPORTACIÓN ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelImportOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📥 Importar inventario CNMC 8/2021</div>
            <div style={panelDescStyle}>Carga los ficheros B2, B21, A1, B1 y B11 para poblar el mapa topológico</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={e => { e.stopPropagation(); setPanelImportOpen(v => !v); }}>{panelImportOpen ? "Ocultar" : "Mostrar"}</button>
        </div>
        {panelImportOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            {importError && <div className="ui-alert ui-alert--danger mb-3">{importError}</div>}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 200 }} value={empresaId} onChange={e => setEmpresaId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Selecciona empresa</option>
                  {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Año declaración</label>
                <input className="ui-input" type="number" style={{ fontSize: 11, height: 30, width: 80 }} value={anioDecl} onChange={e => setAnioDecl(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              {FICHEROS_CONFIG.slice(0, 3).map(({ key, label, desc }) => (
                <div key={key} style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{desc}</div>
                  <input type="file" accept=".txt,.csv" style={{ fontSize: 10 }} onChange={e => setFicheros(f => ({ ...f, [key]: e.target.files?.[0] ?? null }))} />
                  {ficheros[key] && <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 4 }}>✓ {ficheros[key]!.name}</div>}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {FICHEROS_CONFIG.slice(3).map(({ key, label, desc }) => (
                <div key={key} style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{desc}</div>
                  <input type="file" accept=".txt,.csv" style={{ fontSize: 10 }} onChange={e => setFicheros(f => ({ ...f, [key]: e.target.files?.[0] ?? null }))} />
                  {ficheros[key] && <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 4 }}>✓ {ficheros[key]!.name}</div>}
                </div>
              ))}
              <div />
            </div>
            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={handleImportar} disabled={importing || !empresaId || !hayAlgunFichero}>{importing ? "Importando..." : "Importar ficheros"}</button>
            {importResult && (
              <div style={{ marginTop: 16, background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Resultado — ficheros: {importResult.ficheros.join(", ")}</div>
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
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={e => { e.stopPropagation(); setPanelMapaOpen(v => !v); }}>{panelMapaOpen ? "Ocultar" : "Mostrar"}</button>
        </div>

        {panelMapaOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)" }}>
            <div style={{ display: "flex", height: 580 }}>
              <div style={{ width: 230, flexShrink: 0, borderRight: "1px solid var(--card-border)", padding: "14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                  <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }} value={empresaId}
                    onChange={e => {
                      setEmpresaId(e.target.value === "" ? "" : Number(e.target.value));
                      setCtsSeleccionados([]); setLineaSeleccionada(null);
                      setBusquedaLinea(""); setBusquedaLineaPendiente(""); setBusquedaCtFiltro("");
                      setCts([]); setCups([]); setTramos([]); setLineas([]); setTensionPorLinea(new Map());
                    }}>
                    <option value="">Selecciona empresa</option>
                    {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                  </select>
                </div>

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
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E24B4A", border: "2px solid #fff", display: "inline-block" }} />
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

                {lineasFiltradas.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Seleccionar línea</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      <input ref={inputBusquedaLineaRef} className="ui-input" style={{ flex: 1, fontSize: 11, height: 28, fontFamily: "monospace" }}
                        placeholder="Buscar ID..." value={busquedaLineaPendiente}
                        onChange={e => setBusquedaLineaPendiente(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleBuscarLinea(); }} />
                      <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 28, padding: "0 8px", fontSize: 13 }} onClick={handleBuscarLinea}>🔍</button>
                    </div>
                    {busquedaLinea && <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{lineasEnSelect.length} resultado{lineasEnSelect.length !== 1 ? "s" : ""}</div>}
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }} value={lineaSeleccionada ?? ""} onChange={e => setLineaSeleccionada(e.target.value || null)}>
                      <option value="">Todas las líneas</option>
                      {lineasEnSelect.map(id => <option key={id} value={id}>{id}</option>)}
                    </select>
                    {(lineaSeleccionada || busquedaLinea) && (
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ marginTop: 6, fontSize: 10 }} onClick={handleLimpiarLinea}>✕ Limpiar</button>
                    )}
                  </div>
                )}

                {cts.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                    <SeccionLabel
                      label={`Filtrar por CT${ctsSeleccionados.length > 0 ? ` (${ctsSeleccionados.length})` : ""}`}
                      open={ctListaOpen}
                      onToggle={() => setCtListaOpen(v => !v)}
                    />
                    {ctListaOpen && (
                      <>
                        <input className="ui-input" style={{ width: "100%", fontSize: 10, height: 26, marginBottom: 6 }}
                          placeholder="Buscar CT..." value={busquedaCtFiltro}
                          onChange={e => setBusquedaCtFiltro(e.target.value)} />
                        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 9, flex: 1 }} onClick={() => setCtsSeleccionados([])}>Todos</button>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 9, flex: 1 }} onClick={() => setCtsSeleccionados(cts.map(c => c.id_ct))}>Ninguno</button>
                        </div>
                        {ctsSeleccionados.length >= 2 && (
                          <div style={{ fontSize: 9, color: "#1D9E75", fontWeight: 600, marginBottom: 6 }}>● Modo multi-CT activo</div>
                        )}
                        <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                          {ctsFiltradosLista.map(ct => {
                            const sel = ctsSeleccionados.includes(ct.id_ct);
                            const colorCt = ctsSeleccionados.length >= 2 && sel ? coloresCt[ct.id_ct] : undefined;
                            return (
                              <label key={ct.id_ct} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, cursor: "pointer", padding: "2px 4px", borderRadius: 4, background: sel ? "var(--field-bg-soft)" : "transparent" }}>
                                <input type="checkbox" checked={sel} onChange={() => toggleCt(ct.id_ct)} style={{ flexShrink: 0 }} />
                                {colorCt && <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorCt, flexShrink: 0 }} />}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: sel ? "var(--text)" : "var(--text-muted)" }}>{ct.nombre}</span>
                              </label>
                            );
                          })}
                        </div>
                        {ctsSeleccionados.length > 0 && (
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ marginTop: 6, fontSize: 10 }}
                            onClick={() => { setCtsSeleccionados([]); setBusquedaCtFiltro(""); }}>
                            ✕ Limpiar selección
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Leyenda</div>
                  {ctsSeleccionados.length >= 2 ? (
                    <>
                      {ctsSeleccionados.map(id => {
                        const ct = cts.find(c => c.id_ct === id);
                        return (
                          <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>
                            <span style={{ width: 16, height: 3, background: coloresCt[id], display: "inline-block", borderRadius: 2 }} />
                            {ct?.nombre ?? id}
                          </div>
                        );
                      })}
                      <div style={{ marginTop: 4 }}>
                        {[
                          { color: "#E24B4A", w: 10, h: 10, label: "Centro de transformación", radius: "50%" as const, border: "2px solid #fff" },
                          { color: "#378ADD", w: 7,  h: 7,  label: "Punto de suministro",      radius: "50%" as const },
                        ].map(({ color, w, h, label, radius, border }) => (
                          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                            <span style={{ width: w, height: h, background: color, display: "inline-block", borderRadius: radius, border }} />
                            {label}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    [
                      { color: "#A855F7", w: 16, h: 3,  label: "Línea MT",                radius: 2 },
                      { color: "#F59E0B", w: 16, h: 3,  label: "Línea BT",                radius: 2 },
                      { color: "#E24B4A", w: 10, h: 10, label: "Centro de transformación", radius: "50%" as const, border: "2px solid #fff" },
                      { color: "#378ADD", w: 7,  h: 7,  label: "Punto de suministro",     radius: "50%" as const },
                    ].map(({ color, w, h, label, radius, border }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                        <span style={{ width: w, height: h, background: color, display: "inline-block", borderRadius: radius, border }} />
                        {label}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ flex: 1, position: "relative", minHeight: 580 }}>
                {!empresaId && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.85)", fontSize: 12, color: "var(--text-muted)", borderRadius: "0 10px 10px 0" }}>
                    Selecciona una empresa para cargar el mapa
                  </div>
                )}
                <MapaLeaflet
                  cts={ctsPintados}
                  ctsTodos={cts}
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
                  onReasignarCt={handleReasignarCtMapa}
                  onReasignarFase={handleReasignarFaseMapa}
                  coloresCt={coloresCt}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ PANEL 3 — TABLAS ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelTablasOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📊 Tablas de asociación CT</div>
            <div style={panelDescStyle}>Revisión y corrección de la asociación líneas → CT y CUPS → CT</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={e => { e.stopPropagation(); setPanelTablasOpen(v => !v); }}>{panelTablasOpen ? "Ocultar" : "Mostrar"}</button>
        </div>

        {panelTablasOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 20px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 30, minWidth: 200 }} value={empresaId} onChange={e => setEmpresaId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Selecciona empresa</option>
                  {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 30 }}
                onClick={handleCalcularCt} disabled={calcCt || !empresaId}>
                {calcCt ? "Calculando..." : "⚡ Calcular CT"}
              </button>
            </div>

            {calcCtError && <div className="ui-alert ui-alert--danger mb-3">{calcCtError}</div>}
            {calcCtResult && (
              <div style={{ marginBottom: 16, background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Resultado del cálculo</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Líneas ({calcCtResult.lineas_total} total)</div>
                    <div style={{ fontSize: 11 }}>
                      <span style={{ color: METODO_COLOR.bfs }}>● Topológico: {calcCtResult.lineas_bfs}</span>{" · "}
                      <span style={{ color: METODO_COLOR.proximidad }}>● Proximidad: {calcCtResult.lineas_proximidad}</span>{" · "}
                      <span style={{ color: "var(--text-muted)" }}>Sin CT: {calcCtResult.lineas_sin_asoc}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>CUPS ({calcCtResult.cups_total} total)</div>
                    <div style={{ fontSize: 11 }}>
                      <span style={{ color: METODO_COLOR.nudo_linea }}>● Asignados: {calcCtResult.cups_asignados}</span>{" · "}
                      <span style={{ color: "var(--text-muted)" }}>Sin CT: {calcCtResult.cups_sin_asoc}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid var(--card-border)" }}>
              {(["lineas", "cups"] as const).map(tab => (
                <button key={tab} type="button"
                  onClick={() => {
                    setTablaActiva(tab); setHasLoadedTabla(false);
                    if (tab === "lineas") { setPageLineas(0); cargarTablaLineas(0, pageSizeLineas); }
                    else { setPageCups(0); cargarTablaCups(0, pageSizeCups); }
                  }}
                  style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer", borderBottom: tablaActiva === tab ? "2px solid var(--primary)" : "2px solid transparent", color: tablaActiva === tab ? "var(--primary)" : "var(--text-muted)" }}>
                  {tab === "lineas" ? `Líneas → CT (${totalLineas.toLocaleString()})` : `CUPS → CT (${totalCups.toLocaleString()})`}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>CT</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, minWidth: 180 }} value={filtroCtTabla} onChange={e => setFiltroCtTabla(e.target.value)}>
                  <option value="">Todos los CTs</option>
                  {cts.map(ct => <option key={ct.id_ct} value={ct.id_ct}>{ct.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Método</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, minWidth: 140 }} value={filtroMetodo} onChange={e => setFiltroMetodo(e.target.value)}>
                  <option value="">Todos</option>
                  {tablaActiva === "lineas"
                    ? <><option value="bfs">Topológico</option><option value="proximidad">Proximidad</option><option value="manual">Manual</option></>
                    : <><option value="nudo_linea">Nudo→Línea</option><option value="manual">Manual</option></>
                  }
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", height: 28 }}>
                <input type="checkbox" checked={filtroSinCt} onChange={e => setFiltroSinCt(e.target.checked)} />Sin CT asignado
              </label>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 28 }}
                onClick={() => {
                  setHasLoadedTabla(false);
                  if (tablaActiva === "lineas") { setPageLineas(0); cargarTablaLineas(0, pageSizeLineas); }
                  else { setPageCups(0); cargarTablaCups(0, pageSizeCups); }
                }}>
                🔍 Buscar
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 28 }}
                onClick={() => { setFiltroCtTabla(""); setFiltroSinCt(false); setFiltroMetodo(""); }}>
                Limpiar
              </button>
            </div>

            {/* ── Tabla líneas ── */}
            {tablaActiva === "lineas" && (
              <div style={{ overflowX: "auto" }}>
                {!hasLoadedTabla && loadingTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Cargando...</div>
                ) : lineasTabla.length === 0 && hasLoadedTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Sin resultados</div>
                ) : lineasTabla.length > 0 ? (
                  <div ref={tablaLineasRef} style={{ position: "relative", opacity: loadingTabla ? 0.45 : 1, transition: "opacity 0.18s ease", minHeight: minHLineas }}>
                    {loadingTabla && <TableLoadingOverlay />}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                          {["ID Tramo", "Tensión", "Long.", "Op.", "APS", "CT asignado", "Método", ""].map(h => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lineasTabla.map(linea => (
                          <tr key={linea.id_tramo} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 10 }}>{linea.id_tramo}</td>
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{linea.tension_kv != null ? `${linea.tension_kv} kV` : "—"}</td>
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{linea.longitud_km != null ? `${linea.longitud_km.toFixed(3)} km` : "—"}</td>
                            <td style={{ padding: "5px 8px" }}>{linea.operacion === 1 ? "✅" : linea.operacion === 0 ? "⚠️" : "—"}</td>
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{linea.fecha_aps ?? "—"}</td>
                            <td style={{ padding: "5px 8px" }}>
                              {editandoLinea === linea.id_tramo ? (
                                <select className="ui-select" style={{ fontSize: 10, height: 24, minWidth: 160 }} value={editValor} onChange={e => setEditValor(e.target.value)}>
                                  <option value="">— Sin CT —</option>
                                  {cts.map(ct => <option key={ct.id_ct} value={ct.id_ct}>{ct.nombre}</option>)}
                                </select>
                              ) : (
                                <span style={{ fontFamily: "monospace", fontSize: 10, color: linea.id_ct ? "var(--text)" : "var(--text-muted)" }}>
                                  {linea.id_ct ? (cts.find(c => c.id_ct === linea.id_ct)?.nombre ?? linea.id_ct) : "—"}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "5px 8px" }}><BadgeMetodo metodo={linea.metodo_asignacion_ct} /></td>
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                              {editandoLinea === linea.id_tramo ? (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ fontSize: 10, padding: "1px 8px" }} onClick={() => handleGuardarLinea(linea.id_tramo)} disabled={guardando}>{guardando ? "…" : "✓"}</button>
                                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10, padding: "1px 8px" }} onClick={() => setEditandoLinea(null)}>✕</button>
                                </div>
                              ) : (
                                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10 }} onClick={() => { setEditandoLinea(linea.id_tramo); setEditValor(linea.id_ct ?? ""); }}>✏️</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePaginationFooter
                      loading={loadingTabla} hasLoadedOnce={hasLoadedTabla}
                      totalFilas={totalLineas} startIndex={startLineas - 1} endIndex={endLineas}
                      pageSize={pageSizeLineas}
                      setPageSize={v => { setPageSizeLineas(v); setPageLineas(0); }}
                      currentPage={pageLineas} totalPages={totalPagLineas}
                      setPage={p => setPageLineas(p)}
                      compact />
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Tabla CUPS ── */}
            {tablaActiva === "cups" && (
              <div style={{ overflowX: "auto" }}>
                {!hasLoadedTabla && loadingTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Cargando...</div>
                ) : cupsTabla.length === 0 && hasLoadedTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Sin resultados</div>
                ) : cupsTabla.length > 0 ? (
                  <div ref={tablaCupsRef} style={{ position: "relative", opacity: loadingTabla ? 0.45 : 1, transition: "opacity 0.18s ease", minHeight: minHCups }}>
                    {loadingTabla && <TableLoadingOverlay />}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                          {["CUPS", "Tarifa", "Tensión", "Potencia", "Municipio", "CT asignado", "Método", "Fase", ""].map(h => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cupsTabla.map(c => (
                          <tr key={c.cups} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 10 }}>{c.cups}</td>
                            <td style={{ padding: "5px 8px" }}>{c.tarifa ?? "—"}</td>
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{c.tension_kv != null ? `${c.tension_kv} kV` : "—"}</td>
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{c.potencia_contratada_kw != null ? `${c.potencia_contratada_kw} kW` : "—"}</td>
                            <td style={{ padding: "5px 8px" }}>{c.municipio ?? "—"}</td>
                            <td style={{ padding: "5px 8px" }}>
                              {editandoCups === c.cups ? (
                                <select className="ui-select" style={{ fontSize: 10, height: 24, minWidth: 160 }} value={editValor} onChange={e => setEditValor(e.target.value)}>
                                  <option value="">— Sin CT —</option>
                                  {cts.map(ct => <option key={ct.id_ct} value={ct.id_ct}>{ct.nombre}</option>)}
                                </select>
                              ) : (
                                <span style={{ fontFamily: "monospace", fontSize: 10, color: c.id_ct_asignado ? "var(--text)" : "var(--text-muted)" }}>
                                  {c.id_ct_asignado ? (cts.find(ct => ct.id_ct === c.id_ct_asignado)?.nombre ?? c.id_ct_asignado) : "—"}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "5px 8px" }}><BadgeMetodo metodo={c.metodo_asignacion_ct} /></td>

                            {/* ── Columna Fase ── */}
                            <td style={{ padding: "5px 8px" }}>
                              {editandoFase === c.cups ? (
                                <select className="ui-select" style={{ fontSize: 10, height: 24, minWidth: 80 }} value={editFaseValor} onChange={e => setEditFaseValor(e.target.value)}>
                                  <option value="">— —</option>
                                  <option value="R">R</option>
                                  <option value="S">S</option>
                                  <option value="T">T</option>
                                  <option value="RST">RST</option>
                                </select>
                              ) : (
                                <BadgeFase fase={c.fase} />
                              )}
                            </td>

                            {/* ── Acciones: CT + Fase ── */}
                            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                              {editandoCups === c.cups ? (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ fontSize: 10, padding: "1px 8px" }} onClick={() => handleGuardarCups(c.cups)} disabled={guardando}>{guardando ? "…" : "✓ CT"}</button>
                                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10, padding: "1px 8px" }} onClick={() => setEditandoCups(null)}>✕</button>
                                </div>
                              ) : editandoFase === c.cups ? (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ fontSize: 10, padding: "1px 8px", background: "#2563EB22", borderColor: "#2563EB44", color: "#2563EB" }} onClick={() => handleGuardarFaseCups(c.cups)} disabled={guardando}>{guardando ? "…" : "✓ Fase"}</button>
                                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10, padding: "1px 8px" }} onClick={() => setEditandoFase(null)}>✕</button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 3 }}>
                                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10 }} title="Editar CT" onClick={() => { setEditandoCups(c.cups); setEditValor(c.id_ct_asignado ?? ""); setEditandoFase(null); }}>✏️</button>
                                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10, color: "#2563EB" }} title="Editar fase" onClick={() => { setEditandoFase(c.cups); setEditFaseValor(c.fase ?? ""); setEditandoCups(null); }}>⚡</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePaginationFooter
                      loading={loadingTabla} hasLoadedOnce={hasLoadedTabla}
                      totalFilas={totalCups} startIndex={startCups - 1} endIndex={endCups}
                      pageSize={pageSizeCups}
                      setPageSize={v => { setPageSizeCups(v); setPageCups(0); }}
                      currentPage={pageCups} totalPages={totalPagCups}
                      setPage={p => setPageCups(p)}
                      compact />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_TOOLTIP_LINEAS, DEFAULT_TOOLTIP_TRAMOS, DEFAULT_TOOLTIP_CTS, DEFAULT_TOOLTIP_CUPS };
export type { TooltipLineasConfig, TooltipTramosConfig, TooltipCtsConfig, TooltipCupsConfig };
