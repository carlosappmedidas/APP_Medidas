"use client";

import { useState, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import TablePaginationFooter from "../ui/TablePaginationFooter";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FtpConfig {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  nombre: string | null;
  host: string;
  puerto: number;
  usuario: string;
  directorio_remoto: string;
  carpeta_entrada_general: string | null;
  carpeta_salida: string | null;
  carpeta_salida_general: string | null;
  usar_tls: boolean;
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

interface Props {
  token: string | null;
  configs: FtpConfig[];
  /** Callback opcional cuando se completa una subida — recibe el resultado del backend. */
  onUploadCompleted?: (resultado: { subidos: number; errores: number; ficheros: string[] }) => void;
  /** Callback opcional cuando se completa una descarga (1 o más ficheros). */
  onDownloadCompleted?: () => void;
  /** Título del sub-panel. Por defecto "Explorador FTP". */
  titulo?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ANIOS = [2023, 2024, 2025, 2026];
const MESES = [
  { v: "01", l: "Enero" }, { v: "02", l: "Febrero" }, { v: "03", l: "Marzo" },
  { v: "04", l: "Abril" }, { v: "05", l: "Mayo" }, { v: "06", l: "Junio" },
  { v: "07", l: "Julio" }, { v: "08", l: "Agosto" }, { v: "09", l: "Septiembre" },
  { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// File System Access API tipos mínimos
type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
};
type FileSystemWritableFileStreamLike = {
  write: (data: Blob | ArrayBuffer | string) => Promise<void>;
  close: () => Promise<void>;
};
type FileSystemFileHandleLike = {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
};

async function descargarConDialogo(blob: Blob, nombreSugerido: string): Promise<boolean> {
  const win = window as unknown as {
    showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
  };

  if (typeof win.showSaveFilePicker === "function") {
    try {
      const handle = await win.showSaveFilePicker({ suggestedName: nombreSugerido });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreSugerido;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

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
const IconUpload = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

// ─── Estilos ──────────────────────────────────────────────────────────────────

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

export default function ExploradorFtpPanel({
  token,
  configs,
  onUploadCompleted,
  onDownloadCompleted,
  titulo = "Explorador FTP",
}: Props) {
  const [subOpen, setSubOpen] = useState(false);

  const [explorerConfigId, setExplorerConfigId] = useState<number | "">("");
  const [explorerResult, setExplorerResult]     = useState<ExplorerResult | null>(null);
  const [loadingExplorer, setLoadingExplorer]   = useState(false);
  const [errorExplorer, setErrorExplorer]       = useState<string | null>(null);
  const [selectedFicheros, setSelectedFicheros] = useState<Set<string>>(new Set());
  const [filtroNombre, setFiltroNombre]         = useState("");
  const [filtroMesNum, setFiltroMesNum]         = useState("");
  const [filtroAnioNum, setFiltroAnioNum]       = useState("");
  const [descargando, setDescargando]           = useState(false);
  const [subiendo, setSubiendo]                 = useState(false);
  const [requiereFiltro, setRequiereFiltro]     = useState(false);
  const [pageExplorer, setPageExplorer]         = useState(0);
  const [pageSizeExplorer, setPageSizeExplorer] = useState(20);

  const anioDefault = new Date().getFullYear().toString();
  const filtroMes = filtroMesNum ? `${filtroAnioNum || anioDefault}-${filtroMesNum}` : filtroAnioNum ? filtroAnioNum : "";
  const hayFiltros = filtroNombre.trim() || filtroMes;

  const conexionesActivas = configs.filter(c => c.activo);

  // ¿Estamos en la carpeta de salida? → habilita el botón de subir
  const configActual = explorerConfigId ? configs.find(c => c.id === explorerConfigId) : undefined;
  const carpetaSalida = (configActual?.carpeta_salida || "").trim();
  const estaEnCarpetaSalida = (() => {
    if (!carpetaSalida || !explorerResult) return false;
    const normalizar = (p: string) => p.replace(/\/+$/, "") || "/";
    const salida = normalizar(carpetaSalida);
    const actual = normalizar(explorerResult.path_actual);
    return actual === salida || actual.startsWith(salida + "/");
  })();

  const ficherosPagina = explorerResult
    ? explorerResult.ficheros.slice(pageExplorer * pageSizeExplorer, (pageExplorer + 1) * pageSizeExplorer)
    : [];
  const totalPagesExplorer = explorerResult
    ? Math.ceil(explorerResult.ficheros.length / pageSizeExplorer)
    : 0;

  const tamanoSeleccionados = explorerResult
    ? explorerResult.ficheros.filter(f => selectedFicheros.has(f.nombre)).reduce((a, f) => a + f.tamanio, 0)
    : 0;
  const todosEnPaginaSeleccionados = ficherosPagina.length > 0 && ficherosPagina.every(f => selectedFicheros.has(f.nombre));

  // ── Acciones explorador ────────────────────────────────────────────────────
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

  // ── Descarga individual ────────────────────────────────────────────────────
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
      await descargarConDialogo(blob, fichero);
      onDownloadCompleted?.();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error descargando fichero");
    }
  };

  // ── Descarga múltiple (1 fichero o ZIP) ────────────────────────────────────
  const handleDescargar = async () => {
    if (!token || !explorerConfigId || selectedFicheros.size === 0 || !explorerResult) return;

    const ficherosArr = Array.from(selectedFicheros);
    const esZip = ficherosArr.length > 1;

    const config = configs.find(c => c.id === explorerConfigId);
    const empresa = (config?.empresa_nombre || "ficheros").replace(/[^\w\-]/g, "_");
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const nombreSugerido = esZip ? `ficheros_${empresa}_${fechaHoy}.zip` : ficherosArr[0];

    // PASO 1: pedir destino ANTES del fetch (para diálogo instantáneo)
    const win = window as unknown as {
      showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
    };
    let fileHandle: FileSystemFileHandleLike | null = null;
    if (typeof win.showSaveFilePicker === "function") {
      try {
        fileHandle = await win.showSaveFilePicker({ suggestedName: nombreSugerido });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    setDescargando(true); setErrorExplorer(null);
    try {
      // PASO 2: fetch (servidor en paralelo si fuera necesario, aquí solo PC)
      let promesaPC: Promise<Response>;
      if (esZip) {
        promesaPC = fetch(`${API_BASE_URL}/ftp/descargar-zip/${explorerConfigId}?registrar=true`, {
          method: "POST",
          headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({
            path: explorerResult.path_actual,
            ficheros: ficherosArr,
            nombre_zip: nombreSugerido,
          }),
        });
      } else {
        const params = new URLSearchParams({
          path: explorerResult.path_actual,
          fichero: ficherosArr[0],
        });
        promesaPC = fetch(
          `${API_BASE_URL}/ftp/descargar-archivo/${explorerConfigId}?${params}`,
          { headers: getAuthHeaders(token) }
        );
      }

      let copiadosAlPC = 0;
      const resPC = await promesaPC;
      if (!resPC.ok) throw new Error(`Error ${resPC.status}`);
      const blob = await resPC.blob();
      if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          copiadosAlPC = ficherosArr.length;
        } catch { /* fallido pero seguimos */ }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreSugerido;
        a.click();
        URL.revokeObjectURL(url);
        copiadosAlPC = ficherosArr.length;
      }

      alert(`${copiadosAlPC} fichero(s) descargados al PC.`);
      setSelectedFicheros(new Set());
      onDownloadCompleted?.();
    } catch (e: unknown) {
      setErrorExplorer(e instanceof Error ? e.message : "Error descargando");
    } finally { setDescargando(false); }
  };

  // ── Subida ─────────────────────────────────────────────────────────────────
  const handleSubirFicheros = async () => {
    if (!token || !explorerConfigId || !explorerResult || !estaEnCarpetaSalida) return;

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    const ficheros: FileList | null = await new Promise((resolve) => {
      input.addEventListener("change", () => resolve(input.files), { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
      input.click();
    });

    document.body.removeChild(input);
    if (!ficheros || ficheros.length === 0) return;

    // ── Detectar AGRECL en el lote ────────────────────────────────────────
    // Los AGRECL no llevan periodo en el nombre, así que el usuario tiene
    // que decirnos a qué M (M1/M2/M7) pertenecen para clasificarlos en
    // el histórico de envíos. Una sola pregunta para todo el lote.
    const nombresLote: string[] = [];
    for (let i = 0; i < ficheros.length; i++) nombresLote.push(ficheros[i].name);
    const tieneAgrecl = nombresLote.some(n => n.toUpperCase().startsWith("AGRECL_"));

    let mParaAgrecl: string | null = null;
    if (tieneAgrecl) {
      const respuesta = window.prompt(
        "Has incluido ficheros AGRECL en el lote.\n\n" +
        "¿A qué M pertenecen? Escribe M1, M2 o M7:",
        "M2"
      );
      if (respuesta === null) {
        // Usuario canceló → abortar todo el envío
        return;
      }
      const limpio = respuesta.trim().toUpperCase();
      if (limpio !== "M1" && limpio !== "M2" && limpio !== "M7") {
        alert(`"${respuesta}" no es un M válido. Debe ser M1, M2 o M7. Subida cancelada.`);
        return;
      }
      mParaAgrecl = limpio;
    }

    setSubiendo(true);
    setErrorExplorer(null);
    try {
      const formData = new FormData();
      const nombresSubidos: string[] = [];
      for (let i = 0; i < ficheros.length; i++) {
        formData.append("ficheros", ficheros[i]);
        nombresSubidos.push(ficheros[i].name);
      }
      const params = new URLSearchParams({ path: explorerResult.path_actual });
      if (mParaAgrecl) params.set("m_para_agrecl", mParaAgrecl);
      const res = await fetch(
        `${API_BASE_URL}/ftp/subir-archivo/${explorerConfigId}?${params}`,
        {
          method: "POST",
          headers: getAuthHeaders(token),
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const data = await res.json();
      alert(`${data.subidos ?? 0} fichero(s) subidos al SFTP, ${data.errores ?? 0} con errores.`);

      // Notificar al padre con los nombres subidos por si quiere registrar en otro sitio
      onUploadCompleted?.({
        subidos: data.subidos ?? 0,
        errores: data.errores ?? 0,
        ficheros: nombresSubidos,
      });

      // Recargar el listado para que se vean los nuevos
      explorarPath(explorerResult.path_actual, filtroNombre, filtroMes);
    } catch (e: unknown) {
      setErrorExplorer(e instanceof Error ? e.message : "Error subiendo ficheros");
    } finally {
      setSubiendo(false);
    }
  };

  const toggleFichero = (nombre: string) => {
    setSelectedFicheros(prev => {
      const s = new Set(prev);
      if (s.has(nombre)) s.delete(nombre); else s.add(nombre);
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

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={subPanelStyle}>
      <div style={subPanelHeaderStyle} onClick={() => setSubOpen(v => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{titulo}</span>
          {explorerResult && <span className="ui-badge ui-badge--neutral">{explorerResult.ficheros.length} ficheros</span>}
          {selectedFicheros.size > 0 && <span className="ui-badge ui-badge--ok">{selectedFicheros.size} seleccionados · {fmtSizeTotal(tamanoSeleccionados)}</span>}
        </div>
        <span style={{ color: "var(--text-muted)" }}>{subOpen ? <IconChevronUp /> : <IconChevronDown />}</span>
      </div>
      {subOpen && (
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
            {estaEnCarpetaSalida && (
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ height: 30, display: "flex", alignItems: "center", gap: 5, marginLeft: selectedFicheros.size > 0 ? undefined : "auto" }}
                onClick={handleSubirFicheros} disabled={subiendo}
                title="Subir ficheros del PC a esta carpeta del SFTP">
                <IconUpload /> {subiendo ? "Subiendo..." : "Subir ficheros"}
              </button>
            )}
            {selectedFicheros.size > 0 && (
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ height: 30, display: "flex", alignItems: "center", gap: 5, marginLeft: estaEnCarpetaSalida ? undefined : "auto" }}
                onClick={handleDescargar} disabled={descargando}
                title="Descarga al PC y registra en historial">
                <IconDownload /> {descargando ? "Descargando..." : `Descargar (${selectedFicheros.size}) · ${fmtSizeTotal(tamanoSeleccionados)}`}
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
  );
}