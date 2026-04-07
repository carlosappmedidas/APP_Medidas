// app/components/settings/SistemaSection.tsx
"use client";
import React, { useCallback, useEffect, useState } from "react";
import MedidasPsSection from "../medidas/MedidasPsSection";
import MedidasGeneralSection from "../medidas/MedidasGeneralSection";
import AccordionCard from "../ui/AccordionCard";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = { token: string | null };

type TenantItem   = { id: number; nombre: string };
type EmpresaItem  = { id: number; nombre: string; tenant_id: number };

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

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

// ── Panel de gestión de alertas ───────────────────────────────────────────

function AlertsAdminPanel({ token }: { token: string | null }) {
  const [tenants,   setTenants]   = useState<TenantItem[]>([]);
  const [empresas,  setEmpresas]  = useState<EmpresaItem[]>([]);
  const [tenantId,  setTenantId]  = useState("none");
  const [empresaId, setEmpresaId] = useState("all");
  const [anio,      setAnio]      = useState("all");
  const [mes,       setMes]       = useState("all");
  const [lifecycle, setLifecycle] = useState("all");

  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [ok,        setOk]        = useState<string | null>(null);

  // Confirmación explícita antes de ejecutar operaciones destructivas
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
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) { setEmpresas([]); return; }
      const json = await res.json();
      // Filtrar por tenant
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

  // ── Construir payload base ─────────────────────────────────────────
  const buildPayload = () => ({
    tenant_id:        Number(tenantId),
    empresa_id:       empresaId !== "all" ? Number(empresaId) : undefined,
    anio:             anio      !== "all" ? Number(anio)      : undefined,
    mes:              mes       !== "all" ? Number(mes)        : undefined,
    lifecycle_status: lifecycle !== "all" ? lifecycle          : undefined,
  });

  // ── Descripción de la operación ────────────────────────────────────
  const scopeLabel = () => {
    const t = tenants.find((t) => String(t.id) === tenantId)?.nombre ?? `Tenant ${tenantId}`;
    const e = empresaId !== "all"
      ? empresas.find((e) => String(e.id) === empresaId)?.nombre ?? `Empresa ${empresaId}`
      : "todas las empresas";
    const a = anio !== "all" ? anio : "todos los años";
    const m = mes  !== "all" ? MESES[Number(mes) - 1] : "todos los meses";
    const l = lifecycle !== "all" ? `estado "${lifecycle}"` : "todos los estados";
    return `${t} · ${e} · ${a} · ${m} · ${l}`;
  };

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
    } catch (e: any) { setError(e.message ?? "Error al borrar."); }
    finally { setLoading(false); }
  };

  const aniosOpciones = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

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
        {/* Tenant */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Tenant *</div>
          <select style={inputStyle} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="none">Selecciona tenant</option>
            {tenants.map((t) => <option key={t.id} value={String(t.id)}>{t.nombre}</option>)}
          </select>
        </div>
        {/* Empresa */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Empresa</div>
          <select style={inputStyle} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} disabled={tenantId === "none"}>
            <option value="all">Todas</option>
            {empresas.map((e) => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
          </select>
        </div>
        {/* Año */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Año</div>
          <select style={inputStyle} value={anio} onChange={(e) => setAnio(e.target.value)}>
            <option value="all">Todos</option>
            {aniosOpciones.map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </div>
        {/* Mes */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Mes</div>
          <select style={inputStyle} value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="all">Todos</option>
            {MESES.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
          </select>
        </div>
        {/* Estado */}
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

      {/* Scope actual */}
      {tenantId !== "none" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 10px", background: "var(--field-bg-soft)", borderRadius: 6 }}>
          Alcance: <strong style={{ color: "var(--text)" }}>{scopeLabel()}</strong>
        </div>
      )}

      {/* Botones de acción */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          style={{ ...btnStyle, background: "rgba(37,99,235,0.15)", color: "#60a5fa", borderColor: "rgba(37,99,235,0.3)" }}
          disabled={tenantId === "none" || loading}
          onClick={() => setConfirm("reset")}
        >
          Reiniciar alertas a "nueva"
        </button>
        <button
          style={{ ...btnStyle, background: "rgba(239,68,68,0.15)", color: "#f87171", borderColor: "rgba(239,68,68,0.3)" }}
          disabled={tenantId === "none" || loading}
          onClick={() => setConfirm("delete")}
        >
          Borrar alertas
        </button>
      </div>

      {/* Panel de confirmación */}
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
              ? `Se borrarán físicamente las alertas (y sus comentarios) que coincidan con: ${scopeLabel()}. Esta operación no se puede deshacer.`
              : `Se reiniciarán a "nueva" las alertas (borrando su historial de comentarios) que coincidan con: ${scopeLabel()}.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...btnStyle, background: confirm === "delete" ? "rgba(239,68,68,0.2)" : "rgba(37,99,235,0.2)", color: confirm === "delete" ? "#f87171" : "#60a5fa", borderColor: confirm === "delete" ? "rgba(239,68,68,0.4)" : "rgba(37,99,235,0.4)" }}
              disabled={loading}
              onClick={confirm === "delete" ? handleDelete : handleReset}
            >
              {loading ? "Ejecutando..." : confirm === "delete" ? "Sí, borrar" : "Sí, reiniciar"}
            </button>
            <button style={btnStyle} onClick={() => setConfirm(null)} disabled={loading}>
              Cancelar
            </button>
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
        subtitle="Reiniciar o borrar alertas por tenant, empresa y periodo. Solo superusuario."
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
