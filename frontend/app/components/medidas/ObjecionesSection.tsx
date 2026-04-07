"use client";

import { useState } from "react";
import type { User } from "../../types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ObjecionTipo = "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL";

interface TableConfig {
  id: ObjecionTipo;
  label: string;
  importLabel: string;
  generateLabel: string;
  columns: string[];
}

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

// ─── Configuración de las 4 tablas ───────────────────────────────────────────

const TABLES: TableConfig[] = [
  {
    id: "AOBAGRECL",
    label: "AOBAGRECL",
    importLabel: "Importar AOBAGRECL",
    generateLabel: "Generar REOBAGRECL",
    columns: [
      "Public.",
      "D",
      "C",
      "P",
      "V",
      "T",
      "DH",
      "TP",
      "TD",
      "Per",
      "Motivo del emisor",
      "Magnitud",
      "Energía publicada",
      "Energía propuesta",
      "Aceptada",
    ],
  },
  {
    id: "OBJEINCL",
    label: "OBJEINCL",
    importLabel: "Importar OBJEINCL",
    generateLabel: "Generar REOBJEINCL",
    columns: [
      "Public.",
      "CUPS",
      "Comer",
      "Ini",
      "Fin",
      "Motivo del emisor",
      "AE publicada",
      "AE propuesta",
      "AS publicada",
      "AS propuesta",
      "Aceptada",
    ],
  },
  {
    id: "AOBCUPS",
    label: "AOBCUPS",
    importLabel: "Importar AOBCUPS",
    generateLabel: "Generar REOBCUPS",
    columns: [
      "Public.",
      "CUPS",
      "Comer",
      "Per",
      "Motivo del emisor",
      "Energía publicada",
      "Energía propuesta",
      "Aceptada",
      "Magnitud",
    ],
  },
  {
    id: "AOBCIL",
    label: "AOBCIL",
    importLabel: "Importar AOBCIL",
    generateLabel: "Generar REOBCIL",
    columns: [
      "Public.",
      "CIL",
      "Representante",
      "Per",
      "Motivo del emisor",
      "Energía Exportada publicada",
      "Energía Exportada propuesta",
      "Energía Reactiva 2 publicada",
      "Energía Reactiva 2 propuesta",
      "Energía Reactiva 3 publicada",
      "Energía Reactiva 3 propuesta",
      "Aceptada",
    ],
  },
];

// ─── Iconos SVG inline (sin dependencias externas) ───────────────────────────

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconUndo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const IconRedo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
);

const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const IconList = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconSettings = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconGenerate = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// ─── Subcomponente: tabla individual ─────────────────────────────────────────

function ObjecionTable({ config }: { config: TableConfig }) {
  const [allChecked, setAllChecked] = useState(false);

  const headerIcons = [
    { icon: <IconCopy />, title: "Copiar" },
    { icon: <IconUndo />, title: "Deshacer" },
    { icon: <IconRedo />, title: "Rehacer" },
    { icon: <IconRefresh />, title: "Recargar" },
    { icon: <IconList />, title: "Ver columnas" },
    { icon: <IconSettings />, title: "Ajustes" },
  ];

  return (
    <div
      className="flex flex-col rounded overflow-hidden"
      style={{ border: "1px solid #e2e8f0" }}
    >
      {/* ── Cabecera oscura ── */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: "#1a2332" }}
      >
        <span
          className="text-white text-xs font-semibold tracking-widest uppercase"
          style={{ letterSpacing: "0.08em" }}
        >
          {config.label}
        </span>

        <div className="flex items-center gap-0.5">
          {headerIcons.map(({ icon, title }, i) => (
            <button
              key={i}
              title={title}
              className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla con scroll horizontal ── */}
      <div className="overflow-x-auto flex-1" style={{ minHeight: "180px" }}>
        <table className="w-full text-xs border-collapse" style={{ minWidth: "max-content" }}>
          <thead>
            <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th className="w-8 px-2 py-2 text-center" style={{ borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => setAllChecked(e.target.checked)}
                  className="cursor-pointer accent-slate-700"
                />
              </th>
              {config.columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-2 text-left font-medium whitespace-nowrap"
                  style={{
                    color: "#475569",
                    borderRight: "1px solid #f1f5f9",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={config.columns.length + 1}
                className="text-center"
                style={{ padding: "48px 16px", color: "#94a3b8", fontSize: "11px" }}
              >
                Sin objeciones cargadas
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Botones inferiores ── */}
      <div
        className="flex gap-2 p-2"
        style={{ borderTop: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}
      >
        <button
          className="flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors"
          style={{
            border: "1px solid #cbd5e1",
            color: "#475569",
            backgroundColor: "white",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f1f5f9";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "white";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1";
          }}
          onClick={() => {
            // TODO: abrir file picker y llamar a POST /objeciones/{tipo}/import
          }}
        >
          <IconFolder />
          <span>{config.importLabel}</span>
        </button>

        <button
          className="flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors"
          style={{
            border: "1px solid #cbd5e1",
            color: "#475569",
            backgroundColor: "white",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f1f5f9";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "white";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1";
          }}
          onClick={() => {
            // TODO: llamar a POST /objeciones/{tipo}/generate y descargar fichero REOB*
          }}
        >
          <IconGenerate />
          <span>{config.generateLabel}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjecionesSection({ token, currentUser }: ObjecionesSectionProps) {
  const topRow = TABLES.slice(0, 2);
  const bottomRow = TABLES.slice(2, 4);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Fila superior: AOBAGRECL + OBJEINCL */}
      <div className="grid grid-cols-2 gap-4">
        {topRow.map((t) => (
          <ObjecionTable key={t.id} config={t} />
        ))}
      </div>

      {/* Fila inferior: AOBCUPS + AOBCIL */}
      <div className="grid grid-cols-2 gap-4">
        {bottomRow.map((t) => (
          <ObjecionTable key={t.id} config={t} />
        ))}
      </div>
    </div>
  );
}
