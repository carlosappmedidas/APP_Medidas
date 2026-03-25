"use client";

import React, { useEffect, useState } from "react";

import LoginSection from "./components/auth/Login-section";
import DashboardSection from "./components/dashboard/DashboardSection";
import AlertsSection from "./components/admin/AlertsSection";
import MedidasSection from "./components/medidas/MedidasSection";
import ObjecionesSection from "./components/medidas/ObjecionesSection";
import CalendarioReeSection from "./components/medidas/CalendarioReeSection";
import GraficosSection from "./components/medidas/GraficosSection";
import MedidasGeneralSection from "./components/medidas/MedidasGeneralSection";
import CargaSection from "./components/ingestion/CargaSection";
import UsersSection from "./components/admin/UsersSection";
import SistemaSection from "./components/settings/SistemaSection";
import ClientesSection from "./components/admin/ClientesSection";
import MedidasPsSection, { COLUMNS_PS_META } from "./components/medidas/MedidasPsSection";
import AppearanceSettingsSection from "./components/settings/AppearanceSettingsSection";

import type { User } from "./types";
import { API_BASE_URL, getAuthHeaders } from "./apiConfig";

type MainTab =
  | "dashboard"
  | "medidas"
  | "objeciones"
  | "calendario-ree"
  | "graficos"
  | "alertas"
  | "usuarios"
  | "clientes"
  | "tablas-general"
  | "tablas-ps"
  | "carga"
  | "ajustes"
  | "sistema";

/* =========================================================
   Column meta medidas_general
   ========================================================= */
const ALL_COLUMNS_META: { id: string; label: string; group: string }[] = [
  { id: "empresa_id", label: "Empresa ID", group: "Identificación" },
  { id: "empresa_codigo", label: "Código empresa", group: "Identificación" },
  { id: "punto_id", label: "Punto", group: "Identificación" },
  { id: "anio", label: "Año", group: "Identificación" },
  { id: "mes", label: "Mes", group: "Identificación" },

  { id: "energia_bruta_facturada", label: "E bruta facturada", group: "General" },
  { id: "energia_autoconsumo_kwh", label: "E autoconsumo", group: "General" },
  { id: "energia_neta_facturada_kwh", label: "E neta facturada", group: "General" },
  { id: "energia_generada_kwh", label: "E generada", group: "General" },
  { id: "energia_frontera_dd_kwh", label: "E frontera DD", group: "General" },
  { id: "energia_pf_final_kwh", label: "E PF final", group: "General" },
  {
    id: "perdidas_e_facturada_kwh",
    label: "Pérdidas E facturada (kWh)",
    group: "General",
  },
  {
    id: "perdidas_e_facturada_pct",
    label: "Pérdidas E facturada (%)",
    group: "General",
  },

  { id: "energia_publicada_m2_kwh", label: "E publ M2", group: "M2" },
  { id: "energia_autoconsumo_m2_kwh", label: "E autoc M2", group: "M2" },
  { id: "energia_pf_m2_kwh", label: "E PF M2", group: "M2" },
  { id: "energia_frontera_dd_m2_kwh", label: "E front DD M2", group: "M2" },
  { id: "energia_generada_m2_kwh", label: "E gen M2", group: "M2" },
  { id: "energia_neta_facturada_m2_kwh", label: "E neta M2", group: "M2" },
  { id: "perdidas_e_facturada_m2_kwh", label: "Pérdidas M2 (kWh)", group: "M2" },
  { id: "perdidas_e_facturada_m2_pct", label: "Pérdidas M2 (%)", group: "M2" },

  { id: "energia_publicada_m7_kwh", label: "E publ M7", group: "M7" },
  { id: "energia_autoconsumo_m7_kwh", label: "E autoc M7", group: "M7" },
  { id: "energia_pf_m7_kwh", label: "E PF M7", group: "M7" },
  { id: "energia_frontera_dd_m7_kwh", label: "E front DD M7", group: "M7" },
  { id: "energia_generada_m7_kwh", label: "E gen M7", group: "M7" },
  { id: "energia_neta_facturada_m7_kwh", label: "E neta M7", group: "M7" },
  { id: "perdidas_e_facturada_m7_kwh", label: "Pérdidas M7 (kWh)", group: "M7" },
  { id: "perdidas_e_facturada_m7_pct", label: "Pérdidas M7 (%)", group: "M7" },

  { id: "energia_publicada_m11_kwh", label: "E publ M11", group: "M11" },
  { id: "energia_autoconsumo_m11_kwh", label: "E autoc M11", group: "M11" },
  { id: "energia_pf_m11_kwh", label: "E PF M11", group: "M11" },
  { id: "energia_frontera_dd_m11_kwh", label: "E front DD M11", group: "M11" },
  { id: "energia_generada_m11_kwh", label: "E gen M11", group: "M11" },
  { id: "energia_neta_facturada_m11_kwh", label: "E neta M11", group: "M11" },
  { id: "perdidas_e_facturada_m11_kwh", label: "Pérdidas M11 (kWh)", group: "M11" },
  { id: "perdidas_e_facturada_m11_pct", label: "Pérdidas M11 (%)", group: "M11" },

  { id: "energia_publicada_art15_kwh", label: "E publ ART15", group: "ART15" },
  { id: "energia_autoconsumo_art15_kwh", label: "E autoc ART15", group: "ART15" },
  { id: "energia_pf_art15_kwh", label: "E PF ART15", group: "ART15" },
  { id: "energia_frontera_dd_art15_kwh", label: "E front DD ART15", group: "ART15" },
  { id: "energia_generada_art15_kwh", label: "E gen ART15", group: "ART15" },
  { id: "energia_neta_facturada_art15_kwh", label: "E neta ART15", group: "ART15" },
  { id: "perdidas_e_facturada_art15_kwh", label: "Pérdidas ART15 (kWh)", group: "ART15" },
  { id: "perdidas_e_facturada_art15_pct", label: "Pérdidas ART15 (%)", group: "ART15" },
];

