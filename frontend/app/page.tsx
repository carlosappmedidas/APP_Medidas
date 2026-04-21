"use client";
import React, { useEffect, useState } from "react";
import LoginSection from "./components/auth/Login-section";
import DashboardSection from "./components/dashboard/DashboardSection";
import AlertsSection from "./components/admin/AlertsSection";
import AlertasObjecionesSection from "./components/admin/AlertasObjecionesSection";
import AlertConfigSection from "./components/admin/AlertConfigSection";
import MedidasSection from "./components/medidas/MedidasSection";
import ObjecionesSection from "./components/medidas/ObjecionesSection";
import CalendarioReeSection from "./components/medidas/CalendarioReeSection";
import GraficosSection from "./components/medidas/GraficosSection";
import MedidasGeneralSection from "./components/medidas/MedidasGeneralSection";
import CargaSection from "./components/ingestion/CargaSection";
import ComunicacionesSection from "./components/comunicaciones/ComunicacionesSection";
import PerdidasSection from "./components/perdidas/PerdidasSection";
import TopologiaSection from "./components/topologia/TopologiaSection";
import UsersSection from "./components/admin/UsersSection";
import SistemaSection from "./components/settings/SistemaSection";
import ClientesSection from "./components/admin/ClientesSection";
import MedidasPsSection, { COLUMNS_PS_META } from "./components/medidas/MedidasPsSection";
import AppearanceSettingsSection from "./components/settings/AppearanceSettingsSection";
import TableSettingsSection from "./components/settings/TableSettingsSection";
import TopologiaSettingsSection from "./components/settings/TopologiaSettingsSection";
import ObjecionesSettingsSection from "./components/settings/ObjecionesSettingsSection";
import { useTableSettings } from "./components/settings/hooks/useTableSettings";
import { useTopologiaSettings } from "./components/settings/hooks/useTopologiaSettings";
import type { User } from "./types";
import { API_BASE_URL, getAuthHeaders } from "./apiConfig";

type MainTab =
  | "dashboard" | "medidas" | "objeciones" | "calendario-ree" | "graficos"
  | "alertas" | "usuarios" | "clientes" | "tablas-general" | "tablas-ps"
  | "carga" | "comunicaciones" | "perdidas" | "topologia" | "ajustes" | "sistema";

const PAGE_TITLES: Record<MainTab, string> = {
  "dashboard": "Dashboard", "medidas": "Medidas",
  "tablas-general": "Medidas (General)", "tablas-ps": "Medidas (PS)",
  "objeciones": "Objeciones", "calendario-ree": "Calendario REE",
  "graficos": "Gráficos", "alertas": "Alertas", "usuarios": "Usuarios",
  "clientes": "Clientes", "carga": "Carga de datos",
  "comunicaciones": "Comunicaciones FTP",
  "perdidas": "Pérdidas por transformación",
  "topologia": "Topología de red", "ajustes": "Configuración", "sistema": "Sistema",
};

