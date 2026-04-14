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
import type { TablaLineasConfig, TablaCupsConfig, TablaCeldasConfig, TablaCtsConfig } from "../settings/TopologiaSettingsSection";
import { DEFAULT_TABLA_LINEAS, DEFAULT_TABLA_CUPS, DEFAULT_TABLA_CELDAS, DEFAULT_TABLA_CTS } from "../settings/TopologiaSettingsSection";

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
  celdas_insertadas: number; celdas_actualizadas: number; celdas_errores: number;
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
  [key: string]: unknown;
  id_tramo: string; cini: string | null; codigo_ccuu: string | null;
  nudo_inicio: string | null; nudo_fin: string | null;
  ccaa_1: string | null; ccaa_2: string | null;
  propiedad: number | null; tension_kv: number | null;
  tension_construccion_kv: number | null; longitud_km: number | null;
  resistencia_ohm: number | null; reactancia_ohm: number | null; intensidad_a: number | null;
  estado: number | null; punto_frontera: number | null; modelo: string | null;
  operacion: number | null; fecha_aps: string | null;
  causa_baja: number | null; fecha_baja: string | null; fecha_ip: string | null;
  tipo_inversion: number | null; motivacion: string | null;
  im_tramites: number | null; im_construccion: number | null; im_trabajos: number | null;
  valor_auditado: number | null; financiado: number | null;
  subvenciones_europeas: number | null; subvenciones_nacionales: number | null; subvenciones_prtr: number | null;
  cuenta: string | null; avifauna: number | null; identificador_baja: string | null;
  id_ct: string | null; metodo_asignacion_ct: string | null;
}

interface CupsTabla {
  [key: string]: unknown;
  cups: string; id_ct: string | null; cnae: string | null; tarifa: string | null;
  municipio: string | null; provincia: string | null; zona: string | null; conexion: string | null;
  tension_kv: number | null; estado_contrato: number | null;
  potencia_contratada_kw: number | null; potencia_adscrita_kw: number | null;
  energia_activa_kwh: number | null; energia_reactiva_kvarh: number | null;
  autoconsumo: number | null; cini_contador: string | null;
  fecha_alta: string | null; lecturas: number | null;
  baja_suministro: number | null; cambio_titularidad: number | null;
  facturas_estimadas: number | null; facturas_total: number | null;
  cau: string | null; cod_auto: string | null; cod_generacion_auto: number | null;
  conexion_autoconsumo: number | null;
  energia_autoconsumida_kwh: number | null; energia_excedentaria_kwh: number | null;
  id_ct_asignado: string | null; metodo_asignacion_ct: string | null; fase: string | null;
}

interface CeldaTabla {
  [key: string]: unknown;
  id_ct: string;
  id_celda: string;
  id_transformador: string | null;
  cini: string | null;
  posicion: number | null;
  en_servicio: number | null;
  anio_instalacion: number | null;
  cini_p4_tension_rango: string | null;
  cini_p5_tipo_posicion: string | null;
  cini_p6_ubicacion: string | null;
  cini_p7_funcion: string | null;
  cini_p8_tension_nominal: string | null;
}


interface CtTabla {
  [key: string]: unknown;
  id_ct: string; nombre: string; cini: string | null; codigo_ccuu: string | null;
  nudo_alta: string | null; nudo_baja: string | null;
  tension_kv: number | null; tension_construccion_kv: number | null; potencia_kva: number | null;
  municipio_ine: string | null; provincia: string | null; ccaa: string | null; zona: string | null;
  propiedad: string | null; estado: number | null; modelo: string | null; punto_frontera: number | null;
  fecha_aps: string | null; causa_baja: number | null; fecha_baja: string | null; fecha_ip: string | null;
  tipo_inversion: number | null; financiado: number | null;
  im_tramites: number | null; im_construccion: number | null; im_trabajos: number | null;
  subvenciones_europeas: number | null; subvenciones_nacionales: number | null; subvenciones_prtr: number | null;
  valor_auditado: number | null; cuenta: string | null; motivacion: string | null;
  avifauna: number | null; identificador_baja: string | null;
  num_trafos: number | null; num_celdas: number | null; num_cups: number | null;
}

interface TramoTabla {
  [key: string]: unknown;
  id_tramo: string; id_linea: string | null; orden: number | null; num_tramo: number | null;
  lat_ini: number | null; lon_ini: number | null; lat_fin: number | null; lon_fin: number | null;
  cini: string | null; codigo_ccuu: string | null; nudo_inicio: string | null; nudo_fin: string | null;
  ccaa_1: string | null; ccaa_2: string | null; tension_kv: number | null; longitud_km: number | null;
  id_ct: string | null; metodo_asignacion_ct: string | null;
}

interface Props {
  token: string | null; currentUser: User | null;
  tooltipLineas: TooltipLineasConfig; tooltipTramos: TooltipTramosConfig;
  tooltipCts: TooltipCtsConfig; tooltipCups: TooltipCupsConfig;
  tablaLineas?: TablaLineasConfig;
  tablaCups?: TablaCupsConfig;
  tablaCeldas?: TablaCeldasConfig;
  tablaCts?: TablaCtsConfig;
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

const FASE_COLOR: Record<string, string> = {
  R:   "#E24B4A",
  S:   "#F59E0B",
  T:   "#2563EB",
  RST: "#1D9E75",
};

const FUNCION_COLOR: Record<string, string> = {
  "Línea":          "#2563EB",
  "Transformación": "#E24B4A",
  "Acoplamiento":   "#F59E0B",
  "Medida":         "#16A34A",
  "Reserva":        "#7C3AED",
};

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
  { key: "b22", label: "B22 — Celdas de CT",             desc: "CIR8_2021_B22_R1-XXX_AAAA.txt" },
  { key: "a1",  label: "A1 — Puntos de suministro",      desc: "CIR8_2021_A1_R1-XXX_AAAA.txt" },
  { key: "b1",  label: "B1 — Líneas eléctricas",         desc: "CIR8_2021_B1_R1-XXX_AAAA.txt" },
  { key: "b11", label: "B11 — Tramos GIS de líneas",     desc: "CIR8_2021_B11_R1-XXX_AAAA.txt" },
] as const;

