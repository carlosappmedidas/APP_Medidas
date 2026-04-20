// Filtros del panel "Descarga en Objeciones" (FASE 5 · Sub-paso 5.2).
// - Multi-select de empresas con checkboxes (spec V8 · punto 5)
// - Periodo YYYY-MM: dos selects (Año + Mes) con botón Limpiar
// - Fecha publicación SFTP: rango Desde/Hasta (YYYY-MM-DD) con botón Limpiar
// - Nombre substring case-insensitive (spec V8 · punto 7)

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EmpresaOption } from "./shared/types";
import { IconSearch } from "./shared/icons";

interface DescargaFiltrosProps {
  empresas:         EmpresaOption[];
  empresaIds:       number[];        // vacío = todas accesibles
  setEmpresaIds:    (ids: number[]) => void;
  periodo:          string;          // "YYYY-MM" o ""
  setPeriodo:       (v: string) => void;
  fechaDesde:       string;          // "YYYY-MM-DD" o ""
  setFechaDesde:    (v: string) => void;
  fechaHasta:       string;          // "YYYY-MM-DD" o ""
  setFechaHasta:    (v: string) => void;
  nombre:           string;
  setNombre:        (v: string) => void;
  loading:          boolean;
  onBuscar:         () => void;
}

// ── Listas para los selects de Periodo ─────────────────────────────────────

const MESES = [
  { val: "01", label: "Enero" },
  { val: "02", label: "Febrero" },
  { val: "03", label: "Marzo" },
  { val: "04", label: "Abril" },
  { val: "05", label: "Mayo" },
  { val: "06", label: "Junio" },
  { val: "07", label: "Julio" },
  { val: "08", label: "Agosto" },
  { val: "09", label: "Septiembre" },
  { val: "10", label: "Octubre" },
  { val: "11", label: "Noviembre" },
  { val: "12", label: "Diciembre" },
];

// Últimos N años hasta el actual (incluidos).
const AÑOS = (() => {
  const now = new Date().getFullYear();
  const arr: number[] = [];
  for (let y = now; y >= now - 5; y--) arr.push(y);
  return arr;
})();

export default function DescargaFiltros({
  empresas, empresaIds, setEmpresaIds,
  periodo, setPeriodo,
  fechaDesde, setFechaDesde,
  fechaHasta, setFechaHasta,
  nombre, setNombre,
  loading, onBuscar,
}: DescargaFiltrosProps) {

  // ── Multi-select empresas con checkboxes ─────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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
  const seleccionarTodas = () => setEmpresaIds([]);
  const limpiarSeleccion = () => setEmpresaIds([]);

  const empresaLabel = empresaIds.length === 0
    ? "Todas las empresas"
    : empresaIds.length === 1
      ? (empresas.find((e) => e.id === empresaIds[0])?.nombre ?? `Empresa ${empresaIds[0]}`)
      : `${empresaIds.length} empresas seleccionadas`;

  // ── Periodo (año + mes) ──────────────────────────────────────────────────
  // El estado externo sigue siendo "YYYY-MM" o "", pero internamente lo
  // manejamos como dos campos separados sincronizados con el estado padre.
  const { periodoAño, periodoMes } = useMemo(() => {
    if (periodo && periodo.length === 7 && periodo[4] === "-") {
      return { periodoAño: periodo.slice(0, 4), periodoMes: periodo.slice(5, 7) };
    }
    return { periodoAño: "", periodoMes: "" };
  }, [periodo]);

  const setPeriodoAño = (año: string) => {
    if (!año) setPeriodo("");
    else if (periodoMes) setPeriodo(`${año}-${periodoMes}`);
    else setPeriodo(`${año}-01`);  // si solo eligen año, asumimos enero
  };
  const setPeriodoMes = (mes: string) => {
    if (!periodoAño) {
      // si no hay año, asumimos el año actual
      const añoActual = String(new Date().getFullYear());
      setPeriodo(mes ? `${añoActual}-${mes}` : "");
    } else {
      setPeriodo(mes ? `${periodoAño}-${mes}` : "");
    }
  };
  const limpiarPeriodo = () => setPeriodo("");

  // ── Fecha publicación ────────────────────────────────────────────────────
  const limpiarFechas = () => {
    setFechaDesde("");
    setFechaHasta("");
  };

  // ── Estilos compartidos ──────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)" };
  const selectStyle: React.CSSProperties = { fontSize: 11, padding: "4px 8px", height: 28 };
  const inputDateStyle: React.CSSProperties = { fontSize: 11, padding: "4px 8px", height: 28, width: 140 };
  const clearBtnStyle: React.CSSProperties = {
    fontSize: 10, padding: "2px 6px", height: 20,
    opacity: 0.7, cursor: "pointer",
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 14 }}>

      {/* ─── Empresa ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={labelStyle}>Empresa:</span>
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
                        padding: "7px 10px", fontSize: 11, cursor: "pointer",
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

      {/* ─── Periodo (Año + Mes) ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Periodo:</span>
        <select
          className="ui-select"
          value={periodoAño}
          onChange={(e) => setPeriodoAño(e.target.value)}
          style={{ ...selectStyle, minWidth: 72 }}
          title="Año del periodo objetado"
        >
          <option value="">Año</option>
          {AÑOS.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        <select
          className="ui-select"
          value={periodoMes}
          onChange={(e) => setPeriodoMes(e.target.value)}
          style={{ ...selectStyle, minWidth: 110 }}
          title="Mes del periodo objetado"
        >
          <option value="">Mes</option>
          {MESES.map((m) => (
            <option key={m.val} value={m.val}>{m.label}</option>
          ))}
        </select>
        {(periodoAño || periodoMes) && (
          <button
            type="button"
            className="ui-btn ui-btn-ghost"
            onClick={limpiarPeriodo}
            style={clearBtnStyle}
            title="Limpiar periodo"
          >
            ✕
          </button>
        )}
      </div>

      {/* ─── Fecha publicación (Desde / Hasta) ──────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Publicación:</span>
        <span style={{ ...labelStyle, fontSize: 10 }}>Desde</span>
        <input
          type="date"
          className="ui-input"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          style={inputDateStyle}
          title="Fecha mínima de publicación en SFTP"
        />
        <span style={{ ...labelStyle, fontSize: 10 }}>Hasta</span>
        <input
          type="date"
          className="ui-input"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          style={inputDateStyle}
          title="Fecha máxima de publicación en SFTP"
        />
        {(fechaDesde || fechaHasta) && (
          <button
            type="button"
            className="ui-btn ui-btn-ghost"
            onClick={limpiarFechas}
            style={clearBtnStyle}
            title="Limpiar rango de fechas"
          >
            ✕
          </button>
        )}
      </div>

      {/* ─── Nombre (contains) ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
        <span style={labelStyle}>Nombre:</span>
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

      {/* ─── Botón Buscar ────────────────────────────────────────────────── */}
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