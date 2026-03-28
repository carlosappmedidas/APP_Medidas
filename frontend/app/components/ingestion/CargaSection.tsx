"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import TablePaginationFooter from "../ui/TablePaginationFooter";
import type { Empresa, IngestionFile, IngestionWarningItem } from "../../types";

type Props = { token: string | null };

const EXPECTED_TYPES = [
  "BALD", "M1", "M1_AUTOCONSUMO", "ACUMCIL",
  "ACUM_H2_GRD", "ACUM_H2_GEN", "ACUM_H2_RDD_P1", "ACUM_H2_RDD_P2", "PS",
];
const STATUS_OPTIONS = ["pending", "processing", "ok", "error"] as const;
const PLANTILLAS = [
  { label: "M1 – Facturación",  file: "XXXX_XXXX_Facturacion.xlsm" },
  { label: "M1 – Autoconsumos", file: "XXXX_XXXXXX_autoconsumos.xlsx" },
  { label: "PS",                 file: "PS_XXXX_XXXXXX.xlsx" },
] as const;

type SessionLogFilter = "all" | "warnings" | "errors" | "ok" | "omitted";

function inferTipoFromFilename(filename: string): string | null {
  const name = filename.toUpperCase();
  if (name.startsWith("PS_")) return "PS";
  if (name.startsWith("BALD_")) return "BALD";
  if (name.includes("M1_AUTOCONSUMO") || name.includes("AUTOCONSUMO")) return "M1_AUTOCONSUMO";
  if (name.includes("FACTURACION") || name.includes("_M1")) return "M1";
  if (name.startsWith("ACUMCIL") || name.includes("ACUMCIL")) return "ACUMCIL";
  if (name.includes("ACUM_H2_GRD")) return "ACUM_H2_GRD";
  if (name.includes("ACUM_H2_GEN")) return "ACUM_H2_GEN";
  if (name.includes("ACUM_H2_RDD") && name.includes("_P1_")) return "ACUM_H2_RDD_P1";
  if (name.includes("ACUM_H2_RDD") && name.includes("_P2_")) return "ACUM_H2_RDD_P2";
  return null;
}

function extractCodigoFromFilename(tipo: string, filename: string): string | null {
  const stem  = filename.replace(/\.[^/.]+$/, "");
  const name  = stem.replace(/^\d{10,}_/, "");
  const parts = name.split("_");
  const t     = tipo.toUpperCase();
  try {
    if (t === "PS") return parts[1] ?? null;
    if (t === "M1" || t === "M1_AUTOCONSUMO") return parts[0] ?? null;
    if (t === "BALD") return parts[1] ?? null;
    if (t === "ACUMCIL") return parts[2] ?? null;
    if (t === "ACUM_H2_RDD_P1" || t === "ACUM_H2_RDD_P2") return parts[3] ?? null;
    if (t === "ACUM_H2_GRD" || t === "ACUM_H2_GEN") return parts[3] ?? null;
  } catch { return null; }
  return null;
}

function fmtPeriodo(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function fmtDateMadrid(value?: string | null) {
  if (!value) return "-";
  const clean = value.replace(/\+[\d:]+$/, "").replace(/Z$/, "");
  const d = new Date(clean + "Z");
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const s = (status || "").toLowerCase();
  if (s === "ok")         return { background: "rgba(5,150,105,0.2)",   color: "#6ee7b7", border: "1px solid rgba(5,150,105,0.3)" };
  if (s === "error")      return { background: "rgba(220,38,38,0.2)",   color: "#fca5a5", border: "1px solid rgba(220,38,38,0.3)" };
  if (s === "processing") return { background: "rgba(245,158,11,0.2)",  color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" };
  return { background: "rgba(255,255,255,0.06)", color: "rgba(226,232,240,0.5)", border: "1px solid rgba(255,255,255,0.1)" };
}

function formatWarningItem(item: IngestionWarningItem): string {
  if (typeof item === "string") return item;
  const type = (item.type || item.code || "").toString().trim();
  const msg  = (item.message || "").toString().trim();
  const parts: string[] = [];
  if (type) parts.push(`[${type}]`);
  if (msg)  parts.push(msg);
  if (item.periodo && typeof item.periodo === "string") parts.push(`(periodo ${item.periodo})`);
  if (typeof item.anio === "number" && typeof item.mes === "number")
    parts.push(`(periodo ${item.anio}-${String(item.mes).padStart(2, "0")})`);
  if (typeof item.energia_kwh === "number") parts.push(`energia=${item.energia_kwh}`);
  if (item.fecha_final) parts.push(`fecha_final=${item.fecha_final}`);
  return parts.join(" ").trim() || JSON.stringify(item);
}

async function extractErrorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j?.detail === "string") return j.detail;
    return JSON.stringify(j);
  } catch {
    try { return await res.text() || ""; } catch { return ""; }
  }
}

