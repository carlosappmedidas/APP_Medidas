// Panel 1 del módulo Objeciones: Dashboard / Resumen.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.5).

import { useState } from "react";
import type { DashData, DashEmpresa, DashTipoEnPeriodo, EmpresaOption } from "./shared/types";
// Nota: DashPeriodo ya no se importa aquí porque se accede vía dash.por_periodo
// y TypeScript infiere los tipos desde DashData.

interface AutoConfig {
  activa: boolean;
  ultimo_run_at: string | null;
  ultimo_run_ok: boolean | null;
  ultimo_run_msg: string | null;
}

interface AlertasResumen {
  total_alertas: number;
  empresas_afectadas: number;
  periodos_afectados: number;
  total_aobs_pendientes: number;
}

interface DashboardPanelProps {
  dash: DashData | null;
  loading: boolean;
  empresaFiltroId: number | null;
  empresas: EmpresaOption[];
  autoConfig: AutoConfig | null;
  alertasResumen: AlertasResumen | null;
}

// ── Estilos de los chips de tipo (AGRECL / CUPS / INCL / CIL) ─────────────────
// Cada tipo tiene un color propio para que de un vistazo se distinga en el
// detalle desplegado del periodo.
const TIPO_CHIP_STYLE: Record<string, React.CSSProperties> = {
  AOBAGRECL: { background: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  AOBCUPS:   { background: "rgba(168,85,247,0.15)",  color: "#c084fc" },
  OBJEINCL:  { background: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  AOBCIL:    { background: "rgba(20,184,166,0.15)",  color: "#2dd4bf" },
};

const TIPO_LABEL_CORTO: Record<string, string> = {
  AOBAGRECL: "AGRECL",
  AOBCUPS:   "CUPS",
  OBJEINCL:  "INCL",
  AOBCIL:    "CIL",
};

// Tooltip explicativo sobre "X objeciones · Y REOB".
// Si esINCL = true, el texto aclara que REE no envía respuesta para este tipo.
function tooltipObjReob(objTotal: number, reobTotal: number, esINCL: boolean = false): string {
  // Caso sin enviar
  if (reobTotal === 0) {
    return `${objTotal} ${objTotal === 1 ? "objeción pendiente" : "objeciones pendientes"} de enviar al SFTP.`;
  }

  // Caso sin agrupación (una objeción = un REOB)
  if (objTotal === reobTotal) {
    const base = `${objTotal} ${objTotal === 1 ? "objeción enviada" : "objeciones enviadas"} en ${reobTotal} ${reobTotal === 1 ? "fichero REOB" : "ficheros REOB"} (una por fichero).`;
    if (esINCL) {
      return base + "\n\n⚠ REE no envía respuesta (.ok/.bad) para los REOB de tipo INCL.";
    }
    return base;
  }

  // Caso con agrupación (más objeciones que REOBs)
  const diff = objTotal - reobTotal;
  const base = `${objTotal} objeciones enviadas en ${reobTotal} ficheros REOB.\n\n${diff === 1 ? "1 REOB agrupa" : `${diff} REOB agrupan`} a varias objeciones porque pertenecen a la misma comercializadora.`;
  if (esINCL) {
    return base + "\n\n⚠ REE no envía respuesta (.ok/.bad) para los REOB de tipo INCL.";
  }
  return base;
}

// Componente inline para tooltip CSS visible (hover).
// Muestra un popover encima del texto hijo, con el mensaje en `text`.
function InfoTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span style={{ position: "relative", display: "inline-block" }} className="info-tooltip-wrapper">
      {children}
      <span
        className="info-tooltip-popup"
        style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translate(-50%, 4px)",
          width: 280,
          padding: "10px 12px",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 6,
          fontSize: 10,
          color: "var(--text)",
          lineHeight: 1.5,
          textAlign: "left",
          whiteSpace: "normal",
          zIndex: 100,
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity 0.15s, transform 0.15s",
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        }}
      >
        {text}
      </span>
      <style>{`
        .info-tooltip-wrapper:hover .info-tooltip-popup {
          opacity: 1 !important;
          transform: translate(-50%, 0) !important;
        }
      `}</style>
    </span>
  );
}