type FicheroKey = typeof FICHEROS_CONFIG[number]["key"];

const METODO_LABEL: Record<string, string> = { bfs: "Topológico", proximidad: "Proximidad", nudo_linea: "Nudo→Línea", manual: "Manual" };
const METODO_COLOR: Record<string, string> = { bfs: "#1D9E75", proximidad: "#F59E0B", nudo_linea: "#378ADD", manual: "#A855F7" };

export default function TopologiaSection({ token, tooltipLineas, tooltipTramos, tooltipCts, tooltipCups, tablaLineas: tablaLineasProp, tablaCups: tablaCupsProp, tablaCeldas: tablaCeldasProp, tablaCts: tablaCtsProp }: Props) {
  const tablaLineasCfg = tablaLineasProp ?? DEFAULT_TABLA_LINEAS;
  const tablaCupsCfg   = tablaCupsProp   ?? DEFAULT_TABLA_CUPS;
  const tablaCeldasCfg = tablaCeldasProp ?? DEFAULT_TABLA_CELDAS;
  const tablaCtsCfg    = tablaCtsProp    ?? DEFAULT_TABLA_CTS;

  const [panelImportOpen, setPanelImportOpen] = useState(false);
  const [panelMapaOpen,   setPanelMapaOpen]   = useState(true);
  const [panelTablasOpen, setPanelTablasOpen] = useState(false);
  const [capasOpen,       setCapasOpen]       = useState(true);

  const [empresas,  setEmpresas]  = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId] = useState<number | "">("");
  const [anioDecl,  setAnioDecl]  = useState<string>(String(new Date().getFullYear()));
  const [ficheros, setFicheros] = useState<Record<FicheroKey, File | null>>({ b2: null, b21: null, b22: null, a1: null, b1: null, b11: null });
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
  const [mostrarCupsBT, setMostrarCupsBT] = useState(true);
  const [mostrarCupsMT, setMostrarCupsMT] = useState(true);
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

  const [tablaActiva,    setTablaActiva]    = useState<"lineas" | "cups" | "celdas" | "cts" | "tramos">("lineas");
  const [calcCt,         setCalcCt]         = useState(false);
  const [calcCtResult,   setCalcCtResult]   = useState<CalcCtResult | null>(null);
  const [calcCtError,    setCalcCtError]    = useState<string | null>(null);
  const [lineasTabla,    setLineasTabla]    = useState<LineaTabla[]>([]);
  const [cupsTabla,      setCupsTabla]      = useState<CupsTabla[]>([]);
  const [celdasTabla,    setCeldasTabla]    = useState<CeldaTabla[]>([]);
  const [totalLineas,    setTotalLineas]    = useState(0);
  const [totalCups,      setTotalCups]      = useState(0);
  const [totalCeldas,    setTotalCeldas]    = useState(0);
  const [ctsTabla,       setCtsTabla]       = useState<CtTabla[]>([]);
  const [totalCts,       setTotalCts]       = useState(0);
  const [pageCts,        setPageCts]        = useState(0);
  const [pageSizeCts,    setPageSizeCts]    = useState(50);
  const tablaCtsRef = useRef<HTMLDivElement>(null);
  const [minHCts,        setMinHCts]        = useState<number | undefined>(undefined);
  const [tramosTabla,    setTramosTabla]    = useState<TramoTabla[]>([]);
  const [totalTramos2,   setTotalTramos2]   = useState(0);
  const [pageTramos,     setPageTramos]     = useState(0);
  const [pageSizeTramos, setPageSizeTramos] = useState(50);
  const tablaTramosRef = useRef<HTMLDivElement>(null);
  const [minHTramos,     setMinHTramos]     = useState<number | undefined>(undefined);
  const [loadingTabla,   setLoadingTabla]   = useState(false);
  const [hasLoadedTabla, setHasLoadedTabla] = useState(false);
  const [filtroCtTabla,  setFiltroCtTabla]  = useState<string>("");
  const [filtroSinCt,    setFiltroSinCt]    = useState(false);
  const [filtroMetodo,   setFiltroMetodo]   = useState<string>("");

  const [pageLineas,     setPageLineas]     = useState(0);
  const [pageSizeLineas, setPageSizeLineas] = useState(50);
  const [pageCups,       setPageCups]       = useState(0);
  const [pageSizeCups,   setPageSizeCups]   = useState(50);
  const [pageCeldas,     setPageCeldas]     = useState(0);
  const [pageSizeCeldas, setPageSizeCeldas] = useState(50);

  const [editandoLinea,  setEditandoLinea]  = useState<string | null>(null);
  const [editandoCups,   setEditandoCups]   = useState<string | null>(null);
  const [editandoFase,   setEditandoFase]   = useState<string | null>(null);
  const [editValor,      setEditValor]      = useState<string>("");
  const [editFaseValor,  setEditFaseValor]  = useState<string>("");
  const [guardando,      setGuardando]      = useState(false);

  const tablaLineasRef = useRef<HTMLDivElement>(null);
  const tablaCupsRef   = useRef<HTMLDivElement>(null);
  const tablaCeldasRef = useRef<HTMLDivElement>(null);
  const [minHLineas, setMinHLineas] = useState<number | undefined>(undefined);
  const [minHCups,   setMinHCups]   = useState<number | undefined>(undefined);
  const [minHCeldas, setMinHCeldas] = useState<number | undefined>(undefined);

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

  const cargarTablaCeldas = useCallback(async (page = pageCeldas, size = pageSizeCeldas) => {
    if (!token || !empresaId) return;
    if (tablaCeldasRef.current) setMinHCeldas(tablaCeldasRef.current.offsetHeight);
    setLoadingTabla(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), limit: String(size), offset: String(page * size) });
      if (filtroCtTabla) params.set("id_ct", filtroCtTabla);
      const res = await fetch(`${API_BASE_URL}/topologia/tabla/celdas?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCeldasTabla(data.items ?? []);
      setTotalCeldas(data.total ?? 0);
      setHasLoadedTabla(true);
    } catch { setCeldasTabla([]); setTotalCeldas(0); }
    finally { setLoadingTabla(false); setMinHCeldas(undefined); }
  }, [token, empresaId, filtroCtTabla, pageCeldas, pageSizeCeldas]);

  const cargarTablaCts = useCallback(async (page = pageCts, size = pageSizeCts) => {
    if (!token || !empresaId) return;
    if (tablaCtsRef.current) setMinHCts(tablaCtsRef.current.offsetHeight);
    setLoadingTabla(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), limit: String(size), offset: String(page * size) });
      const res = await fetch(`${API_BASE_URL}/topologia/tabla/cts?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCtsTabla(data.items ?? []);
      setTotalCts(data.total ?? 0);
      setHasLoadedTabla(true);
    } catch { setCtsTabla([]); setTotalCts(0); }
    finally { setLoadingTabla(false); setMinHCts(undefined); }
  }, [token, empresaId, pageCts, pageSizeCts]);

    const cargarTablaTramos = useCallback(async (page = pageTramos, size = pageSizeTramos) => {
    if (!token || !empresaId) return;
    if (tablaTramosRef.current) setMinHTramos(tablaTramosRef.current.offsetHeight);
    setLoadingTabla(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), limit: String(size), offset: String(page * size) });
      if (filtroCtTabla) params.set("id_ct", filtroCtTabla);
      const res = await fetch(`${API_BASE_URL}/topologia/tabla/tramos?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTramosTabla(data.items ?? []);
      setTotalTramos2(data.total ?? 0);
      setHasLoadedTabla(true);
    } catch { setTramosTabla([]); setTotalTramos2(0); }
    finally { setLoadingTabla(false); setMinHTramos(undefined); }
  }, [token, empresaId, filtroCtTabla, pageTramos, pageSizeTramos]);

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
      else if (tablaActiva === "cups") cargarTablaCups(0, pageSizeCups);
      else if (tablaActiva === "celdas") cargarTablaCeldas(0, pageSizeCeldas);
      else if (tablaActiva === "cts") cargarTablaCts(0, pageSizeCts);
      else if (tablaActiva === "tramos") cargarTablaTramos(0, pageSizeTramos);
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

  useEffect(() => {
    if (empresaId && panelTablasOpen && tablaActiva === "celdas" && hasLoadedTabla)
      cargarTablaCeldas(pageCeldas, pageSizeCeldas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCeldas, pageSizeCeldas]);

  useEffect(() => {
    if (empresaId && panelTablasOpen && tablaActiva === "cts" && hasLoadedTabla)
      cargarTablaCts(pageCts, pageSizeCts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCts, pageSizeCts]);

  useEffect(() => {
    if (empresaId && panelTablasOpen && tablaActiva === "tramos" && hasLoadedTabla)
      cargarTablaTramos(pageTramos, pageSizeTramos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTramos, pageSizeTramos]);

  const tramosFiltrados = tramos.filter(t => esBTTramo(t) ? mostrarBT : mostrarMT);
  const numBT = tramos.filter(t =>  esBTTramo(t)).length;
  const numMT = tramos.filter(t => !esBTTramo(t)).length;
  const numCupsBT = cups.filter(c => c.tension_kv === null || c.tension_kv <= 1).length;
  const numCupsMT = cups.filter(c => c.tension_kv !== null && c.tension_kv > 1).length;

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
  const totalPagCeldas = Math.max(1, Math.ceil(totalCeldas / pageSizeCeldas));
  const startLineas    = pageLineas * pageSizeLineas + 1;
  const endLineas      = Math.min(pageLineas * pageSizeLineas + lineasTabla.length, totalLineas);
  const startCups      = pageCups  * pageSizeCups  + 1;
  const endCups        = Math.min(pageCups  * pageSizeCups  + cupsTabla.length,   totalCups);
  const startCeldas    = pageCeldas * pageSizeCeldas + 1;
  const endCeldas      = Math.min(pageCeldas * pageSizeCeldas + celdasTabla.length, totalCeldas);
  const totalPagCts    = Math.max(1, Math.ceil(totalCts / pageSizeCts));
  const startCts       = pageCts * pageSizeCts + 1;
  const endCts         = Math.min(pageCts * pageSizeCts + ctsTabla.length, totalCts);
  const totalPagTramos = Math.max(1, Math.ceil(totalTramos2 / pageSizeTramos));
  const startTramos    = pageTramos * pageSizeTramos + 1;
  const endTramos      = Math.min(pageTramos * pageSizeTramos + tramosTabla.length, totalTramos2);

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
      if (tablaActiva === "lineas") cargarTablaLineas(0, pageSizeLineas);
      else if (tablaActiva === "cups") cargarTablaCups(0, pageSizeCups);
      else cargarTablaCeldas(0, pageSizeCeldas);
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
      if (panelTablasOpen) {
        if (tablaActiva === "lineas") cargarTablaLineas(0, pageSizeLineas);
        else if (tablaActiva === "cups") cargarTablaCups(0, pageSizeCups);
        else cargarTablaCeldas(0, pageSizeCeldas);
      }
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

  const BadgeFuncion = ({ funcion }: { funcion: string | null }) => {
    if (!funcion) return <span style={{ color: "var(--text-muted)", fontSize: 10 }}>—</span>;
    const color = FUNCION_COLOR[funcion] ?? "#888";
    return (
      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}44` }}>
        {funcion}
      </span>
    );
  };


    // ── Definición de columnas dinámicas ──────────────────────────────────────
  const thStyle: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontSize: 10, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: "5px 8px", fontSize: 10 };

  type ColDef<T> = { cfgKey: string; label: string; render: (row: T) => React.ReactNode; special?: boolean };

  const LINEAS_COLS: ColDef<LineaTabla>[] = [
    { cfgKey: "identificador_tramo",  label: "ID Tramo",       render: r => <span style={{ fontFamily: "monospace" }}>{r.id_tramo}</span> },
    { cfgKey: "cini",                 label: "CINI",           render: r => r.cini ?? "—" },
    { cfgKey: "codigo_ccuu",          label: "CCUU",           render: r => r.codigo_ccuu ?? "—" },
    { cfgKey: "nudo_inicial",         label: "Nudo inicio",    render: r => r.nudo_inicio ?? "—" },
    { cfgKey: "nudo_final",           label: "Nudo fin",       render: r => r.nudo_fin ?? "—" },
    { cfgKey: "ccaa_1",               label: "CCAA 1",         render: r => r.ccaa_1 ?? "—" },
    { cfgKey: "ccaa_2",               label: "CCAA 2",         render: r => r.ccaa_2 ?? "—" },
    { cfgKey: "propiedad",            label: "Propiedad",      render: r => r.propiedad ?? "—" },
    { cfgKey: "tension_explotacion",  label: "Tensión",        render: r => r.tension_kv != null ? `${r.tension_kv} kV` : "—" },
    { cfgKey: "tension_construccion", label: "T. construcc.",  render: r => r.tension_construccion_kv != null ? `${r.tension_construccion_kv} kV` : "—" },
    { cfgKey: "longitud",             label: "Long.",          render: r => r.longitud_km != null ? `${r.longitud_km.toFixed(3)} km` : "—" },
    { cfgKey: "resistencia",          label: "R (Ω)",          render: r => r.resistencia_ohm ?? "—" },
    { cfgKey: "reactancia",           label: "X (Ω)",          render: r => r.reactancia_ohm ?? "—" },
    { cfgKey: "intensidad",           label: "I (A)",          render: r => r.intensidad_a ?? "—" },
    { cfgKey: "estado",               label: "Estado",         render: r => r.estado ?? "—" },
    { cfgKey: "punto_frontera",       label: "Pto front.",     render: r => r.punto_frontera === 1 ? "✅" : "—" },
    { cfgKey: "modelo",               label: "Modelo",         render: r => r.modelo ?? "—" },
    { cfgKey: "operacion",            label: "Op.",            render: r => r.operacion === 1 ? "✅" : r.operacion === 0 ? "⚠️" : "—" },
    { cfgKey: "fecha_aps",            label: "APS",            render: r => r.fecha_aps ?? "—" },
    { cfgKey: "causa_baja",           label: "Causa baja",     render: r => r.causa_baja ?? "—" },
    { cfgKey: "fecha_baja",           label: "F. baja",        render: r => r.fecha_baja ?? "—" },
    { cfgKey: "fecha_ip",             label: "F. IP",          render: r => r.fecha_ip ?? "—" },
    { cfgKey: "tipo_inversion",       label: "Tipo inv.",      render: r => r.tipo_inversion ?? "—" },
    { cfgKey: "motivacion",           label: "Motivación",     render: r => r.motivacion ?? "—" },
    { cfgKey: "im_tramites",          label: "IM Trám.",       render: r => r.im_tramites ?? "—" },
    { cfgKey: "im_construccion",      label: "IM Constr.",     render: r => r.im_construccion ?? "—" },
    { cfgKey: "im_trabajos",          label: "IM Trab.",       render: r => r.im_trabajos ?? "—" },
    { cfgKey: "valor_auditado",       label: "V. auditado",   render: r => r.valor_auditado ?? "—" },
    { cfgKey: "financiado",           label: "Financ.",        render: r => r.financiado ?? "—" },
    { cfgKey: "subvenciones_europeas",   label: "Subv. EU",    render: r => r.subvenciones_europeas ?? "—" },
    { cfgKey: "subvenciones_nacionales", label: "Subv. nac.",  render: r => r.subvenciones_nacionales ?? "—" },
    { cfgKey: "subvenciones_prtr",       label: "Subv. PRTR",  render: r => r.subvenciones_prtr ?? "—" },
    { cfgKey: "cuenta",               label: "Cuenta",         render: r => r.cuenta ?? "—" },
    { cfgKey: "avifauna",             label: "Avifauna",       render: r => r.avifauna ?? "—" },
    { cfgKey: "identificador_baja",   label: "ID baja",        render: r => r.identificador_baja ?? "—" },
    { cfgKey: "ct_asignado",          label: "CT asignado",    render: () => null, special: true },
    { cfgKey: "metodo_asignacion",    label: "Método",         render: () => null, special: true },
  ];

  const CUPS_COLS: ColDef<CupsTabla>[] = [
    { cfgKey: "cups",                  label: "CUPS",           render: r => <span style={{ fontFamily: "monospace" }}>{r.cups}</span> },
    { cfgKey: "id_ct",                 label: "CT origen",      render: r => r.id_ct ?? "—" },
    { cfgKey: "tarifa",                label: "Tarifa",         render: r => r.tarifa ?? "—" },
    { cfgKey: "cnae",                  label: "CNAE",           render: r => r.cnae ?? "—" },
    { cfgKey: "tension",               label: "Tensión",        render: r => r.tension_kv != null ? `${r.tension_kv} kV` : "—" },
    { cfgKey: "potencia",              label: "Potencia",       render: r => r.potencia_contratada_kw != null ? `${r.potencia_contratada_kw} kW` : "—" },
    { cfgKey: "potencia_adscrita",     label: "Pot. adscr.",    render: r => r.potencia_adscrita_kw ?? "—" },
    { cfgKey: "energia_activa",        label: "E. activa",      render: r => r.energia_activa_kwh ?? "—" },
    { cfgKey: "energia_reactiva",      label: "E. reactiva",    render: r => r.energia_reactiva_kvarh ?? "—" },
    { cfgKey: "autoconsumo",           label: "Autocons.",      render: r => r.autoconsumo ?? "—" },
    { cfgKey: "municipio",             label: "Municipio",      render: r => r.municipio ?? "—" },
    { cfgKey: "provincia",             label: "Provincia",      render: r => r.provincia ?? "—" },
    { cfgKey: "zona",                  label: "Zona",           render: r => r.zona ?? "—" },
    { cfgKey: "conexion",              label: "Conexión",       render: r => r.conexion ?? "—" },
    { cfgKey: "estado_contrato",       label: "Est. contrato",  render: r => r.estado_contrato ?? "—" },
    { cfgKey: "fecha_alta",            label: "F. alta",        render: r => r.fecha_alta ?? "—" },
    { cfgKey: "cini",                  label: "CINI",           render: r => r.cini_contador ?? "—" },
    { cfgKey: "lecturas",              label: "Lecturas",       render: r => r.lecturas ?? "—" },
    { cfgKey: "baja_suministro",       label: "Baja sum.",      render: r => r.baja_suministro ?? "—" },
    { cfgKey: "cambio_titularidad",    label: "Cambio tit.",    render: r => r.cambio_titularidad ?? "—" },
    { cfgKey: "facturas_estimadas",    label: "Fact. estim.",   render: r => r.facturas_estimadas ?? "—" },
    { cfgKey: "facturas_total",        label: "Fact. total",    render: r => r.facturas_total ?? "—" },
    { cfgKey: "cau",                   label: "CAU",            render: r => r.cau ?? "—" },
    { cfgKey: "cod_auto",              label: "Cód. auto",      render: r => r.cod_auto ?? "—" },
    { cfgKey: "cod_generacion",        label: "Tec. gen.",      render: r => r.cod_generacion_auto ?? "—" },
    { cfgKey: "conexion_autoconsumo",  label: "Con. autoc.",    render: r => r.conexion_autoconsumo ?? "—" },
    { cfgKey: "energia_autoconsumida", label: "E. autoc.",      render: r => r.energia_autoconsumida_kwh ?? "—" },
    { cfgKey: "energia_excedentaria",  label: "E. exced.",      render: r => r.energia_excedentaria_kwh ?? "—" },
    { cfgKey: "ct_asignado",           label: "CT asignado",    render: () => null, special: true },
    { cfgKey: "metodo_asignacion",     label: "Método",         render: () => null, special: true },
    { cfgKey: "fase",                  label: "Fase",           render: () => null, special: true },
  ];

  const CELDAS_COLS: ColDef<CeldaTabla>[] = [
    { cfgKey: "id_ct",                  label: "CT",             render: r => cts.find(ct => ct.id_ct === r.id_ct)?.nombre ?? r.id_ct },
    { cfgKey: "id_celda",               label: "Celda",          render: r => <span style={{ fontFamily: "monospace" }}>{r.id_celda}</span> },
    { cfgKey: "cini_p7_funcion",        label: "Función",        render: r => <BadgeFuncion funcion={r.cini_p7_funcion} /> },
    { cfgKey: "cini_p5_tipo_posicion",  label: "Tipo pos.",      render: r => r.cini_p5_tipo_posicion ?? "—" },
    { cfgKey: "cini_p6_ubicacion",      label: "Ubicación",      render: r => r.cini_p6_ubicacion ?? "—" },
    { cfgKey: "cini_p8_tension_nom",    label: "Tensión",        render: r => r.cini_p8_tension_nominal ?? "—" },
    { cfgKey: "id_transformador",       label: "Trafo",          render: r => r.id_transformador ?? "—" },
    { cfgKey: "cini",                   label: "CINI",           render: r => r.cini ?? "—" },
    { cfgKey: "anio_ps",                label: "Año",            render: r => r.anio_instalacion ?? "—" },
    { cfgKey: "cini_p4_tension",        label: "Tensión rango",  render: r => r.cini_p4_tension_rango ?? "—" },
    { cfgKey: "interruptor",            label: "Posición",       render: r => r.posicion ?? "—" },
    { cfgKey: "propiedad",              label: "En servicio",    render: r => r.en_servicio === 1 ? "✅" : "—" },
  ];

  const CTS_COLS: ColDef<CtTabla>[] = [
    { cfgKey: "nombre",                label: "Nombre",         render: r => <span style={{ fontWeight: 600 }}>{r.nombre}</span> },
    { cfgKey: "identificador_ct",      label: "ID CT",          render: r => <span style={{ fontFamily: "monospace" }}>{r.id_ct}</span> },
    { cfgKey: "cini",                  label: "CINI",           render: r => r.cini ?? "—" },
    { cfgKey: "codigo_ccuu",           label: "CCUU",           render: r => r.codigo_ccuu ?? "—" },
    { cfgKey: "tension_explotacion",   label: "Tensión",        render: r => r.tension_kv != null ? `${r.tension_kv} kV` : "—" },
    { cfgKey: "tension_construccion",  label: "T. construcc.",  render: r => r.tension_construccion_kv != null ? `${r.tension_construccion_kv} kV` : "—" },
    { cfgKey: "potencia",              label: "Potencia",       render: r => r.potencia_kva != null ? `${r.potencia_kva} kVA` : "—" },
    { cfgKey: "nudo_alta",             label: "Nudo alta",      render: r => r.nudo_alta ?? "—" },
    { cfgKey: "nudo_baja",             label: "Nudo baja",      render: r => r.nudo_baja ?? "—" },
    { cfgKey: "municipio",             label: "Municipio",      render: r => r.municipio_ine ?? "—" },
    { cfgKey: "provincia",             label: "Provincia",      render: r => r.provincia ?? "—" },
    { cfgKey: "ccaa",                  label: "CCAA",           render: r => r.ccaa ?? "—" },
    { cfgKey: "zona",                  label: "Zona",           render: r => r.zona ?? "—" },
    { cfgKey: "propiedad",             label: "Propiedad",      render: r => r.propiedad ?? "—" },
    { cfgKey: "estado",                label: "Estado",         render: r => r.estado ?? "—" },
    { cfgKey: "modelo",                label: "Modelo",         render: r => r.modelo ?? "—" },
    { cfgKey: "punto_frontera",        label: "Pto front.",     render: r => r.punto_frontera === 1 ? "✅" : "—" },
    { cfgKey: "fecha_aps",             label: "APS",            render: r => r.fecha_aps ?? "—" },
    { cfgKey: "causa_baja",            label: "Causa baja",     render: r => r.causa_baja ?? "—" },
    { cfgKey: "fecha_baja",            label: "F. baja",        render: r => r.fecha_baja ?? "—" },
    { cfgKey: "fecha_ip",              label: "F. IP",          render: r => r.fecha_ip ?? "—" },
    { cfgKey: "tipo_inversion",        label: "Tipo inv.",      render: r => r.tipo_inversion ?? "—" },
    { cfgKey: "motivacion",            label: "Motivación",     render: r => r.motivacion ?? "—" },
    { cfgKey: "im_tramites",           label: "IM Trám.",       render: r => r.im_tramites ?? "—" },
    { cfgKey: "im_construccion",       label: "IM Constr.",     render: r => r.im_construccion ?? "—" },
    { cfgKey: "im_trabajos",           label: "IM Trab.",       render: r => r.im_trabajos ?? "—" },
    { cfgKey: "valor_auditado",        label: "V. auditado",   render: r => r.valor_auditado ?? "—" },
    { cfgKey: "financiado",            label: "Financ.",        render: r => r.financiado ?? "—" },
    { cfgKey: "subvenciones_europeas",   label: "Subv. EU",    render: r => r.subvenciones_europeas ?? "—" },
    { cfgKey: "subvenciones_nacionales", label: "Subv. nac.",  render: r => r.subvenciones_nacionales ?? "—" },
    { cfgKey: "subvenciones_prtr",       label: "Subv. PRTR",  render: r => r.subvenciones_prtr ?? "—" },
    { cfgKey: "cuenta",                label: "Cuenta",         render: r => r.cuenta ?? "—" },
    { cfgKey: "avifauna",              label: "Avifauna",       render: r => r.avifauna ?? "—" },
    { cfgKey: "identificador_baja",    label: "ID baja",        render: r => r.identificador_baja ?? "—" },
    { cfgKey: "num_trafos",            label: "Trafos",         render: r => r.num_trafos ?? 0 },
    { cfgKey: "num_celdas",            label: "Celdas",         render: r => r.num_celdas ?? 0 },
    { cfgKey: "num_cups",              label: "CUPS",           render: r => r.num_cups ?? 0 },
  ];

    const TRAMOS_COLS: ColDef<TramoTabla>[] = [
    { cfgKey: "identificador_tramo",  label: "ID Tramo",    render: r => <span style={{ fontFamily: "monospace" }}>{r.id_tramo}</span> },
    { cfgKey: "id_linea",             label: "ID Línea",    render: r => r.id_linea ?? "—" },
    { cfgKey: "orden",                label: "Orden",       render: r => r.orden ?? "—" },
    { cfgKey: "num_tramo",            label: "Nº tramo",    render: r => r.num_tramo ?? "—" },
    { cfgKey: "coordenadas",          label: "GPS ini",     render: r => r.lat_ini != null ? `${r.lat_ini.toFixed(5)}, ${r.lon_ini?.toFixed(5)}` : "—" },
    { cfgKey: "cini",                 label: "CINI",        render: r => r.cini ?? "—" },
    { cfgKey: "codigo_ccuu",          label: "CCUU",        render: r => r.codigo_ccuu ?? "—" },
    { cfgKey: "nudo_inicial",         label: "Nudo ini",    render: r => r.nudo_inicio ?? "—" },
    { cfgKey: "nudo_final",           label: "Nudo fin",    render: r => r.nudo_fin ?? "—" },
    { cfgKey: "ccaa_1",               label: "CCAA 1",      render: r => r.ccaa_1 ?? "—" },
    { cfgKey: "ccaa_2",               label: "CCAA 2",      render: r => r.ccaa_2 ?? "—" },
    { cfgKey: "tension_explotacion",  label: "Tensión",     render: r => r.tension_kv != null ? `${r.tension_kv} kV` : "—" },
    { cfgKey: "longitud",             label: "Long.",       render: r => r.longitud_km != null ? `${r.longitud_km.toFixed(3)} km` : "—" },
    { cfgKey: "ct_asignado",          label: "CT",          render: r => r.id_ct ? (cts.find(c => c.id_ct === r.id_ct)?.nombre ?? r.id_ct) : "—" },
    { cfgKey: "metodo_asignacion",    label: "Método",      render: r => <BadgeMetodo metodo={r.metodo_asignacion_ct} /> },
  ];

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
                    { label: "Celdas (B22)",          ins: importResult.celdas_insertadas, act: importResult.celdas_actualizadas, err: importResult.celdas_errores },
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
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", marginBottom: 6 }}>
                        <input type="checkbox" checked={mostrarCupsBT} onChange={e => setMostrarCupsBT(e.target.checked)} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#378ADD", border: "1px solid rgba(255,255,255,0.8)", display: "inline-block" }} />
                        CUPS BT {loadingCups ? "…" : `(${numCupsBT})`}
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                        <input type="checkbox" checked={mostrarCupsMT} onChange={e => setMostrarCupsMT(e.target.checked)} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7C3AED", border: "1px solid rgba(255,255,255,0.8)", display: "inline-block" }} />
                        CUPS MT {loadingCups ? "…" : `(${numCupsMT})`}
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
                          { color: "#378ADD", w: 7,  h: 7,  label: "CUPS BT",      radius: "50%" as const },
                          { color: "#7C3AED", w: 7,  h: 7,  label: "CUPS MT",      radius: "50%" as const },
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
                      { color: "#378ADD", w: 7,  h: 7,  label: "CUPS BT",     radius: "50%" as const },
                      { color: "#7C3AED", w: 7,  h: 7,  label: "CUPS MT",     radius: "50%" as const },
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
                  mostrarCupsBT={mostrarCupsBT}
                  mostrarCupsMT={mostrarCupsMT}
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
              {(["lineas", "cups", "celdas", "cts", "tramos"] as const).map(tab => (
                <button key={tab} type="button"
                  onClick={() => {
                    setTablaActiva(tab); setHasLoadedTabla(false);
                    if (tab === "lineas") { setPageLineas(0); cargarTablaLineas(0, pageSizeLineas); }
                    else if (tab === "cups") { setPageCups(0); cargarTablaCups(0, pageSizeCups); }
                    else if (tab === "celdas") { setPageCeldas(0); cargarTablaCeldas(0, pageSizeCeldas); }
                    else if (tab === "cts") { setPageCts(0); cargarTablaCts(0, pageSizeCts); }
                    else { setPageTramos(0); cargarTablaTramos(0, pageSizeTramos); }
                  }}
                  style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer", borderBottom: tablaActiva === tab ? "2px solid var(--primary)" : "2px solid transparent", color: tablaActiva === tab ? "var(--primary)" : "var(--text-muted)" }}>
                  {tab === "lineas" ? `Líneas → CT (${totalLineas.toLocaleString()})` : tab === "cups" ? `CUPS → CT (${totalCups.toLocaleString()})` : tab === "celdas" ? `Celdas (${totalCeldas.toLocaleString()})` : tab === "cts" ? `CTs (${totalCts.toLocaleString()})` : `Tramos (${totalTramos2.toLocaleString()})`}
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
              {tablaActiva !== "celdas" && tablaActiva !== "cts" && (
                <>
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
                </>
              )}
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 28 }}
                onClick={() => {
                  setHasLoadedTabla(false);
                  if (tablaActiva === "lineas") { setPageLineas(0); cargarTablaLineas(0, pageSizeLineas); }
                  else if (tablaActiva === "cups") { setPageCups(0); cargarTablaCups(0, pageSizeCups); }
                  else { setPageCeldas(0); cargarTablaCeldas(0, pageSizeCeldas); }
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
                          {LINEAS_COLS.filter(c => !c.special && tablaLineasCfg[c.cfgKey] !== false).map(c => (
                            <th key={c.cfgKey} style={thStyle}>{c.label}</th>
                          ))}
                          {tablaLineasCfg.ct_asignado !== false && <th style={thStyle}>CT asignado</th>}
                          {tablaLineasCfg.metodo_asignacion !== false && <th style={thStyle}>Método</th>}
                          <th style={thStyle}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineasTabla.map(linea => (
                          <tr key={linea.id_tramo} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            {LINEAS_COLS.filter(c => !c.special && tablaLineasCfg[c.cfgKey] !== false).map(c => (
                              <td key={c.cfgKey} style={tdStyle}>{c.render(linea)}</td>
                            ))}
                            {tablaLineasCfg.ct_asignado !== false && <td style={tdStyle}>
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
                            </td>}
                            {tablaLineasCfg.metodo_asignacion !== false && <td style={tdStyle}><BadgeMetodo metodo={linea.metodo_asignacion_ct} /></td>}
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
                          {CUPS_COLS.filter(c => !c.special && tablaCupsCfg[c.cfgKey] !== false).map(c => (
                            <th key={c.cfgKey} style={thStyle}>{c.label}</th>
                          ))}
                          {tablaCupsCfg.ct_asignado !== false && <th style={thStyle}>CT asignado</th>}
                          {tablaCupsCfg.metodo_asignacion !== false && <th style={thStyle}>Método</th>}
                          {tablaCupsCfg.fase !== false && <th style={thStyle}>Fase</th>}
                          <th style={thStyle}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cupsTabla.map(c => (
                          <tr key={c.cups} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            {CUPS_COLS.filter(col => !col.special && tablaCupsCfg[col.cfgKey] !== false).map(col => (
                              <td key={col.cfgKey} style={tdStyle}>{col.render(c)}</td>
                            ))}
                            {tablaCupsCfg.ct_asignado !== false && <td style={tdStyle}>
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
                            </td>}
                            {tablaCupsCfg.metodo_asignacion !== false && <td style={tdStyle}><BadgeMetodo metodo={c.metodo_asignacion_ct} /></td>}
                            {tablaCupsCfg.fase !== false && <td style={tdStyle}>
                              {editandoFase === c.cups ? (
                                <select className="ui-select" style={{ fontSize: 10, height: 24, minWidth: 80 }} value={editFaseValor} onChange={e => setEditFaseValor(e.target.value)}>
                                  <option value="">— —</option>
                                  <option value="R">R</option><option value="S">S</option><option value="T">T</option><option value="RST">RST</option>
                                </select>
                              ) : (
                                <BadgeFase fase={c.fase} />
                              )}
                            </td>}
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

            {/* ── Tabla Celdas ── */}
            {tablaActiva === "celdas" && (
              <div style={{ overflowX: "auto" }}>
                {!hasLoadedTabla && loadingTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Cargando...</div>
                ) : celdasTabla.length === 0 && hasLoadedTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Sin resultados</div>
                ) : celdasTabla.length > 0 ? (
                  <div ref={tablaCeldasRef} style={{ position: "relative", opacity: loadingTabla ? 0.45 : 1, transition: "opacity 0.18s ease", minHeight: minHCeldas }}>
                    {loadingTabla && <TableLoadingOverlay />}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                          {CELDAS_COLS.filter(c => tablaCeldasCfg[c.cfgKey] !== false).map(c => (
                            <th key={c.cfgKey} style={thStyle}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {celdasTabla.map(c => (
                          <tr key={c.id_celda} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            {CELDAS_COLS.filter(col => tablaCeldasCfg[col.cfgKey] !== false).map(col => (
                              <td key={col.cfgKey} style={tdStyle}>{col.render(c)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePaginationFooter
                      loading={loadingTabla} hasLoadedOnce={hasLoadedTabla}
                      totalFilas={totalCeldas} startIndex={startCeldas - 1} endIndex={endCeldas}
                      pageSize={pageSizeCeldas}
                      setPageSize={v => { setPageSizeCeldas(v); setPageCeldas(0); }}
                      currentPage={pageCeldas} totalPages={totalPagCeldas}
                      setPage={p => setPageCeldas(p)}
                      compact />
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Tabla CTs ── */}
            {tablaActiva === "cts" && (
              <div style={{ overflowX: "auto" }}>
                {!hasLoadedTabla && loadingTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Cargando...</div>
                ) : ctsTabla.length === 0 && hasLoadedTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Sin resultados</div>
                ) : ctsTabla.length > 0 ? (
                  <div ref={tablaCtsRef} style={{ position: "relative", opacity: loadingTabla ? 0.45 : 1, transition: "opacity 0.18s ease", minHeight: minHCts }}>
                    {loadingTabla && <TableLoadingOverlay />}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                          {CTS_COLS.filter(c => tablaCtsCfg[c.cfgKey] !== false).map(c => (
                            <th key={c.cfgKey} style={thStyle}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ctsTabla.map(ct => (
                          <tr key={ct.id_ct} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            {CTS_COLS.filter(col => tablaCtsCfg[col.cfgKey] !== false).map(col => (
                              <td key={col.cfgKey} style={tdStyle}>{col.render(ct)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePaginationFooter
                      loading={loadingTabla} hasLoadedOnce={hasLoadedTabla}
                      totalFilas={totalCts} startIndex={startCts - 1} endIndex={endCts}
                      pageSize={pageSizeCts}
                      setPageSize={v => { setPageSizeCts(v); setPageCts(0); }}
                      currentPage={pageCts} totalPages={totalPagCts}
                      setPage={p => setPageCts(p)}
                      compact />
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Tabla Tramos ── */}
            {tablaActiva === "tramos" && (
              <div style={{ overflowX: "auto" }}>
                {!hasLoadedTabla && loadingTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Cargando...</div>
                ) : tramosTabla.length === 0 && hasLoadedTabla ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0" }}>Sin resultados</div>
                ) : tramosTabla.length > 0 ? (
                  <div ref={tablaTramosRef} style={{ position: "relative", opacity: loadingTabla ? 0.45 : 1, transition: "opacity 0.18s ease", minHeight: minHTramos }}>
                    {loadingTabla && <TableLoadingOverlay />}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                          {TRAMOS_COLS.map(c => (
                            <th key={c.cfgKey} style={thStyle}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tramosTabla.map(t => (
                          <tr key={t.id_tramo} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            {TRAMOS_COLS.map(col => (
                              <td key={col.cfgKey} style={tdStyle}>{col.render(t)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePaginationFooter
                      loading={loadingTabla} hasLoadedOnce={hasLoadedTabla}
                      totalFilas={totalTramos2} startIndex={startTramos - 1} endIndex={endTramos}
                      pageSize={pageSizeTramos}
                      setPageSize={v => { setPageSizeTramos(v); setPageTramos(0); }}
                      currentPage={pageTramos} totalPages={totalPagTramos}
                      setPage={p => setPageTramos(p)}
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