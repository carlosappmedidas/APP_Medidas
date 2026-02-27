// app/components/CargaSection.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

function statusBadgeStyle(status: string): React.CSSProperties {
  const s = (status || "").toLowerCase();

  if (s === "ok") {
    return {
      borderColor: "rgba(16, 185, 129, 0.40)",
      color: "rgba(110, 231, 183, 0.95)",
      background: "rgba(16, 185, 129, 0.10)",
    };
  }

  if (s === "error") {
    return {
      borderColor: "var(--danger-border)",
      color: "var(--danger-text)",
      background: "var(--danger-bg)",
    };
  }

  if (s === "processing") {
    return {
      borderColor: "rgba(234, 179, 8, 0.40)",
      color: "rgba(253, 224, 71, 0.95)",
      background: "rgba(234, 179, 8, 0.10)",
    };
  }

  return {
    borderColor: "rgba(161, 161, 170, 0.35)",
    color: "rgba(228, 228, 231, 0.90)",
    background: "rgba(255, 255, 255, 0.05)",
  };
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

  // ✅ desplegables (cerrados por defecto)
  const [isCargaOpen, setIsCargaOpen] = useState(false);
  const [isHistoricoOpen, setIsHistoricoOpen] = useState(false);

  // ✅ selector de plantillas
  const [plantillaSel, setPlantillaSel] = useState<string>("");

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
        if (json.length > 0 && empresaId === null) {
          setEmpresaId(json[0].id);
        }
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

        appendLog(
          `→ Subiendo fichero "${file.name}" como tipo ${tipo} (empresa ${empresaId})...`
        );

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
          appendLog(
            `❌ Error subiendo "${file.name}": ${res.status} ${res.statusText}`
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

      // 2) PROCESAR FICHEROS SUBIDOS
      for (const ing of uploaded) {
        appendLog(
          `⚙ Procesando fichero id=${ing.id} (${ing.filename}, tipo=${ing.tipo})...`
        );

        const res = await fetch(
          `${API_BASE_URL}/ingestion/files/${ing.id}/process`,
          {
            method: "POST",
            headers: getAuthHeaders(token),
          }
        );

        if (!res.ok) {
          appendLog(
            `❌ Error procesando id=${ing.id}: ${res.status} ${res.statusText}`
          );
          continue;
        }

        const json = (await res.json()) as IngestionFile;

        const filasOk = json.rows_ok ?? 0;
        const filasError = json.rows_error ?? 0;

        appendLog(
          `✅ Procesado id=${json.id} (status=${json.status}, filas OK=${filasOk}, filas error=${filasError}).`
        );
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

      const url = `${API_BASE_URL}/ingestion/files${
        params.toString() ? `?${params}` : ""
      }`;

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
      {/* TARJETA 1: Carga (desplegable, cerrada por defecto) */}
      <section className="ui-card text-sm">
        <header
          className="mb-3 flex cursor-pointer flex-col gap-2 md:flex-row md:items-center md:justify-between"
          onClick={() => setIsCargaOpen((prev) => !prev)}
        >
          <div>
            <h3 className="ui-card-title">Carga de ficheros</h3>
            <p className="ui-card-subtitle">
              Sube ficheros BALD, M1, ACUM*, PS_*, etc. El tipo se infiere del
              nombre de fichero.
            </p>
          </div>

          <span
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {isCargaOpen ? "Ocultar ▲" : "Mostrar ▼"}
          </span>
        </header>

        {isCargaOpen && (
          <>
            {/* Layout con columna derecha para “Plantillas” */}
            <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
              {/* Columna izquierda: Empresa */}
              <div>
                <label className="ui-label">Empresa ID</label>
                <select
                  className="ui-select"
                  value={empresaId ?? ""}
                  onChange={(e) =>
                    setEmpresaId(
                      e.target.value
                        ? Number.parseInt(e.target.value, 10)
                        : null
                    )
                  }
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

                <p
                  className="mt-1 text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                ></p>
              </div>
            </div>

            <div className="mb-4">
              <label className="ui-label">
                Ficheros (puedes seleccionar varios)
              </label>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="ui-file"
              />
              {files && files.length > 0 && (
                <p
                  className="mt-1 text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Seleccionados:{" "}
                  {Array.from(files)
                    .map((f) => f.name)
                    .join(", ")}
                </p>
              )}
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={handleProcess}
                disabled={loading}
                className="ui-btn ui-btn-primary"
              >
                {loading ? "Procesando..." : "Subir y procesar ficheros"}
              </button>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-semibold">Logs sesión actual</h4>
              <div
                className="max-h-48 overflow-y-auto rounded-lg border px-3 py-2 text-[10px] font-mono"
                style={{
                  borderColor: "var(--field-border)",
                  background: "var(--field-bg)",
                  color: "var(--field-text)",
                }}
              >
                {logLines.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>
                    Aquí aparecerán los logs de subida y procesado.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {logLines.map((line, idx) => (
                      <li key={idx}>• {line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* TARJETA 2: Histórico con filtros (desplegable, cerrada por defecto) */}
      <section className="ui-card text-sm">
        <header
          className="mb-3 flex cursor-pointer flex-col gap-2 md:flex-row md:items-center md:justify-between"
          onClick={() => setIsHistoricoOpen((prev) => !prev)}
        >
          <div>
            <h3 className="ui-card-title">Histórico de logs</h3>
            <p className="ui-card-subtitle">
              Listado de cargas (ingestion_files) del tenant. Fechas en horario
              de Madrid.
            </p>
          </div>

          <span
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {isHistoricoOpen ? "Ocultar ▲" : "Mostrar ▼"}
          </span>
        </header>

        {isHistoricoOpen && (
          <>
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-2">
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
                  disabled={historyLoading}
                  className="ui-btn ui-btn-secondary"
                >
                  {historyLoading ? "Cargando..." : "Cargar histórico"}
                </button>
              </div>
            </div>

            <div className="ui-panel mb-4 text-[11px]">
              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <label className="ui-label">Empresa</label>
                  <select
                    className="ui-select"
                    value={histEmpresaId}
                    onChange={(e) =>
                      setHistEmpresaId(
                        e.target.value
                          ? Number.parseInt(e.target.value, 10)
                          : ""
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
                    onChange={(e) =>
                      setHistAnio(
                        e.target.value
                          ? Number.parseInt(e.target.value, 10)
                          : ""
                      )
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
                    onChange={(e) =>
                      setHistMes(
                        e.target.value
                          ? Number.parseInt(e.target.value, 10)
                          : ""
                      )
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

              <p
                className="mt-2 text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                Tip: primero pulsa “Cargar histórico” para traer datos; luego
                filtra y vuelve a cargar.
              </p>
            </div>

            {historyError && (
              <p className="mb-3 text-[11px]" style={{ color: "var(--danger-text)" }}>
                {historyError}
              </p>
            )}

            <div
              className="overflow-x-auto rounded-xl border bg-black/20"
              style={{ borderColor: "var(--card-border)" }}
            >
              <table className="min-w-full border-collapse text-[11px]">
                <thead className="bg-white/5 text-[10px] uppercase tracking-wide">
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="px-4 py-2 text-left">ID</th>
                    <th className="px-4 py-2 text-left">Empresa</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Periodo</th>
                    <th className="px-4 py-2 text-left">Fichero</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-right">OK</th>
                    <th className="px-4 py-2 text-right">Error</th>
                    <th className="px-4 py-2 text-left">Subido</th>
                    <th className="px-4 py-2 text-left">Procesado</th>
                  </tr>
                </thead>

                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-4 text-center"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {historyLoading
                          ? "Cargando histórico..."
                          : "Aún no has cargado el histórico o no hay registros con esos filtros."}
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr
                        key={h.id}
                        className="border-t"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <td className="px-4 py-2 font-mono">{h.id}</td>
                        <td className="px-4 py-2">
                          {empresaLabelById(h.empresa_id)}
                        </td>
                        <td className="px-4 py-2 font-mono">{h.tipo}</td>
                        <td className="px-4 py-2 font-mono">
                          {fmtPeriodo(h.anio, h.mes)}
                        </td>
                        <td className="px-4 py-2">{h.filename}</td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]"
                            style={statusBadgeStyle(h.status)}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {h.rows_ok ?? 0}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {h.rows_error ?? 0}
                        </td>
                        <td className="px-4 py-2">
                          {fmtDateMadrid(h.created_at)}
                        </td>
                        <td className="px-4 py-2">
                          {fmtDateMadrid(h.processed_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}