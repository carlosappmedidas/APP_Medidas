// Panel 1 del módulo Objeciones: Dashboard / Resumen.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.5).

import type { DashData, DashEmpresa, EmpresaOption } from "./shared/types";
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

  // ── Derivados de autoConfig / alertasResumen para la tarjeta Automatización ──
  const autoActiva        = autoConfig?.activa ?? false;
  const alertasActivasNum = alertasResumen?.total_alertas ?? 0;
  const estadoLabel       = autoActiva ? "Activa" : "Desactivada";
  const estadoPuntoColor  = autoActiva ? "#1D9E75" : "#94A3B8";
  const iconoColor        = autoActiva ? "#1D9E75" : "var(--text-muted)";
  const iconoBg           = autoActiva ? "rgba(29,158,117,0.15)" : "rgba(148,163,184,0.12)";
  const alertasColor      = alertasActivasNum > 0 ? "#A32D2D" : "var(--text-muted)";

  // Formateo del último run: "21/04/2026 23:00 ✓" / "ayer 23:00 ⚠"
  const formatearUltimoRun = (iso: string | null, okFlag: boolean | null): string => {
    if (!iso) return "Sin ejecutar aún";
    try {
      const d = new Date(iso);
      const dd  = String(d.getDate()).padStart(2, "0");
      const mm  = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const hh  = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      const marker = okFlag === true ? "✓" : okFlag === false ? "⚠" : "";
      return `Último: ${dd}/${mm}/${yyyy} ${hh}:${min} ${marker}`.trim();
    } catch {
      return "Sin ejecutar aún";
    }
  };
  const ultimoRunTexto = formatearUltimoRun(
    autoConfig?.ultimo_run_at ?? null,
    autoConfig?.ultimo_run_ok ?? null,
  );

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
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Por periodo</div>
              {(dash?.por_periodo ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin datos</div>
              ) : (
                (dash?.por_periodo ?? []).map((t) => (
                  <div key={t.periodo} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <div style={{ fontSize: 11, color: "var(--text)", width: 90, flexShrink: 0 }}>{t.periodo_label}</div>
                    <div style={{ flex: 1, height: 5, background: "var(--card-border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round(t.total / maxPeriodo * 100)}%`, background: "#378ADD", borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", width: 70, textAlign: "right", whiteSpace: "nowrap" }}>
                      {t.total} · {t.pendientes} pend.
                    </div>
                  </div>
                ))
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
                        gridTemplateColumns: "60px 36px 36px",  // col1: pend/total · col2/3: aceptadas/rechazadas/enviados
                        gap: 2,
                        flexShrink: 0,
                      }}>
                        {/* Fila 1: pendientes · aceptadas · rechazadas */}
                        <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.pendientes} pend.</span>
                        <span className="ui-badge ui-badge--ok" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.aceptadas}</span>
                        <span className="ui-badge ui-badge--err" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.rechazadas}</span>

                        {/* Fila 2: total · enviados (enviados ocupa 2 columnas) */}
                        <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9, padding: "1px 5px", textAlign: "center" }}>{e.total} total</span>
                        <span
                          className="ui-badge"
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            textAlign: "center",
                            gridColumn: "span 2",  // ocupa col2 + col3
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