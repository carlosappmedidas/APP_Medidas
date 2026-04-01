// app/components/ui/FilterDropdown.tsx
// ← Paso 9: extraído de GraficosSection.tsx — código idéntico, solo movido de sitio
"use client";

import React, { useEffect, useRef, useState } from "react";

export type MultiCheckOption = { value: number; label: string };

type FilterDropdownProps = {
  title: string;
  options: MultiCheckOption[];
  selectedValues: number[];
  onToggle: (value: number) => void;
  onSelectAll: () => void;
  allLabel?: string;
};

export default function FilterDropdown({
  title,
  options,
  selectedValues,
  onToggle,
  onSelectAll,
  allLabel = "Todas",
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = selectedValues.length === 0 || selectedValues.length === options.length;
  const summary = allSelected ? allLabel : `${selectedValues.length} sel.`;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ui-select"
        style={{ minWidth: 160, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <span>{title}: {summary}</span>
        <span style={{ fontSize: 10, color: "rgba(226,232,240,.5)" }}>▾</span>
      </button>
      {open && (
        <div
          className="rounded-xl border"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
            background: "var(--card-bg)", borderColor: "var(--card-border)",
            padding: 8, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--card-border)" }}>
            <span style={{ fontSize: 10, color: "rgba(226,232,240,.5)" }}>{title}</span>
            <button type="button" onClick={onSelectAll} className="ui-btn ui-btn-outline ui-btn-xs">{allLabel}</button>
          </div>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,58,95,.5)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background:  selectedValues.includes(opt.value) ? "#2563eb"                     : "transparent",
                border:      `1px solid ${selectedValues.includes(opt.value) ? "#2563eb"        : "rgba(255,255,255,.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: "#fff",
              }}>
                {selectedValues.includes(opt.value) ? "✓" : ""}
              </div>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