const ALL_COLUMNS_META: { id: string; label: string; group: string }[] = [
  { id: "empresa_id",      label: "Empresa ID",                   group: "Identificación" },
  { id: "empresa_codigo",  label: "Código empresa",               group: "Identificación" },
  { id: "punto_id",        label: "Punto",                        group: "Identificación" },
  { id: "anio",            label: "Año",                          group: "Identificación" },
  { id: "mes",             label: "Mes",                          group: "Identificación" },
  { id: "energia_bruta_facturada",          label: "E bruta facturada",          group: "General" },
  { id: "energia_autoconsumo_kwh",          label: "E autoconsumo",              group: "General" },
  { id: "energia_neta_facturada_kwh",       label: "E neta facturada",           group: "General" },
  { id: "energia_generada_kwh",             label: "E generada",                 group: "General" },
  { id: "energia_frontera_dd_kwh",          label: "E frontera DD",              group: "General" },
  { id: "energia_pf_final_kwh",             label: "E PF final",                 group: "General" },
  { id: "perdidas_e_facturada_kwh",         label: "Pérdidas E facturada (kWh)", group: "General" },
  { id: "perdidas_e_facturada_pct",         label: "Pérdidas E facturada (%)",   group: "General" },
  { id: "energia_publicada_m2_kwh",         label: "E publ M2",                  group: "M2" },
  { id: "energia_autoconsumo_m2_kwh",       label: "E autoc M2",                 group: "M2" },
  { id: "energia_pf_m2_kwh",               label: "E PF M2",                    group: "M2" },
  { id: "energia_frontera_dd_m2_kwh",       label: "E front DD M2",              group: "M2" },
  { id: "energia_generada_m2_kwh",          label: "E gen M2",                   group: "M2" },
  { id: "energia_neta_facturada_m2_kwh",    label: "E neta M2",                  group: "M2" },
  { id: "perdidas_e_facturada_m2_kwh",      label: "Pérdidas M2 (kWh)",          group: "M2" },
  { id: "perdidas_e_facturada_m2_pct",      label: "Pérdidas M2 (%)",            group: "M2" },
  { id: "energia_publicada_m7_kwh",         label: "E publ M7",                  group: "M7" },
  { id: "energia_autoconsumo_m7_kwh",       label: "E autoc M7",                 group: "M7" },
  { id: "energia_pf_m7_kwh",               label: "E PF M7",                    group: "M7" },
  { id: "energia_frontera_dd_m7_kwh",       label: "E front DD M7",              group: "M7" },
  { id: "energia_generada_m7_kwh",          label: "E gen M7",                   group: "M7" },
  { id: "energia_neta_facturada_m7_kwh",    label: "E neta M7",                  group: "M7" },
  { id: "perdidas_e_facturada_m7_kwh",      label: "Pérdidas M7 (kWh)",          group: "M7" },
  { id: "perdidas_e_facturada_m7_pct",      label: "Pérdidas M7 (%)",            group: "M7" },
  { id: "energia_publicada_m11_kwh",        label: "E publ M11",                 group: "M11" },
  { id: "energia_autoconsumo_m11_kwh",      label: "E autoc M11",                group: "M11" },
  { id: "energia_pf_m11_kwh",              label: "E PF M11",                   group: "M11" },
  { id: "energia_frontera_dd_m11_kwh",      label: "E front DD M11",             group: "M11" },
  { id: "energia_generada_m11_kwh",         label: "E gen M11",                  group: "M11" },
  { id: "energia_neta_facturada_m11_kwh",   label: "E neta M11",                 group: "M11" },
  { id: "perdidas_e_facturada_m11_kwh",     label: "Pérdidas M11 (kWh)",         group: "M11" },
  { id: "perdidas_e_facturada_m11_pct",     label: "Pérdidas M11 (%)",           group: "M11" },
  { id: "energia_publicada_art15_kwh",      label: "E publ ART15",               group: "ART15" },
  { id: "energia_autoconsumo_art15_kwh",    label: "E autoc ART15",              group: "ART15" },
  { id: "energia_pf_art15_kwh",            label: "E PF ART15",                 group: "ART15" },
  { id: "energia_frontera_dd_art15_kwh",    label: "E front DD ART15",           group: "ART15" },
  { id: "energia_generada_art15_kwh",       label: "E gen ART15",                group: "ART15" },
  { id: "energia_neta_facturada_art15_kwh", label: "E neta ART15",               group: "ART15" },
  { id: "perdidas_e_facturada_art15_kwh",   label: "Pérdidas ART15 (kWh)",       group: "ART15" },
  { id: "perdidas_e_facturada_art15_pct",   label: "Pérdidas ART15 (%)",         group: "ART15" },
];

const DEFAULT_GENERAL_ORDER = ALL_COLUMNS_META.map((c) => c.id);
const DEFAULT_PS_ORDER = COLUMNS_PS_META.map((c) => c.id);

