// app/components/ui/YearPillsFilter.tsx
// ← Paso 7: extraído de GraficosSection.tsx — código idéntico, solo movido de sitio
"use client";

import React, { useEffect, useRef, useState } from "react";

type YearPillsFilterProps = {
  allAnios: number[];
  selectedAnios: number[];
  onToggle: (anio: number) => void;
  onSelectAll: () => void;
};

export default function YearPillsFilter({
  allAnios,
  selectedAnios,
  onToggle,
  onSelectAll,
}: YearPillsFilterProps) {
  const [prevOpen, setPrevOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setPrevOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const sorted      = [...allAnios].sort((a, b) => b - a);
  const recent      = sorted.slice(0, 4);
  const previous    = sorted.slice(4);
  const allSelected = selectedAnios.length === 0 || selectedAnios.length === allAnios.length;
  const prevActive  = previous.filter((y) => selectedAnios.includes(y));

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap",
    border:      active ? "1px solid #3b82f6"             : "1px solid rgba(255,255,255,.14)",
    background:  active ? "#1d4ed8"                       : "rgba(0,0,0,.22)",
    color:       active ? "#fff"                          : "rgba(226,232,240,.45)",
    height: 28, display: "flex", alignItems: "center",
  });

  const allPillStyle: React.CSSProperties = {
    fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
    border:     allSelected ? "1px solid #34d399"           : "1px solid rgba(52,211,153,.28)",
    background: allSelected ? "rgba(52,211,153,.2)"         : "transparent",
    color:      allSelected ? "#34d399"                     : "rgba(52,211,153,.6)",
    height: 28, display: "flex", alignItems: "center",
  };

  return (
    <div ref={wrapRef} style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" onClick={onSelectAll} style={allPillStyle}>Todos</button>
      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
      {recent.map((y) => (
        <button key={y} type="button" onClick={() => onToggle(y)} style={pillStyle(selectedAnios.includes(y))}>
          {y}
        </button>
      ))}
      {previous.length > 0 && (
        <>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setPrevOpen((v) => !v)}
              style={{
                fontSize: 11, padding: "0 10px", borderRadius: 7, cursor: "pointer",
                height: 28, display: "flex", alignItems: "center", gap: 5,
                border:     prevActive.length > 0 ? "1px solid rgba(37,99,235,.4)"  : "1px solid rgba(255,255,255,.1)",
                background: prevActive.length > 0 ? "rgba(37,99,235,.15)"           : "rgba(0,0,0,.18)",
                color:      prevActive.length > 0 ? "#93c5fd"                       : "rgba(226,232,240,.38)",
              }}
            >
              Anteriores
              {prevActive.length > 0 && (
                <span style={{ fontSize: 9, background: "rgba(37,99,235,.5)", color: "#fff", borderRadius: 8, padding: "1px 5px" }}>
                  {prevActive.length}
                </span>
              )}
              {prevOpen ? " ▴" : " ▾"}
            </button>
            {prevOpen && (
              <div
                className="rounded-xl border"
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                  background: "var(--card-bg)", borderColor: "var(--card-border)",
                  padding: 6, minWidth: 110, boxShadow: "0 8px 24px rgba(0,0,0,.5)",
                }}
              >
                {previous.map((y) => (
                  <div
                    key={y}
                    onClick={() => onToggle(y)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,58,95,.5)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{
                      width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                      background:  selectedAnios.includes(y) ? "#2563eb"                   : "transparent",
                      border:      `1px solid ${selectedAnios.includes(y) ? "#2563eb"      : "rgba(255,255,255,.2)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, color: "#fff",
                    }}>
                      {selectedAnios.includes(y) ? "✓" : ""}
                    </div>
                    {y}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
