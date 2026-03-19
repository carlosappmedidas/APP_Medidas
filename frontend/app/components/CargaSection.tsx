"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type {
  Empresa,
  IngestionFile,
  IngestionWarningItem,
} from "../types";

type Props = {
  token: string | null;
};

const EXPECTED_TYPES = [
  "BALD",
  "M1",
  "M1_AUTOCONSUMO",
  "ACUMCIL",
  "ACUM_H2_GRD",
  "ACUM_H2_GEN",
  "ACUM_H2_RDD_P1",
  "ACUM_H2_RDD_P2",
  "PS",
];

const STATUS_OPTIONS = ["pending", "processing", "ok", "error"] as const;

const PLANTILLAS = [
  { label: "M1 – Facturación", file: "XXXX_XXXX_Facturacion.xlsm" },
  { label: "M1 – Autoconsumos", file: "XXXX_XXXXXX_autoconsumos.xlsx" },
  { label: "PS", file: "PS_XXXX_XXXXXX.xlsx" },
] as const;

type SessionLogFilter = "all" | "warnings" | "errors" | "ok" | "omitted";

function inferTipoFromFilename(filename: string): string | null {
  const name = filename.toUpperCase();

  if (name.startsWith("PS_")) return "PS";
  if (name.startsWith("BALD_")) return "BALD";

  if (name.includes("M1_AUTOCONSUMO") || name.includes("AUTOCONSUMO")) {
    return "M1_AUTOCONSUMO";
  }

  if (name.includes("FACTURACION") || name.includes("_M1")) {
    return "M1";
  }

  if (name.startsWith("ACUMCIL") || name.includes("ACUMCIL")) {
    return "ACUMCIL";
  }

  if (name.includes("ACUM_H2_GRD")) return "ACUM_H2_GRD";
  if (name.includes("ACUM_H2_GEN")) return "ACUM_H2_GEN";

  if (name.includes("ACUM_H2_RDD") && name.includes("_P1_")) {
    return "ACUM_H2_RDD_P1";
  }
  if (name.includes("ACUM_H2_RDD") && name.includes("_P2_")) {
    return "ACUM_H2_RDD_P2";
  }

  return null;
}