const SIDEBAR_STORAGE_KEY            = "ui_sidebar_collapsed";
const AUTH_TOKEN_STORAGE_KEY         = "auth_token";
const MEDIDAS_OPEN_STORAGE_KEY       = "ui_medidas_open";
const TABLAS_OPEN_STORAGE_KEY        = "ui_tablas_open";
const PERDIDAS_OPEN_STORAGE_KEY      = "ui_perdidas_open";

const PERDIDAS_TABS: MainTab[] = ["perdidas", "topologia"];

export default function HomePage() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY); } catch { return null; }
  });
  const [authReady, setAuthReady]               = useState(false);
  const [activeTab, setActiveTab]               = useState<MainTab>("dashboard");
  const [medidasOpen, setMedidasOpen]           = useState(false);
  const [tablasOpen, setTablasOpen]             = useState(false);
  const [perdidasOpen, setPerdidasOpen]         = useState(false);
  const [currentUser, setCurrentUser]           = useState<User | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [homeMenuOpen, setHomeMenuOpen]         = useState(false);

  const [showApariencia,  setShowApariencia]  = useState(false);
  const [showTablas,      setShowTablas]      = useState(false);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [showTopologia,   setShowTopologia]   = useState(false);
  const [showObjeciones,  setShowObjeciones]  = useState(false);
  const [showAlertasGeneral, setShowAlertasGeneral] = useState(false);
  const [showAlertasObjeciones, setShowAlertasObjeciones] = useState(false)

  const {
    appearance, setAppearance,
    generalColumnOrder, generalHiddenColumns, setGeneralColumnOrder, setGeneralHiddenColumns,
    psColumnOrder, psHiddenColumns, setPsColumnOrder, setPsHiddenColumns,
    resetAll: resetTableSettings,
  } = useTableSettings({ token, defaultGeneralOrder: DEFAULT_GENERAL_ORDER, defaultPsOrder: DEFAULT_PS_ORDER });

  const {
    tooltipLineas, tooltipTramos, tooltipCts, tooltipCups,
    setTooltipLineas, setTooltipTramos, setTooltipCts, setTooltipCups,
    tablaLineas, tablaTramos, tablaCts, tablaCups, tablaCeldas, tablaTrafos,
    setTablaLineas, setTablaTramos, setTablaCts, setTablaCups, setTablaCeldas, setTablaTrafos,
  } = useTopologiaSettings(token);

  useEffect(() => {
    try {
      const savedTab = localStorage.getItem("ui_active_tab");
      if (savedTab && savedTab in PAGE_TITLES) setActiveTab(savedTab as MainTab);
      if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1") setSidebarCollapsed(true);
      if (localStorage.getItem(MEDIDAS_OPEN_STORAGE_KEY) === "1") setMedidasOpen(true);
      if (localStorage.getItem(TABLAS_OPEN_STORAGE_KEY) === "1") setTablasOpen(true);
      if (localStorage.getItem(PERDIDAS_OPEN_STORAGE_KEY) === "1") setPerdidasOpen(true);
    } catch { /* ignore */ }
    finally { setAuthReady(true); }
  }, []);

  useEffect(() => { try { localStorage.setItem("ui_active_tab", activeTab); } catch { /* */ } }, [activeTab]);
  useEffect(() => { try { localStorage.setItem(MEDIDAS_OPEN_STORAGE_KEY, medidasOpen ? "1" : "0"); } catch { /* */ } }, [medidasOpen]);
  useEffect(() => { try { localStorage.setItem(TABLAS_OPEN_STORAGE_KEY, tablasOpen ? "1" : "0"); } catch { /* */ } }, [tablasOpen]);
  useEffect(() => { try { localStorage.setItem(PERDIDAS_OPEN_STORAGE_KEY, perdidasOpen ? "1" : "0"); } catch { /* */ } }, [perdidasOpen]);
  useEffect(() => { try { localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0"); } catch { /* */ } }, [sidebarCollapsed]);

  useEffect(() => {
    if (!token) { setCurrentUser(null); return; }
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: getAuthHeaders(token) });
        if (!res.ok) {
          try { localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY); } catch { /* */ }
          setCurrentUser(null); setToken(null); return;
        }
        setCurrentUser((await res.json()) as User);
      } catch { setCurrentUser(null); }
    };
    load();

    // Interceptor global: cualquier 401 en cualquier fetch → logout
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401) {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "";
        const isLoginCall = url.includes("/auth/login");
        if (!isLoginCall) {
          try { localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY); } catch { /* */ }
          setCurrentUser(null);
          setToken(null);
        }
      }
      return res;
    };
    
    return () => { window.fetch = originalFetch; };
  }, [token]);
  useEffect(() => { setHomeMenuOpen(false); }, [activeTab]);
  useEffect(() => {
    if (activeTab === "alertas") {
      setShowAlertasGeneral(false);
      setShowAlertasObjeciones(false);
    }
  }, [activeTab]);

  const isViewer         = currentUser?.rol === "viewer";
  const canManageUsers   = currentUser && (currentUser.rol === "admin" || currentUser.rol === "owner");
  const isSuperuser      = !!currentUser?.is_superuser;
  const canSeeAjustes    = !!currentUser && !isViewer;
  const canSeeApariencia = !!canManageUsers || isSuperuser;
  const canManageAlerts  = !!currentUser && (isSuperuser || currentUser.rol === "admin" || currentUser.rol === "owner");

  const resetUiColors = () => window.dispatchEvent(new CustomEvent("ui-theme-reset"));
  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  const handleLogout = () => {
    try { localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY); } catch { /* */ }
    setToken(null); setCurrentUser(null); setHomeMenuOpen(false);
  };
  const handleGoHome = () => { setActiveTab("dashboard"); setHomeMenuOpen(false); };

  const handleMedidasClick = () => {
    setMedidasOpen((prev) => !prev);
    if (!["medidas","tablas-general","tablas-ps","objeciones","calendario-ree","graficos"].includes(activeTab)) {
      setActiveTab("medidas");
    }
  };

  const handlePerdidasClick = () => {
    setPerdidasOpen((prev) => !prev);
    if (!PERDIDAS_TABS.includes(activeTab)) setActiveTab("perdidas");
  };

  const handleGoToTableSettings = () => { setActiveTab("ajustes"); setShowTablas(true); };
  const handleGoToAlertConfig   = () => { setActiveTab("ajustes"); setShowAlertConfig(true); };

  if (!authReady) {
    return (
      <div className="ui-login-shell">
        <div className="ui-login-panel">
          <div className="ui-login-brand mb-4 text-center">
            <h1 className="text-xl font-semibold">APP Medidas</h1>
            <p className="mt-1 text-xs ui-muted">Cargando sesión...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="ui-login-shell">
        <div className="ui-login-panel">
          <div className="ui-login-brand mb-4 text-center">
            <h1 className="text-xl font-semibold">APP Medidas</h1>
            <p className="mt-1 text-xs ui-muted">Plataforma de gestión y análisis de medidas</p>
          </div>
          <LoginSection token={token} setToken={setToken} currentUser={currentUser} />
          <p className="mt-4 text-center text-[11px] ui-muted">
            Acceso restringido · Introduce tus credenciales para continuar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-shell">
      <aside className="ui-sidebar" style={{ width: sidebarCollapsed ? "52px" : undefined, transition: "width 0.2s ease" }}>
        <div className="mb-6 flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <div>
              <h1 className="text-lg font-semibold">APP Medidas</h1>
              <p className="mt-1 text-xs ui-muted">Plataforma de gestión</p>
            </div>
          )}
          <button type="button" onClick={toggleSidebar}
            className="ui-btn ui-btn-ghost ui-btn-xs ml-auto rounded-full px-2"
            aria-label={sidebarCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral"}>
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        {!sidebarCollapsed && (
          <nav className="ui-nav">
            <div className="ui-nav-section-title">Menú</div>
            <button onClick={() => setActiveTab("dashboard")}
              className={["ui-nav-item", activeTab === "dashboard" ? "ui-nav-item--active" : ""].join(" ")}>
              <span>Dashboard</span>
            </button>
            <div>
              <button onClick={handleMedidasClick}
                className={["ui-nav-item", ["medidas","tablas-general","tablas-ps","objeciones","calendario-ree","graficos"].includes(activeTab) ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Medidas</span>
                <span className="text-[10px] ui-muted">{medidasOpen ? "▾" : "▸"}</span>
              </button>
              {medidasOpen && (
                <div className="ui-nav-sub">
                  <>
                    <button type="button" onClick={() => setTablasOpen((v) => !v)}
                      className={["ui-nav-subitem", ["tablas-general","tablas-ps"].includes(activeTab) ? "ui-nav-subitem--active" : ""].join(" ")}>
                      <span>Tablas</span>
                      <span className="text-[10px] ui-muted">{tablasOpen ? "▾" : "▸"}</span>
                    </button>
                    {tablasOpen && (
                      <div className="ui-nav-sub">
                        <button type="button" onClick={() => setActiveTab("tablas-general")}
                          className={["ui-nav-subitem", activeTab === "tablas-general" ? "ui-nav-subitem--active" : ""].join(" ")}>
                          <span>Medidas general</span>
                        </button>
                        <button type="button" onClick={() => setActiveTab("tablas-ps")}
                          className={["ui-nav-subitem", activeTab === "tablas-ps" ? "ui-nav-subitem--active" : ""].join(" ")}>
                          <span>Medidas PS</span>
                        </button>
                      </div>
                    )}
                  </>
                  {!isViewer && (
                    <button type="button" onClick={() => setActiveTab("objeciones")}
                      className={["ui-nav-subitem", activeTab === "objeciones" ? "ui-nav-subitem--active" : ""].join(" ")}>
                      <span>Objeciones</span>
                    </button>
                  )}
                  <button type="button" onClick={() => setActiveTab("calendario-ree")}
                    className={["ui-nav-subitem", activeTab === "calendario-ree" ? "ui-nav-subitem--active" : ""].join(" ")}>
                    <span>Calendario REE</span>
                  </button>
                  <button type="button" onClick={() => setActiveTab("graficos")}
                    className={["ui-nav-subitem", activeTab === "graficos" ? "ui-nav-subitem--active" : ""].join(" ")}>
                    <span>Gráficos</span>
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setActiveTab("alertas")}
              className={["ui-nav-item", activeTab === "alertas" ? "ui-nav-item--active" : ""].join(" ")}>
              <span>Alertas</span>
            </button>
            {canManageUsers && (
              <button onClick={() => setActiveTab("usuarios")}
                className={["ui-nav-item", activeTab === "usuarios" ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Usuarios</span>
              </button>
            )}
            {isSuperuser && (
              <button onClick={() => setActiveTab("clientes")}
                className={["ui-nav-item", activeTab === "clientes" ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Clientes</span>
              </button>
            )}
            {!isViewer && (
              <button onClick={() => setActiveTab("carga")}
                className={["ui-nav-item", activeTab === "carga" ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Carga de datos</span>
              </button>
            )}
            {!isViewer && (
              <button onClick={() => setActiveTab("comunicaciones")}
                className={["ui-nav-item", activeTab === "comunicaciones" ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Comunicaciones</span>
              </button>
            )}
            {!isViewer && (
              <div>
                <button onClick={handlePerdidasClick}
                  className={["ui-nav-item", PERDIDAS_TABS.includes(activeTab) ? "ui-nav-item--active" : ""].join(" ")}>
                  <span>Pérdidas</span>
                  <span className="text-[10px] ui-muted">{perdidasOpen ? "▾" : "▸"}</span>
                </button>
                {perdidasOpen && (
                  <div className="ui-nav-sub">
                    <button type="button" onClick={() => setActiveTab("perdidas")}
                      className={["ui-nav-subitem", activeTab === "perdidas" ? "ui-nav-subitem--active" : ""].join(" ")}>
                      <span>Balance CT</span>
                    </button>
                    <button type="button" onClick={() => setActiveTab("topologia")}
                      className={["ui-nav-subitem", activeTab === "topologia" ? "ui-nav-subitem--active" : ""].join(" ")}>
                      <span>Topología</span>
                    </button>
                  </div>
                )}
              </div>
            )}
            {canSeeAjustes && (
              <button onClick={() => setActiveTab("ajustes")}
                className={["ui-nav-item", activeTab === "ajustes" ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Configuración</span>
              </button>
            )}
            {isSuperuser && (
              <button onClick={() => setActiveTab("sistema")}
                className={["ui-nav-item", activeTab === "sistema" ? "ui-nav-item--active" : ""].join(" ")}>
                <span>Sistema</span>
              </button>
            )}
          </nav>
        )}
      </aside>

      <main className="ui-main">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h2 className="ui-page-title">{PAGE_TITLES[activeTab]}</h2>
          <div className="relative">
            <button type="button" onClick={() => setHomeMenuOpen((prev) => !prev)}
              className="ui-btn ui-btn-ghost ui-btn-xs rounded-full px-3" aria-label="Menú de usuario">
              🏠
            </button>
            {homeMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-[color:var(--card-bg)] p-3 shadow-lg"
                style={{ borderColor: "var(--card-border)", zIndex: 20 }}>
                <div className="mb-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>Usuario activo</div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="ui-muted">Email: <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>{currentUser?.email ?? "—"}</span></div>
                  <div className="ui-muted">Rol: <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>{currentUser?.rol ?? "—"}</span></div>
                  {currentUser && <div className="ui-muted">Tenant: <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>{currentUser.tenant_id}</span></div>}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <button type="button" onClick={handleGoHome} className="ui-btn ui-btn-outline ui-btn-xs w-full justify-center">Ir al dashboard</button>
                  <button type="button" onClick={handleLogout} className="ui-btn ui-btn-outline ui-btn-xs w-full justify-center">Cerrar sesión</button>
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === "dashboard"      && <DashboardSection token={token} />}
        {activeTab === "medidas"        && <MedidasSection token={token} currentUser={currentUser} />}
        {activeTab === "objeciones" && !isViewer && <ObjecionesSection token={token} currentUser={currentUser} />}
        {activeTab === "calendario-ree" && <CalendarioReeSection token={token} currentUser={currentUser} />}
        {activeTab === "graficos"       && <GraficosSection token={token} currentUser={currentUser} />}

        {activeTab === "alertas" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="ui-collapsible-card">
              <button type="button" className="ui-collapsible-card__trigger"
                onClick={() => setShowAlertasGeneral((v) => !v)}>
                <div>
                  <div className="ui-collapsible-card__title">ALERTAS · MEDIDAS GENERAL</div>
                  <p className="ui-collapsible-card__subtitle">
                    Desviaciones en energía y pérdidas por empresa y periodo · M1, M2, M7, M11, ART15
                  </p>
                </div>
                <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">
                  {showAlertasGeneral ? "Ocultar" : "Mostrar"}
                </span>
              </button>
              {showAlertasGeneral && (
                <div className="ui-collapsible-card__body">
                  <AlertsSection token={token} currentUser={currentUser}
                    onGoToAlertConfig={canManageAlerts ? handleGoToAlertConfig : undefined} />
                </div>
              )}
            </div>

            {/* ─── ALERTAS · OBJECIONES ─────────────────────────────────────── */}
            {!isViewer && (
              <div className="ui-collapsible-card">
                <button type="button" className="ui-collapsible-card__trigger"
                  onClick={() => setShowAlertasObjeciones((v) => !v)}>
                  <div>
                    <div className="ui-collapsible-card__title">ALERTAS · OBJECIONES</div>
                    <p className="ui-collapsible-card__subtitle">
                      AOBs pendientes de descargar tras el cierre de recepción de objeciones (scheduler automático).
                    </p>
                  </div>
                  <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">
                    {showAlertasObjeciones ? "Ocultar" : "Mostrar"}
                  </span>
                </button>
                {showAlertasObjeciones && (
                  <div className="ui-collapsible-card__body">
                    <AlertasObjecionesSection token={token} />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "usuarios"  && (canManageUsers || isSuperuser) && <UsersSection token={token} />}
        {activeTab === "clientes"  && isSuperuser && <ClientesSection token={token} currentUser={currentUser} />}

        {activeTab === "tablas-general" && (
          <MedidasGeneralSection token={token}
            columnOrder={generalColumnOrder} setColumnOrder={setGeneralColumnOrder}
            hiddenColumns={generalHiddenColumns} setHiddenColumns={setGeneralHiddenColumns}
            onGoToSettings={canSeeAjustes ? handleGoToTableSettings : undefined}
            appearance={appearance} />
        )}
        {activeTab === "tablas-ps" && (
          <MedidasPsSection token={token}
            columnOrder={psColumnOrder} setColumnOrder={setPsColumnOrder}
            hiddenColumns={psHiddenColumns} setHiddenColumns={setPsHiddenColumns}
            onGoToSettings={canSeeAjustes ? handleGoToTableSettings : undefined}
            appearance={appearance} />
        )}

        {activeTab === "carga"          && !isViewer && <CargaSection token={token} />}
        {activeTab === "comunicaciones" && !isViewer && <ComunicacionesSection token={token} currentUser={currentUser} />}
        {activeTab === "perdidas"       && !isViewer && <PerdidasSection token={token} currentUser={currentUser} />}

        {activeTab === "topologia" && !isViewer && (
          <TopologiaSection
            token={token}
            currentUser={currentUser}
            tooltipLineas={tooltipLineas}
            tooltipTramos={tooltipTramos}
            tooltipCts={tooltipCts}
            tooltipCups={tooltipCups}
            tablaLineas={tablaLineas}
            tablaCups={tablaCups}
            tablaCeldas={tablaCeldas}
            tablaCts={tablaCts}
            tablaTramos={tablaTramos}
          />
        )}

        {activeTab === "ajustes" && canSeeAjustes && (
          <section className="settings-page" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {canSeeApariencia && (
              <div className="ui-collapsible-card">
                <button type="button" className="ui-collapsible-card__trigger" onClick={() => setShowApariencia((v) => !v)}>
                  <div>
                    <div className="ui-collapsible-card__title">APARIENCIA DEL PANEL</div>
                    <p className="ui-collapsible-card__subtitle">Cambia los colores del panel. Se aplica al momento en todas las secciones.</p>
                  </div>
                  <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">{showApariencia ? "Ocultar" : "Mostrar"}</span>
                </button>
                {showApariencia && (
                  <div className="ui-collapsible-card__body">
                    <div className="flex justify-end mb-3">
                      <button type="button" onClick={resetUiColors} className="ui-btn ui-btn-outline ui-btn-xs">Restaurar colores</button>
                    </div>
                    <AppearanceSettingsSection token={token} />
                  </div>
                )}
              </div>
            )}
            <div className="ui-collapsible-card">
              <button type="button" className="ui-collapsible-card__trigger" onClick={() => setShowTablas((v) => !v)}>
                <div>
                  <div className="ui-collapsible-card__title">CONFIGURACIÓN DE TABLAS</div>
                  <p className="ui-collapsible-card__subtitle">Apariencia, columnas y orden de las tablas de medidas. Se guarda en servidor.</p>
                </div>
                <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">{showTablas ? "Ocultar" : "Mostrar"}</span>
              </button>
              {showTablas && (
                <div className="ui-collapsible-card__body">
                  <TableSettingsSection
                    appearance={appearance} onSetAppearance={setAppearance}
                    generalColumnOrder={generalColumnOrder} generalHiddenColumns={generalHiddenColumns}
                    generalMeta={ALL_COLUMNS_META}
                    onSetGeneralOrder={setGeneralColumnOrder} onSetGeneralHidden={setGeneralHiddenColumns}
                    psColumnOrder={psColumnOrder} psHiddenColumns={psHiddenColumns}
                    psMeta={COLUMNS_PS_META}
                    onSetPsOrder={setPsColumnOrder} onSetPsHidden={setPsHiddenColumns}
                    onResetAll={resetTableSettings} />
                </div>
              )}
            </div>
            <div className="ui-collapsible-card">
              <button type="button" className="ui-collapsible-card__trigger" onClick={() => setShowAlertConfig((v) => !v)}>
                <div>
                  <div className="ui-collapsible-card__title">CONFIGURACIÓN DE ALERTAS</div>
                  <p className="ui-collapsible-card__subtitle">Umbrales y severidad de alertas por empresa y tipo de medida.</p>
                </div>
                <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">{showAlertConfig ? "Ocultar" : "Mostrar"}</span>
              </button>
              {showAlertConfig && (
                <div className="ui-collapsible-card__body">
                  <AlertConfigSection token={token} canManage={canManageAlerts} />
                </div>
              )}
            </div>
            <div className="ui-collapsible-card">
              <button type="button" className="ui-collapsible-card__trigger" onClick={() => setShowTopologia((v) => !v)}>
                <div>
                  <div className="ui-collapsible-card__title">CONFIGURACIÓN TOPOLOGÍA</div>
                  <p className="ui-collapsible-card__subtitle">Columnas de las tablas y campos del tooltip del mapa. Se guarda automáticamente.</p>
                </div>
                <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">{showTopologia ? "Ocultar" : "Mostrar"}</span>
              </button>
              {showTopologia && (
                <div className="ui-collapsible-card__body">
                  <TopologiaSettingsSection
                    tooltipLineas={tooltipLineas}
                    tooltipTramos={tooltipTramos}
                    tooltipCts={tooltipCts}
                    tooltipCups={tooltipCups}
                    onChangeLineas={setTooltipLineas}
                    onChangeTramos={setTooltipTramos}
                    onChangeCts={setTooltipCts}
                    onChangeCups={setTooltipCups}
                    tablaLineas={tablaLineas}
                    tablaTramos={tablaTramos}
                    tablaCts={tablaCts}
                    tablaCups={tablaCups}
                    tablaCeldas={tablaCeldas}
                    tablaTrafos={tablaTrafos}
                    onChangeTablaLineas={setTablaLineas}
                    onChangeTablaTramos={setTablaTramos}
                    onChangeTablaCts={setTablaCts}
                    onChangeTablaCups={setTablaCups}
                    onChangeTablaCeldas={setTablaCeldas}
                    onChangeTablaTrafos={setTablaTrafos}
                  />
                </div>
              )}
            </div>
            <div className="ui-collapsible-card">
              <button type="button" className="ui-collapsible-card__trigger" onClick={() => setShowObjeciones((v) => !v)}>
                <div>
                  <div className="ui-collapsible-card__title">CONFIGURACIÓN OBJECIONES</div>
                  <p className="ui-collapsible-card__subtitle">Define la carpeta SFTP donde buscar ficheros de objeciones (AOB) por cada conexión activa.</p>
                </div>
                <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">{showObjeciones ? "Ocultar" : "Mostrar"}</span>
              </button>
              {showObjeciones && (
                <div className="ui-collapsible-card__body">
                  <ObjecionesSettingsSection token={token} />
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "sistema" && isSuperuser && <SistemaSection token={token} />}
      </main>
    </div>
  );
}
