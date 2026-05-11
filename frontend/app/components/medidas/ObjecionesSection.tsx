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

  // ── Refrescar manualmente (botón "Actualizar" del DashboardPanel) ───────
  // Recarga el dashboard + la config de automatización + la lista de empresas.
  // No recarga la página entera para no perder el estado de la UI (paneles
  // abiertos/cerrados, scroll, filtros aplicados en Descarga, etc.).
  const refrescarTodo = useCallback(async () => {
    if (!token) return;
    // Lanza todo en paralelo
    await Promise.all([
      // Dashboard de objeciones
      cargarDash(),
      // Empresas
      (async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) });
          if (res.ok) setEmpresas(await res.json());
        } catch { /* silencioso */ }
      })(),
      // Config de automatización
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/objeciones/automatizacion/config`,
            { headers: getAuthHeaders(token) },
          );
          if (!res.ok) return;
          const data = await res.json();
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
        } catch { /* silencioso */ }
      })(),
    ]);
  }, [token, cargarDash]);

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

  // ── Cargar mes objetado vigente desde calendario-ree/dashboard-hitos ──────
  // Devuelve el campo `mes_afectado_limite_respuesta_objeciones` en formato
  // "Ago 25" (mes corto + año 2 dígitos). Lo usamos para filtrar las 3 tarjetas
  // del DashboardPanel (TOTAL · ESTADO · POR EMPRESA) en lugar de coger el
  // primer elemento de por_periodo (que es el último mes con datos en BD).
  const [mesObjetadoVigente, setMesObjetadoVigente] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    const cargar = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/calendario-ree/dashboard-hitos`,
          { headers: getAuthHeaders(token) },
        );
        if (!res.ok) return;
        const data = await res.json();
        setMesObjetadoVigente(data?.mes_afectado_limite_respuesta_objeciones ?? null);
      } catch { /* silencioso */ }
    };
    void cargar();
  }, [token]);

  // ── Toggle global "Periodo actual / Histórico" ────────────────────────────
  // Vive aquí (en el padre) en vez de en DashboardPanel, porque ahora afecta
  // también a GestionPanel e HistorialPanel. Cada panel lo recibe como prop
  // y filtra sus datos cuando vale "actual".
  const [vistaPeriodo, setVistaPeriodo] = useState<"actual" | "historico">("actual");

  // Convierte el formato del calendario REE ("Ago 25") al formato YYYYMM
  // que usan los campos aaaamm de los ficheros/REOBs en BD ("202508").
  // Devuelve null si no se puede parsear (entonces "Periodo actual" no filtra).
  const MESES_CORTOS_ES: Record<string, string> = {
    ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
    jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
  };
  const mesObjetadoYYYYMM = (() => {
    if (!mesObjetadoVigente) return null;
    const m = mesObjetadoVigente.trim().match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{2})$/);
    if (!m) return null;
    const mm = MESES_CORTOS_ES[m[1].toLowerCase().slice(0, 3)];
    if (!mm) return null;
    return `20${m[2]}${mm}`; // "Ago 25" → "202508"
  })();

  // ── Descripción dashboard ─────────────────────────────────────────────────

  const dashDesc = empresaFiltroId
    ? `${empresas.find((e) => e.id === empresaFiltroId)?.nombre ?? "Empresa"} · ${dash?.total ?? 0} objeciones · ${dash?.pendientes ?? 0} pendientes`
    : `Todas las empresas · ${dash?.total ?? 0} objeciones · ${dash?.pendientes ?? 0} pendientes`;

  // ── Título dinámico: "Objeciones · Mayo 2026" ─────────────────────────────
  // Usa el mes calendario actual (no el último mes con datos). Cambia
  // automáticamente cuando entra un mes nuevo. El cálculo se re-ejecuta en
  // cada render, así que no necesita refresco manual ni state.
  const MESES_ES_LARGO = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const _hoy = new Date();
  const tituloDashboard = `Objeciones · ${MESES_ES_LARGO[_hoy.getMonth()]} ${_hoy.getFullYear()}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="text-sm">
      {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}

      {/* ── PANEL 1: Dashboard ─────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setDashOpen((v) => !v)}>
          <div>
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "0.01em",
              color: "var(--text)",
              lineHeight: 1.2,
            }}>
              {tituloDashboard}
            </div>
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
            onRefresh={refrescarTodo}
            mesObjetadoVigente={mesObjetadoVigente}
            vistaPeriodo={vistaPeriodo}
            setVistaPeriodo={setVistaPeriodo}
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
        vistaPeriodo={vistaPeriodo}
        mesObjetadoYYYYMM={mesObjetadoYYYYMM}
        mesObjetadoLabel={mesObjetadoVigente}
      />

      {/* ── PANEL 3: Historial REOB ───────────────────────────────────── */}
      <HistorialPanel
        token={token}
        empresaFiltroId={empresaFiltroId}
        setEmpresaFiltroId={setEmpresaFiltroId}
        empresas={empresas}
        vistaPeriodo={vistaPeriodo}
        mesObjetadoYYYYMM={mesObjetadoYYYYMM}
        mesObjetadoLabel={mesObjetadoVigente}
      />
    </div>
  );
}