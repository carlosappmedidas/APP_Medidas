"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ─── Tipos del JSON del backend ────────────────────────────────────────────────

type MClass = "M1" | "M2" | "M7";
type GrupoId = "PM_1_2_3" | "PM_4_5" | "GEN_4_5";
type EstadoPlazo = "en_plazo" | "vence_hoy" | "vencido" | "enviado";

interface AlertaPlazo {
  M: MClass;
  periodo: string;          // "YYYY-MM"
  plazo_fecha: string;      // ISO con TZ Madrid
  plazo_label: string;
  estado: EstadoPlazo;
  dias_restantes: number;
  ficheros_enviados: number;
}

interface GrupoPeriodo {
  periodo: string;
  M: MClass;
  ficheros_enviados: number;
  respuestas_ok: number;
  respuestas_bad: number;
  respuestas_pendiente: number;
}

interface GrupoResumen {
  id: GrupoId;
  label: string;
  tipos: string[];
  periodos: GrupoPeriodo[];
}

interface EmpresaGrupoTotales {
  enviados: number;
  ok: number;
  bad: number;
  pendiente: number;
}

interface EmpresaGrupoDetalleItem {
  periodo: string;
  M: MClass;
  enviados: number;
  ok: number;
  bad: number;
  pendiente: number;
}

interface EmpresaResumen {
  empresa_id: number;
  empresa_nombre: string;
  codigo_ree: string | null;
  total_enviados_mes: number;
  totales_por_grupo: Record<GrupoId, EmpresaGrupoTotales>;
  detalle_por_grupo: Record<GrupoId, EmpresaGrupoDetalleItem[]>;
}

interface EnviosResumenResp {
  mes_envio: string;
  modo: "mensual" | "historico";
  alertas: Record<MClass, AlertaPlazo> | null;
  grupos: GrupoResumen[];
  por_empresa: EmpresaResumen[];
}