const SIDEBAR_STORAGE_KEY = "ui_sidebar_collapsed";
const AUTH_TOKEN_STORAGE_KEY = "auth_token";
const MEDIDAS_OPEN_STORAGE_KEY = "ui_medidas_open";
const TABLAS_OPEN_STORAGE_KEY = "ui_tablas_open";

export default function HomePage() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    try {
      return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");
  const [medidasOpen, setMedidasOpen] = useState(false);
  const [tablasOpen, setTablasOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [columnOrder, setColumnOrder] = useState<string[]>(ALL_COLUMNS_META.map((c) => c.id));
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  const [psColumnOrder, setPsColumnOrder] = useState<string[]>(
    COLUMNS_PS_META.map((c) => c.id)
  );
  const [psHiddenColumns, setPsHiddenColumns] = useState<string[]>([]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const savedTab = localStorage.getItem("ui_active_tab");
      if (
        savedTab === "dashboard" ||
        savedTab === "medidas" ||
        savedTab === "objeciones" ||
        savedTab === "calendario-ree" ||
        savedTab === "graficos" ||
        savedTab === "alertas" ||
        savedTab === "usuarios" ||
        savedTab === "clientes" ||
        savedTab === "tablas-general" ||
        savedTab === "tablas-ps" ||
        savedTab === "carga" ||
        savedTab === "ajustes" ||
        savedTab === "sistema"
      ) {
        setActiveTab(savedTab);
      }

      setMedidasOpen(localStorage.getItem(MEDIDAS_OPEN_STORAGE_KEY) === "1");
      setTablasOpen(localStorage.getItem(TABLAS_OPEN_STORAGE_KEY) === "1");

      const colOrder = localStorage.getItem("medidas_column_order");
      if (colOrder) setColumnOrder(JSON.parse(colOrder));

      const hidden = localStorage.getItem("medidas_hidden_columns");
      if (hidden) setHiddenColumns(JSON.parse(hidden));

      const psOrder = localStorage.getItem("medidas_ps_column_order");
      if (psOrder) setPsColumnOrder(JSON.parse(psOrder));

      const psHidden = localStorage.getItem("medidas_ps_hidden_columns");
      if (psHidden) setPsHiddenColumns(JSON.parse(psHidden));

      const sidebarRaw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (sidebarRaw === "1") setSidebarCollapsed(true);
    } catch {
      // ignore
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ui_active_tab", activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(MEDIDAS_OPEN_STORAGE_KEY, medidasOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [medidasOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(TABLAS_OPEN_STORAGE_KEY, tablasOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [tablasOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("medidas_column_order", JSON.stringify(columnOrder));
    } catch {
      // ignore
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem("medidas_hidden_columns", JSON.stringify(hiddenColumns));
    } catch {
      // ignore
    }
  }, [hiddenColumns]);

  useEffect(() => {
    try {
      localStorage.setItem("medidas_ps_column_order", JSON.stringify(psColumnOrder));
    } catch {
      // ignore
    }
  }, [psColumnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem("medidas_ps_hidden_columns", JSON.stringify(psHiddenColumns));
    } catch {
      // ignore
    }
  }, [psHiddenColumns]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (
      activeTab === "tablas-general" ||
      activeTab === "tablas-ps" ||
      activeTab === "objeciones" ||
      activeTab === "calendario-ree" ||
      activeTab === "graficos"
    ) {
      setMedidasOpen(true);
    }
    if (activeTab === "tablas-general" || activeTab === "tablas-ps") {
      setTablasOpen(true);
    }
    if (activeTab === "medidas") {
      setMedidasOpen(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }

    const loadMe = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: getAuthHeaders(token),
        });

        if (!res.ok) {
          try {
            localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
          } catch {
            // ignore
          }
          setCurrentUser(null);
          setToken(null);
          return;
        }

        const json = (await res.json()) as User;
        setCurrentUser(json);
      } catch {
        setCurrentUser(null);
      }
    };

    loadMe();
  }, [token]);

  useEffect(() => {
    setHomeMenuOpen(false);
  }, [activeTab]);

  const canManageUsers =
    currentUser && (currentUser.rol === "admin" || currentUser.rol === "owner");

  const canSeeAjustes = !!canManageUsers;
  const isSuperuser = !!currentUser?.is_superuser;

  const resetUiColors = () => {
    window.dispatchEvent(new CustomEvent("ui-theme-reset"));
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setCurrentUser(null);
    setHomeMenuOpen(false);
  };

  const handleGoHome = () => {
    setActiveTab("dashboard");
    setHomeMenuOpen(false);
  };

  const handleMedidasClick = () => {
    setMedidasOpen((prev) => !prev);

    if (
      activeTab !== "medidas" &&
      activeTab !== "tablas-general" &&
      activeTab !== "tablas-ps" &&
      activeTab !== "objeciones" &&
      activeTab !== "calendario-ree" &&
      activeTab !== "graficos"
    ) {
      setActiveTab("medidas");
    }
  };

  const handleTablasClick = () => {
    setTablasOpen((prev) => !prev);

    if (activeTab !== "tablas-general" && activeTab !== "tablas-ps") {
      setActiveTab("tablas-general");
    }
  };

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
            <p className="mt-1 text-xs ui-muted">
              Plataforma de gestión y análisis de medidas
            </p>
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
      <aside
        className="ui-sidebar"
        style={{
          width: sidebarCollapsed ? "52px" : undefined,
          transition: "width 0.2s ease",
        }}
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <div>
              <h1 className="text-lg font-semibold">APP Medidas</h1>
              <p className="mt-1 text-xs ui-muted">Plataforma de gestión</p>
            </div>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            className="ui-btn ui-btn-ghost ui-btn-xs ml-auto rounded-full px-2"
            aria-label={sidebarCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        {!sidebarCollapsed && (
          <nav className="ui-nav">
            <div className="ui-nav-section-title">Menú</div>

            <button
              onClick={() => setActiveTab("dashboard")}
              className={[
                "ui-nav-item",
                activeTab === "dashboard" ? "ui-nav-item--active" : "",
              ].join(" ")}
            >
              <span>Dashboard</span>
            </button>

            <div>
              <button
                onClick={handleMedidasClick}
                className={[
                  "ui-nav-item",
                  activeTab === "medidas" ||
                  activeTab === "tablas-general" ||
                  activeTab === "tablas-ps" ||
                  activeTab === "objeciones" ||
                  activeTab === "calendario-ree" ||
                  activeTab === "graficos"
                    ? "ui-nav-item--active"
                    : "",
                ].join(" ")}
              >
                <span>Medidas</span>
                <span className="text-[10px] ui-muted">{medidasOpen ? "▾" : "▸"}</span>
              </button>

              {medidasOpen && (
                <div className="ui-nav-sub">
                  <button
                    type="button"
                    onClick={handleTablasClick}
                    className={[
                      "ui-nav-subitem",
                      activeTab === "tablas-general" || activeTab === "tablas-ps"
                        ? "ui-nav-subitem--active"
                        : "",
                    ].join(" ")}
                  >
                    <span>Tablas</span>
                    <span className="text-[10px] ui-muted">{tablasOpen ? "▾" : "▸"}</span>
                  </button>

                  {tablasOpen && (
                    <div className="ui-nav-sub">
                      <button
                        type="button"
                        onClick={() => setActiveTab("tablas-general")}
                        className={[
                          "ui-nav-subitem",
                          activeTab === "tablas-general" ? "ui-nav-subitem--active" : "",
                        ].join(" ")}
                      >
                        <span>Medidas general</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("tablas-ps")}
                        className={[
                          "ui-nav-subitem",
                          activeTab === "tablas-ps" ? "ui-nav-subitem--active" : "",
                        ].join(" ")}
                      >
                        <span>Medidas PS</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveTab("objeciones")}
                    className={[
                      "ui-nav-subitem",
                      activeTab === "objeciones" ? "ui-nav-subitem--active" : "",
                    ].join(" ")}
                  >
                    <span>Objeciones</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("calendario-ree")}
                    className={[
                      "ui-nav-subitem",
                      activeTab === "calendario-ree" ? "ui-nav-subitem--active" : "",
                    ].join(" ")}
                  >
                    <span>Calendario REE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("graficos")}
                    className={[
                      "ui-nav-subitem",
                      activeTab === "graficos" ? "ui-nav-subitem--active" : "",
                    ].join(" ")}
                  >
                    <span>Gráficos</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveTab("alertas")}
              className={[
                "ui-nav-item",
                activeTab === "alertas" ? "ui-nav-item--active" : "",
              ].join(" ")}
            >
              <span>Alertas</span>
            </button>

            {canManageUsers && (
              <button
                onClick={() => setActiveTab("usuarios")}
                className={[
                  "ui-nav-item",
                  activeTab === "usuarios" ? "ui-nav-item--active" : "",
                ].join(" ")}
              >
                <span>Usuarios</span>
              </button>
            )}

            {isSuperuser && (
              <button
                onClick={() => setActiveTab("clientes")}
                className={[
                  "ui-nav-item",
                  activeTab === "clientes" ? "ui-nav-item--active" : "",
                ].join(" ")}
              >
                <span>Clientes</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab("carga")}
              className={[
                "ui-nav-item",
                activeTab === "carga" ? "ui-nav-item--active" : "",
              ].join(" ")}
            >
              <span>Carga de datos</span>
            </button>

            {canSeeAjustes && (
              <button
                onClick={() => setActiveTab("ajustes")}
                className={[
                  "ui-nav-item",
                  activeTab === "ajustes" ? "ui-nav-item--active" : "",
                ].join(" ")}
              >
                <span>Configuración</span>
              </button>
            )}

            {isSuperuser && (
              <button
                onClick={() => setActiveTab("sistema")}
                className={[
                  "ui-nav-item",
                  activeTab === "sistema" ? "ui-nav-item--active" : "",
                ].join(" ")}
              >
                <span>Sistema</span>
              </button>
            )}
          </nav>
        )}
      </aside>

      <main className="ui-main">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h2 className="ui-page-title">APP Medidas</h2>

          <div className="relative">
            <button
              type="button"
              onClick={() => setHomeMenuOpen((prev) => !prev)}
              className="ui-btn ui-btn-ghost ui-btn-xs rounded-full px-3"
              aria-label="Menú de usuario"
            >
              🏠
            </button>

            {homeMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-64 rounded-xl border bg-[color:var(--card-bg)] p-3 shadow-lg"
                style={{ borderColor: "var(--card-border)", zIndex: 20 }}
              >
                <div className="mb-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                  Usuario activo
                </div>

                <div className="space-y-0.5 text-[11px]">
                  <div className="ui-muted">
                    Email:{" "}
                    <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>
                      {currentUser?.email ?? "—"}
                    </span>
                  </div>
                  <div className="ui-muted">
                    Rol:{" "}
                    <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>
                      {currentUser?.rol ?? "—"}
                    </span>
                  </div>
                  {currentUser && (
                    <div className="ui-muted">
                      Tenant:{" "}
                      <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>
                        {currentUser.tenant_id}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="ui-btn ui-btn-outline ui-btn-xs w-full justify-center"
                  >
                    Ir al dashboard
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="ui-btn ui-btn-outline ui-btn-xs w-full justify-center"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === "dashboard" && <DashboardSection token={token} />}

        {activeTab === "medidas" && <MedidasSection token={token} currentUser={currentUser} />}

        {activeTab === "objeciones" && (
          <ObjecionesSection token={token} currentUser={currentUser} />
        )}

        {activeTab === "calendario-ree" && (
          <CalendarioReeSection token={token} currentUser={currentUser} />
        )}

        {activeTab === "graficos" && (
          <GraficosSection token={token} currentUser={currentUser} />
        )}

        {activeTab === "alertas" && <AlertsSection token={token} currentUser={currentUser} />}

        {activeTab === "usuarios" && canManageUsers && <UsersSection token={token} />}

        {activeTab === "clientes" && isSuperuser && (
          <ClientesSection token={token} currentUser={currentUser} />
        )}

        {activeTab === "tablas-general" && (
          <MedidasGeneralSection
            token={token}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            hiddenColumns={hiddenColumns}
            setHiddenColumns={setHiddenColumns}
          />
        )}

        {activeTab === "tablas-ps" && (
          <MedidasPsSection
            token={token}
            columnOrder={psColumnOrder}
            setColumnOrder={setPsColumnOrder}
            hiddenColumns={psHiddenColumns}
            setHiddenColumns={setPsHiddenColumns}
          />
        )}

        {activeTab === "carga" && <CargaSection token={token} />}

        {activeTab === "ajustes" && canSeeAjustes && (
          <section className="settings-page">
            <header className="settings-header">
              <div>
                <h3 className="ui-page-title">Configuración</h3>
                <p className="ui-card-subtitle">
                  Ajustes de la cuenta y apariencia del panel.
                </p>
              </div>

              <div className="settings-header-right">
                <span className="ui-badge ui-badge--neutral">
                  {token ? "Guardando en local + servidor" : "Guardando solo en este navegador"}
                </span>

                <button
                  type="button"
                  onClick={resetUiColors}
                  className="ui-btn ui-btn-outline ui-btn-xs"
                >
                  Restaurar colores
                </button>
              </div>
            </header>

            <div className="ui-card ui-card--border text-sm">
              <AppearanceSettingsSection token={token} />
            </div>
          </section>
        )}

        {activeTab === "sistema" && isSuperuser && <SistemaSection token={token} />}
      </main>
    </div>
  );
}