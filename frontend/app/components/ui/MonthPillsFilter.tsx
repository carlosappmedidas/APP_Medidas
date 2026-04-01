// app/components/ui/MonthPillsFilter.tsx
// ← Paso 8: extraído de GraficosSection.tsx — código idéntico, solo movido de sitio
"use client";

import React from "react";

const MESES_LABEL: Record<number, string> = {
  1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
};

type MonthPillsFilterProps = {
  selectedMeses: number[];
  onToggle: (mes: number) => void;
  onSelectAll: () => void;
};

export default function MonthPillsFilter({
  selectedMeses,
  onToggle,
  onSelectAll,
}: MonthPillsFilterProps) {
  const allSelected = selectedMeses.length === 0 || selectedMeses.length === 12;

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 10, padding: "0 6px", borderRadius: 6, cursor: "pointer",
    border:     active ? "1px solid rgba(37,99,235,.5)" : "1px solid rgba(255,255,255,.1)",
    background: active ? "rgba(37,99,235,.28)"          : "rgba(0,0,0,.18)",
    color:      active ? "#93c5fd"                      : "rgba(226,232,240,.38)",
    height: 26, display: "flex", alignItems: "center", minWidth: 30, justifyContent: "center",
  });

  const allStyle: React.CSSProperties = {
    fontSize: 10, padding: "0 7px", borderRadius: 6, cursor: "pointer",
    border:     allSelected ? "1px solid #34d399"         : "1px solid rgba(52,211,153,.22)",
    background: allSelected ? "rgba(52,211,153,.14)"      : "transparent",
    color:      allSelected ? "#34d399"                   : "rgba(52,211,153,.55)",
    height: 26, display: "flex", alignItems: "center",
  };

  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      <button type="button" onClick={onSelectAll} style={allStyle}>Todos</button>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
        <button key={m} type="button" onClick={() => onToggle(m)} style={pillStyle(selectedMeses.includes(m))}>
          {MESES_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
