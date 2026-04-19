// Panel 1 del módulo Objeciones: Dashboard / Resumen.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.5).

import type { DashData, DashEmpresa, EmpresaOption } from "./shared/types";

interface DashboardPanelProps {
  dash: DashData | null;
  loading: boolean;
  empresaFiltroId: number | null;
  empresas: EmpresaOption[];
}

export default function DashboardPanel({
  dash, loading, empresaFiltroId, empresas,
}: DashboardPanelProps) {
  const total = dash?.total ?? 0;
  const pend  = dash?.pendientes ?? 0;
  const ok    = dash?.aceptadas ?? 0;
  const err   = dash?.rechazadas ?? 0;
  const pct   = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
  const empresaActiva = empresaFiltroId ? empresas.find((e) => e.id === empresaFiltroId) : null;
  const maxTipo = Math.max(1, ...(dash?.por_tipo ?? []).map((t) => t.total));

  return (
    <div style={{ padding: "16px 20px", borderTop: "1px solid var(--card-border)" }}>
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "12px 0" }}>Cargando resumen...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 8, marginBottom: 14 }}>            {[
              { label: "Total objeciones", val: total, sub: `${dash?.por_tipo.length ?? 0} tipos · ${dash?.por_empresa.length ?? 0} empresa${(dash?.por_empresa.length ?? 0) !== 1 ? "s" : ""}`, color: "var(--text)", bar: null },
              { label: "Pendientes",       val: pend,  sub: `${pct(pend)}% del total`, color: "#BA7517", bar: { pct: pct(pend), bg: "#EF9F27" } },
              { label: "Aceptadas",        val: ok,    sub: `${pct(ok)}% del total`,   color: "#1D9E75", bar: { pct: pct(ok),   bg: "#1D9E75" } },
              { label: "Rechazadas",       val: err,   sub: `${pct(err)}% del total`,  color: "#E24B4A", bar: { pct: pct(err),  bg: "#E24B4A" } },
              { label: "Enviadas SFTP",    val: dash?.enviadas_sftp ?? 0, sub: `${pct(dash?.enviadas_sftp ?? 0)}% del total`, color: "#378ADD", bar: { pct: pct(dash?.enviadas_sftp ?? 0), bg: "#378ADD" } },            ].map((kpi) => (
              <div key={kpi.label} style={{ background: "var(--field-bg-soft)", borderRadius: 8, padding: "11px 13px" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: kpi.color }}>{kpi.val}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{kpi.sub}</div>
                {kpi.bar && (
                  <div style={{ height: 3, background: "var(--card-border)", borderRadius: 2, marginTop: 7, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${kpi.bar.pct}%`, background: kpi.bar.bg, borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 10 }}>
            <div style={{ background: "var(--field-bg-soft)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Por tipo de objeción</div>
              {(dash?.por_tipo ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin datos</div>
              ) : (
                (dash?.por_tipo ?? []).map((t) => (
                  <div key={t.tipo} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <div style={{ fontSize: 11, color: "var(--text)", width: 90, flexShrink: 0 }}>{t.tipo}</div>
                    <div style={{ flex: 1, height: 5, background: "var(--card-border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round(t.total / maxTipo * 100)}%`, background: "#378ADD", borderRadius: 3, transition: "width 0.4s" }} />
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
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "stretch", flexShrink: 0 }}>
                        {/* Fila 1: pendientes + aceptadas + rechazadas (3 columnas iguales) */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                          <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9, textAlign: "center" }}>{e.pendientes} pend.</span>
                          <span className="ui-badge ui-badge--ok" style={{ fontSize: 9, textAlign: "center" }}>{e.aceptadas}</span>
                          <span className="ui-badge ui-badge--err" style={{ fontSize: 9, textAlign: "center" }}>{e.rechazadas}</span>
                        </div>
                        {/* Fila 2: total (span 2 cols) + sftp (1 col) — mismo ancho total que la fila 1 */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                          <span className="ui-badge ui-badge--neutral" style={{ fontSize: 9, textAlign: "center", gridColumn: "span 2" }}>{e.total} total</span>
                          <span
                            className="ui-badge"
                            style={{
                              fontSize: 9,
                              textAlign: "center",
                              background: "rgba(55,138,221,0.15)",
                              color: "#378ADD",
                              border: "0.5px solid rgba(55,138,221,0.35)",
                            }}
                          >
                            {eSftp} sftp
                          </span>
                        </div>
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