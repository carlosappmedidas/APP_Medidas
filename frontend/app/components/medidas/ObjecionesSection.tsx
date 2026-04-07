"use client";

import { useState } from "react";
import type { User } from "../../types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ObjecionTipo = "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL";

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

interface TabConfig {
  id: ObjecionTipo;
  label: string;
  importLabel: string;
  generateLabel: string;
  columns: { id: string; label: string; align: "left" | "right" }[];
}

// ─── Configuración de tabs ────────────────────────────────────────────────────

const TABS: TabConfig[] = [
  {
    id: "AOBAGRECL",
    label: "AOBAGRECL",
    importLabel: "Importar AOBAGRECL",
    generateLabel: "Generar REOBAGRECL",
    columns: [
      { id: "publicacion",      label: "Publicación",      align: "left" },
      { id: "distribuidor",     label: "Distribuidor",     align: "left" },
      { id: "comercializador",  label: "Comercializador",  align: "left" },
      { id: "provincia",        label: "Provincia",        align: "left" },
      { id: "nivel_tension",    label: "Nivel tensión",    align: "left" },
      { id: "tarifa",           label: "Tarifa",           align: "left" },
      { id: "disc_horaria",     label: "Disc. horaria",    align: "left" },
      { id: "tipo_punto",       label: "Tipo punto",       align: "left" },
      { id: "tipo_demanda",     label: "Tipo demanda",     align: "left" },
      { id: "periodo",          label: "Periodo",          align: "left" },
      { id: "motivo",           label: "Motivo",           align: "left" },
      { id: "magnitud",         label: "Magnitud",         align: "left" },
      { id: "e_publicada",      label: "E. publicada (kWh)", align: "right" },
      { id: "e_propuesta",      label: "E. propuesta (kWh)", align: "right" },
      { id: "aceptada",         label: "Aceptada",         align: "left" },
    ],
  },
  {
    id: "OBJEINCL",
    label: "OBJEINCL",
    importLabel: "Importar OBJEINCL",
    generateLabel: "Generar REOBJEINCL",
    columns: [
      { id: "publicacion",     label: "Publicación",        align: "left" },
      { id: "cups",            label: "CUPS",               align: "left" },
      { id: "comercializador", label: "Comercializador",    align: "left" },
      { id: "inicio",          label: "Inicio",             align: "left" },
      { id: "fin",             label: "Fin",                align: "left" },
      { id: "motivo",          label: "Motivo",             align: "left" },
      { id: "ae_publicada",    label: "AE publicada (kWh)", align: "right" },
      { id: "ae_propuesta",    label: "AE propuesta (kWh)", align: "right" },
      { id: "as_publicada",    label: "AS publicada (kWh)", align: "right" },
      { id: "as_propuesta",    label: "AS propuesta (kWh)", align: "right" },
      { id: "aceptada",        label: "Aceptada",           align: "left" },
    ],
  },
  {
    id: "AOBCUPS",
    label: "AOBCUPS",
    importLabel: "Importar AOBCUPS",
    generateLabel: "Generar REOBCUPS",
    columns: [
      { id: "publicacion",     label: "Publicación",        align: "left" },
      { id: "cups",            label: "CUPS",               align: "left" },
      { id: "comercializador", label: "Comercializador",    align: "left" },
      { id: "periodo",         label: "Periodo",            align: "left" },
      { id: "motivo",          label: "Motivo",             align: "left" },
      { id: "e_publicada",     label: "E. publicada",       align: "right" },
      { id: "e_propuesta",     label: "E. propuesta",       align: "right" },
      { id: "aceptada",        label: "Aceptada",           align: "left" },
      { id: "magnitud",        label: "Magnitud",           align: "left" },
    ],
  },
  {
    id: "AOBCIL",
    label: "AOBCIL",
    importLabel: "Importar AOBCIL",
    generateLabel: "Generar REOBCIL",
    columns: [
      { id: "publicacion",        label: "Publicación",              align: "left" },
      { id: "cil",                label: "CIL",                      align: "left" },
      { id: "representante",      label: "Representante",            align: "left" },
      { id: "periodo",            label: "Periodo",                  align: "left" },
      { id: "motivo",             label: "Motivo",                   align: "left" },
      { id: "ee_publicada",       label: "E. Export. publicada",     align: "right" },
      { id: "ee_propuesta",       label: "E. Export. propuesta",     align: "right" },
      { id: "eq2_publicada",      label: "E. React. Q2 publicada",   align: "right" },
      { id: "eq2_propuesta",      label: "E. React. Q2 propuesta",   align: "right" },
      { id: "eq3_publicada",      label: "E. React. Q3 publicada",   align: "right" },
      { id: "eq3_propuesta",      label: "E. React. Q3 propuesta",   align: "right" },
      { id: "aceptada",           label: "Aceptada",                 align: "left" },
    ],
  },
];

// ─── Badge de estado ──────────────────────────────────────────────────────────

