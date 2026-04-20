// Panel 3 del módulo Objeciones: Historial de ficheros REOB enviados.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.6).
//
// Comportamiento (mejoras posteriores):
//   - No carga nada hasta que hay empresa seleccionada (igual que GestionPanel).
//   - Selector empresa incluye "Todas las empresas" como primera opción,
//     pero mientras esté en "Todas" (=null) no se dispara fetch.
//   - 4 pestañas por tipo (AOBAGRECL, OBJEINCL, AOBCUPS, AOBCIL) con contador,
//     visualmente idéntico a GestionPanel.
//   - La tabla muestra solo los REOBs del tipo activo.

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { ObjecionRow } from "../ObjecionDetalleModal";
import type { ObjecionTipo, ReobGenerado, EmpresaOption } from "./shared/types";
import { TIPO_RUTA, TABS } from "./shared/constants";
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

// ─── Mapeo tipo REOB (BD) → pestaña (ObjecionTipo) ───────────────────────────
//
// En BD el campo `tipo` de ReobGenerado vale "agrecl" | "incl" | "cups" | "cil"
// (en minúsculas, sin prefijo). Las pestañas usan el tipo en formato AOB
// ("AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL"), así que hay que mapear.

const TIPO_BD_A_TAB: Record<string, ObjecionTipo> = {
  agrecl: "AOBAGRECL",
  incl:   "OBJEINCL",
  cups:   "AOBCUPS",
  cil:    "AOBCIL",
};

function tipoDeReob(r: ReobGenerado): ObjecionTipo | null {
  const key = (r.tipo || "").toLowerCase();
  return TIPO_BD_A_TAB[key] ?? null;
}

export default function HistorialPanel({
  token, empresaFiltroId, setEmpresaFiltroId, empresas,
}: HistorialPanelProps) {
  const [historialOpen, setHistorialOpen] = useState(false);
  const [activeTab, setActiveTab]         = useState<ObjecionTipo>("AOBAGRECL");
  const [historial, setHistorial]         = useState<ReobGenerado[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [historialExpandido, setHistorialExpandido] = useState<number | null>(null);
  const [historialFilas, setHistorialFilas] = useState<ObjecionRow[]>([]);
  const [loadingHistorialFilas, setLoadingHistorialFilas] = useState(false);

  // ── Cargar historial — solo cuando hay empresa seleccionada ──────────────

  const cargarHistorial = useCallback(async () => {
    if (!token || !empresaFiltroId) {
      setHistorial([]);
      return;
    }
    setLoadingHistorial(true);
    try {
      const params = new URLSearchParams();
      params.set("empresa_id", String(empresaFiltroId));
      const res = await fetch(`${API_BASE_URL}/objeciones/reob-generados?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setHistorial(await res.json());
    } catch { setHistorial([]); }
    finally { setLoadingHistorial(false); }
  }, [token, empresaFiltroId]);

  useEffect(() => {
    if (historialOpen) {
      cargarHistorial();
    } else {
      setHistorialExpandido(null);
      setHistorialFilas([]);
    }
  }, [historialOpen, cargarHistorial]);

  // Al cambiar de pestaña o de empresa, cerrar cualquier fila expandida.
  useEffect(() => {
    setHistorialExpandido(null);
    setHistorialFilas([]);
  }, [activeTab, empresaFiltroId]);

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

  // ── Contadores por tipo (para las pestañas) ──────────────────────────────

  const counts = useMemo<Record<ObjecionTipo, number>>(() => {
    const acc: Record<ObjecionTipo, number> = {
      AOBAGRECL: 0, OBJEINCL: 0, AOBCUPS: 0, AOBCIL: 0,
    };
    for (const r of historial) {
      const tab = tipoDeReob(r);
      if (tab) acc[tab] += 1;
    }
    return acc;
  }, [historial]);

  // ── Filtrar por pestaña activa ───────────────────────────────────────────

  const historialFiltrado = useMemo(
    () => historial.filter((r) => tipoDeReob(r) === activeTab),
    [historial, activeTab],
  );

  // ── Barra de pestañas (mismo estilo que GestionPanel) ────────────────────

  const tabBar = (
    <div style={{ display: "flex", backgroundColor: "#1a2332", borderRadius: "6px 6px 0 0", paddingLeft: "8px", gap: "2px" }}>
      {TABS.map((t) => {
        const isActive = t.id === activeTab;
        const count = counts[t.id];
        return (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "9px 16px", fontSize: "11px", fontWeight: 500,
            color: isActive ? "white" : "rgba(255,255,255,0.4)",
            background: "transparent", border: "none",
            borderBottom: isActive ? "2px solid #60a5fa" : "2px solid transparent",
            cursor: "pointer", letterSpacing: "0.06em",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            {t.label}
            {count > 0 && (
              <span style={{
                fontSize: "10px",
                background: isActive ? "#60a5fa" : "rgba(255,255,255,0.15)",
                color: "white", borderRadius: "10px", padding: "1px 6px", fontWeight: 600,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Mensaje que se muestra dentro del tbody según el estado.
  const filaMensaje = !empresaFiltroId
    ? "Selecciona una empresa para ver el historial de ficheros REOB enviados"
    : loadingHistorial
      ? "Cargando..."
      : historialFiltrado.length === 0
        ? `Sin registros para ${activeTab} — los ficheros aparecen aquí cuando se envían por SFTP`
        : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle} onClick={() => setHistorialOpen((v) => !v)}>
        <div>
          <div style={panelTitleStyle}>Historial de ficheros REOB enviados</div>
          <div style={panelDescStyle}>Registro de respuestas enviadas al SFTP</div>
        </div>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
          onClick={(e) => { e.stopPropagation(); setHistorialOpen((v) => !v); }}>
          {historialOpen ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {historialOpen && (
        <div style={{ borderTop: "1px solid var(--card-border)", padding: "14px 20px" }}>

          {/* Selector empresa (mismo estilo que GestionPanel) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Empresa:</span>
            <select
              className="ui-select"
              value={empresaFiltroId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setEmpresaFiltroId(val === "" ? null : Number(val));
              }}
              style={{ fontSize: "11px", padding: "4px 8px", minWidth: 160, height: 28 }}
            >
              <option value="">Todas las empresas</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}
                </option>
              ))}
            </select>
          </div>

          {/* Pestañas por tipo */}
          {tabBar}

          {/* Tabla (siempre visible, igual que GestionPanel) */}
          <div className="ui-table-wrap">
            <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead className="ui-thead">
                <tr>
                  <th className="ui-th" style={{ width: 24 }}></th>
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
                {filaMensaje !== null ? (
                  <tr className="ui-tr">
                    <td colSpan={8} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      {filaMensaje}
                    </td>
                  </tr>
                ) : historialFiltrado.map((r) => (
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
                        <td colSpan={8} style={{ padding: "0 0 0 32px" }}>
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