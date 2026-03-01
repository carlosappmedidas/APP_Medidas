// app/components/CargaSection.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { Empresa } from "../types";

type Props = {
  token: string | null;
};

type IngestionFile = {
  id: number;
  empresa_id: number;
  tipo: string;
  anio: number;
  mes: number;
  filename: string;
  status: string;

  rows_ok?: number;
  rows_error?: number;

  created_at?: string;
  updated_at?: string | null;
  processed_at?: string | null;
  error_message?: string | null;
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

// ✅ Plantillas globales (descarga directa desde backend /plantillas/<file>)
const PLANTILLAS = [
  { label: "M1 – Facturación", file: "XXXX_XXXX_Facturacion.xlsm" },
  { label: "M1 – Autoconsumos", file: "XXXX_XXXXXX_autoconsumos.xlsx" },
  { label: "PS", file: "PS_XXXX_XXXXXX.xlsx" },
] as const;

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

// ✅ Siempre en horario de Madrid
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

// ✅ Acordeón inline (misma flecha ▾ + rotación)
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

  // --- Histórico ---
  const [history, setHistory] = useState<IngestionFile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // --- Filtros histórico ---
  const [histEmpresaId, setHistEmpresaId] = useState<number | "">("");
  const [histTipo, setHistTipo] = useState<string>("");
  const [histStatus, setHistStatus] = useState<string>("");
  const [histAnio, setHistAnio] = useState<number | "">("");
  const [histMes, setHistMes] = useState<number | "">("");

  // ✅ selector de plantillas
  const [plantillaSel, setPlantillaSel] = useState<string>("");

  const canUse = !!token;

  // ✅ estado acordeones (por defecto cerrados como tu AccordionCard)
  const [cargaOpen, setCargaOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  // Cargar empresas para seleccionar empresa_id
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

    loadEmpresas();
  }, [token, empresaId]);

  const appendLog = (line: string) => {
    setLogLines((prev) => [...prev, `${new Date().toISOString()} - ${line}`]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
  };

  // --- Lógica actual de subida/proceso: NO TOCAR ---
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

      // 1) SUBIR FICHEROS
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
          appendLog(`❌ Error subiendo "${file.name}": ${res.status} ${res.statusText}`);
          continue;
        }

        const json = (await res.json()) as IngestionFile;
        uploaded.push(json);
        appendLog(
          `✅ Subido "${file.name}" (id ingestion=${json.id}, periodo=${json.anio}${String(json.mes).padStart(
            2,
            "0"
          )}, tipo=${json.tipo}).`
        );
      }

      // 2) PROCESAR FICHEROS SUBIDOS
      for (const ing of uploaded) {
        appendLog(`⚙ Procesando fichero id=${ing.id} (${ing.filename}, tipo=${ing.tipo})...`);

        const res = await fetch(`${API_BASE_URL}/ingestion/files/${ing.id}/process`, {
          method: "POST",
          headers: getAuthHeaders(token),
        });

        if (!res.ok) {
          appendLog(`❌ Error procesando id=${ing.id}: ${res.status} ${res.statusText}`);
          continue;
        }

        const json = (await res.json()) as IngestionFile;

        const filasOk = json.rows_ok ?? 0;
        const filasError = json.rows_error ?? 0;

        appendLog(`✅ Procesado id=${json.id} (status=${json.status}, filas OK=${filasOk}, filas error=${filasError}).`);
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

  // Opciones de tipo/año/mes basadas en lo ya cargado (para selects “inteligentes”)
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

  // Cargar histórico con filtros
  const handleLoadHistory = async () => {
    if (!token) {
      setHistoryError("Haz login para poder cargar el histórico.");
      setHistory([]);
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
      setHistory(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Error cargando histórico de ingestion:", err);
      setHistoryError("No se pudo cargar el histórico de cargas.");
      setHistory([]);
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

  // ✅ descarga al seleccionar plantilla (sin tocar lógica)
  const handleDownloadPlantilla = (fileName: string) => {
    const url = `${API_BASE_URL}/plantillas/${encodeURIComponent(fileName)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-8">
      {/* ✅ TARJETA 1: Carga */}
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

        {/* Layout con columna derecha para “Plantillas” */}
        <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
          {/* Columna izquierda: Empresa */}
          <div>
            <label className="ui-label">Empresa</label>
            <select
              className="ui-select"
              value={empresaId ?? ""}
              disabled={!canUse || loading}
              onChange={(e) => setEmpresaId(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} – {e.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Columna derecha: Plantillas */}
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
          <input type="file" multiple onChange={handleFileChange} className="ui-file" disabled={!canUse || loading} />
          {files && files.length > 0 && (
            <p className="mt-1 text-[10px] ui-muted">
              Seleccionados: {Array.from(files).map((f) => f.name).join(", ")}
            </p>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={handleProcess} disabled={!canUse || loading} className="ui-btn ui-btn-primary">
            {loading ? "Procesando..." : "Subir y procesar ficheros"}
          </button>

          <button
            type="button"
            onClick={() => setLogLines([])}
            disabled={logLines.length === 0}
            className="ui-btn ui-btn-outline"
            title="Limpiar logs"
          >
            Limpiar logs
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold">Logs sesión actual</h4>
            <span className="text-[10px] ui-muted">{loading ? "Trabajando…" : ""}</span>
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
              <div className="ui-muted">Aquí aparecerán los logs de subida y procesado.</div>
            ) : (
              <ul className="space-y-0.5">
                {logLines.map((line, idx) => (
                  <li key={idx}>• {line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </InlineAccordion>

      {/* ✅ TARJETA 2: Histórico */}
      <InlineAccordion
        title="Histórico de cargas"
        subtitle="Listado de cargas (ingestion_files) del tenant. Fechas en horario de Madrid."
        open={historyOpen}
        setOpen={setHistoryOpen}
        contentId="history-content"
      >
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleClearHistoryFilters} className="ui-btn ui-btn-outline">
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
          </div>

          <div className="text-[10px] ui-muted">Tip: filtra y vuelve a “Cargar histórico”.</div>
        </div>

        <div className="ui-panel mb-4 text-[11px]">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label className="ui-label">Empresa</label>
              <select
                className="ui-select"
                value={histEmpresaId}
                disabled={!canUse || historyLoading}
                onChange={(e) => setHistEmpresaId(e.target.value ? Number.parseInt(e.target.value, 10) : "")}
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
                onChange={(e) => setHistAnio(e.target.value ? Number.parseInt(e.target.value, 10) : "")}
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
                onChange={(e) => setHistMes(e.target.value ? Number.parseInt(e.target.value, 10) : "")}
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
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr className="ui-tr">
                  <td colSpan={10} className="ui-td text-center ui-muted">
                    {historyLoading
                      ? "Cargando histórico..."
                      : "Aún no has cargado el histórico o no hay registros con esos filtros."}
                  </td>
                </tr>
              ) : (
                history.map((h) => (
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </InlineAccordion>
    </div>
  );
}