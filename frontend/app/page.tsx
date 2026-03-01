// app/page.tsx
"use client";

import React, { useEffect, useState } from "react";

import LoginSection from "./components/Login-section";
import DashboardSection from "./components/DashboardSection";
import EmpresasSection from "./components/EmpresasSection";
import MedidasGeneralSection from "./components/MedidasGeneralSection";
import CargaSection from "./components/CargaSection";
import UsersSection from "./components/UsersSection";
import SistemaSection from "./components/SistemaSection";
import ClientesSection from "./components/ClientesSection";
import MedidasPsSection, { COLUMNS_PS_META } from "./components/MedidasPsSection";
import AppearanceSettingsSection from "./components/AppearanceSettingsSection";

import type { User } from "./types";
import { API_BASE_URL, getAuthHeaders } from "./apiConfig";

type MainTab =
  | "login"
  | "dashboard"
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

  // M2
  { id: "energia_publicada_m2_kwh", label: "E publ M2", group: "M2" },
  { id: "energia_autoconsumo_m2_kwh", label: "E autoc M2", group: "M2" },
  { id: "energia_pf_m2_kwh", label: "E PF M2", group: "M2" },
  { id: "energia_frontera_dd_m2_kwh", label: "E front DD M2", group: "M2" },
  { id: "energia_generada_m2_kwh", label: "E gen M2", group: "M2" },
  { id: "energia_neta_facturada_m2_kwh", label: "E neta M2", group: "M2" },
  { id: "perdidas_e_facturada_m2_kwh", label: "Pérdidas M2 (kWh)", group: "M2" },
  { id: "perdidas_e_facturada_m2_pct", label: "Pérdidas M2 (%)", group: "M2" },

  // M7
  { id: "energia_publicada_m7_kwh", label: "E publ M7", group: "M7" },
  { id: "energia_autoconsumo_m7_kwh", label: "E autoc M7", group: "M7" },
  { id: "energia_pf_m7_kwh", label: "E PF M7", group: "M7" },
  { id: "energia_frontera_dd_m7_kwh", label: "E front DD M7", group: "M7" },
  { id: "energia_generada_m7_kwh", label: "E gen M7", group: "M7" },
  { id: "energia_neta_facturada_m7_kwh", label: "E neta M7", group: "M7" },
  { id: "perdidas_e_facturada_m7_kwh", label: "Pérdidas M7 (kWh)", group: "M7" },
  { id: "perdidas_e_facturada_m7_pct", label: "Pérdidas M7 (%)", group: "M7" },

  // M11
  { id: "energia_publicada_m11_kwh", label: "E publ M11", group: "M11" },
  { id: "energia_autoconsumo_m11_kwh", label: "E autoc M11", group: "M11" },
  { id: "energia_pf_m11_kwh", label: "E PF M11", group: "M11" },
  { id: "energia_frontera_dd_m11_kwh", label: "E front DD M11", group: "M11" },
  { id: "energia_generada_m11_kwh", label: "E gen M11", group: "M11" },
  { id: "energia_neta_facturada_m11_kwh", label: "E neta M11", group: "M11" },
  { id: "perdidas_e_facturada_m11_kwh", label: "Pérdidas M11 (kWh)", group: "M11" },
  { id: "perdidas_e_facturada_m11_pct", label: "Pérdidas M11 (%)", group: "M11" },

  // ART15
  { id: "energia_publicada_art15_kwh", label: "E publ ART15", group: "ART15" },
  { id: "energia_autoconsumo_art15_kwh", label: "E autoc ART15", group: "ART15" },
  { id: "energia_pf_art15_kwh", label: "E PF ART15", group: "ART15" },
  { id: "energia_frontera_dd_art15_kwh", label: "E front DD ART15", group: "ART15" },
  { id: "energia_generada_art15_kwh", label: "E gen ART15", group: "ART15" },
  { id: "energia_neta_facturada_art15_kwh", label: "E neta ART15", group: "ART15" },
  { id: "perdidas_e_facturada_art15_kwh", label: "Pérdidas ART15 (kWh)", group: "ART15" },
  { id: "perdidas_e_facturada_art15_pct", label: "Pérdidas ART15 (%)", group: "ART15" },
];

