"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ─── Tipos del JSON del backend ────────────────────────────────────────────────

type MClass = "M1" | "M2" | "M7";
type GrupoId = "PM_1_2_3" | "PM_4_5" | "GEN_4_5";
type EstadoPlazo = "en_plazo" | "vence_hoy" | "vencido" | "enviado";

interface AlertaPlazo {
  M: MClass;
  periodo: string;
  plazo_fecha: string;
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

interface HistoricoMes {
  mes_envio: string;
  total_enviados: number;
  respuestas_ok: number;
  respuestas_bad: number;
  grupos: GrupoResumen[];
  por_empresa: EmpresaResumen[];
}

interface HistoricoAnio {
  anio: number;
  total_enviados: number;
  respuestas_ok: number;
  respuestas_bad: number;
  totales_por_grupo: Record<GrupoId, number>;
  meses: HistoricoMes[];
}

interface EnviosHistoricoResp {
  anios: HistoricoAnio[];
}

interface Props { token: string | null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function fmtPeriodoLabel(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES[m]}/${a}`;
}

function fmtMesEnvioLargo(mesEnvio: string): string {
  const [a, m] = mesEnvio.split("-").map(Number);
  const meses = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                 "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${meses[m]} ${a}`;
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

function fmtNum(n: number): string {
  return n.toLocaleString("es-ES");
}

const ORDEN_GRUPOS: GrupoId[] = ["PM_1_2_3", "PM_4_5", "GEN_4_5"];

const GRUPO_LABEL_CORTO: Record<GrupoId, string> = {
  PM_1_2_3: "PM 1,2,3",
  PM_4_5: "PM 4,5",
  GEN_4_5: "GEN 4,5",
};

function estiloPlazo(estado: EstadoPlazo): { bg: string; color: string; icon: string; label: string } {
  switch (estado) {
    case "enviado":   return { bg: "rgba(29,158,117,0.15)",  color: "#0F6E56", icon: "✅", label: "Enviado a tiempo" };
    case "en_plazo":  return { bg: "rgba(55,138,221,0.15)",  color: "#378ADD", icon: "⏳", label: "En plazo" };
    case "vence_hoy": return { bg: "rgba(186,117,23,0.18)",  color: "#BA7517", icon: "⚠️", label: "Vence hoy" };
    case "vencido":   return { bg: "rgba(226,75,74,0.15)",   color: "#A32D2D", icon: "❌", label: "Vencido" };
  }
}

const ESTILO_M: Record<MClass, { bg: string; color: string }> = {
  M1: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  M2: { bg: "rgba(168,85,247,0.15)",  color: "#c084fc" },
  M7: { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

function getMesEnvioActual(): { anio: number; mes: number } {
  const ahora = new Date();
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit",
  });
  const partes = fmt.formatToParts(ahora);
  const anio = Number(partes.find((p) => p.type === "year")?.value ?? ahora.getFullYear());
  const mes  = Number(partes.find((p) => p.type === "month")?.value ?? (ahora.getMonth() + 1));
  return { anio, mes };
}

// ─── Sub-componente: bloque de detalle de un mes (3 tarjetas + por empresa) ───

interface DetalleMesProps {
  grupos: GrupoResumen[];
  porEmpresa: EmpresaResumen[];
  expandedEmpresas: Set<number>;
  toggleEmpresa: (id: number) => void;
  detalleAbierto: boolean;
  toggleDetalle: () => void;
}

function DetalleMes({ grupos, porEmpresa, expandedEmpresas, toggleEmpresa, detalleAbierto, toggleDetalle }: DetalleMesProps) {
  const tarjetaStyle: React.CSSProperties = {
    background: "var(--field-bg-soft)", borderRadius: 10,
    padding: "14px 16px", border: "0.5px solid var(--card-border)",
  };

  return (
    <>
      {/* 3 tarjetas de grupo */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))",
        gap: 10, marginBottom: 16,
      }}>
        {ORDEN_GRUPOS.map((grupoId) => {
          const grupo = grupos.find((g) => g.id === grupoId);
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

      {/* Detalle por empresa (desplegable como botón pill ancho completo) */}
      {porEmpresa.length > 0 && (
        <>
          <div style={{ marginBottom: detalleAbierto ? 8 : 0 }}>
            <button
              type="button"
              onClick={toggleDetalle}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%",
                padding: "10px 14px",
                fontSize: 11, fontWeight: 500,
                color: detalleAbierto ? "#85B7EB" : "var(--text)",
                background: detalleAbierto ? "rgba(55,138,221,0.15)" : "var(--field-bg-soft)",
                border: detalleAbierto
                  ? "0.5px solid rgba(55,138,221,0.5)"
                  : "0.5px solid var(--card-border)",
                borderRadius: 8,
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                if (!detalleAbierto) {
                  e.currentTarget.style.borderColor = "rgba(55,138,221,0.4)";
                  e.currentTarget.style.background = "rgba(55,138,221,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!detalleAbierto) {
                  e.currentTarget.style.borderColor = "var(--card-border)";
                  e.currentTarget.style.background = "var(--field-bg-soft)";
                }
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 10,
                  color: detalleAbierto ? "#85B7EB" : "var(--text-muted)",
                  transform: detalleAbierto ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  display: "inline-block",
                }}>▶</span>
                <span style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  fontSize: 11,
                }}>
                  🏢 Detalle por empresa
                </span>
              </span>
              <span style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontWeight: 400,
              }}>
                {porEmpresa.length} {porEmpresa.length === 1 ? "empresa" : "empresas"}
              </span>
            </button>
          </div>

          {detalleAbierto && (
          <div style={{
            background: "var(--field-bg-soft)", borderRadius: 8,
            border: "0.5px solid var(--card-border)",
            overflow: "hidden",
          }}>
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

            {porEmpresa.map((emp) => {
              const expanded = expandedEmpresas.has(emp.empresa_id);
              const g1 = emp.totales_por_grupo.PM_1_2_3 ?? { enviados: 0, ok: 0, bad: 0, pendiente: 0 };
              const g2 = emp.totales_por_grupo.PM_4_5  ?? { enviados: 0, ok: 0, bad: 0, pendiente: 0 };
              const g3 = emp.totales_por_grupo.GEN_4_5 ?? { enviados: 0, ok: 0, bad: 0, pendiente: 0 };

              const renderCelda = (g: EmpresaGrupoTotales) => (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, flexWrap: "wrap",
                }}>
                  <span style={{
                    fontSize: 11,
                    color: g.enviados > 0 ? "var(--text)" : "var(--text-muted)",
                    fontWeight: g.enviados > 0 ? 500 : 400,
                  }}>{g.enviados}</span>
                  {g.ok > 0 && (
                    <span style={{
                      padding: "0px 4px", borderRadius: 6,
                      background: "rgba(29,158,117,0.15)", color: "#0F6E56",
                      fontSize: 8, fontWeight: 500,
                    }}>🟢{g.ok}</span>
                  )}
                  {g.bad > 0 && (
                    <span style={{
                      padding: "0px 4px", borderRadius: 6,
                      background: "rgba(226,75,74,0.15)", color: "#A32D2D",
                      fontSize: 8, fontWeight: 500,
                    }}>🔴{g.bad}</span>
                  )}
                  {g.pendiente > 0 && (
                    <span style={{
                      padding: "0px 4px", borderRadius: 6,
                      background: "rgba(156,163,175,0.15)", color: "var(--text)",
                      fontSize: 8, fontWeight: 500,
                    }}>⚪{g.pendiente}</span>
                  )}
                </div>
              );

              return (
                <div key={emp.empresa_id}>
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
                    {renderCelda(g1)}
                    {renderCelda(g2)}
                    {renderCelda(g3)}
                    <div style={{ textAlign: "right", fontSize: 12, color: "#378ADD", fontWeight: 600 }}>
                      {emp.total_enviados_mes}
                    </div>
                  </div>

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
                        const grupoLabel = grupos.find((g) => g.id === grupoId)?.label ?? grupoId;
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
          )}
        </>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardEnviosSection({ token }: Props) {
  const [vista, setVista] = useState<"mensual" | "historico">("mensual");
  const inicial = getMesEnvioActual();
  const [anio, setAnio] = useState<number>(inicial.anio);
  const [mes, setMes]   = useState<number>(inicial.mes);

  const [dataMensual, setDataMensual] = useState<EnviosResumenResp | null>(null);
  const [dataHist, setDataHist] = useState<EnviosHistoricoResp | null>(null);

  // En histórico: SOLO un año puede estar expandido a la vez (drill-down).
  const [anioActivo, setAnioActivo] = useState<number | null>(null);
  const [mesesExpandidos, setMesesExpandidos] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Empresas expandidas (key: "mes_envio:empresa_id")
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());

  // "Detalle por empresa" desplegable por mes_envio (plegado por defecto)
  const [detalleEmpresaAbierto, setDetalleEmpresaAbierto] = useState<Set<string>>(new Set());

  // ── Cargar datos ──
  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      if (vista === "mensual") {
        const url = `${API_BASE_URL}/dashboard/envios-resumen?anio=${anio}&mes=${mes}&modo=mensual`;
        const r = await fetch(url, { headers: getAuthHeaders(token) });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || `Error ${r.status}`);
        }
        setDataMensual(await r.json());
      } else {
        const url = `${API_BASE_URL}/dashboard/envios-historico`;
        const r = await fetch(url, { headers: getAuthHeaders(token) });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || `Error ${r.status}`);
        }
        setDataHist(await r.json());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  }, [token, anio, mes, vista]);

  useEffect(() => { cargar(); }, [cargar]);

  const switchMensual = () => {
    const ahora = getMesEnvioActual();
    setAnio(ahora.anio);
    setMes(ahora.mes);
    setVista("mensual");
  };

  const toggleAnio = (anio: number) => {
    setAnioActivo((prev) => (prev === anio ? null : anio));
    setMesesExpandidos(new Set()); // resetear meses al cambiar de año
  };

  const toggleMes = (mesEnvio: string) => {
    setMesesExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(mesEnvio)) next.delete(mesEnvio);
      else next.add(mesEnvio);
      return next;
    });
  };

  const toggleEmpresa = (mesEnvio: string, empresaId: number) => {
    const key = `${mesEnvio}:${empresaId}`;
    setExpandedEmpresas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDetalleEmpresa = (mesEnvio: string) => {
    setDetalleEmpresaAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(mesEnvio)) next.delete(mesEnvio);
      else next.add(mesEnvio);
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

  const headerLabel = vista === "mensual"
    ? `ENVÍOS ${MESES_LARGOS[mes]}-${anio} (mes en que se realiza el envío)`
    : `Histórico de envíos`;

  // Para el histórico: limitar a los 5 años más recientes con datos
  const aniosVisibles = (dataHist?.anios ?? []).slice(0, 5);
  const anioActivoData = aniosVisibles.find((a) => a.anio === anioActivo) ?? null;

  return (
    <div style={panelStyle}>
      {/* Cabecera */}
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

      {/* Cuerpo */}
      <div style={{ padding: "14px 20px" }}>
        {loading && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "16px 0", textAlign: "center" }}>
            Cargando dashboard...
          </div>
        )}
        {error && <div className="ui-alert ui-alert--danger">{error}</div>}

        {/* ═══ MODO MENSUAL ═══════════════════════════════════════════════ */}
        {!loading && !error && vista === "mensual" && dataMensual && (
          <>
            {dataMensual.alertas && (
              <>
                {(() => {
                  // Calcular los 2 meses para el toggle: actual y anterior
                  const ahora = getMesEnvioActual();
                  const mesActual = { anio: ahora.anio, mes: ahora.mes };
                  const mesAnt = mesActual.mes === 1
                    ? { anio: mesActual.anio - 1, mes: 12 }
                    : { anio: mesActual.anio, mes: mesActual.mes - 1 };
                  const opciones = [mesActual, mesAnt];

                  const labelCorto = (a: number, m: number) =>
                    `${MESES[m]} ${String(a).slice(-2)}`;

                  return (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 8, gap: 8, flexWrap: "wrap",
                    }}>
                      <div style={{
                        fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                        letterSpacing: "0.08em", fontWeight: 600,
                      }}>
                        Alertas de envíos
                      </div>
                      <div style={{
                        display: "inline-flex",
                        background: "var(--card-bg)",
                        border: "1px solid var(--card-border)",
                        borderRadius: 4, padding: 1,
                      }}>
                        {opciones.map((opt) => {
                          const seleccionado = opt.anio === anio && opt.mes === mes;
                          return (
                            <button
                              key={`${opt.anio}-${opt.mes}`}
                              type="button"
                              onClick={() => {
                                if (!seleccionado) {
                                  setAnio(opt.anio);
                                  setMes(opt.mes);
                                }
                              }}
                              style={{
                                padding: "3px 12px",
                                fontSize: 10,
                                borderRadius: 3,
                                background: seleccionado ? "rgba(55,138,221,0.18)" : "transparent",
                                color: seleccionado ? "#85B7EB" : "var(--text-muted)",
                                border: "none",
                                cursor: seleccionado ? "default" : "pointer",
                                fontWeight: seleccionado ? 500 : 400,
                                transition: "background 0.15s, color 0.15s",
                              }}
                            >
                              {labelCorto(opt.anio, opt.mes)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                  gap: 10, marginBottom: 16,
                }}>
                  {(["M1", "M2", "M7"] as MClass[]).map((m) => {
                    const a = dataMensual.alertas![m];
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
                          {(() => {
                            // Contar empresas distintas que enviaron AL MENOS un fichero para este M
                            const empresasConEnvio = new Set<number>();
                            for (const emp of dataMensual.por_empresa) {
                              for (const grupoId of ORDEN_GRUPOS) {
                                const items = emp.detalle_por_grupo[grupoId] ?? [];
                                if (items.some((it) => it.M === m && it.enviados > 0)) {
                                  empresasConEnvio.add(emp.empresa_id);
                                  break;
                                }
                              }
                            }
                            const n = empresasConEnvio.size;
                            if (n === 0) return null;
                            return (
                              <>
                                {" · "}
                                <span style={{ color: "var(--text)", fontWeight: 500 }}>{n}</span>{" "}
                                {n === 1 ? "empresa" : "empresas"}
                              </>
                            );
                          })()}
                        </div>
                        {(() => {
                          // Buscar OK/BAD/Pendiente sumando todas las líneas de los grupos para este M
                          let ok = 0, bad = 0, pend = 0;
                          for (const g of dataMensual.grupos) {
                            for (const p of g.periodos) {
                              if (p.M === m) {
                                ok += p.respuestas_ok;
                                bad += p.respuestas_bad;
                                pend += p.respuestas_pendiente;
                              }
                            }
                          }
                          if (ok === 0 && bad === 0 && pend === 0) return null;
                          return (
                            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                              {ok > 0 && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: 8,
                                  background: "rgba(29,158,117,0.15)", color: "#0F6E56",
                                  fontSize: 9, fontWeight: 500,
                                }}>🟢 {ok}</span>
                              )}
                              {bad > 0 && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: 8,
                                  background: "rgba(226,75,74,0.15)", color: "#A32D2D",
                                  fontSize: 9, fontWeight: 500,
                                }}>🔴 {bad}</span>
                              )}
                              {pend > 0 && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: 8,
                                  background: "rgba(156,163,175,0.15)", color: "var(--text)",
                                  fontSize: 9, fontWeight: 500,
                                }}>⚪ {pend}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{
              fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
              letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8,
            }}>
              Ficheros enviados por grupo
            </div>
            <DetalleMes
              grupos={dataMensual.grupos}
              porEmpresa={dataMensual.por_empresa}
              expandedEmpresas={new Set(
                Array.from(expandedEmpresas)
                  .filter((k) => k.startsWith(`${dataMensual.mes_envio}:`))
                  .map((k) => Number(k.split(":")[1]))
              )}
              toggleEmpresa={(id) => toggleEmpresa(dataMensual.mes_envio, id)}
              detalleAbierto={detalleEmpresaAbierto.has(dataMensual.mes_envio)}
              toggleDetalle={() => toggleDetalleEmpresa(dataMensual.mes_envio)}
            />
            {dataMensual.por_empresa.length === 0 && (
              <div style={{
                fontSize: 11, color: "var(--text-muted)", fontStyle: "italic",
                textAlign: "center", padding: "12px 0",
              }}>
                Sin envíos registrados para este periodo.
              </div>
            )}
          </>
        )}

        {/* ═══ MODO HISTÓRICO (tarjetas-año en grid + detalle abajo) ═════ */}
        {!loading && !error && vista === "historico" && dataHist && (
          <>
            {aniosVisibles.length === 0 ? (
              <div style={{
                fontSize: 11, color: "var(--text-muted)", fontStyle: "italic",
                textAlign: "center", padding: "16px 0",
              }}>
                Sin envíos registrados.
              </div>
            ) : (
              <>
                {/* Tarjetas-año en flex (ancho fijo, wrap si hay muchas) */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 16,
                }}>
                  {aniosVisibles.map((anioData) => {
                    const isActive = anioActivo === anioData.anio;
                    return (
                      <div
                        key={anioData.anio}
                        onClick={() => toggleAnio(anioData.anio)}
                        style={{
                          width: 220,
                          flexShrink: 0,
                          background: "var(--field-bg-soft)",
                          border: isActive
                            ? "1px solid rgba(55,138,221,0.6)"
                            : "0.5px solid var(--card-border)",
                          borderRadius: 8,
                          padding: 12,
                          cursor: "pointer",
                          transition: "background 0.15s, border-color 0.15s",
                          boxShadow: isActive ? "0 0 0 2px rgba(55,138,221,0.15)" : "none",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = "rgba(55,138,221,0.4)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = "var(--card-border)";
                        }}
                      >
                        {/* Fila 1: año + chevron */}
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "baseline", marginBottom: 4,
                        }}>
                          <div style={{
                            fontSize: 16, fontWeight: 600, color: "var(--text)",
                          }}>{anioData.anio}</div>
                          <div style={{
                            fontSize: 10,
                            color: isActive ? "#378ADD" : "var(--text-muted)",
                            transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                          }}>▸</div>
                        </div>

                        {/* Subtotal envíos */}
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                          {anioData.meses.length} {anioData.meses.length === 1 ? "mes" : "meses"} · {fmtNum(anioData.total_enviados)} envíos
                        </div>

                        {/* Breakdown por grupo */}
                        <div style={{
                          fontSize: 10, color: "var(--text-muted)",
                          marginBottom: 6, lineHeight: 1.6,
                        }}>
                          {ORDEN_GRUPOS.map((gid) => {
                            const tot = anioData.totales_por_grupo[gid] ?? 0;
                            return (
                              <div key={gid} style={{
                                display: "flex", justifyContent: "space-between",
                              }}>
                                <span>{GRUPO_LABEL_CORTO[gid]}:</span>
                                <span style={{
                                  color: tot > 0 ? "var(--text)" : "var(--text-muted)",
                                  fontWeight: tot > 0 ? 500 : 400,
                                }}>{fmtNum(tot)}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Respuestas REE */}
                        <div style={{
                          display: "flex", gap: 4,
                          paddingTop: 6,
                          borderTop: "0.5px solid var(--card-border)",
                          flexWrap: "wrap",
                        }}>
                          {anioData.respuestas_ok > 0 && (
                            <span style={{
                              padding: "1px 6px", borderRadius: 8,
                              background: "rgba(29,158,117,0.15)", color: "#0F6E56",
                              fontSize: 9, fontWeight: 500,
                            }}>🟢 {fmtNum(anioData.respuestas_ok)}</span>
                          )}
                          {anioData.respuestas_bad > 0 && (
                            <span style={{
                              padding: "1px 6px", borderRadius: 8,
                              background: "rgba(226,75,74,0.15)", color: "#A32D2D",
                              fontSize: 9, fontWeight: 500,
                            }}>🔴 {fmtNum(anioData.respuestas_bad)}</span>
                          )}
                          {anioData.respuestas_ok === 0 && anioData.respuestas_bad === 0 && (
                            <span style={{
                              fontSize: 9, color: "var(--text-muted)", fontStyle: "italic",
                            }}>Sin respuestas REE</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Detalle del año activo (debajo del grid) */}
                {anioActivoData && (
                  <div style={{
                    background: "rgba(55,138,221,0.04)",
                    border: "0.5px solid rgba(55,138,221,0.18)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}>
                    <div style={{
                      fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                      letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10,
                    }}>
                      Detalle año <span style={{ color: "#378ADD" }}>{anioActivoData.anio}</span>
                    </div>

                    {anioActivoData.meses.map((mesData) => {
                      const mesOpen = mesesExpandidos.has(mesData.mes_envio);
                      return (
                        <div key={mesData.mes_envio} style={{ marginBottom: 8 }}>
                          {/* Cabecera del mes */}
                          <div
                            onClick={() => toggleMes(mesData.mes_envio)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                              background: mesOpen ? "rgba(55,138,221,0.08)" : "var(--card-bg)",
                              border: "0.5px solid var(--card-border)",
                              borderRadius: 6,
                              transition: "background 0.15s",
                            }}
                          >
                            <div style={{
                              fontSize: 11,
                              color: mesOpen ? "#378ADD" : "var(--text-muted)",
                              transform: mesOpen ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 0.2s",
                              userSelect: "none",
                            }}>▶</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                              📅 {fmtMesEnvioLargo(mesData.mes_envio)}
                            </div>
                            <div style={{ flex: 1, textAlign: "right" }}>
                              <span style={{ fontSize: 12, color: "#378ADD", fontWeight: 600 }}>
                                {fmtNum(mesData.total_enviados)}
                              </span>
                              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>
                                envíos
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              {mesData.respuestas_ok > 0 && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: 8,
                                  background: "rgba(29,158,117,0.15)", color: "#0F6E56",
                                  fontSize: 9, fontWeight: 500,
                                }}>🟢 {mesData.respuestas_ok}</span>
                              )}
                              {mesData.respuestas_bad > 0 && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: 8,
                                  background: "rgba(226,75,74,0.15)", color: "#A32D2D",
                                  fontSize: 9, fontWeight: 500,
                                }}>🔴 {mesData.respuestas_bad}</span>
                              )}
                            </div>
                          </div>

                          {/* Detalle del mes */}
                          {mesOpen && (
                            <div style={{ padding: "10px 0 4px 0" }}>
                              <DetalleMes
                                grupos={mesData.grupos}
                                porEmpresa={mesData.por_empresa}
                                expandedEmpresas={new Set(
                                  Array.from(expandedEmpresas)
                                    .filter((k) => k.startsWith(`${mesData.mes_envio}:`))
                                    .map((k) => Number(k.split(":")[1]))
                                )}
                                toggleEmpresa={(id) => toggleEmpresa(mesData.mes_envio, id)}
                                detalleAbierto={detalleEmpresaAbierto.has(mesData.mes_envio)}
                                toggleDetalle={() => toggleDetalleEmpresa(mesData.mes_envio)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
