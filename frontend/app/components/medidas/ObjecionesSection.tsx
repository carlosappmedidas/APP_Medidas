"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type { DashData, EmpresaOption } from "./objeciones/shared/types";
import DashboardPanel from "./objeciones/DashboardPanel";
import DescargaPanel from "./objeciones/DescargaPanel";
import GestionPanel from "./objeciones/GestionPanel";
import HistorialPanel from "./objeciones/HistorialPanel";
import CampanaAlertasObjeciones from "./CampanaAlertasObjeciones";

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
  onGoToObjecionesConfig?: () => void;
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

export default function ObjecionesSection({ token, currentUser, onGoToObjecionesConfig }: ObjecionesSectionProps) {

  const [dashOpen, setDashOpen] = useState(true);

  const [dash, setDash]               = useState<DashData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Nonce para forzar remount del DescargaPanel cuando la campanita pulsa
  // "Abrir en Descarga". El DescargaPanel lee localStorage solo al montarse,
  // así que cambiando su `key` lo obligamos a remontar y leer la intención.
  const [descargaRemountNonce, setDescargaRemountNonce] = useState(0);

  const handleAbrirDescargaDesdeCampana = () => {
    // Asegurar que el panel de Resumen esté abierto (no afecta al Descarga, pero queda más claro).
    setDescargaRemountNonce((n) => n + 1);
    // Scroll al panel de Descarga tras un pequeño delay para que React lo remonte.
    setTimeout(() => {
      const el = document.querySelector('[data-panel="objeciones-descarga"]') as HTMLElement | null;
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

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

  // ── Cargar automatización (para tarjeta "Automatización") ──
  useEffect(() => {
    if (!token) return;
    const cargar = async () => {
      try {
        const resConfig = await fetch(
          `${API_BASE_URL}/objeciones/automatizacion/config`,
          { headers: getAuthHeaders(token) },
        );
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <CampanaAlertasObjeciones
              token={token}
              onAbrirDescarga={handleAbrirDescargaDesdeCampana}
            />
            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={(e) => { e.stopPropagation(); setDashOpen((v) => !v); }}>
              {dashOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        {dashOpen && (
          <DashboardPanel
            dash={dash}
            loading={dashLoading}
            empresaFiltroId={empresaFiltroId}
            empresas={empresas}
            autoConfig={autoConfig}
            onGoToObjecionesConfig={onGoToObjecionesConfig}
          />
        )}
      </div>

      {/* ── PANEL 2: Descarga en Objeciones ──────────────────────────── */}
      <div data-panel="objeciones-descarga">
        <DescargaPanel
          key={descargaRemountNonce}
          token={token}
          empresas={empresas}
          onDashRefresh={cargarDash}
          onError={setError}
        />
      </div>

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