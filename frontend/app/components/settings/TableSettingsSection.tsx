// app/components/settings/TableSettingsSection.tsx
"use client";

import React from "react";
import type { TableAppearance, TableColumnConfig } from "./hooks/useTableSettings";

// ── Tipos ──────────────────────────────────────────────────────────────────

type ColumnMeta = { id: string; label: string; group: string };

type Props = {
  // apariencia
  appearance: TableAppearance;
  onSetAppearance: (key: keyof TableAppearance, value: boolean) => void;
  // columnas General
  generalColumnOrder: string[];
  generalHiddenColumns: string[];
  generalMeta: ColumnMeta[];
  onSetGeneralOrder: (order: string[]) => void;
  onSetGeneralHidden: (cols: string[]) => void;
  // columnas PS
  psColumnOrder: string[];
  psHiddenColumns: string[];
  psMeta: ColumnMeta[];
  onSetPsOrder: (order: string[]) => void;
  onSetPsHidden: (cols: string[]) => void;
  // reset
  onResetAll: () => void;
};

// ── Colores de grupo ───────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, React.CSSProperties> = {
  "Identificación": { background: "rgba(30,58,95,0.3)",  color: "var(--text-muted)" },
  "General":        { background: "rgba(37,99,235,0.2)", color: "#60a5fa" },
  "M2":             { background: "rgba(5,150,105,0.2)", color: "#34d399" },
  "M7":             { background: "rgba(245,158,11,0.2)",color: "#fbbf24" },
  "M11":            { background: "rgba(168,85,247,0.2)",color: "#c084fc" },
  "ART15":          { background: "rgba(239,68,68,0.2)", color: "#f87171" },
  "Energía PS":     { background: "rgba(37,99,235,0.2)", color: "#60a5fa" },
  "CUPS PS":        { background: "rgba(30,58,95,0.3)",  color: "var(--text-muted)" },
  "Importes PS":    { background: "rgba(5,150,105,0.2)", color: "#34d399" },
  "Energía Tarifas":{ background: "rgba(245,158,11,0.2)",color: "#fbbf24" },
  "CUPS Tarifas":   { background: "rgba(30,58,95,0.3)",  color: "var(--text-muted)" },
  "Importes Tarifas":{ background:"rgba(168,85,247,0.2)",color: "#c084fc" },
};

// ── Toggle switch ──────────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: checked ? "var(--btn-secondary-bg)" : "var(--card-border)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 150ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          top: 3,
          left: checked ? 19 : 3,
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