// ── Estilos inline compartidos ─────────────────────────────────────
const cardBorder = "1px solid var(--card-border)";
const cardBg     = "var(--card-bg)";

const S = {
  // Botón de acción base — Elegir archivos, Limpiar logs, ↓ Logs
  actionBtn: {
    fontSize: 11, padding: "5px 13px", borderRadius: 8,
    cursor: "pointer", whiteSpace: "nowrap" as const,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(0,0,0,0.2)", color: "var(--text)",
    height: 30, display: "flex", alignItems: "center", gap: 4,
  } as React.CSSProperties,
  // Botón verde — Subir y procesar
  actionBtnGreen: {
    fontSize: 11, padding: "5px 13px", borderRadius: 8,
    cursor: "pointer", whiteSpace: "nowrap" as const,
    border: "1px solid #059669", background: "#059669", color: "#fff",
    height: 30, display: "flex", alignItems: "center",
  } as React.CSSProperties,
  disabled: { opacity: 0.45, cursor: "not-allowed" } as React.CSSProperties,
  // Icono pequeño (↻ ⨯ ↙)
  iconBtn: {
    width: 28, height: 28, borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(0,0,0,0.2)", color: "rgba(226,232,240,0.7)",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 13, flexShrink: 0,
  } as React.CSSProperties,
  iconBtnBlue: {
    width: 28, height: 28, borderRadius: 8,
    border: "1px solid rgba(37,99,235,0.4)",
    background: "rgba(37,99,235,0.15)", color: "#93c5fd",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 13, flexShrink: 0,
  } as React.CSSProperties,
  lbl: {
    fontSize: 10, textTransform: "uppercase" as const,
    letterSpacing: "0.05em", color: "rgba(226,232,240,0.55)",
    display: "block", marginBottom: 3,
  } as React.CSSProperties,
  sel: {
    fontSize: 11, padding: "5px 8px",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
    background: "rgba(0,0,0,0.4)", color: "var(--text)",
  } as React.CSSProperties,
  kpi: {
    background: "rgba(0,0,0,0.2)", border: "1px solid rgba(30,58,95,0.6)",
    borderRadius: 8, padding: "7px 10px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  } as React.CSSProperties,
  logBox: {
    fontSize: 10, fontFamily: "monospace",
    background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8, padding: "10px 12px", minHeight: 90,
    color: "rgba(226,232,240,0.55)", lineHeight: 1.6,
    overflowY: "auto" as const, maxHeight: 200,
  } as React.CSSProperties,
  pill: (status: string) => ({
    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
    ...statusBadgeStyle(status),
  } as React.CSSProperties),
  tblWrap: {
    border: "1px solid rgba(30,58,95,0.8)", borderRadius: 10, overflow: "hidden",
  } as React.CSSProperties,
};

export default function CargaSection({ token }: Props) {
  const [empresas, setEmpresas]               = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId]             = useState<number | null>(null);
  const [files, setFiles]                     = useState<FileList | null>(null);
  const [logLines, setLogLines]               = useState<string[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [mismatchErrors, setMismatchErrors]   = useState<string[]>([]);
  const fileInputRef                          = useRef<HTMLInputElement>(null);
  const [history, setHistory]                 = useState<IngestionFile[]>([]);
  const [historyLoading, setHistoryLoading]   = useState(false);
  const [historyError, setHistoryError]       = useState<string | null>(null);
  const [histHasLoadedOnce, setHistHasLoadedOnce] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<IngestionFile | null>(null);
  const [histEmpresaId, setHistEmpresaId]     = useState<number | "">("");
  const [histTipo, setHistTipo]               = useState<string>("");
  const [histStatus, setHistStatus]           = useState<string>("");
  const [histAnio, setHistAnio]               = useState<number | "">("");
  const [histMes, setHistMes]                 = useState<number | "">("");
  const [histPage, setHistPage]               = useState<number>(0);
  const [histPageSize, setHistPageSize]       = useState<number>(20);
  const [histTotal, setHistTotal]             = useState<number>(0);
  const [histTotalPages, setHistTotalPages]   = useState<number>(1);
  const [plantillaSel, setPlantillaSel]       = useState<string>("");
  const [cargaOpen, setCargaOpen]             = useState<boolean>(false);
  const [historyOpen, setHistoryOpen]         = useState<boolean>(false);
  const historyOpenRef                        = useRef<boolean>(false);
  const [logFilter, setLogFilter]             = useState<SessionLogFilter>("all");
  const canUse = !!token;

  // ── Cargar empresas ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) });
        if (!res.ok) return;
        const json = (await res.json()) as Empresa[];
        setEmpresas(json);
        if (json.length > 0 && empresaId === null) setEmpresaId(json[0].id);
      } catch (err) { console.error("Error cargando empresas:", err); }
    };
    void load();
  }, [token, empresaId]);

  const appendLog = (line: string) =>
    setLogLines((prev) => [...prev, `${new Date().toISOString()} - ${line}`]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    setMismatchErrors([]);
  };

  // ── Descarga logs ────────────────────────────────────────────────
  const handleDownloadLogs = () => {
    if (logLines.length === 0) return;
    const blob = new Blob([logLines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url  = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = `carga_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  // ── Resumen sesión ───────────────────────────────────────────────
  const sessionSummary = useMemo(() => {
    let totalSeleccionados = files?.length ?? 0;
    let subidosOk = 0, erroresSubida = 0, procesadosOk = 0;
    let erroresProcesado = 0, avisos = 0, notas = 0, omitidos = 0, finalizado = false;
    for (const line of logLines) {
      if (line.includes("Iniciando carga de")) {
        const m = line.match(/Iniciando carga de\s+(\d+)\s+fichero/i);
        if (m) totalSeleccionados = Number.parseInt(m[1], 10) || totalSeleccionados;
      }
      if (line.includes("✅ Subido"))              subidosOk      += 1;
      if (line.includes("❌ Error subiendo"))       erroresSubida  += 1;
      if (line.includes("✅ Procesado"))            procesadosOk   += 1;
      if (line.includes("❌ Error procesando"))     erroresProcesado += 1;
      if (line.includes("⚠ Avisos") || line.includes("↳ ⚠")) avisos += 1;
      if (line.includes("ℹ️ Notas")  || line.includes("↳ ℹ️")) notas += 1;
      if (line.includes("Se omite"))               omitidos += 1;
      if (line.includes("✔ Carga y procesado de ficheros finalizados.")) finalizado = true;
    }
    return {
      totalSeleccionados, subidosOk, erroresSubida, procesadosOk,
      erroresProcesado, totalErrores: erroresSubida + erroresProcesado,
      avisos, notas, omitidos, finalizado,
      estado: loading ? "processing" : finalizado ? "done" : logLines.length > 0 ? "idle" : "empty",
    };
  }, [files, logLines, loading]);

  const filteredLogLines = useMemo(() => {
    if (logFilter === "all") return logLines;
    return logLines.filter((line) => {
      if (logFilter === "warnings") return line.includes("⚠ Avisos") || line.includes("↳ ⚠") || line.includes("⚠ Fichero");
      if (logFilter === "errors")   return line.includes("❌") || line.includes("↳ Motivo:");
      if (logFilter === "ok")       return line.includes("✅ Subido") || line.includes("✅ Procesado") || line.includes("✔ Carga");
      if (logFilter === "omitted")  return line.includes("Se omite");
      return true;
    });
  }, [logFilter, logLines]);

  // ── Procesar ficheros ────────────────────────────────────────────
  const handleProcess = async () => {
    if (!token)     { appendLog("No hay token, haz login primero."); return; }
    if (!empresaId) { appendLog("Debes seleccionar una empresa."); return; }
    if (!files || files.length === 0) { appendLog("No has seleccionado ningún fichero."); return; }

    const empresaSeleccionada = empresas.find((e) => e.id === empresaId);
    const codigoReeEmpresa = empresaSeleccionada?.codigo_ree ?? null;
    if (codigoReeEmpresa) {
      const errores: string[] = [];
      for (const file of Array.from(files)) {
        const tipo = inferTipoFromFilename(file.name);
        if (!tipo) continue;
        const codigoFichero = extractCodigoFromFilename(tipo, file.name);
        if (codigoFichero !== null && codigoFichero !== codigoReeEmpresa)
          errores.push(`"${file.name}" → código detectado: ${codigoFichero} (empresa: ${codigoReeEmpresa})`);
      }
      if (errores.length > 0) { setMismatchErrors(errores); return; }
    }

    setMismatchErrors([]);
    setLoading(true);
    appendLog(`Iniciando carga de ${files.length} fichero(s)...`);
    try {
      const uploaded: IngestionFile[] = [];
      for (const file of Array.from(files)) {
        const tipo = inferTipoFromFilename(file.name);
        if (!tipo) {
          appendLog(`⚠ Fichero "${file.name}": no se ha podido inferir el tipo (esperado ${EXPECTED_TYPES.join(" / ")}). Se omite.`);
          continue;
        }
        appendLog(`→ Subiendo "${file.name}" como tipo ${tipo} (empresa ${empresaId})...`);
        const formData = new FormData();
        formData.append("empresa_id", String(empresaId));
        formData.append("tipo", tipo);
        formData.append("file", file);
        const res = await fetch(`${API_BASE_URL}/ingestion/files/upload`, {
          method: "POST", headers: getAuthHeaders(token), body: formData,
        });
        if (!res.ok) {
          const detail = await extractErrorDetail(res);
          appendLog(`❌ Error subiendo "${file.name}": ${res.status} ${res.statusText}${detail ? ` · ${detail}` : ""}`);
          continue;
        }
        const json = (await res.json()) as IngestionFile;
        uploaded.push(json);
        appendLog(`✅ Subido "${file.name}" (id=${json.id}, periodo=${json.anio}${String(json.mes).padStart(2, "0")}, tipo=${json.tipo}).`);
      }
      for (const ing of uploaded) {
        appendLog(`⚙ Procesando id=${ing.id} (${ing.filename}, tipo=${ing.tipo})...`);
        const res = await fetch(`${API_BASE_URL}/ingestion/files/${ing.id}/process`, {
          method: "POST", headers: getAuthHeaders(token),
        });
        if (!res.ok) {
          const detail = await extractErrorDetail(res);
          appendLog(`❌ Error procesando id=${ing.id}: ${res.status} ${res.statusText}${detail ? ` · ${detail}` : ""}`);
          continue;
        }
        const json = (await res.json()) as IngestionFile;
        appendLog(`✅ Procesado id=${json.id} (status=${json.status}, filas OK=${json.rows_ok ?? 0}, error=${json.rows_error ?? 0}).`);
        const warnings = Array.isArray((json as any).warnings) ? ((json as any).warnings as IngestionWarningItem[]) : [];
        const notices  = Array.isArray((json as any).notices)  ? ((json as any).notices  as IngestionWarningItem[]) : [];
        if (warnings.length > 0) { appendLog(`⚠ Avisos (${warnings.length}):`); for (const w of warnings) appendLog(`↳ ⚠ ${formatWarningItem(w)}`); }
        if (notices.length  > 0) { appendLog(`ℹ️ Notas (${notices.length}):`);   for (const n of notices)  appendLog(`↳ ℹ️ ${formatWarningItem(n)}`); }
        const wm = (json as any).warnings_message ?? "";
        if (wm) appendLog(`⚠ Avisos: ${wm}`);
        if ((json.status || "").toLowerCase() === "error")
          appendLog(`↳ Motivo: ${json.error_message ?? "(sin detalle)"}`);
      }
      appendLog("✔ Carga y procesado de ficheros finalizados.");
      setFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (historyOpenRef.current) { setHistPage(0); void handleLoadHistory(0); }
    } catch (err) {
      appendLog(`❌ Error general: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const empresaLabelById = (id: number) => {
    const e = empresas.find((x) => x.id === id);
    return e ? `${e.id} – ${e.nombre}` : String(id);
  };

  // ── Cargar histórico ─────────────────────────────────────────────
  const handleLoadHistory = async (targetPage?: number) => {
    if (!token) { setHistoryError("Haz login para poder cargar el histórico."); setHistory([]); setSelectedHistory(null); return; }
    const pageToLoad = targetPage ?? histPage;
    setHistoryLoading(true); setHistoryError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("page_size", String(histPageSize));
      if (histEmpresaId !== "") params.set("empresa_id", String(histEmpresaId));
      if (histTipo.trim() !== "") params.set("tipo", histTipo.trim());
      if (histStatus.trim() !== "") params.set("status_", histStatus.trim());
      if (histAnio !== "") params.set("anio", String(histAnio));
      if (histMes  !== "") params.set("mes",  String(histMes));
      const res = await fetch(`${API_BASE_URL}/ingestion/files/page?${params.toString()}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json() as { items: IngestionFile[]; page: number; page_size: number; total: number; total_pages: number };
      setHistory(Array.isArray(json?.items) ? json.items : []);
      setHistTotal(typeof json?.total === "number" ? json.total : 0);
      setHistTotalPages(typeof json?.total_pages === "number" ? json.total_pages : 1);
      setHistHasLoadedOnce(true);
      setSelectedHistory((prev) => prev ? (json.items.find((x) => x.id === prev.id) ?? null) : null);
    } catch {
      setHistoryError("No se pudo cargar el histórico de cargas.");
      setHistory([]); setHistTotal(0); setHistTotalPages(1); setHistHasLoadedOnce(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!histHasLoadedOnce) return;
    void handleLoadHistory(histPage);
  }, [histPage, histPageSize]);

  const handleClearHistoryFilters = () => {
    setHistEmpresaId(""); setHistTipo(""); setHistStatus("");
    setHistAnio(""); setHistMes(""); setHistPage(0);
  };

  const handleDownloadPlantilla = (fileName: string) =>
    window.open(`${API_BASE_URL}/plantillas/${encodeURIComponent(fileName)}`, "_blank", "noopener,noreferrer");

  const countAvisos = (h: IngestionFile) => {
    const w = Array.isArray((h as any).warnings) ? ((h as any).warnings as unknown[]).length : 0;
    const n = Array.isArray((h as any).notices)  ? ((h as any).notices  as unknown[]).length : 0;
    const m = (h as any).warnings_message ? 1 : 0;
    return w + n + m;
  };

  const selectedWarnings = useMemo(() =>
    Array.isArray((selectedHistory as any)?.warnings) ? ((selectedHistory as any).warnings as IngestionWarningItem[]) : [],
  [selectedHistory]);

  const selectedNotices = useMemo(() =>
    Array.isArray((selectedHistory as any)?.notices)  ? ((selectedHistory as any).notices  as IngestionWarningItem[]) : [],
  [selectedHistory]);

  const histStartIndex  = histTotal === 0 ? 0 : histPage * histPageSize;
  const histEndIndex    = Math.min(histStartIndex + histPageSize, histTotal);
  const histCurrentPage = Math.min(histPage, Math.max(0, histTotalPages - 1));

  // ── Log filter pill ───────────────────────────────────────────────
  const LogPill = ({ f, label }: { f: SessionLogFilter; label: string }) => (
    <button
      type="button"
      onClick={() => setLogFilter(f)}
      style={{
        fontSize: 10, padding: "2px 7px", borderRadius: 20, cursor: "pointer",
        border: logFilter === f ? "1px solid rgba(37,99,235,0.4)" : "1px solid rgba(255,255,255,0.12)",
        background: logFilter === f ? "rgba(37,99,235,0.25)" : "transparent",
        color: logFilter === f ? "#93c5fd" : "rgba(226,232,240,0.5)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ══════════════════════════════════════════════════════════
          TARJETA 1 — CARGA DE FICHEROS
          Header idéntico al CollapsibleCard: button full-width +
          span.ui-btn.ui-btn-ghost.ui-btn-xs para Mostrar/Ocultar
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--card-border)", background: cardBg }}
      >
        <button
          type="button"
          onClick={() => setCargaOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        >
          <div>
            <div className="ui-card-title text-base md:text-lg">CARGA DE FICHEROS</div>
            <p className="ui-card-subtitle mt-1">
              Sube ficheros BALD, M1, ACUM*, PS_*, etc. El tipo se infiere del nombre.
            </p>
          </div>
          <span className="ui-btn ui-btn-ghost ui-btn-xs">
            {cargaOpen ? "Ocultar" : "Mostrar"}
          </span>
        </button>

        {cargaOpen && (
          <div className="px-4 pb-4">

            {/* Alerta mismatch */}
            {mismatchErrors.length > 0 && (
              <div className="ui-alert ui-alert--danger mb-4">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  ⛔ Carga cancelada — los siguientes ficheros no pertenecen a la empresa seleccionada:
                </div>
                <ul style={{ marginTop: 4, fontSize: 11, fontFamily: "monospace" }}>
                  {mismatchErrors.map((err, idx) => <li key={idx}>• {err}</li>)}
                </ul>
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  Selecciona la empresa correcta o sube los ficheros correspondientes a esta empresa.
                </div>
                <button type="button" className="ui-btn ui-btn-outline ui-btn-xs mt-2" onClick={() => setMismatchErrors([])}>
                  Cerrar aviso
                </button>
              </div>
            )}

            {/* Input file oculto */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ display: "none" }}
              disabled={!canUse || loading}
            />

            {/* Tira: empresa + plantilla + spacer + 4 botones */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={S.lbl}>Empresa</span>
                <select
                  style={S.sel}
                  value={empresaId ?? ""}
                  disabled={!canUse || loading}
                  onChange={(e) => {
                    setEmpresaId(e.target.value ? Number.parseInt(e.target.value, 10) : null);
                    setMismatchErrors([]);
                  }}
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.id} – {e.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={S.lbl}>Plantilla</span>
                <select
                  style={{ ...S.sel, minWidth: 150 }}
                  value={plantillaSel}
                  disabled={!canUse}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPlantillaSel(v);
                    if (v) { handleDownloadPlantilla(v); setTimeout(() => setPlantillaSel(""), 0); }
                  }}
                >
                  <option value="">Seleccionar…</option>
                  {PLANTILLAS.map((p) => <option key={p.file} value={p.file}>{p.label}</option>)}
                </select>
              </div>

              {/* fichero seleccionado */}
              {files && files.length > 0 && (
                <div style={{ alignSelf: "flex-end", fontSize: 10, color: "rgba(226,232,240,0.45)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingBottom: 6 }}>
                  {files.length === 1 ? files[0].name : `${files.length} ficheros`}
                </div>
              )}

              <div style={{ flex: 1 }} />

              {/* 4 botones en línea — mismo estilo base */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <span style={{ ...S.lbl, visibility: "hidden" }}>x</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canUse || loading}
                    style={{ ...S.actionBtn, ...((!canUse || loading) ? S.disabled : {}) }}
                  >
                    Elegir archivos
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLogLines([]); setLogFilter("all"); }}
                    disabled={logLines.length === 0}
                    style={{ ...S.actionBtn, ...(logLines.length === 0 ? S.disabled : {}) }}
                  >
                    Limpiar logs
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadLogs}
                    disabled={logLines.length === 0}
                    title="Descargar logs como fichero .txt"
                    style={{ ...S.actionBtn, ...(logLines.length === 0 ? S.disabled : {}) }}
                  >
                    ↓ Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleProcess()}
                    disabled={!canUse || loading}
                    style={{ ...S.actionBtnGreen, ...((!canUse || loading) ? S.disabled : {}) }}
                  >
                    {loading ? "Procesando…" : "Subir y procesar"}
                  </button>
                </div>
              </div>
            </div>

            {/* KPIs + Log lado a lado */}
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>

              {/* KPIs verticales */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ ...S.lbl, marginBottom: 3 }}>Resumen sesión</span>
                {[
                  { label: "Total",    val: sessionSummary.totalSeleccionados, color: "var(--text)" },
                  { label: "OK",       val: sessionSummary.procesadosOk,       color: "#34d399" },
                  { label: "Errores",  val: sessionSummary.totalErrores,       color: "#fca5a5" },
                  { label: "Avisos",   val: sessionSummary.avisos,             color: "#fbbf24" },
                  { label: "Omitidos", val: sessionSummary.omitidos,           color: "rgba(226,232,240,0.4)" },
                  { label: "Notas",    val: sessionSummary.notas,              color: "rgba(226,232,240,0.4)" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={S.kpi}>
                    <span style={{ fontSize: 10, color: "rgba(226,232,240,0.5)" }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, fontFamily: "monospace", color }}>{val}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: "rgba(226,232,240,0.3)", marginTop: 2 }}>
                  {sessionSummary.estado === "processing" ? "Procesando…"
                    : sessionSummary.estado === "done"    ? "Completado"
                    : sessionSummary.estado === "idle"    ? "Listo"
                    : "Sin actividad"}
                </div>
              </div>

              {/* Log */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>Logs sesión actual</span>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    <LogPill f="all"      label="Todos" />
                    <LogPill f="ok"       label="OK" />
                    <LogPill f="warnings" label="Avisos" />
                    <LogPill f="errors"   label="Errores" />
                    <LogPill f="omitted"  label="Omitidos" />
                  </div>
                </div>
                <div style={S.logBox}>
                  {logLines.length === 0 ? (
                    <span style={{ color: "rgba(226,232,240,0.35)" }}>Aquí aparecerán los logs de subida y procesado.</span>
                  ) : filteredLogLines.length === 0 ? (
                    <span style={{ color: "rgba(226,232,240,0.35)" }}>No hay líneas para el filtro seleccionado.</span>
                  ) : (
                    <ul style={{ listStyle: "none" }}>
                      {filteredLogLines.map((line, idx) => <li key={`${logFilter}-${idx}`}>• {line}</li>)}
                    </ul>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "rgba(226,232,240,0.25)", marginTop: 5 }}>
                  Con la normativa (±3 días + refacturas), aquí verás avisos tipo "mes no existente" o "refactura detectada", pero la carga NO se bloqueará.
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TARJETA 2 — HISTÓRICO DE CARGAS
          Mismo patrón de header que CollapsibleCard
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--card-border)", background: cardBg }}
      >
        <button
          type="button"
          onClick={() => {
            const next = !historyOpen;
            historyOpenRef.current = next;
            setHistoryOpen(next);
          }}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        >
          <div>
            <div className="ui-card-title text-base md:text-lg">HISTÓRICO DE CARGAS</div>
            <p className="ui-card-subtitle mt-1">
              Listado de cargas (ingestion_files) del tenant. Fechas en horario de Madrid.
            </p>
          </div>
          <span className="ui-btn ui-btn-ghost ui-btn-xs">
            {historyOpen ? "Ocultar" : "Mostrar"}
          </span>
        </button>

        {historyOpen && (
          <div className="px-4 pb-4">

            {/* Barra: total + iconos encima de filtros */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "rgba(226,232,240,0.4)" }}>
                Total:{" "}
                <span style={{ color: "var(--text)", fontWeight: 500 }}>{histTotal}</span>
                {" "}registros
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  title="Limpiar filtros"
                  onClick={handleClearHistoryFilters}
                  style={S.iconBtn}
                >
                  ⨯
                </button>
                <button
                  type="button"
                  title="Cargar histórico"
                  onClick={() => { setHistPage(0); void handleLoadHistory(0); }}
                  disabled={!canUse || historyLoading}
                  style={{ ...S.iconBtnBlue, ...((!canUse || historyLoading) ? S.disabled : {}) }}
                >
                  ↻
                </button>
                <button
                  type="button"
                  title="Cerrar detalle"
                  onClick={() => setSelectedHistory(null)}
                  disabled={!selectedHistory}
                  style={{ ...S.iconBtn, ...(!selectedHistory ? S.disabled : {}) }}
                >
                  ↙
                </button>
              </div>
            </div>

            {/* Filtros */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Empresa", value: String(histEmpresaId), onChange: (v: string) => setHistEmpresaId(v ? Number.parseInt(v, 10) : ""), options: [{ value: "", label: "(todas)" }, ...empresas.map((e) => ({ value: String(e.id), label: `${e.id} – ${e.nombre}` }))] },
                { label: "Tipo",    value: histTipo,              onChange: (v: string) => setHistTipo(v),                                    options: [{ value: "", label: "(todos)" }, ...EXPECTED_TYPES.map((t) => ({ value: t, label: t }))] },
                { label: "Estado",  value: histStatus,            onChange: (v: string) => setHistStatus(v),                                  options: [{ value: "", label: "(todos)" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s }))] },
                { label: "Año",     value: String(histAnio),      onChange: (v: string) => setHistAnio(v ? Number.parseInt(v, 10) : ""),      options: [{ value: "", label: "(todos)" }, ...Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => ({ value: String(y), label: String(y) }))] },
                { label: "Mes",     value: String(histMes),       onChange: (v: string) => setHistMes(v ? Number.parseInt(v, 10) : ""),       options: [{ value: "", label: "(todos)" }, ...Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({ value: String(m), label: String(m).padStart(2, "0") }))] },
              ].map(({ label, value, onChange, options }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={S.lbl}>{label}</span>
                  <select
                    style={{ ...S.sel, width: "100%" }}
                    value={value}
                    disabled={!canUse || historyLoading}
                    onChange={(e) => onChange(e.target.value)}
                  >
                    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {historyError && <div className="ui-alert ui-alert--danger mb-4">{historyError}</div>}

            {/* Tabla */}
            <div style={S.tblWrap}>
              <table className="ui-table text-[11px]" style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {["ID", "Empresa", "Tipo", "Periodo", "Fichero", "Estado", "OK", "Error", "Subido", "Procesado", "Avisos", "Detalle"].map((h) => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 500, color: "rgba(226,232,240,0.55)", letterSpacing: "0.04em", borderBottom: "1px solid rgba(30,58,95,0.5)", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyLoading && Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      {Array.from({ length: 12 }).map((__, j) => (
                        <td key={j} style={{ padding: "7px 10px", borderBottom: "1px solid rgba(30,58,95,0.3)" }}>
                          <span style={{ display: "inline-block", height: 12, width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!historyLoading && history.length === 0 && (
                    <tr>
                      <td colSpan={12} style={{ padding: "12px 10px", color: "rgba(226,232,240,0.4)", fontSize: 11 }}>
                        {histHasLoadedOnce ? "No hay registros con esos filtros." : "Pulsa ↻ para cargar el histórico."}
                      </td>
                    </tr>
                  )}
                  {!historyLoading && history.map((h) => {
                    const avisos     = countAvisos(h);
                    const isSelected = selectedHistory?.id === h.id;
                    return (
                      <tr
                        key={h.id}
                        style={{ borderBottom: "1px solid rgba(30,58,95,0.3)", background: isSelected ? "rgba(30,58,95,0.4)" : "transparent" }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(30,58,95,0.25)"; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", color: "var(--text)" }}>{h.id}</td>
                        <td style={{ padding: "7px 10px", color: "var(--text)" }}>{empresaLabelById(h.empresa_id)}</td>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", color: "var(--text)" }}>{h.tipo}</td>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", color: "var(--text)" }}>{fmtPeriodo(h.anio, h.mes)}</td>
                        <td style={{ padding: "7px 10px", color: "var(--text)" }}>{h.filename}</td>
                        <td style={{ padding: "7px 10px" }}><span style={S.pill(h.status)}>{h.status}</span></td>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "var(--text)" }}>{h.rows_ok ?? 0}</td>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "var(--text)" }}>{h.rows_error ?? 0}</td>
                        <td style={{ padding: "7px 10px", color: "rgba(226,232,240,0.45)", whiteSpace: "nowrap" }}>{fmtDateMadrid(h.created_at)}</td>
                        <td style={{ padding: "7px 10px", color: "rgba(226,232,240,0.45)", whiteSpace: "nowrap" }}>{fmtDateMadrid(h.processed_at)}</td>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: avisos > 0 ? "#fbbf24" : "rgba(226,232,240,0.4)" }}>{avisos}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedHistory(h)}
                            style={{ ...S.actionBtn, fontSize: 10, padding: "3px 9px", height: "auto" }}
                          >
                            {isSelected ? "Abierto" : "Detalle"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: "rgba(226,232,240,0.3)", padding: "8px 12px", borderTop: "1px solid rgba(30,58,95,0.4)" }}>
                El borrado y su vista previa están disponibles en la pestaña Sistema.
              </div>
            </div>

            {/* Paginación */}
            <TablePaginationFooter
              loading={historyLoading}
              hasLoadedOnce={histHasLoadedOnce}
              totalFilas={histTotal}
              startIndex={histStartIndex}
              endIndex={histEndIndex}
              pageSize={histPageSize}
              setPageSize={(size) => { setHistPageSize(size); setHistPage(0); }}
              currentPage={histCurrentPage}
              totalPages={histTotalPages}
              setPage={setHistPage}
              compact
            />

            {/* Detalle seleccionado */}
            {selectedHistory && (
              <div className="ui-card ui-card--border mt-4">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                      Detalle de carga #{selectedHistory.id}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(226,232,240,0.5)", marginTop: 2 }}>
                      {empresaLabelById(selectedHistory.empresa_id)} ·{" "}
                      <span style={{ fontFamily: "monospace" }}>{selectedHistory.tipo}</span> ·{" "}
                      <span style={{ fontFamily: "monospace" }}>{fmtPeriodo(selectedHistory.anio, selectedHistory.mes)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <span style={S.pill(selectedHistory.status)}>{selectedHistory.status}</span>
                    <button type="button" onClick={() => setSelectedHistory(null)} style={{ ...S.actionBtn, fontSize: 10, padding: "3px 9px", height: "auto" }}>
                      Cerrar
                    </button>
                  </div>
                </div>
                <div className="ui-panel text-[11px]">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
                    {[
                      { label: "Fichero",    val: selectedHistory.filename },
                      { label: "Subido",     val: fmtDateMadrid(selectedHistory.created_at) },
                      { label: "Procesado",  val: fmtDateMadrid(selectedHistory.processed_at) },
                      { label: "Filas OK",   val: String(selectedHistory.rows_ok ?? 0) },
                      { label: "Filas Error",val: String(selectedHistory.rows_error ?? 0) },
                      { label: "Error",      val: selectedHistory.error_message ?? "-" },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: "rgba(226,232,240,0.5)", marginBottom: 2 }}>{label}</div>
                        <div style={{ color: label === "Error" && selectedHistory.error_message ? "#fca5a5" : "var(--text)" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: "var(--text)" }}>Avisos / notas</div>
                    {(selectedHistory as any).warnings_message && (
                      <div className="ui-alert ui-alert--warning text-[11px] mb-2">{(selectedHistory as any).warnings_message}</div>
                    )}
                    {selectedWarnings.length === 0 && selectedNotices.length === 0 && !(selectedHistory as any).warnings_message ? (
                      <div style={{ fontSize: 11, color: "rgba(226,232,240,0.4)" }}>Sin avisos.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {selectedWarnings.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: "rgba(226,232,240,0.5)", marginBottom: 4 }}>Warnings ({selectedWarnings.length})</div>
                            <ul style={{ paddingLeft: 16, fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                              {selectedWarnings.map((w, idx) => <li key={`w-${idx}`}>{formatWarningItem(w)}</li>)}
                            </ul>
                          </div>
                        )}
                        {selectedNotices.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: "rgba(226,232,240,0.5)", marginBottom: 4 }}>Notas ({selectedNotices.length})</div>
                            <ul style={{ paddingLeft: 16, fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                              {selectedNotices.map((n, idx) => <li key={`n-${idx}`}>{formatWarningItem(n)}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
}