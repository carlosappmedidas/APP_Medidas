// Panel 3 del módulo Objeciones: Historial de ficheros REOB enviados.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.6).

"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { ObjecionRow } from "../ObjecionDetalleModal";
import type { ObjecionTipo, ReobGenerado, EmpresaOption } from "./shared/types";
import { TIPO_RUTA } from "./shared/constants";
import { fmtDate } from "./shared/helpers";
import { BadgeAceptacion } from "./shared/badges";

interface HistorialPanelProps {
  token: string | null;
  empresaFiltroId: number | null;
  setEmpresaFiltroId: (id: number | null) => void;
  empresas: EmpresaOption[];
}

// ─── Estilos panel (mismo estilo que los demás paneles de Objeciones) ────────

const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: "10px",
  overflow: "hidden",
  marginBottom: "10px",
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

export default function HistorialPanel({
  token, empresaFiltroId, setEmpresaFiltroId, empresas,
}: HistorialPanelProps) {
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historial, setHistorial]         = useState<ReobGenerado[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [historialExpandido, setHistorialExpandido] = useState<number | null>(null);
  const [historialFilas, setHistorialFilas] = useState<ObjecionRow[]>([]);
  const [loadingHistorialFilas, setLoadingHistorialFilas] = useState(false);

  // ── Cargar historial ──────────────────────────────────────────────────────

  const cargarHistorial = useCallback(async () => {
    if (!token) return;
    setLoadingHistorial(true);
    try {
      const params = new URLSearchParams();
      if (empresaFiltroId) params.set("empresa_id", String(empresaFiltroId));
      const res = await fetch(`${API_BASE_URL}/objeciones/reob-generados?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setHistorial(await res.json());
    } catch { setHistorial([]); }
    finally { setLoadingHistorial(false); }
  }, [token, empresaFiltroId]);

  useEffect(() => { if (historialOpen) cargarHistorial(); }, [historialOpen, cargarHistorial]);

  // ── Cargar filas de un REOB al expandirlo ────────────────────────────────

  const cargarHistorialFilas = async (reob: ReobGenerado) => {
    if (!token) return;
    setLoadingHistorialFilas(true);
    try {
      const ruta_ = TIPO_RUTA[reob.tipo.replace("AOB", "") as ObjecionTipo] ?? reob.tipo.toLowerCase();
      const params = new URLSearchParams({
        empresa_id: String(reob.empresa_id),
        nombre_fichero: reob.nombre_fichero_aob,
      });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta_}?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const rows: ObjecionRow[] = await res.json();
      setHistorialFilas(reob.comercializadora
        ? rows.filter((r) => {
            const cccc = (r.id_objecion as string | undefined)?.split("_")[1];
            return cccc === reob.comercializadora;
          })
        : rows
      );
    } catch { setHistorialFilas([]); }
    finally { setLoadingHistorialFilas(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle} onClick={() => setHistorialOpen((v) => !v)}>
        <div>
          <div style={panelTitleStyle}>Historial de ficheros REOB enviados</div>
          <div style={panelDescStyle}>
            {historial.length > 0 ? `${historial.length} ficheros enviados` : "Registro de respuestas enviadas al SFTP"}
          </div>
        </div>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
          onClick={(e) => { e.stopPropagation(); setHistorialOpen((v) => !v); }}>
          {historialOpen ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {historialOpen && (
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--card-border)", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Empresa:</span>
            <select className="ui-select" value={empresaFiltroId ?? ""}
              onChange={(e) => setEmpresaFiltroId(e.target.value === "" ? null : Number(e.target.value))}
              style={{ fontSize: 11, padding: "3px 6px", height: 26 }}>
              <option value="">Todas</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>
              ))}
            </select>
            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={cargarHistorial}>↻ Actualizar</button>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
              {loadingHistorial ? "Cargando..." : `${historial.length} registros`}
            </span>
          </div>
          <div className="ui-table-wrap">
            <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead className="ui-thead">
                <tr>
                  <th className="ui-th" style={{ width: 24 }}></th>
                  <th className="ui-th">Tipo</th>
                  <th className="ui-th">Fichero REOB</th>
                  <th className="ui-th">Fichero AOB origen</th>
                  <th className="ui-th">Comerc.</th>
                  <th className="ui-th">Periodo</th>
                  <th className="ui-th" style={{ textAlign: "center" }}>Regs.</th>
                  <th className="ui-th">Enviado</th>
                  <th className="ui-th">sftp</th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                    Sin registros — los ficheros aparecen aquí cuando se envían por SFTP
                  </td></tr>
                ) : historial.map((r) => (
                  <>
                    <tr key={r.id} className="ui-tr" style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (historialExpandido === r.id) {
                          setHistorialExpandido(null); setHistorialFilas([]);
                        } else {
                          setHistorialExpandido(r.id); cargarHistorialFilas(r);
                        }
                      }}>
                      <td className="ui-td" style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 10 }}>
                        {historialExpandido === r.id ? "∨" : "›"}
                      </td>
                      <td className="ui-td">
                        <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9 }}>{r.tipo.toUpperCase()}</span>
                      </td>
                      <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9 }}>{r.nombre_fichero_reob}</td>
                      <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9, color: "var(--text-muted)" }}>{r.nombre_fichero_aob}</td>
                      <td className="ui-td">{r.comercializadora ?? "—"}</td>
                      <td className="ui-td">{r.aaaamm ?? "—"}</td>
                      <td className="ui-td" style={{ textAlign: "center" }}>{r.num_registros ?? "—"}</td>
                      <td className="ui-td ui-muted">{fmtDate(r.enviado_sftp_at)}</td>
                      <td className="ui-td">
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: r.enviado_sftp_at ? "#378ADD" : "var(--card-border)" }} />
                      </td>
                    </tr>
                    {historialExpandido === r.id && (
                      <tr key={`${r.id}-sub`} className="ui-tr" style={{ background: "rgba(55,138,221,0.04)" }}>
                        <td colSpan={9} style={{ padding: "0 0 0 32px" }}>
                          <div style={{ padding: "8px 12px 8px 0" }}>
                            <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 6 }}>
                              Objeciones de <span style={{ fontFamily: "monospace", color: "var(--text)" }}>{r.nombre_fichero_aob}</span>
                              {r.comercializadora && <> · comercializadora <strong>{r.comercializadora}</strong></>}
                            </div>
                            {loadingHistorialFilas ? (
                              <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 0" }}>Cargando...</div>
                            ) : historialFilas.length === 0 ? (
                              <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 0" }}>Sin objeciones</div>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                                <thead>
                                  <tr>
                                    {["ID objeción", "Periodo", "Motivo", "E. publicada", "E. propuesta", "Aceptación"].map((h) => (
                                      <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, borderBottom: "0.5px solid var(--card-border)" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {historialFilas.map((fila, fi) => (
                                    <tr key={fi} style={{ borderBottom: "0.5px solid rgba(55,138,221,0.08)" }}>
                                      <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{fila.id_objecion || fila.cups || fila.cil || "—"}</td>
                                      <td style={{ padding: "4px 8px" }}>{fila.periodo || "—"}</td>
                                      <td style={{ padding: "4px 8px" }}>{fila.motivo || "—"}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{fila.e_publicada ?? fila.ae_publicada ?? fila.eas_publicada ?? "—"}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{fila.e_propuesta ?? fila.ae_propuesta ?? fila.eas_propuesta ?? "—"}</td>
                                      <td style={{ padding: "4px 8px" }}><BadgeAceptacion valor={fila.aceptacion ?? ""} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}