// ── Fila de opción de apariencia ───────────────────────────────────────────
function AppearanceRow({
  label,
  description,
  icon,
  value,
  onChange,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 12px",
        borderRadius: 8,
        border: "1px solid var(--card-border)",
        background: "var(--card-bg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            background: "var(--nav-item-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{label}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{description}</div>
        </div>
      </div>
      <Toggle checked={value} onChange={onChange} />
    </div>
  );
}

// ── Panel de columnas ──────────────────────────────────────────────────────
function ColumnsPanel({
  title,
  meta,
  columnOrder,
  hiddenColumns,
  onSetOrder,
  onSetHidden,
  defaultOrder,
}: {
  title: string;
  meta: ColumnMeta[];
  columnOrder: string[];
  hiddenColumns: string[];
  onSetOrder: (order: string[]) => void;
  onSetHidden: (cols: string[]) => void;
  defaultOrder: string[];
}) {
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);

  const safeOrder = columnOrder.length > 0 ? columnOrder : defaultOrder;
  const orderedMeta = React.useMemo(() => {
    const map = new Map(meta.map((m) => [m.id, m]));
    const result: ColumnMeta[] = [];
    for (const id of safeOrder) {
      const m = map.get(id);
      if (m) result.push(m);
    }
    // añadir columnas no presentes en el order
    for (const m of meta) {
      if (!safeOrder.includes(m.id)) result.push(m);
    }
    return result;
  }, [meta, safeOrder]);

  function toggleVisible(id: string) {
    if (hiddenColumns.includes(id)) {
      onSetHidden(hiddenColumns.filter((c) => c !== id));
    } else {
      onSetHidden([...hiddenColumns, id]);
    }
  }

  function handleDrop(toIdx: number) {
    if (dragIdx === null || dragIdx === toIdx) return;
    const copy = orderedMeta.map((m) => m.id);
    const [item] = copy.splice(dragIdx, 1);
    copy.splice(toIdx, 0, item);
    onSetOrder(copy);
    setDragIdx(null);
  }

  const visibleCount = orderedMeta.length - hiddenColumns.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{title}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
            {visibleCount} de {orderedMeta.length} columnas visibles · Arrastra para reordenar
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-xs"
            onClick={() => onSetHidden(defaultOrder)}
          >
            Ocultar todas
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-xs"
            onClick={() => { onSetOrder(defaultOrder); onSetHidden([]); }}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 5,
          maxHeight: 380,
          overflowY: "auto",
        }}
      >
        {orderedMeta.map((col, idx) => {
          const isVisible = !hiddenColumns.includes(col.id);
          const groupStyle = GROUP_COLORS[col.group] ?? { background: "rgba(30,58,95,0.2)", color: "var(--text-muted)" };
          return (
            <div
              key={col.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDrop={() => handleDrop(idx)}
              onDragOver={(e) => e.preventDefault()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                cursor: "grab",
                opacity: isVisible ? 1 : 0.45,
              }}
            >
              {/* checkbox */}
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={isVisible}
                onChange={() => toggleVisible(col.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ flexShrink: 0 }}
              />
              {/* label */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                </div>
              </div>
              {/* badge de grupo */}
              <span
                style={{
                  fontSize: 8,
                  padding: "1px 5px",
                  borderRadius: 4,
                  flexShrink: 0,
                  ...groupStyle,
                }}
              >
                {col.group}
              </span>
              {/* handle arrastre */}
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>☰</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function TableSettingsSection({
  appearance,
  onSetAppearance,
  generalColumnOrder,
  generalHiddenColumns,
  generalMeta,
  onSetGeneralOrder,
  onSetGeneralHidden,
  psColumnOrder,
  psHiddenColumns,
  psMeta,
  onSetPsOrder,
  onSetPsHidden,
  onResetAll,
}: Props) {
  const [activeTable, setActiveTable] = React.useState<"general" | "ps">("general");

  const appearanceOptions: {
    key: keyof TableAppearance;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "stripedRows",
      label: "Bandas alternas",
      description: "Filas pares con fondo diferente — facilita seguir la línea horizontalmente",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="12" height="2.5" rx="1" fill="currentColor" opacity="0.3" style={{ color: "#60a5fa" }} />
          <rect x="1" y="6" width="12" height="2.5" rx="1" fill="currentColor" opacity="0.6" style={{ color: "#60a5fa" }} />
          <rect x="1" y="10" width="12" height="2.5" rx="1" fill="currentColor" opacity="0.3" style={{ color: "#60a5fa" }} />
        </svg>
      ),
    },
    {
      key: "columnGroups",
      label: "Cabeceras de grupo por ventana",
      description: "Resalta con color cada grupo de columnas (General, M2, M7, ART15...)",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="12" height="3" rx="1" fill="#34d399" opacity="0.5" />
          <rect x="1" y="5.5" width="5.5" height="2" rx="0.5" fill="#60a5fa" opacity="0.5" />
          <rect x="7.5" y="5.5" width="5.5" height="2" rx="0.5" fill="#fbbf24" opacity="0.6" />
          <rect x="1" y="9" width="5.5" height="2" rx="0.5" fill="#60a5fa" opacity="0.5" />
          <rect x="7.5" y="9" width="5.5" height="2" rx="0.5" fill="#fbbf24" opacity="0.6" />
        </svg>
      ),
    },
    {
      key: "pctBadges",
      label: "Badge de color en porcentajes",
      description: "Pérdidas positivas en verde, negativas en rojo — identifica anomalías de un vistazo",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="4" width="5.5" height="6" rx="2" fill="#34d399" opacity="0.4" />
          <rect x="7.5" y="4" width="5.5" height="6" rx="2" fill="#f87171" opacity="0.4" />
          <text x="3.5" y="9" fontSize="4" fontWeight="700" textAnchor="middle" fill="#34d399">+%</text>
          <text x="10.5" y="9" fontSize="4" fontWeight="700" textAnchor="middle" fill="#f87171">-%</text>
        </svg>
      ),
    },
    {
      key: "periodSeparator",
      label: "Separador de período",
      description: "Agrupa filas bajo cabeceras de sección \"2026 · Febrero\", \"2026 · Enero\"...",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="12" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" style={{ color: "var(--text-muted)" }} />
          <rect x="1" y="5" width="12" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" style={{ color: "var(--text-muted)" }} />
          <rect x="1" y="7" width="12" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" style={{ color: "var(--text-muted)" }} />
          <rect x="1" y="10" width="12" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" style={{ color: "var(--text-muted)" }} />
          <rect x="1" y="12" width="12" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" style={{ color: "var(--text-muted)" }} />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Info */}
      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
        ✅ Guardando en servidor — disponible desde cualquier navegador o dispositivo.
      </p>

      {/* SECCIÓN: APARIENCIA */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Apariencia</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Opciones visuales que aplican a ambas tablas (General y PS)
            </div>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-xs"
            onClick={onResetAll}
          >
            Restaurar todo
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {appearanceOptions.map((opt) => (
            <AppearanceRow
              key={opt.key}
              label={opt.label}
              description={opt.description}
              icon={opt.icon}
              value={appearance[opt.key]}
              onChange={(v) => onSetAppearance(opt.key, v)}
            />
          ))}
        </div>
      </div>

      {/* SECCIÓN: COLUMNAS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
          Columnas y orden
        </div>

        {/* Tabs General / PS */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["general", "ps"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTable(t)}
              style={{
                padding: "5px 14px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: activeTable === t ? 500 : 400,
                cursor: "pointer",
                border: activeTable === t
                  ? "1px solid var(--btn-secondary-bg)"
                  : "1px solid var(--card-border)",
                background: activeTable === t ? "var(--nav-item-bg)" : "transparent",
                color: activeTable === t ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {t === "general" ? "Medidas General" : "Medidas PS"}
            </button>
          ))}
        </div>

        {activeTable === "general" && (
          <ColumnsPanel
            title="Medidas General"
            meta={generalMeta}
            columnOrder={generalColumnOrder}
            hiddenColumns={generalHiddenColumns}
            onSetOrder={onSetGeneralOrder}
            onSetHidden={onSetGeneralHidden}
            defaultOrder={generalMeta.map((m) => m.id)}
          />
        )}

        {activeTable === "ps" && (
          <ColumnsPanel
            title="Medidas PS"
            meta={psMeta}
            columnOrder={psColumnOrder}
            hiddenColumns={psHiddenColumns}
            onSetOrder={onSetPsOrder}
            onSetHidden={onSetPsHidden}
            defaultOrder={psMeta.map((m) => m.id)}
          />
        )}
      </div>

    </div>
  );
}