function fmtPeriodo(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function fmtDateMadrid(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function statusBadgeClass(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "ok") return "ui-badge ui-badge--ok";
  if (s === "error") return "ui-badge ui-badge--err";
  if (s === "processing") return "ui-badge ui-badge--warn";
  return "ui-badge ui-badge--neutral";
}

function formatWarningItem(item: IngestionWarningItem): string {
  if (typeof item === "string") return item;

  const type = (item.type || item.code || "").toString().trim();
  const msg = (item.message || "").toString().trim();

  const parts: string[] = [];
  if (type) parts.push(`[${type}]`);
  if (msg) parts.push(msg);

  if (item.periodo && typeof item.periodo === "string") {
    parts.push(`(periodo ${item.periodo})`);
  }

  if (typeof item.anio === "number" && typeof item.mes === "number") {
    parts.push(`(periodo ${item.anio}-${String(item.mes).padStart(2, "0")})`);
  }

  if (typeof item.energia_kwh === "number") {
    parts.push(`energia=${item.energia_kwh}`);
  }

  if (item.fecha_final) {
    parts.push(`fecha_final=${item.fecha_final}`);
  }

  const out = parts.join(" ").trim();
  return out || JSON.stringify(item);
}

async function extractErrorDetail(res: Response): Promise<string> {
  try {
    const errJson = await res.json();
    if (typeof errJson?.detail === "string") {
      return errJson.detail;
    }
    return JSON.stringify(errJson);
  } catch {
    try {
      const text = await res.text();
      return text || "";
    } catch {
      return "";
    }
  }
}

function InlineAccordion({
  title,
  subtitle,
  open,
  setOpen,
  children,
  contentId,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
  contentId: string;
}) {
  return (
    <section className="ui-card ui-card--border text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-4 flex w-full items-center justify-between gap-6 rounded-2xl px-1 py-1 text-left"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <div className="min-w-0">
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-xs ui-muted">{subtitle}</div> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] ui-muted">{open ? "Ocultar" : "Mostrar"}</span>
          <span
            className={[
              "inline-flex items-center justify-center text-[13px] ui-muted transition-transform",
              open ? "rotate-180" : "rotate-0",
            ].join(" ")}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
      </button>

      {open && <div id={contentId}>{children}</div>}
    </section>
  );
}

export default function CargaSection({ token }: Props) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState<IngestionFile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<IngestionFile | null>(null);

  const [histEmpresaId, setHistEmpresaId] = useState<number | "">("");
  const [histTipo, setHistTipo] = useState<string>("");
  const [histStatus, setHistStatus] = useState<string>("");
  const [histAnio, setHistAnio] = useState<number | "">("");
  const [histMes, setHistMes] = useState<number | "">("");

  const [plantillaSel, setPlantillaSel] = useState<string>("");

  const [cargaOpen, setCargaOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<SessionLogFilter>("all");

  const canUse = !!token;

  useEffect(() => {
    const loadEmpresas = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/empresas/`, {
          headers: getAuthHeaders(token),
        });
        if (!res.ok) return;
        const json = (await res.json()) as Empresa[];
        setEmpresas(json);
        if (json.length > 0 && empresaId === null) setEmpresaId(json[0].id);
      } catch (err) {
        console.error("Error cargando empresas en CargaSection:", err);
      }
    };

    void loadEmpresas();
  }, [token, empresaId]);

  const appendLog = (line: string) => {
    setLogLines((prev) => [...prev, `${new Date().toISOString()} - ${line}`]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
  };

  const sessionSummary = useMemo(() => {
    const totalSeleccionados = files?.length ?? 0;

    let totalIniciados = 0;
    let subidosOk = 0;
    let erroresSubida = 0;
    let procesadosOk = 0;
    let erroresProcesado = 0;
    let avisos = 0;
    let notas = 0;
    let omitidos = 0;
    let finalizado = false;

    for (const line of logLines) {
      if (line.includes("Iniciando carga de")) {
        const m = line.match(/Iniciando carga de\s+(\d+)\s+fichero/i);
        if (m) totalIniciados = Number.parseInt(m[1], 10) || totalIniciados;
      }

      if (line.includes("✅ Subido")) subidosOk += 1;
      if (line.includes("❌ Error subiendo")) erroresSubida += 1;
      if (line.includes("✅ Procesado")) procesadosOk += 1;
      if (line.includes("❌ Error procesando")) erroresProcesado += 1;
      if (line.includes("⚠ Avisos")) avisos += 1;
      if (line.includes("↳ ⚠")) avisos += 1;
      if (line.includes("ℹ️ Notas")) notas += 1;
      if (line.includes("↳ ℹ️")) notas += 1;
      if (line.includes("Se omite")) omitidos += 1;
      if (line.includes("✔ Carga y procesado de ficheros finalizados.")) finalizado = true;
    }

    const totalErrores = erroresSubida + erroresProcesado;
    const estado =
      loading ? "processing" : finalizado ? "done" : logLines.length > 0 ? "idle" : "empty";

    return {
      totalSeleccionados,
      totalIniciados,
      subidosOk,
      erroresSubida,
      procesadosOk,
      erroresProcesado,
      totalErrores,
      avisos,
      notas,
      omitidos,
      finalizado,
      estado,
    };
  }, [files, logLines, loading]);

  const filteredLogLines = useMemo(() => {
    if (logFilter === "all") return logLines;

    return logLines.filter((line) => {
      if (logFilter === "warnings") {
        return line.includes("⚠ Avisos") || line.includes("↳ ⚠") || line.includes("⚠ Fichero");
      }

      if (logFilter === "errors") {
        return line.includes("❌") || line.includes("↳ Motivo:");
      }

      if (logFilter === "ok") {
        return (
          line.includes("✅ Subido") ||
          line.includes("✅ Procesado") ||
          line.includes("✔ Carga y procesado")
        );
      }

      if (logFilter === "omitted") {
        return line.includes("Se omite");
      }

      return true;
    });
  }, [logFilter, logLines]);

  const logFilterLabel = useMemo(() => {
    if (logFilter === "warnings") return "Avisos";
    if (logFilter === "errors") return "Errores";
    if (logFilter === "ok") return "OK";
    if (logFilter === "omitted") return "Omitidos";
    return "Todos";
  }, [logFilter]);

  const activateLogFilter = (filter: SessionLogFilter) => {
    setSummaryOpen(true);
    setLogFilter(filter);
  };

  const handleProcess = async () => {
    if (!token) {
      appendLog("No hay token, haz login primero.");
      return;
    }
    if (!empresaId) {
      appendLog("Debes seleccionar una empresa.");
      return;
    }
    if (!files || files.length === 0) {
      appendLog("No has seleccionado ningún fichero.");
      return;
    }

    setLoading(true);
    appendLog(`Iniciando carga de ${files.length} fichero(s)...`);

    try {
      const uploaded: IngestionFile[] = [];

      for (const file of Array.from(files)) {
        const tipo = inferTipoFromFilename(file.name);

        if (!tipo) {
          appendLog(
            `⚠ Fichero "${file.name}": no se ha podido inferir el tipo (esperado ${EXPECTED_TYPES.join(
              " / "
            )}). Se omite.`
          );
          continue;
        }

        appendLog(`→ Subiendo fichero "${file.name}" como tipo ${tipo} (empresa ${empresaId})...`);

        const formData = new FormData();
        formData.append("empresa_id", String(empresaId));
        formData.append("tipo", tipo);
        formData.append("file", file);

        const res = await fetch(`${API_BASE_URL}/ingestion/files/upload`, {
          method: "POST",
          headers: getAuthHeaders(token),
          body: formData,
        });

        if (!res.ok) {
          const detail = await extractErrorDetail(res);
          appendLog(
            `❌ Error subiendo "${file.name}": ${res.status} ${res.statusText}${detail ? ` · ${detail}` : ""}`
          );
          continue;
        }

        const json = (await res.json()) as IngestionFile;
        uploaded.push(json);

        appendLog(
          `✅ Subido "${file.name}" (id ingestion=${json.id}, periodo=${json.anio}${String(
            json.mes
          ).padStart(2, "0")}, tipo=${json.tipo}).`
        );
      }

      for (const ing of uploaded) {
        appendLog(`⚙ Procesando fichero id=${ing.id} (${ing.filename}, tipo=${ing.tipo})...`);

        const res = await fetch(`${API_BASE_URL}/ingestion/files/${ing.id}/process`, {
          method: "POST",
          headers: getAuthHeaders(token),
        });

        if (!res.ok) {
          const detail = await extractErrorDetail(res);
          appendLog(
            `❌ Error procesando id=${ing.id}: ${res.status} ${res.statusText}${detail ? ` · ${detail}` : ""}`
          );
          continue;
        }

        const json = (await res.json()) as IngestionFile;

        const filasOk = json.rows_ok ?? 0;
        const filasError = json.rows_error ?? 0;

        appendLog(
          `✅ Procesado id=${json.id} (status=${json.status}, filas OK=${filasOk}, filas error=${filasError}).`
        );

        const warnings = Array.isArray((json as IngestionFile & { warnings?: unknown }).warnings)
          ? ((json as IngestionFile & { warnings?: IngestionWarningItem[] }).warnings ?? [])
          : [];

        const notices = Array.isArray((json as IngestionFile & { notices?: unknown }).notices)
          ? ((json as IngestionFile & { notices?: IngestionWarningItem[] }).notices ?? [])
          : [];

        if (warnings.length > 0) {
          appendLog(`⚠ Avisos (${warnings.length}) detectados en el procesado:`);
          for (const w of warnings) appendLog(`↳ ⚠ ${formatWarningItem(w)}`);
        }

        if (notices.length > 0) {
          appendLog(`ℹ️ Notas (${notices.length}) del procesado:`);
          for (const n of notices) appendLog(`↳ ℹ️ ${formatWarningItem(n)}`);
        }

        const warningsMessage =
          (json as IngestionFile & { warnings_message?: string }).warnings_message ?? "";

        if (warningsMessage) {
          appendLog(`⚠ Avisos: ${warningsMessage}`);
        }

        if ((json.status || "").toLowerCase() === "error") {
          appendLog(`↳ Motivo: ${json.error_message ?? "(sin detalle en error_message)"}`);
        }
      }

      appendLog("✔ Carga y procesado de ficheros finalizados.");
    } catch (err) {
      console.error("Error en handleProcess:", err);
      appendLog(`❌ Error general en la carga: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const empresaLabelById = (id: number) => {
    const e = empresas.find((x) => x.id === id);
    return e ? `${e.id} – ${e.nombre}` : String(id);
  };

  const histTiposDisponibles = useMemo(() => {
    const set = new Set<string>(EXPECTED_TYPES);
    for (const h of history) set.add((h.tipo || "").toUpperCase());
    return Array.from(set).filter(Boolean).sort();
  }, [history]);

  const histAniosDisponibles = useMemo(() => {
    const set = new Set<number>();
    for (const h of history) set.add(h.anio);
    return Array.from(set).sort((a, b) => b - a);
  }, [history]);

  const histMesesDisponibles = useMemo(() => {
    const set = new Set<number>();
    for (const h of history) set.add(h.mes);
    return Array.from(set).sort((a, b) => a - b);
  }, [history]);

  const handleLoadHistory = async () => {
    if (!token) {
      setHistoryError("Haz login para poder cargar el histórico.");
      setHistory([]);
      setSelectedHistory(null);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const params = new URLSearchParams();

      if (histEmpresaId !== "") params.set("empresa_id", String(histEmpresaId));
      if (histTipo.trim() !== "") params.set("tipo", histTipo.trim());
      if (histStatus.trim() !== "") params.set("status_", histStatus.trim());
      if (histAnio !== "") params.set("anio", String(histAnio));
      if (histMes !== "") params.set("mes", String(histMes));

      const url = `${API_BASE_URL}/ingestion/files${params.toString() ? `?${params}` : ""}`;

      const res = await fetch(url, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend /ingestion/files:", text);
        throw new Error(`Error ${res.status}`);
      }

      const json = (await res.json()) as IngestionFile[];
      const arr = Array.isArray(json) ? json : [];

      arr.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      setHistory(arr);

      setSelectedHistory((prev) => {
        if (!prev) return null;
        const still = arr.find((x) => x.id === prev.id);
        return still ?? null;
      });
    } catch (err) {
      console.error("Error cargando histórico de ingestion:", err);
      setHistoryError("No se pudo cargar el histórico de cargas.");
      setHistory([]);
      setSelectedHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleClearHistoryFilters = () => {
    setHistEmpresaId("");
    setHistTipo("");
    setHistStatus("");
    setHistAnio("");
    setHistMes("");
  };

  const handleDownloadPlantilla = (fileName: string) => {
    const url = `${API_BASE_URL}/plantillas/${encodeURIComponent(fileName)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const countAvisos = (h: IngestionFile) => {
    const warnings = Array.isArray((h as IngestionFile & { warnings?: unknown }).warnings)
      ? ((h as IngestionFile & { warnings?: unknown[] }).warnings ?? []).length
      : 0;

    const notices = Array.isArray((h as IngestionFile & { notices?: unknown }).notices)
      ? ((h as IngestionFile & { notices?: unknown[] }).notices ?? []).length
      : 0;

    const warningsMessage = (h as IngestionFile & { warnings_message?: string }).warnings_message
      ? 1
      : 0;

    return warnings + notices + warningsMessage;
  };

  const selectedWarnings = useMemo(() => {
    if (!selectedHistory) return [];
    return Array.isArray((selectedHistory as IngestionFile & { warnings?: unknown }).warnings)
      ? ((selectedHistory as IngestionFile & { warnings?: IngestionWarningItem[] }).warnings ?? [])
      : [];
  }, [selectedHistory]);

  const selectedNotices = useMemo(() => {
    if (!selectedHistory) return [];
    return Array.isArray((selectedHistory as IngestionFile & { notices?: unknown }).notices)
      ? ((selectedHistory as IngestionFile & { notices?: IngestionWarningItem[] }).notices ?? [])
      : [];
  }, [selectedHistory]);

  return (
    <div className="space-y-8">
      <InlineAccordion
        title="Carga de ficheros"
        subtitle="Sube ficheros BALD, M1, ACUM*, PS_*, etc. El tipo se infiere del nombre."
        open={cargaOpen}
        setOpen={setCargaOpen}
        contentId="carga-content"
      >
        {!canUse && (
          <div className="ui-alert ui-alert--danger mb-4">
            Necesitas iniciar sesión para cargar ficheros.
          </div>
        )}

        <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
          <div>
            <label className="ui-label">Empresa</label>
            <select
              className="ui-select"
              value={empresaId ?? ""}
              disabled={!canUse || loading}
              onChange={(e) =>
                setEmpresaId(e.target.value ? Number.parseInt(e.target.value, 10) : null)
              }
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} – {e.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">Plantillas</label>
            <select
              className="ui-select"
              value={plantillaSel}
              disabled={!canUse}
              onChange={(e) => {
                const v = e.target.value;
                setPlantillaSel(v);
                if (v) {
                  handleDownloadPlantilla(v);
                  setTimeout(() => setPlantillaSel(""), 0);
                }
              }}
            >
              <option value="">Selecciona una plantilla…</option>
              {PLANTILLAS.map((p) => (
                <option key={p.file} value={p.file}>
                  {p.label}
                </option>
              ))}
            </select>

            <p className="mt-1 text-[10px] ui-muted">Se abrirá en otra pestaña.</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="ui-label">Ficheros (puedes seleccionar varios)</label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="ui-file"
            disabled={!canUse || loading}
          />
          {files && files.length > 0 && (
            <p className="mt-1 text-[10px] ui-muted">
              Seleccionados: {Array.from(files).map((f) => f.name).join(", ")}
            </p>
          )}
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleProcess}
              disabled={!canUse || loading}
              className="ui-btn ui-btn-primary"
            >
              {loading ? "Procesando..." : "Subir y procesar ficheros"}
            </button>

            <button
              type="button"
              onClick={() => {
                setLogLines([]);
                setLogFilter("all");
              }}
              disabled={logLines.length === 0}
              className="ui-btn ui-btn-outline"
              title="Limpiar logs"
            >
              Limpiar logs
            </button>
          </div>

          <div
            className="rounded-xl border px-3 py-2"
            style={{ borderColor: "var(--card-border)", background: "var(--field-bg-soft)" }}
          >
            <button
              type="button"
              onClick={() => setSummaryOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={summaryOpen}
              aria-controls="upload-session-summary"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-semibold">Resumen de carga</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="ui-badge ui-badge--neutral">
                    Total {sessionSummary.totalSeleccionados}
                  </span>
                  <span className="ui-badge ui-badge--ok">
                    OK {sessionSummary.procesadosOk}
                  </span>
                  <span className="ui-badge ui-badge--err">
                    Error {sessionSummary.totalErrores}
                  </span>
                  <span className="ui-badge ui-badge--warn">
                    Avisos {sessionSummary.avisos}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] ui-muted">
                  {sessionSummary.estado === "processing"
                    ? "En curso"
                    : sessionSummary.estado === "done"
                    ? "Completado"
                    : sessionSummary.estado === "idle"
                    ? "Listo"
                    : "Sin datos"}
                </span>
                <span
                  className={[
                    "inline-flex items-center justify-center text-[13px] ui-muted transition-transform",
                    summaryOpen ? "rotate-180" : "rotate-0",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </div>
            </button>

            {summaryOpen && (
              <div
                id="upload-session-summary"
                className="mt-3 border-t pt-3"
                style={{ borderColor: "var(--card-border)" }}
              >
                <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-2">
                  <div
                    className="rounded-lg border px-2 py-2"
                    style={{
                      borderColor: "var(--field-border)",
                      background: "var(--field-bg)",
                    }}
                  >
                    <div className="ui-muted text-[10px]">Total seleccionados</div>
                    <div className="mt-1 font-mono">{sessionSummary.totalSeleccionados}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => activateLogFilter("ok")}
                    className="rounded-lg border px-2 py-2 text-left hover:opacity-90"
                    style={{
                      borderColor: "var(--field-border)",
                      background: "var(--field-bg)",
                    }}
                    title="Ver logs OK"
                  >
                    <div className="ui-muted text-[10px]">Subidos / procesados OK</div>
                    <div className="mt-1 font-mono">{sessionSummary.procesadosOk}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => activateLogFilter("errors")}
                    className="rounded-lg border px-2 py-2 text-left hover:opacity-90"
                    style={{
                      borderColor: "var(--field-border)",
                      background: "var(--field-bg)",
                    }}
                    title="Ver logs con error"
                  >
                    <div className="ui-muted text-[10px]">Errores</div>
                    <div className="mt-1 font-mono">{sessionSummary.totalErrores}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => activateLogFilter("warnings")}
                    className="rounded-lg border px-2 py-2 text-left hover:opacity-90"
                    style={{
                      borderColor: "var(--field-border)",
                      background: "var(--field-bg)",
                    }}
                    title="Ver logs con avisos"
                  >
                    <div className="ui-muted text-[10px]">Avisos</div>
                    <div className="mt-1 font-mono">{sessionSummary.avisos}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => activateLogFilter("omitted")}
                    className="rounded-lg border px-2 py-2 text-left hover:opacity-90"
                    style={{
                      borderColor: "var(--field-border)",
                      background: "var(--field-bg)",
                    }}
                    title="Ver ficheros omitidos"
                  >
                    <div className="ui-muted text-[10px]">Omitidos</div>
                    <div className="mt-1 font-mono">{sessionSummary.omitidos}</div>
                  </button>

                  <div
                    className="rounded-lg border px-2 py-2"
                    style={{
                      borderColor: "var(--field-border)",
                      background: "var(--field-bg)",
                    }}
                  >
                    <div className="ui-muted text-[10px]">Notas</div>
                    <div className="mt-1 font-mono">{sessionSummary.notas}</div>
                  </div>
                </div>

                <div className="mt-3 text-[10px] ui-muted">
                  Estado actual:{" "}
                  <span style={{ color: "var(--text)" }}>
                    {sessionSummary.estado === "processing"
                      ? "Procesando ficheros"
                      : sessionSummary.estado === "done"
                      ? "Carga finalizada"
                      : sessionSummary.estado === "idle"
                      ? "Sesión preparada"
                      : "Sin actividad"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold">Logs sesión actual</h4>

            <div className="flex items-center gap-2">
              {logFilter !== "all" && (
                <>
                  <span className="ui-badge ui-badge--neutral">
                    Filtro: {logFilterLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLogFilter("all")}
                    className="ui-btn ui-btn-outline"
                    title="Quitar filtro"
                  >
                    Ver todo
                  </button>
                </>
              )}

              <span className="text-[10px] ui-muted">{loading ? "Trabajando…" : ""}</span>
            </div>
          </div>

          <div
            className="max-h-48 overflow-y-auto rounded-lg border px-3 py-2 text-[10px] font-mono"
            style={{
              borderColor: "var(--field-border)",
              background: "var(--field-bg)",
              color: "var(--field-text)",
            }}
          >
            {logLines.length === 0 ? (
              <div className="ui-muted">
                Aquí aparecerán los logs de subida y procesado.
              </div>
            ) : filteredLogLines.length === 0 ? (
              <div className="ui-muted">No hay líneas para el filtro seleccionado.</div>
            ) : (
              <ul className="space-y-0.5">
                {filteredLogLines.map((line, idx) => (
                  <li key={`${logFilter}-${idx}`}>• {line}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2 text-[10px] ui-muted">
            Con la normativa (±3 días + refacturas), aquí verás avisos tipo “mes no existente” o
            “refactura detectada”, pero la carga NO se bloqueará.
          </div>
        </div>
      </InlineAccordion>

      <InlineAccordion
        title="Histórico de cargas"
        subtitle="Listado de cargas (ingestion_files) del tenant. Fechas en horario de Madrid."
        open={historyOpen}
        setOpen={setHistoryOpen}
        contentId="history-content"
      >
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleClearHistoryFilters}
              className="ui-btn ui-btn-outline"
            >
              Limpiar filtros
            </button>

            <button
              type="button"
              onClick={handleLoadHistory}
              disabled={!canUse || historyLoading}
              className="ui-btn ui-btn-secondary"
            >
              {historyLoading ? "Cargando..." : "Cargar histórico"}
            </button>

            <button
              type="button"
              onClick={() => setSelectedHistory(null)}
              disabled={!selectedHistory}
              className="ui-btn ui-btn-outline"
              title="Cerrar detalle"
            >
              Cerrar detalle
            </button>
          </div>

          <div className="text-[10px] ui-muted">
            El borrado y su vista previa están disponibles en la pestaña Sistema.
          </div>
        </div>

        <div className="ui-panel mb-4 text-[11px]">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label className="ui-label">Empresa</label>
              <select
                className="ui-select"
                value={histEmpresaId}
                disabled={!canUse || historyLoading}
                onChange={(e) =>
                  setHistEmpresaId(
                    e.target.value ? Number.parseInt(e.target.value, 10) : ""
                  )
                }
              >
                <option value="">(todas)</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} – {e.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Tipo</label>
              <select
                className="ui-select"
                value={histTipo}
                disabled={!canUse || historyLoading}
                onChange={(e) => setHistTipo(e.target.value)}
              >
                <option value="">(todos)</option>
                {histTiposDisponibles.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Estado</label>
              <select
                className="ui-select"
                value={histStatus}
                disabled={!canUse || historyLoading}
                onChange={(e) => setHistStatus(e.target.value)}
              >
                <option value="">(todos)</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Año</label>
              <select
                className="ui-select"
                value={histAnio}
                disabled={!canUse || historyLoading}
                onChange={(e) =>
                  setHistAnio(e.target.value ? Number.parseInt(e.target.value, 10) : "")
                }
              >
                <option value="">(todos)</option>
                {histAniosDisponibles.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Mes</label>
              <select
                className="ui-select"
                value={histMes}
                disabled={!canUse || historyLoading}
                onChange={(e) =>
                  setHistMes(e.target.value ? Number.parseInt(e.target.value, 10) : "")
                }
              >
                <option value="">(todos)</option>
                {histMesesDisponibles.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {historyError && <div className="ui-alert ui-alert--danger mb-4">{historyError}</div>}

        <div className="ui-table-wrap">
          <table className="ui-table text-[11px]">
            <thead className="ui-thead">
              <tr>
                <th className="ui-th">ID</th>
                <th className="ui-th">Empresa</th>
                <th className="ui-th">Tipo</th>
                <th className="ui-th">Periodo</th>
                <th className="ui-th">Fichero</th>
                <th className="ui-th">Estado</th>
                <th className="ui-th ui-th-right">OK</th>
                <th className="ui-th ui-th-right">Error</th>
                <th className="ui-th">Subido</th>
                <th className="ui-th">Procesado</th>
                <th className="ui-th ui-th-right">Avisos</th>
                <th className="ui-th">Detalle</th>
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr className="ui-tr">
                  <td colSpan={12} className="ui-td text-center ui-muted">
                    {historyLoading
                      ? "Cargando histórico..."
                      : "Aún no has cargado el histórico o no hay registros con esos filtros."}
                  </td>
                </tr>
              ) : (
                history.map((h) => {
                  const avisos = countAvisos(h);
                  const isSelected = selectedHistory?.id === h.id;

                  return (
                    <tr key={h.id} className="ui-tr">
                      <td className="ui-td font-mono">{h.id}</td>
                      <td className="ui-td">{empresaLabelById(h.empresa_id)}</td>
                      <td className="ui-td font-mono">{h.tipo}</td>
                      <td className="ui-td font-mono">{fmtPeriodo(h.anio, h.mes)}</td>
                      <td className="ui-td">{h.filename}</td>
                      <td className="ui-td">
                        <span className={statusBadgeClass(h.status)}>{h.status}</span>
                      </td>
                      <td className="ui-td ui-td-right font-mono">{h.rows_ok ?? 0}</td>
                      <td className="ui-td ui-td-right font-mono">{h.rows_error ?? 0}</td>
                      <td className="ui-td">{fmtDateMadrid(h.created_at)}</td>
                      <td className="ui-td">{fmtDateMadrid(h.processed_at)}</td>
                      <td
                        className="ui-td ui-td-right font-mono"
                        title={avisos ? "Hay avisos/notas" : "Sin avisos"}
                      >
                        {avisos}
                      </td>
                      <td className="ui-td">
                        <button
                          type="button"
                          className="ui-btn ui-btn-outline"
                          onClick={() => setSelectedHistory(h)}
                          title="Ver detalle"
                        >
                          {isSelected ? "Abierto" : "Detalle"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selectedHistory && (
          <div className="mt-4 ui-card ui-card--border">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  Detalle de carga #{selectedHistory.id}
                </div>
                <div className="mt-1 text-[11px] ui-muted">
                  {empresaLabelById(selectedHistory.empresa_id)} ·{" "}
                  <span className="font-mono">{selectedHistory.tipo}</span> ·{" "}
                  <span className="font-mono">
                    {fmtPeriodo(selectedHistory.anio, selectedHistory.mes)}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={statusBadgeClass(selectedHistory.status)}>
                  {selectedHistory.status}
                </span>
                <button
                  type="button"
                  className="ui-btn ui-btn-outline"
                  onClick={() => setSelectedHistory(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="ui-panel text-[11px]">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="ui-muted text-[10px]">Fichero</div>
                  <div className="mt-0.5">{selectedHistory.filename}</div>
                </div>
                <div>
                  <div className="ui-muted text-[10px]">Subido</div>
                  <div className="mt-0.5">{fmtDateMadrid(selectedHistory.created_at)}</div>
                </div>
                <div>
                  <div className="ui-muted text-[10px]">Procesado</div>
                  <div className="mt-0.5">{fmtDateMadrid(selectedHistory.processed_at)}</div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="ui-muted text-[10px]">Filas OK</div>
                  <div className="mt-0.5 font-mono">{selectedHistory.rows_ok ?? 0}</div>
                </div>
                <div>
                  <div className="ui-muted text-[10px]">Filas Error</div>
                  <div className="mt-0.5 font-mono">{selectedHistory.rows_error ?? 0}</div>
                </div>
                <div>
                  <div className="ui-muted text-[10px]">Error (si aplica)</div>
                  <div className="mt-0.5">
                    {selectedHistory.error_message ? (
                      <span className="ui-text-danger">
                        {selectedHistory.error_message}
                      </span>
                    ) : (
                      <span className="ui-muted">-</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold">Avisos / notas</div>

                {(selectedHistory as IngestionFile & { warnings_message?: string })
                  .warnings_message ? (
                  <div className="mt-2 ui-alert ui-alert--warning text-[11px]">
                    {
                      (selectedHistory as IngestionFile & { warnings_message?: string })
                        .warnings_message
                    }
                  </div>
                ) : null}

                {selectedWarnings.length === 0 &&
                selectedNotices.length === 0 &&
                !(selectedHistory as IngestionFile & { warnings_message?: string })
                  .warnings_message ? (
                  <div className="mt-2 ui-muted text-[11px]">Sin avisos.</div>
                ) : (
                  <div className="mt-2 space-y-3">
                    {selectedWarnings.length > 0 && (
                      <div>
                        <div className="ui-muted text-[10px] mb-1">
                          Warnings ({selectedWarnings.length})
                        </div>
                        <ul className="list-disc pl-5 text-[11px] space-y-1">
                          {selectedWarnings.map((w, idx) => (
                            <li key={`w-${idx}`}>{formatWarningItem(w)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedNotices.length > 0 && (
                      <div>
                        <div className="ui-muted text-[10px] mb-1">
                          Notas ({selectedNotices.length})
                        </div>
                        <ul className="list-disc pl-5 text-[11px] space-y-1">
                          {selectedNotices.map((n, idx) => (
                            <li key={`n-${idx}`}>{formatWarningItem(n)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </InlineAccordion>
    </div>
  );
}