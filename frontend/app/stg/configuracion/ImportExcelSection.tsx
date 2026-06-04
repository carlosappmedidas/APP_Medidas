// app/stg/configuracion/ImportExcelSection.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

// --- Tipos ---
interface ExcelPreview {
  headers: string[];
  rows_count: number;
  sample_rows: Record<string, any>[];
  campos_bd_permitidos: string[];
}

interface ExcelImportResult {
  procesadas: number;
  actualizadas: number;
  no_encontradas: number;
  errores: Array<{ fila: number; motivo: string }>;
}

interface ImportConfig {
  id: number;
  empresa_id: number;
  origen: string;
  mapeo_columnas: Record<string, string> | null;
  activo: boolean;
  last_sync: string | null;
  last_sync_status: string | null;
  last_sync_resumen: any;
}

// --- Constantes ---
const IGNORAR = "__ignorar__";

const CAMPOS_BD_OPCIONES: Array<{ value: string; label: string }> = [
  { value: IGNORAR, label: "— ignorar esta columna —" },
  { value: "codigo_ct", label: "codigo_ct  🔑 (obligatorio)" },
  { value: "nombre", label: "nombre" },
  { value: "direccion", label: "direccion" },
  { value: "municipio", label: "municipio" },
  { value: "provincia", label: "provincia" },
  { value: "id_ct", label: "id_ct" },
  { value: "nombre_ct", label: "nombre_ct" },
  { value: "cups", label: "cups" },
];

// Auto-detección por nombre de cabecera (normalizado lowercase + sin símbolos)
function autoDetectMapping(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    let best = IGNORAR;
    if (norm === "codigoct" || norm === "codct" || norm.startsWith("codigoct")) best = "codigo_ct";
    else if (norm === "idct") best = "id_ct";
    else if (norm.startsWith("nombrect") || norm === "nombredelct") best = "nombre_ct";
    else if (norm === "nombre" || norm === "nombrecompleto") best = "nombre";
    else if (norm.startsWith("direc")) best = "direccion";
    else if (norm.startsWith("munic")) best = "municipio";
    else if (norm.startsWith("prov")) best = "provincia";
    else if (norm === "cups") best = "cups";
    result[h] = best;
  }
  return result;
}

// --- Estilos compartidos ---
const card: React.CSSProperties = {
  padding: 14,
  background: "rgba(255,255,255,0.02)",
  borderRadius: 6,
  border: "0.5px solid rgba(255,255,255,0.12)",
};
const labelText: React.CSSProperties = { fontSize: 12, color: "rgba(241,239,232,0.5)" };
const valueText: React.CSSProperties = { fontSize: 13, color: "rgba(241,239,232,0.9)" };
const button: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "0.5px solid rgba(175,169,236,0.4)",
  background: "rgba(175,169,236,0.12)",
  color: "rgba(241,239,232,0.95)",
  fontSize: 13,
  cursor: "pointer",
};
const buttonPrimary: React.CSSProperties = {
  ...button,
  background: "rgba(175,169,236,0.25)",
  border: "0.5px solid rgba(175,169,236,0.6)",
};
const buttonDisabled: React.CSSProperties = {
  ...button,
  background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.08)",
  color: "rgba(241,239,232,0.3)",
  cursor: "not-allowed",
};

interface Props {
  empresaId: number;
}

