// app/components/settings/SistemaSection.tsx
"use client";
import React, { useCallback, useEffect, useState } from "react";
import MedidasPsSection from "../medidas/MedidasPsSection";
import MedidasGeneralSection from "../medidas/MedidasGeneralSection";
import AccordionCard from "../ui/AccordionCard";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = { token: string | null };

type TenantItem  = { id: number; nombre: string };
type EmpresaItem = { id: number; nombre: string; tenant_id: number };

type LifecycleStatus = "nueva" | "en_revision" | "resuelta";
type Severity        = "info" | "warning" | "critical";
type Category        = "mes_anterior" | "absoluta" | "anio_anterior";

type AlertRow = {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  tenant_id: number;
  alert_code: string;
  alerta: string;
  category: Category;
  anio: number;
  mes: number;
  severity: Severity;
  current_value: number | null;
  previous_value: number | null;
  diff_value: number | null;
  diff_unit: string;
  threshold_value: number;
  lifecycle_status: LifecycleStatus;
  message: string | null;
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const CATEGORY_COLORS: Record<Category, { bg: string; color: string; border: string }> = {
  mes_anterior:  { bg: "rgba(37,99,235,0.12)",  color: "#60a5fa", border: "rgba(37,99,235,0.3)" },
  absoluta:      { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  anio_anterior: { bg: "rgba(5,150,105,0.12)",  color: "#34d399", border: "rgba(5,150,105,0.3)" },
};
const SEVERITY_COLORS: Record<Severity, { bg: string; color: string }> = {
  info:     { bg: "rgba(30,58,95,0.3)",   color: "var(--text-muted)" },
  warning:  { bg: "rgba(245,158,11,0.2)", color: "#fbbf24" },
  critical: { bg: "rgba(239,68,68,0.18)", color: "#f87171" },
};
const LIFECYCLE_COLORS: Record<LifecycleStatus, { bg: string; color: string }> = {
  nueva:       { bg: "rgba(239,68,68,0.18)",  color: "#f87171" },
  en_revision: { bg: "rgba(37,99,235,0.18)",  color: "#60a5fa" },
  resuelta:    { bg: "rgba(5,150,105,0.18)",  color: "#34d399" },
};
const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  nueva: "Nueva", en_revision: "En revisión", resuelta: "Resuelta",
};

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 500, background: bg, color }}>{children}</span>;
}

const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: "5px 12px",
  border: "0.5px solid var(--card-border)",
  borderRadius: 6, background: "var(--card-bg)",
  color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap",
};
const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: "5px 8px",
  border: "0.5px solid var(--card-border)",
  borderRadius: 6, background: "var(--card-bg)",
  color: "var(--text)", width: "100%",
};
const thStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: 11, fontWeight: 500,
  color: "var(--text-muted)", borderBottom: "0.5px solid var(--card-border)",
  whiteSpace: "nowrap", textAlign: "left",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 12, color: "var(--text)",
  borderBottom: "0.5px solid var(--card-border)", verticalAlign: "middle",
};

// ── Panel de gestión de alertas ───────────────────────────────────────────