function BadgeEstado({ valor }: { valor: string }) {
  const map: Record<string, { bg: string; color: string; texto: string }> = {
    S:  { bg: "rgba(5,150,105,0.18)",  color: "#34d399", texto: "Aceptada"  },
    N:  { bg: "rgba(239,68,68,0.18)",  color: "#f87171", texto: "Rechazada" },
    "": { bg: "rgba(245,158,11,0.18)", color: "#fbbf24", texto: "Pendiente" },
  };
  const e = map[valor] ?? map[""];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: "inherit",
        fontWeight: 500,
        background: e.bg,
        color: e.color,
        whiteSpace: "nowrap",
      }}
    >
      {e.texto}
    </span>
  );
}

// ─── Iconos SVG ───────────────────────────────────────────────────────────────

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ─── Datos de ejemplo (TODO: reemplazar por API) ──────────────────────────────

const FILAS_EJEMPLO: Record<ObjecionTipo, Record<string, string>[]> = {
  AOBAGRECL: [
    { publicacion: "20260302", distribuidor: "0277", comercializador: "0921", provincia: "AB", nivel_tension: "E2", tarifa: "6A", disc_horaria: "G0", tipo_punto: "5", tipo_demanda: "0", periodo: "2025/06", motivo: "100", magnitud: "AE", e_publicada: "847", e_propuesta: "398", aceptada: "" },
    { publicacion: "20260319", distribuidor: "0277", comercializador: "1008", provincia: "M",  nivel_tension: "E1", tarifa: "2.0TD", disc_horaria: "G0", tipo_punto: "1", tipo_demanda: "0", periodo: "2025/06", motivo: "100", magnitud: "AE", e_publicada: "1.240", e_propuesta: "1.100", aceptada: "S" },
    { publicacion: "20260319", distribuidor: "0277", comercializador: "0336", provincia: "M",  nivel_tension: "E2", tarifa: "3.0TD", disc_horaria: "G0", tipo_punto: "5", tipo_demanda: "0", periodo: "2025/05", motivo: "200", magnitud: "AE", e_publicada: "5.320", e_propuesta: "4.900", aceptada: "N" },
  ],
  OBJEINCL: [
    { publicacion: "20260302", cups: "ES0277000000002138RN0F", comercializador: "0921", inicio: "20250601 01", fin: "20250701 00", motivo: "100", ae_publicada: "847", ae_propuesta: "398", as_publicada: "0", as_propuesta: "0", aceptada: "" },
  ],
  AOBCUPS: [],
  AOBCIL:  [],
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjecionesSection({ token, currentUser }: ObjecionesSectionProps) {
  const [activeTab, setActiveTab] = useState<ObjecionTipo>("AOBAGRECL");

  const tab = TABS.find((t) => t.id === activeTab)!;
  const rows = FILAS_EJEMPLO[activeTab];
  const totalRows = rows.length;

  const handleImport = () => {
    // TODO: abrir file picker y llamar a POST /objeciones/{tipo}/import
  };

  const handleGenerate = () => {
    // TODO: llamar a POST /objeciones/{tipo}/generate y descargar fichero REOB*
  };

  return (
    <section className="ui-card text-sm">

      {/* ── Barra de tabs ── */}
      <div
        style={{
          display: "flex",
          backgroundColor: "#1a2332",
          borderRadius: "6px 6px 0 0",
          paddingLeft: "8px",
          gap: "2px",
          marginBottom: 0,
        }}
      >
        {TABS.map((t) => {
          const isActive = t.id === activeTab;
          const count = FILAS_EJEMPLO[t.id].length;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "9px 16px",
                fontSize: "11px",
                fontWeight: 500,
                color: isActive ? "white" : "rgba(255,255,255,0.4)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid #60a5fa" : "2px solid transparent",
                cursor: "pointer",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "color 0.15s",
              }}
            >
              {t.label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    background: isActive ? "#60a5fa" : "rgba(255,255,255,0.15)",
                    color: "white",
                    borderRadius: "10px",
                    padding: "1px 6px",
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center justify-between gap-2 mb-3"
        style={{
          padding: "8px 10px",
          background: "var(--field-bg-soft)",
          border: "1px solid var(--card-border)",
          borderTop: "none",
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImport}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <IconFolder />
            {tab.importLabel}
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <IconDownload />
            {tab.generateLabel}
          </button>
        </div>

        <span className="ui-muted" style={{ fontSize: "11px" }}>
          {totalRows === 0
            ? "Sin registros"
            : `${totalRows} registro${totalRows !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* ── Tabla ── */}
      <div className="ui-table-wrap">
        <table
          className="ui-table text-[11px]"
          style={{ borderCollapse: "separate", borderSpacing: 0 }}
        >
          <thead className="ui-thead">
            <tr>
              {tab.columns.map((col) => (
                <th
                  key={col.id}
                  className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="ui-tr">
                <td
                  colSpan={tab.columns.length}
                  className="ui-td text-center ui-muted"
                  style={{ padding: "48px 16px" }}
                >
                  Sin objeciones cargadas · Usa &quot;{tab.importLabel}&quot; para cargar un fichero
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr key={ri} className="ui-tr">
                  {tab.columns.map((col) => (
                    <td
                      key={col.id}
                      className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {col.id === "aceptada"
                        ? <BadgeEstado valor={row[col.id] ?? ""} />
                        : (row[col.id] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </section>
  );
}