/* =========================================================
   Ajustes UI (submenú interno)
   ========================================================= */
type AjustesSubTab = "aspecto";

/* =========================================================
   UI Theme (backend) helpers
   - Reutilizamos el mismo localStorage que usa AppearanceSettingsSection
   ========================================================= */
const UI_THEME_STORAGE_KEY = "ui_theme_overrides";

function applyUiThemeOverrides(overrides: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  for (const [k, v] of Object.entries(overrides || {})) {
    if (typeof k !== "string") continue;
    if (!k.startsWith("--")) continue;
    if (typeof v !== "string") continue;
    root.style.setProperty(k, v);
  }
}

export default function HomePage() {
  const [token, setToken] = useState<string | null>(null);

  // ✅ (opcional) restaurar pestaña en client para suavizar UX
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    if (typeof window === "undefined") return "login";
    try {
      const raw = window.localStorage.getItem("ui_active_tab");
      const v = raw as MainTab | null;
      if (!v) return "login";
      return v;
    } catch {
      return "login";
    }
  });

  const [tablasOpen, setTablasOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("ui_tablas_open");
      return raw === "1";
    } catch {
      return false;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Submenú interno de “Ajustes”
  const [ajustesSubTab, setAjustesSubTab] = useState<AjustesSubTab>("aspecto");

  // ✅ Desplegable de la tarjeta Ajustes (solo UI) — CERRADO POR DEFECTO
  const [ajustesOpen, setAjustesOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("ui_ajustes_open");
      return raw === "1";
    } catch {
      return false;
    }
  });

  /* =========================================================
     ✅ Aplicar overrides guardados ANTES (reduce “flash/transición”)
     ========================================================= */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        applyUiThemeOverrides(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  /* =========================================================
     Column persistence (localStorage)
     ========================================================= */

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const defaultOrder = ALL_COLUMNS_META.map((c) => c.id);
    if (typeof window === "undefined") return defaultOrder;

    try {
      const raw = window.localStorage.getItem("medidas_column_order");
      if (!raw) return defaultOrder;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultOrder;

      const valid = parsed.filter((id: string) => ALL_COLUMNS_META.some((c) => c.id === id));
      const missing = ALL_COLUMNS_META.map((c) => c.id).filter((id) => !valid.includes(id));

      return [...valid, ...missing];
    } catch {
      return defaultOrder;
    }
  });

  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("medidas_hidden_columns");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id: string) => ALL_COLUMNS_META.some((c) => c.id === id));
    } catch {
      return [];
    }
  });

  const [psColumnOrder, setPsColumnOrder] = useState<string[]>(() => {
    const defaultOrder = COLUMNS_PS_META.map((c) => c.id);
    if (typeof window === "undefined") return defaultOrder;

    try {
      const raw = window.localStorage.getItem("medidas_ps_column_order");
      if (!raw) return defaultOrder;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultOrder;

      const valid = parsed.filter((id: string) => COLUMNS_PS_META.some((c) => c.id === id));
      const missing = COLUMNS_PS_META.map((c) => c.id).filter((id) => !valid.includes(id));

      return [...valid, ...missing];
    } catch {
      return defaultOrder;
    }
  });

  const [psHiddenColumns, setPsHiddenColumns] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("medidas_ps_hidden_columns");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id: string) => COLUMNS_PS_META.some((c) => c.id === id));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("medidas_column_order", JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("medidas_hidden_columns", JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("medidas_ps_column_order", JSON.stringify(psColumnOrder));
  }, [psColumnOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("medidas_ps_hidden_columns", JSON.stringify(psHiddenColumns));
  }, [psHiddenColumns]);

  /* =========================================================
     ✅ Persistencia UI: activeTab / tablasOpen / ajustesOpen
     ========================================================= */
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ui_active_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ui_tablas_open", tablasOpen ? "1" : "0");
  }, [tablasOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ui_ajustes_open", ajustesOpen ? "1" : "0");
  }, [ajustesOpen]);

  /* =========================================================
     Load /auth/me
     ========================================================= */
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
          setCurrentUser(null);

          if (res.status === 401 || res.status === 403) {
            setToken(null);
            setActiveTab("login");
          }
          return;
        }

        const json = (await res.json()) as User;
        setCurrentUser(json);
      } catch (err) {
        console.error("Error cargando /auth/me:", err);
        setCurrentUser(null);
      }
    };

    loadMe();
  }, [token]);

  /* =========================================================
     ✅ Session ping
     ========================================================= */
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const ping = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: getAuthHeaders(token),
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            if (cancelled) return;
            setCurrentUser(null);
            setToken(null);
            setActiveTab("login");
          }
          return;
        }

        const json = (await res.json()) as User;
        if (!cancelled) setCurrentUser(json);
      } catch (err) {
        console.error("Error ping /auth/me:", err);
      }
    };

    const intervalMs = 60_000;

    ping();
    const id = window.setInterval(ping, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  const canManageUsers = currentUser && (currentUser.rol === "admin" || currentUser.rol === "owner");
  const canSeeAjustes = !!canManageUsers;

  const isSuperuser = !!currentUser?.is_superuser;
  const isTablasActive = activeTab === "tablas-general" || activeTab === "tablas-ps";

  /* =========================================================
     ✅ Mantener “Tablas” abierto cuando estés en tablas
     ========================================================= */
  useEffect(() => {
    if (isTablasActive && !tablasOpen) setTablasOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTablasActive]);

  /* =========================================================
     ✅ Load UI theme from backend (admin/owner)
     ========================================================= */
  useEffect(() => {
    if (!token) return;
    if (!canSeeAjustes) return;

    const loadTheme = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/ui-theme`, {
          headers: getAuthHeaders(token),
        });
        if (!res.ok) return;

        const json = (await res.json()) as {
          ui_theme_overrides?: Record<string, unknown> | null;
        };
        const overrides = json?.ui_theme_overrides ?? null;

        if (typeof window !== "undefined") {
          if (overrides && typeof overrides === "object") {
            window.localStorage.setItem(UI_THEME_STORAGE_KEY, JSON.stringify(overrides));
            applyUiThemeOverrides(overrides);
          } else {
            window.localStorage.removeItem(UI_THEME_STORAGE_KEY);
          }
        }
      } catch (err) {
        console.error("Error cargando /auth/ui-theme:", err);
      }
    };

    loadTheme();
  }, [token, canSeeAjustes]);

  /* =========================================================
     Guards
     ========================================================= */
  useEffect(() => {
    if (activeTab === "usuarios" && !canManageUsers) {
      setActiveTab("login");
    }
  }, [activeTab, canManageUsers]);

  useEffect(() => {
    if (activeTab === "sistema" && !isSuperuser) {
      setActiveTab("login");
    }
  }, [activeTab, isSuperuser]);

  useEffect(() => {
    if (activeTab === "clientes" && !isSuperuser) {
      setActiveTab("login");
    }
  }, [activeTab, isSuperuser]);

  useEffect(() => {
    if (activeTab === "ajustes" && !canSeeAjustes) {
      setActiveTab("login");
    }
  }, [activeTab, canSeeAjustes]);

  /* =========================================================
     Ajustes UI - acciones
     ========================================================= */
  const resetUiColors = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ui-theme-reset"));
  };

  /* =========================================================
     UI
     ========================================================= */
  return (
    <div className="ui-shell">
      {/* SIDEBAR */}
      <aside className="ui-sidebar">
        <div className="mb-8">
          <h1 className="text-lg font-semibold">APP Medidas</h1>
          <p className="mt-1 text-xs ui-muted">Plataforma de gestión</p>
        </div>

        <nav className="ui-nav">
          <div className="ui-nav-section-title">Menú</div>

          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={["ui-nav-item", activeTab === "login" ? "ui-nav-item--active" : ""].join(" ")}
          >
            <span>Acceso</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={["ui-nav-item", activeTab === "dashboard" ? "ui-nav-item--active" : ""].join(" ")}
          >
            <span>Dashboard</span>
          </button>

          {canManageUsers && (
            <button
              type="button"
              onClick={() => setActiveTab("usuarios")}
              className={["ui-nav-item", activeTab === "usuarios" ? "ui-nav-item--active" : ""].join(" ")}
            >
              <span>Usuarios</span>
            </button>
          )}

          {isSuperuser && (
            <button
              type="button"
              onClick={() => setActiveTab("clientes")}
              className={["ui-nav-item", activeTab === "clientes" ? "ui-nav-item--active" : ""].join(" ")}
            >
              <span>Clientes</span>
            </button>
          )}

          {/* TABLAS */}
          <div>
            <button
              type="button"
              onClick={() => {
                setTablasOpen((prev) => !prev);
                if (!isTablasActive) setActiveTab("tablas-general");
              }}
              className={["ui-nav-item", isTablasActive ? "ui-nav-item--active" : ""].join(" ")}
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
                  className={["ui-nav-subitem", activeTab === "tablas-ps" ? "ui-nav-subitem--active" : ""].join(" ")}
                >
                  <span>Medidas PS</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("carga")}
            className={["ui-nav-item", activeTab === "carga" ? "ui-nav-item--active" : ""].join(" ")}
          >
            <span>Carga de datos</span>
          </button>

          {canSeeAjustes && (
            <button
              type="button"
              onClick={() => setActiveTab("ajustes")}
              className={["ui-nav-item", activeTab === "ajustes" ? "ui-nav-item--active" : ""].join(" ")}
            >
              <span>Configuración</span>
            </button>
          )}

          {isSuperuser && (
            <button
              type="button"
              onClick={() => setActiveTab("sistema")}
              className={["ui-nav-item", activeTab === "sistema" ? "ui-nav-item--active" : ""].join(" ")}
            >
              <span>Sistema</span>
            </button>
          )}
        </nav>
      </aside>

      {/* MAIN */}
      <main className="ui-main">
        <h2 className="mb-8 ui-page-title">APP Medidas</h2>

        {activeTab === "login" && (
          <div className="space-y-8">
            <LoginSection token={token} setToken={setToken} currentUser={currentUser} />
            <EmpresasSection token={token} />
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <DashboardSection token={token} />
          </div>
        )}

        {activeTab === "usuarios" && (
          <div className="space-y-8">
            {canManageUsers ? (
              <UsersSection token={token} />
            ) : (
              <section className="ui-card ui-card--border text-red-300 text-sm">No tienes permisos para gestionar usuarios.</section>
            )}
          </div>
        )}

        {activeTab === "clientes" && (
          <div className="space-y-8">
            {isSuperuser ? (
              <ClientesSection token={token} currentUser={currentUser} />
            ) : (
              <section className="ui-card ui-card--border text-red-300 text-sm">Solo disponible para superusuarios.</section>
            )}
          </div>
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
          <section className="ui-card ui-card--border text-sm">
            {/* ✅ Cabecera clicable (desplegable) — con Mostrar/Ocultar */}
            <button
              type="button"
              onClick={() => setAjustesOpen((prev) => !prev)}
              className="mb-4 flex w-full items-center justify-between gap-6 rounded-2xl px-1 py-1 text-left"
              aria-expanded={ajustesOpen}
              aria-controls="ajustes-content"
            >
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Configuración</h3>
                <p className="text-xs ui-muted">Preferencias y ajustes del panel.</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] ui-muted">{ajustesOpen ? "Ocultar" : "Mostrar"}</span>
                <span
                  className={[
                    "inline-flex items-center justify-center text-[13px] ui-muted transition-transform",
                    ajustesOpen ? "rotate-180" : "rotate-0",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </div>
            </button>

            {/* ✅ Contenido desplegable */}
            {ajustesOpen && (
              <div id="ajustes-content">
                {/* Submenú interno */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAjustesSubTab("aspecto")}
                    className={["ui-btn", ajustesSubTab === "aspecto" ? "ui-btn-secondary" : "ui-btn-outline"].join(" ")}
                  >
                    Apariencia
                  </button>

                  <button
                    type="button"
                    onClick={resetUiColors}
                    className="ui-btn ui-btn-outline"
                    title="Restaurar colores por defecto"
                  >
                    Restaurar colores
                  </button>
                </div>

                {ajustesSubTab === "aspecto" && <AppearanceSettingsSection token={token} />}
              </div>
            )}
          </section>
        )}

        {activeTab === "sistema" && (
          <div className="space-y-8">
            {isSuperuser ? (
              <SistemaSection token={token} />
            ) : (
              <section className="ui-card ui-card--border text-red-300 text-sm">Solo disponible para superusuarios.</section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}