function AlertsAdminPanel({ token }: { token: string | null }) {
  const [tenants,   setTenants]   = useState<TenantItem[]>([]);
  const [empresas,  setEmpresas]  = useState<EmpresaItem[]>([]);
  const [tenantId,  setTenantId]  = useState("none");
  const [empresaId, setEmpresaId] = useState("all");
  const [anio,      setAnio]      = useState("all");
  const [mes,       setMes]       = useState("all");
  const [lifecycle, setLifecycle] = useState("all");

  const [alerts,        setAlerts]        = useState<AlertRow[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [ok,      setOk]      = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "reset" | "delete">(null);

  // ── Cargar tenants ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/auth/admin/tenants`, { headers: getAuthHeaders(token) })
      .then((r) => r.ok ? r.json() : [])
      .then((json) => setTenants(Array.isArray(json) ? json : []))
      .catch(() => setTenants([]));
  }, [token]);

  // ── Cargar empresas del tenant seleccionado ────────────────────────
  const loadEmpresas = useCallback(async (tid: string) => {
    if (!token || tid === "none") { setEmpresas([]); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, { headers: getAuthHeaders(token) });
      if (!res.ok) { setEmpresas([]); return; }
      const json = await res.json();
      setEmpresas(
        (Array.isArray(json) ? json : [])
          .filter((e: any) => String(e.tenant_id) === tid)
          .map((e: any) => ({ id: Number(e.id), nombre: String(e.nombre), tenant_id: Number(e.tenant_id) }))
          .sort((a: EmpresaItem, b: EmpresaItem) => a.nombre.localeCompare(b.nombre))
      );
    } catch { setEmpresas([]); }
  }, [token]);

  useEffect(() => {
    setEmpresaId("all");
    loadEmpresas(tenantId);
  }, [tenantId, loadEmpresas]);

  // ── Cargar alertas según filtros activos ───────────────────────────
  const loadAlerts = useCallback(async () => {
    if (!token || tenantId === "none") { setAlerts([]); return; }
    setLoadingAlerts(true);
    try {
      const params = new URLSearchParams();
      params.set("tenant_id", tenantId);
      if (empresaId !== "all") params.set("empresa_id", empresaId);
      if (anio      !== "all") params.set("anio",        anio);
      if (mes       !== "all") params.set("mes",          mes);
      if (lifecycle !== "all") params.set("lifecycle_status", lifecycle);
      const res = await fetch(`${API_BASE_URL}/alerts/results?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      setAlerts(await res.json());
    } catch { setAlerts([]); }
    finally { setLoadingAlerts(false); }
  }, [token, tenantId, empresaId, anio, mes, lifecycle]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // ── Payload y descripción ──────────────────────────────────────────
  const buildPayload = () => ({
    tenant_id:        Number(tenantId),
    empresa_id:       empresaId !== "all" ? Number(empresaId) : undefined,
    anio:             anio      !== "all" ? Number(anio)      : undefined,
    mes:              mes       !== "all" ? Number(mes)        : undefined,
    lifecycle_status: lifecycle !== "all" ? lifecycle          : undefined,
  });

  const scopeLabel = () => {
    const t = tenants.find((t) => String(t.id) === tenantId)?.nombre ?? `Tenant ${tenantId}`;
    const e = empresaId !== "all" ? empresas.find((e) => String(e.id) === empresaId)?.nombre ?? `Empresa ${empresaId}` : "todas las empresas";
    const a = anio !== "all" ? anio : "todos los años";
    const m = mes  !== "all" ? MESES[Number(mes) - 1] : "todos los meses";
    const l = lifecycle !== "all" ? `estado "${lifecycle}"` : "todos los estados";
    return `${t} · ${e} · ${a} · ${m} · ${l}`;
  };

  const aniosOpciones = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  // ── Ejecutar reset ─────────────────────────────────────────────────
  const handleReset = async () => {
    if (!token || tenantId === "none") return;
    setLoading(true); setError(null); setOk(null); setConfirm(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/admin/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setOk(`✓ Reiniciadas ${json.alertas_reiniciadas} alertas a "nueva" · ${scopeLabel()}`);
      await loadAlerts();
    } catch (e: any) { setError(e.message ?? "Error al reiniciar."); }
    finally { setLoading(false); }
  };

  // ── Ejecutar borrado ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!token || tenantId === "none") return;
    setLoading(true); setError(null); setOk(null); setConfirm(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/admin/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setOk(`✓ Borradas ${json.alertas_borradas} alertas · ${scopeLabel()}`);
      await loadAlerts();
    } catch (e: any) { setError(e.message ?? "Error al borrar."); }
    finally { setLoading(false); }
  };

  // ── Stats del listado ──────────────────────────────────────────────
  const stats = {
    total:       alerts.length,
    nuevas:      alerts.filter((a) => a.lifecycle_status === "nueva").length,
    en_revision: alerts.filter((a) => a.lifecycle_status === "en_revision").length,
    resueltas:   alerts.filter((a) => a.lifecycle_status === "resuelta").length,
    criticas:    alerts.filter((a) => a.severity === "critical").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Mensajes */}
      {error && <div className="ui-alert ui-alert--danger">{error}</div>}
      {ok && (
        <div style={{ padding: "8px 12px", background: "rgba(5,150,105,0.1)", border: "0.5px solid rgba(5,150,105,0.3)", borderRadius: 8, fontSize: 12, color: "#34d399" }}>
          {ok}
        </div>
      )}

      {/* Advertencia */}
      <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "0.5px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 12, color: "#f87171" }}>
        <strong>Zona de operaciones destructivas.</strong> El reinicio borra comentarios e historial. El borrado elimina las alertas físicamente. Usa los filtros para acotar el alcance antes de ejecutar.
      </div>

      {/* Filtros */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Tenant *</div>
          <select style={inputStyle} value={tenantId} onChange={(e) => { setTenantId(e.target.value); setOk(null); setError(null); }}>
            <option value="none">Selecciona tenant</option>
            {tenants.map((t) => <option key={t.id} value={String(t.id)}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Empresa</div>
          <select style={inputStyle} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} disabled={tenantId === "none"}>
            <option value="all">Todas</option>
            {empresas.map((e) => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Año</div>
          <select style={inputStyle} value={anio} onChange={(e) => setAnio(e.target.value)}>
            <option value="all">Todos</option>
            {aniosOpciones.map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Mes</div>
          <select style={inputStyle} value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="all">Todos</option>
            {MESES.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Estado</div>
          <select style={inputStyle} value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
            <option value="all">Todos</option>
            <option value="nueva">Nueva</option>
            <option value="en_revision">En revisión</option>
            <option value="resuelta">Resuelta</option>
          </select>
        </div>
      </div>

      {/* Scope + botones */}
      {tenantId !== "none" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", flex: 1, padding: "6px 10px", background: "var(--field-bg-soft)", borderRadius: 6 }}>
            Alcance: <strong style={{ color: "var(--text)" }}>{scopeLabel()}</strong>
          </div>
          <button
            style={{ ...btnStyle, background: "rgba(37,99,235,0.15)", color: "#60a5fa", borderColor: "rgba(37,99,235,0.3)" }}
            disabled={loading}
            onClick={() => setConfirm("reset")}
          >
            Reiniciar a "nueva"
          </button>
          <button
            style={{ ...btnStyle, background: "rgba(239,68,68,0.15)", color: "#f87171", borderColor: "rgba(239,68,68,0.3)" }}
            disabled={loading}
            onClick={() => setConfirm("delete")}
          >
            Borrar alertas
          </button>
        </div>
      )}

      {/* Confirmación */}
      {confirm && (
        <div style={{
          padding: "14px 16px",
          background: confirm === "delete" ? "rgba(239,68,68,0.08)" : "rgba(37,99,235,0.08)",
          border: `0.5px solid ${confirm === "delete" ? "rgba(239,68,68,0.3)" : "rgba(37,99,235,0.3)"}`,
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: confirm === "delete" ? "#f87171" : "#60a5fa" }}>
            {confirm === "delete" ? "⚠️ Confirmar borrado" : "Confirmar reinicio"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            {confirm === "delete"
              ? `Se borrarán físicamente ${stats.total} alertas (y sus comentarios). Esta operación no se puede deshacer.`
              : `Se reiniciarán ${stats.total} alertas a "nueva" borrando su historial de comentarios.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...btnStyle, background: confirm === "delete" ? "rgba(239,68,68,0.2)" : "rgba(37,99,235,0.2)", color: confirm === "delete" ? "#f87171" : "#60a5fa", borderColor: confirm === "delete" ? "rgba(239,68,68,0.4)" : "rgba(37,99,235,0.4)" }}
              disabled={loading}
              onClick={confirm === "delete" ? handleDelete : handleReset}
            >
              {loading ? "Ejecutando..." : confirm === "delete" ? "Sí, borrar" : "Sí, reiniciar"}
            </button>
            <button style={btnStyle} onClick={() => setConfirm(null)} disabled={loading}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Listado de alertas ── */}
      {tenantId !== "none" && (
        <div style={{ border: "0.5px solid var(--card-border)", borderRadius: 10, overflow: "hidden", background: "var(--card-bg)" }}>
          {/* Stats mini */}
          <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--card-border)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { label: "Total",       value: stats.total,       color: "var(--text)" },
              { label: "Nuevas",      value: stats.nuevas,      color: "#f87171" },
              { label: "En revisión", value: stats.en_revision, color: "#60a5fa" },
              { label: "Resueltas",   value: stats.resueltas,   color: "#34d399" },
              { label: "Críticas",    value: stats.criticas,    color: "#f87171" },
            ].map((s) => (
              <div key={s.label} style={{ background: "var(--field-bg-soft)", borderRadius: 7, padding: "5px 10px", textAlign: "center", minWidth: 54 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.label}</div>
              </div>
            ))}
            {loadingAlerts && <div style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>Cargando...</div>}
          </div>

          {/* Tabla */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Empresa</th>
                  <th style={thStyle}>Periodo</th>
                  <th style={thStyle}>Regla</th>
                  <th style={thStyle}>Categoría</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Valor actual</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Diferencia</th>
                  <th style={thStyle}>Severidad</th>
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {!loadingAlerts && alerts.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                    {tenantId === "none" ? "Selecciona un tenant para ver las alertas." : "No hay alertas con los filtros actuales."}
                  </td></tr>
                )}
                {alerts.map((a) => {
                  const cat = CATEGORY_COLORS[a.category] ?? CATEGORY_COLORS["mes_anterior"];
                  const sev = SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS["info"];
                  const lc  = LIFECYCLE_COLORS[a.lifecycle_status] ?? LIFECYCLE_COLORS["nueva"];
                  const isAbs = a.category === "absoluta";
                  return (
                    <tr key={a.id} style={{ cursor: "default" }}>
                      <td style={tdStyle}><span style={{ fontWeight: 500 }}>{a.empresa_nombre}</span></td>
                      <td style={tdStyle}>{MESES[(a.mes ?? 1) - 1]} {a.anio}</td>
                      <td style={{ ...tdStyle, maxWidth: 200 }}>
                        <div style={{ fontWeight: 500 }}>{a.alerta}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{a.alert_code}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500, background: cat.bg, color: cat.color, border: `0.5px solid ${cat.border}`, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {a.category === "mes_anterior" ? "mes ant." : a.category === "absoluta" ? "absoluta" : "año ant."}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {a.current_value != null ? `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a.current_value)} ${a.diff_unit === "%" ? "%" : ""}` : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {isAbs
                          ? `umbral ${a.threshold_value} ${a.diff_unit}`
                          : a.diff_value != null ? `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a.diff_value)} ${a.diff_unit}` : "—"}
                      </td>
                      <td style={tdStyle}><Badge {...sev}>{a.severity === "critical" ? "Crítica" : a.severity === "warning" ? "Warning" : "Info"}</Badge></td>
                      <td style={tdStyle}><Badge {...lc}>{LIFECYCLE_LABELS[a.lifecycle_status]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export default function SistemaSection({ token }: Props) {
  return (
    <div className="space-y-6">

      <AccordionCard
        title="Gestión de alertas · Sistema"
        subtitle="Ver, reiniciar o borrar alertas por tenant, empresa y periodo. Solo superusuario."
        defaultOpen={false}
      >
        <AlertsAdminPanel token={token} />
      </AccordionCard>

      <AccordionCard
        title="Medidas (PS) · Sistema"
        subtitle="Vista global para todos los clientes. Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasPsSection token={token} scope="all" />
      </AccordionCard>

      <AccordionCard
        title="Medidas (General) · Sistema"
        subtitle="Vista global para todos los clientes. Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasGeneralSection token={token} scope="all" />
      </AccordionCard>

    </div>
  );
}
