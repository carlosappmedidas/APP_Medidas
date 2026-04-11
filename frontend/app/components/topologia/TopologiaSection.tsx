"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type { CtMapa, CupsMapa } from "./MapaLeaflet";

// Importación dinámica — evita SSR de Leaflet (que necesita window)
const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--text-muted)", fontSize: 12,
    }}>
      Cargando mapa...
    </div>
  ),
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EmpresaOption { id: number; nombre: string; }

interface ImportResult {
  cts_insertados:    number;
  cts_actualizados:  number;
  cts_errores:       number;
  trfs_insertados:   number;
  trfs_actualizados: number;
  trfs_errores:      number;
  cups_insertados:   number;
  cups_actualizados: number;
  cups_errores:      number;
  ficheros:          string[];
}

interface Props { token: string | null; currentUser: User | null; }

// ─── Estilos ──────────────────────────────────────────────────────────────────

// Panel estándar — con overflow:hidden para que las esquinas redondeadas recorten el contenido
const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "10px", overflow: "hidden", marginBottom: "10px",
};

// Panel del mapa — SIN overflow:hidden para que Leaflet capture eventos de drag fuera del contenedor
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TopologiaSection({ token }: Props) {

  const [panelImportOpen, setPanelImportOpen] = useState(false);
  const [panelMapaOpen,   setPanelMapaOpen]   = useState(true);

  const [empresas,  setEmpresas]  = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId] = useState<number | "">("");
  const [anioDecl,  setAnioDecl]  = useState<string>(String(new Date().getFullYear()));

  // ── Importación ───────────────────────────────────────────────────────────
  const [fileB2,       setFileB2]       = useState<File | null>(null);
  const [fileB21,      setFileB21]      = useState<File | null>(null);
  const [fileA1,       setFileA1]       = useState<File | null>(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);

  // ── Mapa ──────────────────────────────────────────────────────────────────
  const [cts,            setCts]            = useState<CtMapa[]>([]);
  const [cups,           setCups]           = useState<CupsMapa[]>([]);
  const [loadingCts,     setLoadingCts]     = useState(false);
  const [loadingCups,    setLoadingCups]    = useState(false);
  const [mostrarCts,     setMostrarCts]     = useState(true);
  const [mostrarCups,    setMostrarCups]    = useState(true);
  const [ctSeleccionado, setCtSeleccionado] = useState<string>("");

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then(setEmpresas)
      .catch(() => {});
  }, [token]);

  // ── Cargar CTs ────────────────────────────────────────────────────────────
  const cargarCts = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingCts(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/topologia/mapa/cts?empresa_id=${empresaId}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setCts(await res.json());
    } catch { setCts([]); }
    finally { setLoadingCts(false); }
  }, [token, empresaId]);

  // ── Cargar CUPS ───────────────────────────────────────────────────────────
  const cargarCups = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingCups(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (ctSeleccionado) params.set("id_ct", ctSeleccionado);
      const res = await fetch(
        `${API_BASE_URL}/topologia/mapa/cups?${params}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setCups(await res.json());
    } catch { setCups([]); }
    finally { setLoadingCups(false); }
  }, [token, empresaId, ctSeleccionado]);

  useEffect(() => {
    if (empresaId) { cargarCts(); cargarCups(); }
  }, [empresaId, cargarCts, cargarCups]);

  useEffect(() => {
    if (empresaId) cargarCups();
  }, [ctSeleccionado, empresaId, cargarCups]);

  // ── Importación ───────────────────────────────────────────────────────────
  const handleImportar = async () => {
    if (!token || !empresaId || (!fileB2 && !fileB21 && !fileA1)) return;
    setImporting(true); setImportError(null); setImportResult(null);

    const fd = new FormData();
    fd.append("empresa_id",       String(empresaId));
    fd.append("anio_declaracion", anioDecl);
    if (fileB2)  fd.append("b2",  fileB2);
    if (fileB21) fd.append("b21", fileB21);
    if (fileA1)  fd.append("a1",  fileA1);

    try {
      const res = await fetch(`${API_BASE_URL}/topologia/importar`, {
        method: "POST", headers: getAuthHeaders(token), body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      setImportResult(await res.json() as ImportResult);
      cargarCts(); cargarCups();
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Error importando");
    } finally { setImporting(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="text-sm">

      {/* ══ PANEL 1 — IMPORTACIÓN ══ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelImportOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📥 Importar inventario CNMC 8/2021</div>
            <div style={panelDescStyle}>Carga los ficheros B2, B21 y A1 para poblar el mapa topológico</div>
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
                  value={empresaId}
                  onChange={e => setEmpresaId(e.target.value === "" ? "" : Number(e.target.value))}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "B2 — Centros de transformación", desc: "CIR8_2021_B2_R1-XXX_AAAA.txt",  file: fileB2,  set: setFileB2 },
                { label: "B21 — Transformadores en CT",    desc: "CIR8_2021_B21_R1-XXX_AAAA.txt", file: fileB21, set: setFileB21 },
                { label: "A1 — Puntos de suministro",      desc: "CIR8_2021_A1_R1-XXX_AAAA.txt",  file: fileA1,  set: setFileA1 },
              ].map(({ label, desc, file, set }) => (
                <div key={label} style={{ background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{desc}</div>
                  <input type="file" accept=".txt,.csv" style={{ fontSize: 10 }}
                    onChange={e => set(e.target.files?.[0] ?? null)} />
                  {file && <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 4 }}>✓ {file.name}</div>}
                </div>
              ))}
            </div>

            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={handleImportar}
              disabled={importing || !empresaId || (!fileB2 && !fileB21 && !fileA1)}>
              {importing ? "Importando..." : "Importar ficheros"}
            </button>

            {importResult && (
              <div style={{ marginTop: 16, background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
                  Resultado — ficheros: {importResult.ficheros.join(", ")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { label: "CTs (B2)",              ins: importResult.cts_insertados,  act: importResult.cts_actualizados,  err: importResult.cts_errores },
                    { label: "Transformadores (B21)", ins: importResult.trfs_insertados, act: importResult.trfs_actualizados, err: importResult.trfs_errores },
                    { label: "CUPS (A1)",             ins: importResult.cups_insertados, act: importResult.cups_actualizados, err: importResult.cups_errores },
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
      {/* overflow:visible es crítico — overflow:hidden bloquea el drag de Leaflet */}
      <div style={mapaPanelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelMapaOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>🗺️ Mapa topológico</div>
            <div style={panelDescStyle}>
              {cts.length > 0 || cups.length > 0
                ? `${cts.length} CTs · ${cups.length} CUPS`
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

              {/* ── Columna lateral izquierda ── */}
              <div style={{
                width: 220, flexShrink: 0,
                borderRight: "1px solid var(--card-border)",
                padding: "14px", overflowY: "auto",
                display: "flex", flexDirection: "column", gap: 14,
              }}>

                {/* Empresa */}
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Empresa</label>
                  <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                    value={empresaId}
                    onChange={e => {
                      setEmpresaId(e.target.value === "" ? "" : Number(e.target.value));
                      setCtSeleccionado(""); setCts([]); setCups([]);
                    }}>
                    <option value="">Selecciona empresa</option>
                    {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                  </select>
                </div>

                {/* Capas */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Capas
                  </div>
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
                </div>

                {/* Filtro por CT */}
                {cts.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Filtrar CUPS por CT
                    </div>
                    <select className="ui-select" style={{ width: "100%", fontSize: 11, height: 30 }}
                      value={ctSeleccionado}
                      onChange={e => setCtSeleccionado(e.target.value)}>
                      <option value="">Todos los CTs</option>
                      {cts.map(ct => <option key={ct.id_ct} value={ct.id_ct}>{ct.nombre}</option>)}
                    </select>
                    {ctSeleccionado && (
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ marginTop: 6, fontSize: 10 }}
                        onClick={() => setCtSeleccionado("")}>
                        ✕ Quitar filtro
                      </button>
                    )}
                  </div>
                )}

                {/* Leyenda */}
                <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Leyenda</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E24B4A", border: "2px solid #fff", boxShadow: "0 1px 2px rgba(0,0,0,0.3)", display: "inline-block" }} />
                    Centro de transformación
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#378ADD", display: "inline-block" }} />
                    Punto de suministro
                  </div>
                </div>
              </div>

              {/* ── Mapa ── */}
              <div style={{ flex: 1, position: "relative", minHeight: 580 }}>
                {!empresaId && (
                  <div style={{
                    position: "absolute", inset: 0, zIndex: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.85)",
                    fontSize: 12, color: "var(--text-muted)",
                    borderRadius: "0 10px 10px 0",
                  }}>
                    Selecciona una empresa para cargar el mapa
                  </div>
                )}
                <MapaLeaflet
                  cts={cts}
                  cups={cups}
                  mostrarCts={mostrarCts}
                  mostrarCups={mostrarCups}
                />
              </div>

            </div>
          </div>
        )}
      </div>

    </div>
  );
}