export default function DashboardPanel({
  dash, loading, empresaFiltroId, empresas,
  autoConfig, alertasResumen,
}: DashboardPanelProps) {
  const total = dash?.total ?? 0;
  const pend  = dash?.pendientes ?? 0;
  const ok    = dash?.aceptadas ?? 0;
  const err   = dash?.rechazadas ?? 0;
  const pct   = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
  const empresaActiva = empresaFiltroId ? empresas.find((e) => e.id === empresaFiltroId) : null;
  const maxPeriodo = Math.max(1, ...(dash?.por_periodo ?? []).map((t) => t.total));

  // Estado de periodos desplegados (Set con las claves de periodo abiertos).
  const [expandedPeriodos, setExpandedPeriodos] = useState<Set<string>>(new Set());

  const togglePeriodo = (pkey: string) => {
    setExpandedPeriodos((prev) => {
      const next = new Set(prev);
      if (next.has(pkey)) next.delete(pkey);
      else next.add(pkey);
      return next;
    });
  };

  // ── Derivados de autoConfig / alertasResumen para la tarjeta Automatización ──
  const autoActiva        = autoConfig?.activa ?? false;
  const alertasActivasNum = alertasResumen?.total_alertas ?? 0;
  const estadoLabel       = autoActiva ? "Activa" : "Desactivada";
  const estadoPuntoColor  = autoActiva ? "#1D9E75" : "#94A3B8";
  const iconoColor        = autoActiva ? "#1D9E75" : "var(--text-muted)";
  const iconoBg           = autoActiva ? "rgba(29,158,117,0.15)" : "rgba(148,163,184,0.12)";
  const alertasColor      = alertasActivasNum > 0 ? "#A32D2D" : "var(--text-muted)";

  // Formateo del último run en hora Madrid: "23/04/2026 00:42 ✓"
  // El backend guarda los timestamps en UTC (datetime.utcnow) sin offset, así que
  // al recibirlos añadimos "Z" si no tienen zona, y luego los formateamos con
  // Intl.DateTimeFormat en timezone Europe/Madrid.
  const formatearUltimoRun = (iso: string | null, okFlag: boolean | null): string => {
    if (!iso) return "Sin ejecutar aún";
    try {
      // Si el ISO no tiene indicador de zona (Z o ±hh:mm), lo tratamos como UTC.
      const isoUtc = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      const d = new Date(isoUtc);
      const fecha = new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        day: "2-digit", month: "2-digit", year: "numeric",
      }).format(d);
      const hora = new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(d);
      const marker = okFlag === true ? "✓" : okFlag === false ? "⚠" : "";
      return `Último: ${fecha} ${hora} ${marker}`.trim();
    } catch {
      return "Sin ejecutar aún";
    }
  };
  const ultimoRunTexto = formatearUltimoRun(
    autoConfig?.ultimo_run_at ?? null,
    autoConfig?.ultimo_run_ok ?? null,
  );

  // ── Render de una fila (resumen o detalle por tipo) ──────────────────────
  // Utiliza el MISMO grid-template-columns para que las barras queden alineadas.
  const GRID_TEMPLATE = "24px 90px 1fr 110px 160px";

  return (
    <div style={{ padding: "16px 20px", borderTop: "1px solid var(--card-border)" }}>
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "12px 0" }}>Cargando resumen...</div>
      ) : (
        <>
          {/* 3 tarjetas fusionadas: Total · Estado · Automatización */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 14 }}>

            {/* ── Tarjeta 1: TOTAL ─────────────────────────────────────────── */}
            <div style={{ background: "var(--field-bg-soft)", borderRadius: 10, padding: "14px 16px", border: "0.5px solid var(--card-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2"/>
                    <path d="M7 10h10M7 14h7"/>
                  </svg>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Total</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 500, color: "var(--text)", lineHeight: 1 }}>{total}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>objeciones</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <span style={{ color: "#378ADD", fontWeight: 500 }}>{dash?.enviadas_sftp ?? 0}</span> enviadas SFTP
                {total > 0 && <> · {pct(dash?.enviadas_sftp ?? 0)}%</>}
              </div>
              {/* ── Respuestas REE (solo sobre REOBs que REE responde, excl. INCL) ──
                  "esperadas" = suma de REOBs no-INCL enviados = ree_ok + ree_bad + ree_sin_resp
                  "respondidas" = ree_ok + ree_bad (REE ya dio veredicto OK o BAD)
                  Se calcula agregando todos los periodos devueltos por el dashboard. */}
              {(() => {
                const periodos = dash?.por_periodo ?? [];
                const esperadas = periodos.reduce(
                  (acc, p) => acc + (p.ree_ok ?? 0) + (p.ree_bad ?? 0) + (p.ree_sin_resp ?? 0),
                  0,
                );
                const respondidas = periodos.reduce(
                  (acc, p) => acc + (p.ree_ok ?? 0) + (p.ree_bad ?? 0),
                  0,
                );
                if (esperadas === 0) return null;
                const pctRee = Math.round(respondidas / esperadas * 100);
                return (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    <span style={{ color: "#0F6E56", fontWeight: 500 }}>{respondidas}</span>
                    {" respondidas / "}
                    <span style={{ fontWeight: 500 }}>{esperadas}</span>
                    {" esperadas · "}
                    {pctRee}%
                  </div>
                );
              })()}
            </div>

            {/* ── Tarjeta 2: ESTADO ────────────────────────────────────────── */}
            <div style={{ background: "var(--field-bg-soft)", borderRadius: 10, padding: "14px 16px", border: "0.5px solid var(--card-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Estado</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 500, color: "#BA7517", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pend}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>pendientes</span>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 10, background: "rgba(29,158,117,0.12)", color: "#0F6E56", fontWeight: 500, fontSize: 11 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-9"/>
                  </svg>
                  {ok} aceptadas
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 10, background: "rgba(226,75,74,0.12)", color: "#A32D2D", fontWeight: 500, fontSize: 11 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                  {err} rechazadas
                </span>
              </div>
            </div>

            {/* ── Tarjeta 3: AUTOMATIZACIÓN ────────────────────────────── */}
            <div style={{ background: "var(--field-bg-soft)", borderRadius: 10, padding: "14px 16px", border: "0.5px solid var(--card-border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: iconoBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconoColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Automatización</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: estadoPuntoColor }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>{estadoLabel}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 500, color: alertasColor, lineHeight: 1 }}>{alertasActivasNum}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>alertas activas</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ultimoRunTexto}</span>
                <button
                  type="button"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 6,
                    border: "0.5px solid var(--card-border)",
                    background: "var(--field-bg-soft)", color: "var(--text)",
                    fontSize: 11, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Ver alertas
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </div>

          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 10 }}>
            <div style={{ background: "var(--field-bg-soft)", borderRadius: 8, padding: "12px 14px" }}>
              {/* Cabecera de la tabla Por periodo */}
              <div style={{
                display: "grid",
                gridTemplateColumns: GRID_TEMPLATE,
                gap: 10,
                alignItems: "center",
                fontSize: 9,
                color: "var(--text-muted)",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                paddingBottom: 6,
                marginBottom: 6,
                borderBottom: "0.5px solid var(--card-border)",
              }}>
                <div></div>
                <div>Por periodo</div>
                <div></div>
                <div style={{ textAlign: "center" }}>Pend.</div>
                <div style={{ textAlign: "right" }}>Respuestas REE</div>
              </div>

              {(dash?.por_periodo ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin datos</div>
              ) : (
                (dash?.por_periodo ?? []).map((t) => {
                  const expanded = expandedPeriodos.has(t.periodo);
                  const tiposDetalle: DashTipoEnPeriodo[] = t.por_tipo ?? [];
                  const hasDetail = tiposDetalle.length > 0;
                  const tieneRespuestasREE = (t.ree_ok + t.ree_bad + t.ree_sin_resp) > 0;
                  const reobTotalPeriodo = tiposDetalle.reduce((acc, r) => acc + (r.reob_total ?? 0), 0);

                  return (
                    <div key={t.periodo}>
                      {/* ── Fila resumen del mes (clickable si hay detalle) ── */}
                      <div
                        onClick={() => hasDetail && togglePeriodo(t.periodo)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: GRID_TEMPLATE,
                          gap: 10,
                          alignItems: "center",
                          padding: "6px 0",
                          borderBottom: expanded ? "none" : "0.5px solid rgba(31,41,55,0.3)",
                          cursor: hasDetail ? "pointer" : "default",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { if (hasDetail) e.currentTarget.style.background = "rgba(55,138,221,0.04)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {/* Chevron */}
                        <div style={{
                          fontSize: 10,
                          color: hasDetail ? (expanded ? "#378ADD" : "var(--text-muted)") : "transparent",
                          textAlign: "center",
                          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                          userSelect: "none",
                        }}>▶</div>

                        {/* Periodo label */}
                        <div style={{ fontSize: 11, color: "var(--text)" }}>{t.periodo_label}</div>

                        {/* Barra + nº objeciones/REOB */}
                        <div>
                          <div style={{ height: 5, background: "var(--card-border)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${Math.round(t.total / maxPeriodo * 100)}%`,
                              background: "#378ADD", borderRadius: 3, transition: "width 0.4s",
                            }} />
                          </div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                            {t.total} obj{reobTotalPeriodo > 0 && <> · {reobTotalPeriodo} REOB</>}
                          </div>
                        </div>

                        {/* Pendientes */}
                        <div style={{
                          fontSize: 11, textAlign: "center", fontWeight: 500,
                          color: t.pendientes > 0 ? "#BA7517" : "var(--text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {t.pendientes}
                        </div>

                        {/* Respuestas REE del periodo (agregado, excluyendo INCL) */}
                        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {!tieneRespuestasREE && t.ree_na === 0 ? (
                            <span style={{ fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
                              Sin REOB enviados
                            </span>
                          ) : (
                            <>
                              <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                background: "rgba(29,158,117,0.15)",
                                color: t.ree_ok > 0 ? "#0F6E56" : "var(--text-muted)",
                                fontWeight: 500,
                                opacity: t.ree_ok > 0 ? 1 : 0.5,
                              }}>🟢 {t.ree_ok}</span>
                              <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                background: "rgba(226,75,74,0.15)",
                                color: t.ree_bad > 0 ? "#A32D2D" : "var(--text-muted)",
                                fontWeight: 500,
                                opacity: t.ree_bad > 0 ? 1 : 0.5,
                              }}>🔴 {t.ree_bad}</span>
                          <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                background: "rgba(156,163,175,0.15)",
                                color: t.ree_sin_resp > 0 ? "var(--text)" : "var(--text-muted)",
                                fontWeight: 500,
                                opacity: t.ree_sin_resp > 0 ? 1 : 0.5,
                              }}>⚪ {t.ree_sin_resp}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ── Detalle desplegado: filas por tipo ────────── */}
                      {expanded && hasDetail && (
                        <div style={{
                          background: "rgba(55,138,221,0.04)",
                          borderTop: "0.5px dashed rgba(55,138,221,0.18)",
                          borderBottom: "0.5px solid rgba(31,41,55,0.3)",
                          padding: "4px 0",
                        }}>
                          {tiposDetalle.map((tipoRow) => {
                            const chipStyle = TIPO_CHIP_STYLE[tipoRow.tipo] ?? { background: "rgba(156,163,175,0.15)", color: "var(--text-muted)" };
                            const chipLabel = TIPO_LABEL_CORTO[tipoRow.tipo] ?? tipoRow.tipo;
                            const widthPct = Math.round(tipoRow.obj_total / maxPeriodo * 100);
                            const esINCL = tipoRow.tipo === "OBJEINCL";

                            return (
                              <div key={tipoRow.tipo} style={{
                                display: "grid",
                                gridTemplateColumns: GRID_TEMPLATE,
                                gap: 10,
                                alignItems: "center",
                                padding: "4px 0",
                              }}>
                                {/* Hueco del chevron */}
                                <div></div>

                                {/* Chip del tipo */}
                                <div>
                                  <span style={{
                                    ...chipStyle,
                                    padding: "1px 6px", borderRadius: 4,
                                    fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                                    display: "inline-block",
                                  }}>{chipLabel}</span>
                                </div>

                                {/* Barra del tipo (alineada con la del periodo) */}
                                <div>
                                  <div style={{ height: 5, background: "var(--card-border)", borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{
                                      height: "100%",
                                      width: `${widthPct}%`,
                                      background: chipStyle.color as string,
                                      borderRadius: 3, transition: "width 0.4s",
                                      opacity: 0.7,
                                    }} />
                                  </div>
                                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                                    <InfoTooltip text={tooltipObjReob(tipoRow.obj_total, tipoRow.reob_total, esINCL)}>
                                      <span style={{ cursor: "help", borderBottom: tipoRow.reob_total > 0 ? "1px dotted var(--text-muted)" : "none" }}>
                                        {tipoRow.obj_total} obj{tipoRow.reob_total > 0 && <> · {tipoRow.reob_total} REOB</>}
                                      </span>
                                    </InfoTooltip>
                                  </div>
                                </div>

                                {/* Pendientes del tipo */}
                                <div style={{
                                  fontSize: 10, textAlign: "center", fontWeight: 500,
                                  color: tipoRow.obj_pendientes > 0 ? "#BA7517" : "var(--text-muted)",
                                  fontVariantNumeric: "tabular-nums",
                                }}>
                                  {tipoRow.obj_pendientes}
                                </div>

                                {/* Respuestas REE del tipo */}
                                <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                  {esINCL ? (
                                    <span
                                      title="REE no envía respuestas (.ok/.bad) para los REOB de tipo INCL"
                                      style={{
                                        fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                        background: "rgba(107,114,128,0.10)",
                                        color: "var(--text-muted)",
                                        fontWeight: 500,
                                        cursor: "help",
                                      }}
                                    >N/A</span>
                                  ) : (
                                    <>
                                      {tipoRow.ree_ok > 0 && (
                                        <span style={{
                                          fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                          background: "rgba(29,158,117,0.15)",
                                          color: "#0F6E56",
                                          fontWeight: 500,
                                        }}>🟢 {tipoRow.ree_ok}</span>
                                      )}
                                      {tipoRow.ree_bad > 0 && (
                                        <span style={{
                                          fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                          background: "rgba(226,75,74,0.15)",
                                          color: "#A32D2D",
                                          fontWeight: 500,
                                        }}>🔴 {tipoRow.ree_bad}</span>
                                      )}
                                      {tipoRow.ree_sin_resp > 0 && (
                                        <span style={{
                                          fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                          background: "rgba(156,163,175,0.15)",
                                          color: "var(--text)",
                                          fontWeight: 500,
                                        }}>⚪ {tipoRow.ree_sin_resp}</span>
                                      )}
                                      {tipoRow.ree_ok === 0 && tipoRow.ree_bad === 0 && tipoRow.ree_sin_resp === 0 && (
                                        <span style={{ fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
                                          —
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ background: "var(--field-bg-soft)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Por empresa</div>
              {(dash?.por_empresa ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin datos</div>
              ) : (
                (dash?.por_empresa ?? []).map((e) => {
                  const isActive = empresaActiva && e.empresa_id === empresaActiva.id;
                  const eSftp = (e as DashEmpresa & { enviadas_sftp?: number }).enviadas_sftp ?? 0;
                  return (
                    <div key={e.empresa_id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 8,
                      padding: "5px 6px", marginBottom: 4, borderRadius: 6,
                      background: isActive ? "rgba(55,138,221,0.1)" : "transparent",
                      border: isActive ? "0.5px solid rgba(55,138,221,0.3)" : "0.5px solid transparent",
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.empresa_nombre}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{e.empresa_codigo_ree ?? "—"}</div>
                      </div>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "60px 36px 36px",
                        gap: 2,
                        flexShrink: 0,
                      }}>
                        <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.pendientes} pend.</span>
                        <span className="ui-badge ui-badge--ok" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.aceptadas}</span>
                        <span className="ui-badge ui-badge--err" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.rechazadas}</span>
                        <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.total} total</span>
                        <span
                          className="ui-badge"
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            textAlign: "center",
                            gridColumn: "span 2",
                            background: "rgba(55,138,221,0.15)",
                            color: "#378ADD",
                            border: "0.5px solid rgba(55,138,221,0.35)",
                          }}
                        >
                          {eSftp} enviados
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}