interface Props { token: string | null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function fmtPeriodoLabel(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES[m]}/${a}`;
}

function fmtPlazoFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

const ORDEN_GRUPOS: GrupoId[] = ["PM_1_2_3", "PM_4_5", "GEN_4_5"];

// Estilo de badge por estado de plazo
function estiloPlazo(estado: EstadoPlazo): { bg: string; color: string; icon: string; label: string } {
  switch (estado) {
    case "enviado":   return { bg: "rgba(29,158,117,0.15)",  color: "#0F6E56", icon: "✅", label: "Enviado a tiempo" };
    case "en_plazo":  return { bg: "rgba(55,138,221,0.15)",  color: "#378ADD", icon: "⏳", label: "En plazo" };
    case "vence_hoy": return { bg: "rgba(186,117,23,0.18)",  color: "#BA7517", icon: "⚠️", label: "Vence hoy" };
    case "vencido":   return { bg: "rgba(226,75,74,0.15)",   color: "#A32D2D", icon: "❌", label: "Vencido" };
  }
}

// Estilo de badge por M (chip de color)
const ESTILO_M: Record<MClass, { bg: string; color: string }> = {
  M1: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  M2: { bg: "rgba(168,85,247,0.15)",  color: "#c084fc" },
  M7: { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

// ─── Mes actual (Madrid) ──────────────────────────────────────────────────────

function getMesEnvioActual(): { anio: number; mes: number } {
  // Hora "ahora" formateada en Europe/Madrid → extraemos año y mes
  const ahora = new Date();
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit",
  });
  // formatToParts da {type:"year", value:"2026"} y {type:"month", value:"05"}
  const partes = fmt.formatToParts(ahora);
  const anio = Number(partes.find((p) => p.type === "year")?.value ?? ahora.getFullYear());
  const mes  = Number(partes.find((p) => p.type === "month")?.value ?? (ahora.getMonth() + 1));
  return { anio, mes };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardEnviosSection({ token }: Props) {
  // ── Estado: vista (mensual/histórico), año/mes seleccionados ──
  const [vista, setVista] = useState<"mensual" | "historico">("mensual");
  const inicial = getMesEnvioActual();
  const [anio, setAnio] = useState<number>(inicial.anio);
  const [mes, setMes]   = useState<number>(inicial.mes);

  const [data, setData]     = useState<EnviosResumenResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Fila por_empresa expandida (set de empresa_ids)
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<number>>(new Set());

  // ── Cargar datos del backend ──
  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const url = `${API_BASE_URL}/dashboard/envios-resumen?anio=${anio}&mes=${mes}&modo=${vista}`;
      const r = await fetch(url, { headers: getAuthHeaders(token) });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${r.status}`);
      }
      const json: EnviosResumenResp = await r.json();
      setData(json);
      setExpandedEmpresas(new Set()); // reset al cambiar consulta
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  }, [token, anio, mes, vista]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Cuando se cambia a "mensual", forzar mes/año actuales ──
  const switchMensual = () => {
    const ahora = getMesEnvioActual();
    setAnio(ahora.anio);
    setMes(ahora.mes);
    setVista("mensual");
  };

  // ── Cabecera principal: ENVÍOS MAY-2026 + toggle vista ──
  const headerLabel = vista === "mensual"
    ? `ENVÍOS ${MESES_LARGOS[mes]}-${anio} (mes en que se realiza el envío)`
    : `ENVÍOS — Histórico (datos del periodo ${MESES_LARGOS[mes]}-${anio})`;

  // ── Toggle de empresa expandida ──
  const toggleEmpresa = (empresa_id: number) => {
    setExpandedEmpresas((prev) => {
      const next = new Set(prev);
      if (next.has(empresa_id)) next.delete(empresa_id);
      else next.add(empresa_id);
      return next;
    });
  };

  // ── Estilos compartidos ──
  const panelStyle: React.CSSProperties = {
    background: "var(--card-bg)", border: "1px solid var(--card-border)",
    borderRadius: "10px", overflow: "hidden", marginBottom: "10px",
  };

  const tarjetaStyle: React.CSSProperties = {
    background: "var(--field-bg-soft)", borderRadius: 10,
    padding: "14px 16px", border: "0.5px solid var(--card-border)",
  };

  return (
    <div style={panelStyle}>
      {/* ── Cabecera del panel ────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid var(--card-border)",
        flexWrap: "wrap", gap: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--text)",
        }}>
          📊 {headerLabel}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Filtros año/mes solo en modo histórico */}
          {vista === "historico" && (
            <>
              <select className="ui-select" style={{ fontSize: 11, height: 28 }}
                value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="ui-select" style={{ fontSize: 11, height: 28 }}
                value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{MESES[m]}</option>
                ))}
              </select>
            </>
          )}

          {/* Toggle Mensual / Histórico */}
          <div style={{
            display: "inline-flex",
            background: "rgba(0,0,0,0.35)",
            border: "0.5px solid var(--card-border)",
            borderRadius: 6, padding: 2,
          }}>
            <button type="button" onClick={switchMensual}
              style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 4,
                background: vista === "mensual" ? "rgba(55,138,221,0.18)" : "transparent",
                color: vista === "mensual" ? "#85B7EB" : "var(--text-muted)",
                border: "none", cursor: "pointer",
                fontWeight: vista === "mensual" ? 500 : 400,
              }}>
              Mensual
            </button>
            <button type="button" onClick={() => setVista("historico")}
              style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 4,
                background: vista === "historico" ? "rgba(55,138,221,0.18)" : "transparent",
                color: vista === "historico" ? "#85B7EB" : "var(--text-muted)",
                border: "none", cursor: "pointer",
                fontWeight: vista === "historico" ? 500 : 400,
              }}>
              Histórico
            </button>
          </div>
        </div>
      </div>

      {/* ── Cuerpo ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 20px" }}>
        {loading && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "16px 0", textAlign: "center" }}>
            Cargando dashboard...
          </div>
        )}
        {error && <div className="ui-alert ui-alert--danger">{error}</div>}

        {!loading && !error && data && (
          <>
            {/* ── BLOQUE 1: Alertas de plazo (solo modo MENSUAL) ─────────── */}
            {vista === "mensual" && data.alertas && (
              <>
                <div style={{
                  fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                  letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8,
                }}>
                  Alertas de envíos
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                  gap: 10, marginBottom: 16,
                }}>
                  {(["M1", "M2", "M7"] as MClass[]).map((m) => {
                    const a = data.alertas![m];
                    const est = estiloPlazo(a.estado);
                    const chip = ESTILO_M[m];
                    return (
                      <div key={m} style={tarjetaStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{
                            ...chip, padding: "2px 8px", borderRadius: 4,
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                          }}>{m}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Periodo: <span style={{ color: "var(--text)", fontWeight: 500 }}>{fmtPeriodoLabel(a.periodo)}</span>
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                          {a.plazo_label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>
                          {fmtPlazoFecha(a.plazo_fecha)}
                        </div>
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "3px 9px", borderRadius: 10,
                          background: est.bg, color: est.color,
                          fontSize: 11, fontWeight: 500,
                        }}>
                          <span>{est.icon}</span>
                          <span>{est.label}</span>
                          {a.estado === "en_plazo" && a.dias_restantes > 0 && (
                            <span style={{ opacity: 0.85 }}>· faltan {a.dias_restantes} {a.dias_restantes === 1 ? "día" : "días"}</span>
                          )}
                          {a.estado === "vencido" && (
                            <span style={{ opacity: 0.85 }}>· hace {Math.abs(a.dias_restantes)} {Math.abs(a.dias_restantes) === 1 ? "día" : "días"}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                          <span style={{ color: "#378ADD", fontWeight: 500 }}>{a.ficheros_enviados}</span> ficheros enviados
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── BLOQUE 2: Resumen por grupo de tipos ───────────────────── */}
            <div style={{
              fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
              letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8,
            }}>
              Ficheros enviados por grupo
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))",
              gap: 10, marginBottom: 16,
            }}>
              {ORDEN_GRUPOS.map((grupoId) => {
                const grupo = data.grupos.find((g) => g.id === grupoId);
                if (!grupo) return null;
                const totalEnviados = grupo.periodos.reduce((s, p) => s + p.ficheros_enviados, 0);

                return (
                  <div key={grupoId} style={tarjetaStyle}>
                    <div style={{
                      fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                      letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4,
                    }}>
                      {grupo.label}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 10 }}>
                      Tipos: {grupo.tipos.join(", ")}
                    </div>

                    {grupo.periodos.length === 0 ? (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                        Sin envíos en este periodo
                      </div>
                    ) : (
                      <>
                        {/* Ficheros enviados por línea (M + periodo) */}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                          Ficheros enviados
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
                          {grupo.periodos.map((p, idx) => {
                            const chip = ESTILO_M[p.M];
                            return (
                              <div key={idx} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "3px 0", fontSize: 11,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{
                                    ...chip, padding: "1px 6px", borderRadius: 4,
                                    fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                                  }}>{p.M}</span>
                                  <span style={{ color: "var(--text-muted)" }}>
                                    Periodo {fmtPeriodoLabel(p.periodo)}
                                  </span>
                                </div>
                                <span style={{ color: "var(--text)", fontWeight: 500 }}>
                                  {p.ficheros_enviados}
                                </span>
                              </div>
                            );
                          })}
                          <div style={{
                            borderTop: "0.5px solid var(--card-border)",
                            marginTop: 4, paddingTop: 4,
                            display: "flex", justifyContent: "space-between",
                            fontSize: 11,
                          }}>
                            <span style={{ color: "var(--text-muted)" }}>Total grupo</span>
                            <span style={{ color: "#378ADD", fontWeight: 600 }}>{totalEnviados}</span>
                          </div>
                        </div>

                        {/* Respuestas REE: 1 línea por periodo con OK/BAD */}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                          Respuestas REE
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {grupo.periodos.map((p, idx) => (
                            <div key={`r-${idx}`} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "3px 0", fontSize: 11,
                            }}>
                              <span style={{ color: "var(--text-muted)" }}>
                                {p.M} · {fmtPeriodoLabel(p.periodo)}
                              </span>
                              <div style={{ display: "flex", gap: 4 }}>
                                {p.respuestas_ok > 0 && (
                                  <span style={{
                                    padding: "1px 6px", borderRadius: 8,
                                    background: "rgba(29,158,117,0.15)", color: "#0F6E56",
                                    fontSize: 9, fontWeight: 500,
                                  }}>🟢 {p.respuestas_ok}</span>
                                )}
                                {p.respuestas_bad > 0 && (
                                  <span style={{
                                    padding: "1px 6px", borderRadius: 8,
                                    background: "rgba(226,75,74,0.15)", color: "#A32D2D",
                                    fontSize: 9, fontWeight: 500,
                                  }}>🔴 {p.respuestas_bad}</span>
                                )}
                                {p.respuestas_pendiente > 0 && (
                                  <span style={{
                                    padding: "1px 6px", borderRadius: 8,
                                    background: "rgba(156,163,175,0.15)", color: "var(--text)",
                                    fontSize: 9, fontWeight: 500,
                                  }}>⚪ {p.respuestas_pendiente}</span>
                                )}
                                {p.respuestas_ok === 0 && p.respuestas_bad === 0 && p.respuestas_pendiente === 0 && (
                                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>—</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── BLOQUE 3: Detalle por empresa (expandible) ─────────────── */}
            {data.por_empresa.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                  letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8,
                }}>
                  Detalle por empresa
                </div>

                <div style={{
                  background: "var(--field-bg-soft)", borderRadius: 8,
                  border: "0.5px solid var(--card-border)",
                  overflow: "hidden",
                }}>
                  {/* Cabecera de la tabla */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1.5fr repeat(3, 1fr) 0.7fr",
                    gap: 8, padding: "8px 12px",
                    fontSize: 9, color: "var(--text-muted)",
                    fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
                    borderBottom: "0.5px solid var(--card-border)",
                  }}>
                    <div></div>
                    <div>Empresa</div>
                    <div style={{ textAlign: "center" }}>F1/F1QH</div>
                    <div style={{ textAlign: "center" }}>AGRECL/INMECL/MAGCL</div>
                    <div style={{ textAlign: "center" }}>MCIL345/QH</div>
                    <div style={{ textAlign: "right" }}>Total</div>
                  </div>

                  {data.por_empresa.map((emp) => {
                    const expanded = expandedEmpresas.has(emp.empresa_id);
                    const tot1 = emp.totales_por_grupo.PM_1_2_3?.enviados ?? 0;
                    const tot2 = emp.totales_por_grupo.PM_4_5?.enviados ?? 0;
                    const tot3 = emp.totales_por_grupo.GEN_4_5?.enviados ?? 0;

                    return (
                      <div key={emp.empresa_id}>
                        {/* Fila resumen (clickable) */}
                        <div
                          onClick={() => toggleEmpresa(emp.empresa_id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "24px 1.5fr repeat(3, 1fr) 0.7fr",
                            gap: 8, padding: "8px 12px",
                            alignItems: "center",
                            cursor: "pointer",
                            borderBottom: expanded ? "none" : "0.5px solid rgba(31,41,55,0.3)",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(55,138,221,0.04)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{
                            fontSize: 10,
                            color: expanded ? "#378ADD" : "var(--text-muted)",
                            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                            textAlign: "center",
                            userSelect: "none",
                          }}>▶</div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
                              {emp.empresa_nombre}
                            </div>
                            {emp.codigo_ree && (
                              <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                {emp.codigo_ree}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "center", fontSize: 11, color: tot1 > 0 ? "var(--text)" : "var(--text-muted)", fontWeight: tot1 > 0 ? 500 : 400 }}>
                            {tot1}
                          </div>
                          <div style={{ textAlign: "center", fontSize: 11, color: tot2 > 0 ? "var(--text)" : "var(--text-muted)", fontWeight: tot2 > 0 ? 500 : 400 }}>
                            {tot2}
                          </div>
                          <div style={{ textAlign: "center", fontSize: 11, color: tot3 > 0 ? "var(--text)" : "var(--text-muted)", fontWeight: tot3 > 0 ? 500 : 400 }}>
                            {tot3}
                          </div>
                          <div style={{ textAlign: "right", fontSize: 12, color: "#378ADD", fontWeight: 600 }}>
                            {emp.total_enviados_mes}
                          </div>
                        </div>

                        {/* Detalle desplegable */}
                        {expanded && (
                          <div style={{
                            background: "rgba(55,138,221,0.04)",
                            borderTop: "0.5px dashed rgba(55,138,221,0.18)",
                            borderBottom: "0.5px solid rgba(31,41,55,0.3)",
                            padding: "8px 12px 12px 36px",
                          }}>
                            {ORDEN_GRUPOS.map((grupoId) => {
                              const items = emp.detalle_por_grupo[grupoId] ?? [];
                              if (items.length === 0) return null;
                              const grupoLabel = data.grupos.find((g) => g.id === grupoId)?.label ?? grupoId;
                              return (
                                <div key={grupoId} style={{ marginBottom: 8 }}>
                                  <div style={{
                                    fontSize: 9, color: "var(--text-muted)",
                                    textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
                                    marginBottom: 3,
                                  }}>
                                    {grupoLabel}
                                  </div>
                                  {items.map((it, idx) => {
                                    const chip = ESTILO_M[it.M];
                                    return (
                                      <div key={idx} style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        padding: "2px 0", fontSize: 10,
                                      }}>
                                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                          <span style={{
                                            ...chip, padding: "1px 5px", borderRadius: 3,
                                            fontSize: 8, fontWeight: 600, letterSpacing: "0.04em",
                                          }}>{it.M}</span>
                                          <span style={{ color: "var(--text-muted)" }}>
                                            {fmtPeriodoLabel(it.periodo)}
                                          </span>
                                        </div>
                                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                          <span style={{ color: "var(--text)", fontWeight: 500 }}>
                                            {it.enviados} env.
                                          </span>
                                          {it.ok > 0 && (
                                            <span style={{
                                              padding: "0px 5px", borderRadius: 6,
                                              background: "rgba(29,158,117,0.15)", color: "#0F6E56",
                                              fontSize: 8, fontWeight: 500,
                                            }}>🟢 {it.ok}</span>
                                          )}
                                          {it.bad > 0 && (
                                            <span style={{
                                              padding: "0px 5px", borderRadius: 6,
                                              background: "rgba(226,75,74,0.15)", color: "#A32D2D",
                                              fontSize: 8, fontWeight: 500,
                                            }}>🔴 {it.bad}</span>
                                          )}
                                          {it.pendiente > 0 && (
                                            <span style={{
                                              padding: "0px 5px", borderRadius: 6,
                                              background: "rgba(156,163,175,0.15)", color: "var(--text)",
                                              fontSize: 8, fontWeight: 500,
                                            }}>⚪ {it.pendiente}</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {data.por_empresa.length === 0 && (
              <div style={{
                fontSize: 11, color: "var(--text-muted)", fontStyle: "italic",
                textAlign: "center", padding: "12px 0",
              }}>
                Sin envíos registrados para este periodo.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
