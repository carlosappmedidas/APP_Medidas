"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type { DashData, EmpresaOption } from "./objeciones/shared/types";
import DashboardPanel from "./objeciones/DashboardPanel";
import DescargaPanel from "./objeciones/DescargaPanel";
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

  // ── Datos del scheduler de objeciones (para tarjeta "Automatización") ──
  // Ahora son 3 configs: fin_recepcion, fin_resolucion, buscar_respuestas_ree.
  // Las 3 se pasan al Dashboard para que pueda mostrar una línea "Último" por cada una.
  type AutoConfigItem = {
    activa: boolean;
    ultimo_run_at: string | null;
    ultimo_run_ok: boolean | null;
    ultimo_run_msg: string | null;
  };
  type AutoConfigAll = {
    fin_recepcion:         AutoConfigItem;
    fin_resolucion:        AutoConfigItem;
    buscar_respuestas_ree: AutoConfigItem;
  };
  const [autoConfig, setAutoConfig] = useState<AutoConfigAll | null>(null);
  const [alertasResumen, setAlertasResumen] = useState<{
    total_alertas: number;
    empresas_afectadas: number;
    periodos_afectados: number;
    total_aobs_pendientes: number;
  } | null>(null);

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

  // ── Cargar automatización + resumen alertas (para tarjeta "Automatización") ──
  useEffect(() => {
    if (!token) return;
    const cargar = async () => {
      try {
        const [resConfig, resResumen] = await Promise.all([
          fetch(`${API_BASE_URL}/objeciones/automatizacion/config`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE_URL}/objeciones/alertas/resumen`,       { headers: getAuthHeaders(token) }),
        ]);
        if (resConfig.ok) {
          // El endpoint devuelve un objeto con 3 claves. Normalizamos por seguridad.
          const data = await resConfig.json();
          const norm = (c: Partial<AutoConfigItem> | undefined): AutoConfigItem => ({
            activa:         !!c?.activa,
            ultimo_run_at:  c?.ultimo_run_at  ?? null,
            ultimo_run_ok:  c?.ultimo_run_ok  ?? null,
            ultimo_run_msg: c?.ultimo_run_msg ?? null,
          });
          setAutoConfig({
            fin_recepcion:         norm(data.fin_recepcion),
            fin_resolucion:        norm(data.fin_resolucion),
            buscar_respuestas_ree: norm(data.buscar_respuestas_ree),
          });
        }
        if (resResumen.ok) setAlertasResumen(await resResumen.json());
      } catch { /* silencioso */ }
    };
    void cargar();
  }, [token]);

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
          <DashboardPanel
            dash={dash}
            loading={dashLoading}
            empresaFiltroId={empresaFiltroId}
            empresas={empresas}
            autoConfig={autoConfig}
            alertasResumen={alertasResumen}
          />
        )}
      </div>

      {/* ── PANEL 2: Descarga en Objeciones ──────────────────────────── */}
      <DescargaPanel
        token={token}
        empresas={empresas}
        onDashRefresh={cargarDash}
        onError={setError}
      />

      {/* ── PANEL 3: Gestión ───────────────────────────────────────────── */}
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