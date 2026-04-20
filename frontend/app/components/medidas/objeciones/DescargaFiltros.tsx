// Filtros del panel "Descarga en Objeciones" (FASE 5 · Sub-paso 5.2).
// - Multi-select de empresas con checkboxes (spec V8 · punto 5)
// - Periodo YYYY-MM único (spec V8 · punto 6)
// - Nombre substring case-insensitive (spec V8 · punto 7)

"use client";

import { useEffect, useRef, useState } from "react";
import type { EmpresaOption } from "./shared/types";
import { IconSearch } from "./shared/icons";

interface DescargaFiltrosProps {
  empresas:         EmpresaOption[];
  empresaIds:       number[];        // vacío = todas accesibles
  setEmpresaIds:    (ids: number[]) => void;
  periodo:          string;          // "YYYY-MM" o ""
  setPeriodo:       (v: string) => void;
  nombre:           string;
  setNombre:        (v: string) => void;
  loading:          boolean;
  onBuscar:         () => void;
}

export default function DescargaFiltros({
  empresas, empresaIds, setEmpresaIds,
  periodo, setPeriodo,
  nombre, setNombre,
  loading, onBuscar,
}: DescargaFiltrosProps) {

  // ── Multi-select custom con checkboxes ──────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Cerrar el dropdown al hacer click fuera.
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const toggleEmpresa = (id: number) => {
    if (empresaIds.includes(id)) {
      setEmpresaIds(empresaIds.filter((x) => x !== id));
    } else {
      setEmpresaIds([...empresaIds, id]);
    }
  };

  const seleccionarTodas = () => setEmpresaIds([]);  // [] = todas
  const limpiarSeleccion = () => setEmpresaIds([]);

  const empresaLabel = empresaIds.length === 0
    ? "Todas las empresas"
    : empresaIds.length === 1
      ? (empresas.find((e) => e.id === empresaIds[0])?.nombre ?? `Empresa ${empresaIds[0]}`)
      : `${empresaIds.length} empresas seleccionadas`;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 14 }}>
      {/* Empresa (multi-select custom) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Empresa:</span>
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={() => setDropdownOpen((v) => !v)}
            style={{ minWidth: 180, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
          >
            <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {empresaLabel}
            </span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
          </button>
          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
              background: "var(--card-bg)", border: "1px solid var(--card-border)",
              borderRadius: 8, minWidth: 240, maxHeight: 320, overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}>
              {/* Acciones rápidas */}
              <div style={{
                display: "flex", gap: 4, padding: "8px 10px",
                borderBottom: "1px solid var(--card-border)",
                background: "var(--field-bg-soft)",
              }}>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                  onClick={seleccionarTodas} style={{ fontSize: 10 }}>
                  Todas
                </button>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs"
                  onClick={limpiarSeleccion} style={{ fontSize: 10 }}>
                  Limpiar
                </button>
              </div>
              {/* Lista empresas */}
              {empresas.length === 0 ? (
                <div style={{ padding: 10, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                  Sin empresas accesibles
                </div>
              ) : (
                empresas.map((emp) => {
                  const checked = empresaIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 10px", fontSize: 11,
                        cursor: "pointer",
                        borderBottom: "0.5px solid var(--card-border)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--nav-item-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEmpresa(emp.id)}
                        style={{ cursor: "pointer", accentColor: "#1a2332" }}
                      />
                      <span style={{ flex: 1 }}>
                        {emp.nombre || `Empresa ${emp.id}`}
                      </span>
                      {emp.codigo_ree && (
                        <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
                          {emp.codigo_ree}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Periodo YYYY-MM */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Periodo:</span>
        <input
          type="month"
          className="ui-input"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          placeholder="Últimos 6 meses"
          style={{ fontSize: 11, padding: "4px 8px", height: 28, width: 140 }}
        />
      </div>

      {/* Nombre contains */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Nombre:</span>
        <input
          type="text"
          className="ui-input"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onBuscar(); }}
          placeholder="Texto contenido en el fichero"
          style={{ fontSize: 11, padding: "4px 8px", height: 28, flex: 1, minWidth: 160 }}
        />
      </div>

      {/* Botón Buscar */}
      <button
        type="button"
        onClick={onBuscar}
        disabled={loading}
        className="ui-btn ui-btn-primary ui-btn-xs"
        style={{ display: "flex", alignItems: "center", gap: 5 }}
      >
        <IconSearch />
        {loading ? "Buscando..." : "Buscar"}
      </button>
    </div>
  );
}