export default function ImportExcelSection({ empresaId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [savedMapping, setSavedMapping] = useState<Record<string, string> | null>(null);
  const [lastSync, setLastSync] = useState<{ at: string | null; status: string | null } | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // Cargar mapping previo guardado en BD
  useEffect(() => {
    if (!empresaId) return;
    setFile(null);
    setPreview(null);
    setImportResult(null);
    setError(null);

    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/stg/import-config?empresa_id=${empresaId}`, {
          headers: authHeader,
        });
        if (!r.ok) return;
        const data = await r.json();
        const cfg: ImportConfig | undefined = (data.items || []).find(
          (c: ImportConfig) => c.origen === "excel" && c.activo
        );
        if (cfg && cfg.mapeo_columnas) {
          setSavedMapping(cfg.mapeo_columnas);
          setMapping(cfg.mapeo_columnas);
          setLastSync({ at: cfg.last_sync, status: cfg.last_sync_status });
        } else {
          setSavedMapping(null);
          setMapping({});
          setLastSync(null);
        }
      } catch {
        // silent
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setPreview(null);
    setImportResult(null);
    setError(null);
  }

  async function handleDownloadTemplate() {
    setError(null);
    setDownloadingTemplate(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/stg/concentradores/excel-template?empresa_id=${empresaId}`,
        { headers: authHeader }
      );
      if (!r.ok) {
        const eb = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
        throw new Error(eb.detail || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `concentradores_mapping_empresa_${empresaId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handlePreview() {
    if (!file) return;
    setError(null);
    setPreviewing(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_BASE_URL}/stg/excel/preview?empresa_id=${empresaId}`, {
        method: "POST",
        headers: authHeader,
        body: fd,
      });
      if (!r.ok) {
        const eb = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
        throw new Error(eb.detail || `HTTP ${r.status}`);
      }
      const data: ExcelPreview = await r.json();
      setPreview(data);

      // Pre-rellenar: saved > auto-detect > ignorar
      if (savedMapping) {
        const next: Record<string, string> = {};
        for (const h of data.headers) {
          next[h] = savedMapping[h] || autoDetectMapping([h])[h] || IGNORAR;
        }
        setMapping(next);
      } else {
        setMapping(autoDetectMapping(data.headers));
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setPreviewing(false);
    }
  }

  function setMappingFor(header: string, value: string) {
    setMapping(prev => ({ ...prev, [header]: value }));
  }

  const mappingIsSaved = useMemo(() => {
    if (!savedMapping) return false;
    const current: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping)) {
      if (v && v !== IGNORAR) current[k] = v;
    }
    return JSON.stringify(Object.fromEntries(Object.entries(current).sort())) === JSON.stringify(Object.fromEntries(Object.entries(savedMapping).sort()));
  }, [mapping, savedMapping]);

  const validation = useMemo(() => {
    const cabsCt = Object.entries(mapping).filter(([, v]) => v === "codigo_ct").map(([k]) => k);
    if (cabsCt.length === 0) {
      return { ok: false, msg: "Mapea alguna columna del Excel a 'codigo_ct' (es obligatorio)" };
    }
    if (cabsCt.length > 1) {
      return { ok: false, msg: `Solo una columna puede mapearse a 'codigo_ct' (tienes ${cabsCt.length})` };
    }
    const counts: Record<string, number> = {};
    for (const v of Object.values(mapping)) {
      if (v && v !== IGNORAR) counts[v] = (counts[v] || 0) + 1;
    }
    const dups = Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k);
    if (dups.length > 0) {
      return { ok: false, msg: `Campos mapeados más de una vez: ${dups.join(", ")}` };
    }
    return { ok: true, msg: "" };
  }, [mapping]);

  const canImport = !!file && !!preview && validation.ok && mappingIsSaved;

  async function handleSaveMapping() {
    if (!validation.ok) {
      setError(validation.msg);
      return;
    }
    setError(null);
    setSavingMapping(true);
    try {
      const toSave: Record<string, string> = {};
      for (const [k, v] of Object.entries(mapping)) {
        if (v && v !== IGNORAR) toSave[k] = v;
      }
      const r = await fetch(`${API_BASE_URL}/stg/import-config`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          origen: "excel",
          mapeo_columnas: toSave,
          activo: true,
        }),
      });
      if (!r.ok) {
        const eb = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
        throw new Error(eb.detail || `HTTP ${r.status}`);
      }
      setSavedMapping(toSave);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleImport() {
    if (!file || !canImport) return;
    setError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_BASE_URL}/stg/excel/execute?empresa_id=${empresaId}`, {
        method: "POST",
        headers: authHeader,
        body: fd,
      });
      if (!r.ok) {
        const eb = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
        throw new Error(eb.detail || `HTTP ${r.status}`);
      }
      const data: ExcelImportResult = await r.json();
      setImportResult(data);

      // Refrescar last_sync
      const r2 = await fetch(`${API_BASE_URL}/stg/import-config?empresa_id=${empresaId}`, {
        headers: authHeader,
      });
      if (r2.ok) {
        const d2 = await r2.json();
        const cfg: ImportConfig | undefined = (d2.items || []).find(
          (c: ImportConfig) => c.origen === "excel" && c.activo
        );
        if (cfg) setLastSync({ at: cfg.last_sync, status: cfg.last_sync_status });
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Descarga de plantilla de mapeo (Paquete 8f-import-export) */}
      <div style={{ ...card, background: "rgba(140,200,255,0.06)", border: "0.5px solid rgba(140,200,255,0.25)" }}>
        <div style={{ fontSize: 12, color: "rgba(241,239,232,0.7)", marginBottom: 10, lineHeight: 1.5 }}>
          <strong style={{ color: "rgba(241,239,232,0.9)" }}>📥 Plantilla de mapeo CIR → ID_CT</strong>
          <div style={{ marginTop: 6 }}>
            Descarga un Excel con los concentradores actuales (columna <code style={{ padding: "1px 4px", background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>codigo_ct</code> rellena con los <code style={{ padding: "1px 4px", background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>CIR…</code>) y la columna <code style={{ padding: "1px 4px", background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>id_ct</code> vacía. Rellena cada fila con el código administrativo del CT (p.ej. <code style={{ padding: "1px 4px", background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>102.CTR.E300000004</code>) y vuelve a subirlo en el bloque de abajo.
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          disabled={downloadingTemplate}
          style={downloadingTemplate ? buttonDisabled : button}
        >
          {downloadingTemplate ? "Descargando..." : "⬇ Descargar plantilla de mapeo"}
        </button>
      </div>

      {savedMapping && (
        <div style={{ ...card, background: "rgba(175,169,236,0.06)", border: "0.5px solid rgba(175,169,236,0.25)" }}>
          <div style={{ fontSize: 12, color: "rgba(241,239,232,0.7)" }}>
            ✓ Hay un <strong>mapping guardado</strong> ({Object.keys(savedMapping).length} columnas). Si subes un Excel con esas cabeceras se mapeará automáticamente.
            {lastSync?.at && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                · Último import: {new Date(lastSync.at).toLocaleString("es-ES")} ({lastSync.status})
              </span>
            )}
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={previewing || importing}
            style={{ ...valueText, padding: "6px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 6, border: "0.5px solid rgba(255,255,255,0.12)" }}
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={!file || previewing}
            style={file && !previewing ? buttonPrimary : buttonDisabled}
          >
            {previewing ? "Previsualizando..." : "Previsualizar"}
          </button>
        </div>
        {file && (
          <div style={{ ...labelText, marginTop: 6 }}>
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...card, background: "rgba(255,80,80,0.08)", border: "0.5px solid rgba(255,80,80,0.3)" }}>
          <div style={{ fontSize: 13, color: "rgba(255,200,200,0.95)" }}>⚠ {error}</div>
        </div>
      )}

      {preview && (
        <div style={card}>
          <div style={{ ...labelText, marginBottom: 10 }}>
            Cabeceras detectadas: <strong style={{ color: "rgba(241,239,232,0.85)" }}>{preview.headers.length}</strong>
            {"  ·  "}
            Filas con datos: <strong style={{ color: "rgba(241,239,232,0.85)" }}>{preview.rows_count}</strong>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1.2fr", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <div style={{ ...labelText, fontWeight: 600 }}>Columna del Excel</div>
            <div></div>
            <div style={{ ...labelText, fontWeight: 600 }}>Campo en BD</div>
            {preview.headers.map(h => (
              <React.Fragment key={h}>
                <div style={{ ...valueText, padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
                  {h || <em style={{ opacity: 0.5 }}>(sin cabecera)</em>}
                </div>
                <div style={{ ...labelText, textAlign: "center" }}>→</div>
                <select
                  value={mapping[h] || IGNORAR}
                  onChange={e => setMappingFor(h, e.target.value)}
                  style={{ ...valueText, padding: "6px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 4, border: "0.5px solid rgba(255,255,255,0.12)" }}
                >
                  {CAMPOS_BD_OPCIONES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </React.Fragment>
            ))}
          </div>

          {!validation.ok && (
            <div style={{ ...labelText, color: "rgba(255,200,100,0.9)", marginBottom: 10 }}>
              ⚠ {validation.msg}
            </div>
          )}

          {validation.ok && (mappingIsSaved ? (
            <div style={{ ...labelText, color: "rgba(150,220,150,0.85)", marginBottom: 10 }}>
              ✓ Este mapping ya está guardado en BD.
            </div>
          ) : (
            <div style={{ ...labelText, color: "rgba(255,200,100,0.85)", marginBottom: 10 }}>
              ● Hay cambios sin guardar en el mapping.
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSaveMapping}
              disabled={!validation.ok || savingMapping || mappingIsSaved}
              style={(!validation.ok || savingMapping || mappingIsSaved) ? buttonDisabled : button}
            >
              {savingMapping ? "Guardando..." : "💾 Guardar mapping"}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport || importing}
              style={(!canImport || importing) ? buttonDisabled : buttonPrimary}
              title={!canImport ? "Necesita: fichero + preview + codigo_ct mapeado + mapping guardado" : ""}
            >
              {importing ? "Importando..." : "▶ Importar ahora"}
            </button>
          </div>

          {preview.sample_rows.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ ...labelText, cursor: "pointer" }}>
                Vista previa: primeras {preview.sample_rows.length} filas
              </summary>
              <div style={{ marginTop: 8, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {preview.headers.map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "0.5px solid rgba(255,255,255,0.15)", color: "rgba(241,239,232,0.7)", fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample_rows.map((row, i) => (
                      <tr key={i}>
                        {preview.headers.map(h => (
                          <td key={h} style={{ padding: "4px 6px", borderBottom: "0.5px solid rgba(255,255,255,0.06)", color: "rgba(241,239,232,0.85)" }}>
                            {row[h] !== undefined && row[h] !== null ? String(row[h]) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {importResult && (
        <div style={{ ...card, background: "rgba(150,220,150,0.06)", border: "0.5px solid rgba(150,220,150,0.25)" }}>
          <div style={{ ...labelText, marginBottom: 8, color: "rgba(241,239,232,0.7)", fontWeight: 600 }}>
            ✓ Import completado
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 10 }}>
            <Stat label="Procesadas" value={importResult.procesadas} />
            <Stat label="Actualizadas" value={importResult.actualizadas} accent="green" />
            <Stat label="No encontradas" value={importResult.no_encontradas} accent={importResult.no_encontradas > 0 ? "yellow" : undefined} />
            <Stat label="Errores" value={importResult.errores.length} accent={importResult.errores.length > 0 ? "red" : undefined} />
          </div>
          {importResult.errores.length > 0 && (
            <details>
              <summary style={{ ...labelText, cursor: "pointer", color: "rgba(255,200,100,0.85)" }}>
                Ver {importResult.errores.length} error(es)
              </summary>
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12, color: "rgba(241,239,232,0.7)" }}>
                {importResult.errores.map((er, i) => (
                  <li key={i}>Fila {er.fila}: {er.motivo}</li>
                ))}
              </ul>
            </details>
          )}
          <div style={{ marginTop: 10 }}>
            <a
              href="/stg/concentradores"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: "rgba(175,169,236,0.95)", textDecoration: "underline" }}
            >
              Ver los concentradores actualizados →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "green" | "yellow" | "red" }) {
  const accentColors: Record<string, string> = {
    green: "rgba(150,220,150,0.95)",
    yellow: "rgba(255,200,100,0.95)",
    red: "rgba(255,150,150,0.95)",
  };
  const valueColor = accent ? accentColors[accent] : "rgba(241,239,232,0.9)";
  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: valueColor }}>{value}</div>
    </div>
  );
}
