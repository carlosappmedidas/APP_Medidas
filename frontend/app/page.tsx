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

const UI_THEME_STORAGE_KEY = "ui_theme_overrides";

function applyUiThemeOverrides(overrides: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  for (const [k, v] of Object.entries(overrides || {})) {
    if (!k.startsWith("--")) continue;
    if (typeof v !== "string") continue;
    root.style.setProperty(k, v);
  }
}

export default function HomePage() {
  const [token, setToken] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>("login");
  const [tablasOpen, setTablasOpen] = useState(false);
  const [ajustesOpen, setAjustesOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ajustesSubTab, setAjustesSubTab] = useState<"aspecto">("aspecto");

  const [columnOrder, setColumnOrder] = useState<string[]>(ALL_COLUMNS_META.map((c) => c.id));
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  const [psColumnOrder, setPsColumnOrder] = useState<string[]>(COLUMNS_PS_META.map((c) => c.id));
  const [psHiddenColumns, setPsHiddenColumns] = useState<string[]>([]);

  useEffect(() => {
    try {
      const tab = localStorage.getItem("ui_active_tab") as MainTab | null;
      if (tab) setActiveTab(tab);

      setTablasOpen(localStorage.getItem("ui_tablas_open") === "1");
      setAjustesOpen(localStorage.getItem("ui_ajustes_open") === "1");

      const colOrder = localStorage.getItem("medidas_column_order");
      if (colOrder) setColumnOrder(JSON.parse(colOrder));

      const hidden = localStorage.getItem("medidas_hidden_columns");
      if (hidden) setHiddenColumns(JSON.parse(hidden));

      const psOrder = localStorage.getItem("medidas_ps_column_order");
      if (psOrder) setPsColumnOrder(JSON.parse(psOrder));

      const psHidden = localStorage.getItem("medidas_ps_hidden_columns");
      if (psHidden) setPsHiddenColumns(JSON.parse(psHidden));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("ui_active_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem("ui_tablas_open", tablasOpen ? "1" : "0");
  }, [tablasOpen]);

  useEffect(() => {
    localStorage.setItem("ui_ajustes_open", ajustesOpen ? "1" : "0");
  }, [ajustesOpen]);

  useEffect(() => {
    localStorage.setItem("medidas_column_order", JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem("medidas_hidden_columns", JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

  useEffect(() => {
    localStorage.setItem("medidas_ps_column_order", JSON.stringify(psColumnOrder));
  }, [psColumnOrder]);

  useEffect(() => {
    localStorage.setItem("medidas_ps_hidden_columns", JSON.stringify(psHiddenColumns));
  }, [psHiddenColumns]);

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
          setToken(null);
          setActiveTab("login");
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

  const canManageUsers =
    currentUser && (currentUser.rol === "admin" || currentUser.rol === "owner");

  const canSeeAjustes = !!canManageUsers;
  const isSuperuser = !!currentUser?.is_superuser;

  const isTablasActive =
    activeTab === "tablas-general" || activeTab === "tablas-ps";

  useEffect(() => {
    if (isTablasActive && !tablasOpen) setTablasOpen(true);
  }, [isTablasActive]);

  const resetUiColors = () => {
    window.dispatchEvent(new CustomEvent("ui-theme-reset"));
  };

  return (
    <div className="ui-shell">
      {/* SIDEBAR */}
      <aside className="ui-sidebar">
        <div className="mb-8">
          <h1 className="text-lg font-semibold">APP Medidas</h1>
          <p className="mt-1 text-xs ui-muted">Plataforma de gestión</p>
        </div>

        {/* MENÚ */}
        <nav className="ui-nav">
          <div className="ui-nav-section-title">Menú</div>

          <button
            onClick={() => setActiveTab("login")}
            className={[
              "ui-nav-item",
              activeTab === "login" ? "ui-nav-item--active" : "",
            ].join(" ")}
          >
            <span>Acceso</span>
          </button>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={[
              "ui-nav-item",
              activeTab === "dashboard" ? "ui-nav-item--active" : "",
            ].join(" ")}
          >
            <span>Dashboard</span>
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

          {/* TABLAS */}
          <div>
            <button
              onClick={() => {
                setTablasOpen((prev) => !prev);
                if (!isTablasActive) setActiveTab("tablas-general");
              }}
              className={[
                "ui-nav-item",
                isTablasActive ? "ui-nav-item--active" : "",
              ].join(" ")}
            >
              <span>Tablas</span>
              <span className="text-[10px] ui-muted">
                {tablasOpen ? "▾" : "▸"}
              </span>
            </button>

            {/* ✅ RESTAURADO: submenú para que NO “desaparezcan” General/PS */}
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
          </div>

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
      </aside>

      {/* MAIN */}
      <main className="ui-main">
        <h2 className="mb-8 ui-page-title">APP Medidas</h2>

        {activeTab === "login" && (
          <>
            <LoginSection token={token} setToken={setToken} currentUser={currentUser} />
            <EmpresasSection token={token} />
          </>
        )}

        {activeTab === "dashboard" && <DashboardSection token={token} />}

        {activeTab === "usuarios" && canManageUsers && (
          <UsersSection token={token} />
        )}

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
          <section className="ui-card ui-card--border text-sm">
            <button
              onClick={() => setAjustesOpen((prev) => !prev)}
              className="mb-4 flex w-full items-center justify-between"
            >
              <span>Configuración</span>
              <span>{ajustesOpen ? "▾" : "▸"}</span>
            </button>

            {ajustesOpen && (
              <>
                <button
                  onClick={() => setAjustesSubTab("aspecto")}
                  className="ui-btn"
                >
                  Apariencia
                </button>

                <button onClick={resetUiColors} className="ui-btn">
                  Restaurar colores
                </button>

                {ajustesSubTab === "aspecto" && (
                  <AppearanceSettingsSection token={token} />
                )}
              </>
            )}
          </section>
        )}

        {activeTab === "sistema" && isSuperuser && (
          <SistemaSection token={token} />
        )}
      </main>
    </div>
  );
}