"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type { DashData, EmpresaOption } from "./objeciones/shared/types";
import DashboardPanel from "./objeciones/DashboardPanel";
import GestionPanel from "./objeciones/GestionPanel";
import HistorialPanel from "./objeciones/HistorialPanel";

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

// ─── Estilos panel (estilo Configuración) ─────────────────────────────────────

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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjecionesSection({ token, currentUser }: ObjecionesSectionProps) {

  const [dashOpen, setDashOpen] = useState(true);

  const [dash, setDash]               = useState<DashData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  const [empresas, setEmpresas]               = useState<EmpresaOption[]>([]);
  const [empresaFiltroId, setEmpresaFiltroId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  // ── Cargar empresas ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) });
        if (!res.ok) return;
        const data: EmpresaOption[] = await res.json();
        setEmpresas(data);
      } catch { /* silencioso */ }
    };
    void fetch_();
  }, [token, currentUser]);

  // ── Cargar dashboard ──────────────────────────────────────────────────────

  const cargarDash = useCallback(async () => {
    if (!token) return;
    setDashLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresaFiltroId) params.set("empresa_id", String(empresaFiltroId));
      const res = await fetch(`${API_BASE_URL}/objeciones/dashboard?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setDash(await res.json());
    } catch { setDash(null); }
    finally { setDashLoading(false); }
  }, [token, empresaFiltroId]);

  useEffect(() => { cargarDash(); }, [cargarDash]);

  // ── Descripción dashboard ─────────────────────────────────────────────────

  const dashDesc = empresaFiltroId
    ? `${empresas.find((e) => e.id === empresaFiltroId)?.nombre ?? "Empresa"} · ${dash?.total ?? 0} objeciones · ${dash?.pendientes ?? 0} pendientes`
    : `Todas las empresas · ${dash?.total ?? 0} objeciones · ${dash?.pendientes ?? 0} pendientes`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="text-sm">
      {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}

      {/* ── PANEL 1: Dashboard ─────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setDashOpen((v) => !v)}>
          <div>
            <div style={panelTitleStyle}>Resumen de objeciones</div>
            <div style={panelDescStyle}>{dashDesc}</div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={(e) => { e.stopPropagation(); setDashOpen((v) => !v); }}>
            {dashOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {dashOpen && (
          <DashboardPanel dash={dash} loading={dashLoading} empresaFiltroId={empresaFiltroId} empresas={empresas} />
        )}
      </div>

      {/* ── PANEL 2: Gestión ───────────────────────────────────────────── */}
      <GestionPanel
        token={token}
        empresas={empresas}
        empresaFiltroId={empresaFiltroId}
        setEmpresaFiltroId={setEmpresaFiltroId}
        dash={dash}
        onDashRefresh={cargarDash}
        onError={setError}
      />

      {/* ── PANEL 3: Historial REOB ───────────────────────────────────── */}
      <HistorialPanel
        token={token}
        empresaFiltroId={empresaFiltroId}
        setEmpresaFiltroId={setEmpresaFiltroId}
        empresas={empresas}
      />
    </div>
  );
}