// Panel "Descarga en Objeciones" — explorar SFTP e importar ficheros AOB.
// FASE 5 · Sub-paso 5.2 — filtros + tabla funcional (sin ejecución todavía).
// En 5.3 llegan los modales y la conexión a POST /ejecutar.

"use client";

import { useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { BusquedaResult, EmpresaOption } from "./shared/types";
import DescargaFiltros from "./DescargaFiltros";
import DescargaTabla from "./DescargaTabla";

// ─── Estilos panel (idénticos al resto de paneles de Objeciones) ──────────────

const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: "10px",
  overflow: "hidden",
  marginBottom: "10px",
};
const panelHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 20px", cursor: "pointer", userSelect: "none",
};
const panelTitleStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text)",
};
const panelDescStyle: React.CSSProperties = {
  fontSize: "11px", color: "var(--text-muted)", marginTop: 3,
};

interface DescargaPanelProps {
  token:         string | null;
  empresas:      EmpresaOption[];
  onDashRefresh: () => void;
  onError:       (msg: string | null) => void;
}

export default function DescargaPanel({
  token, empresas, onDashRefresh, onError,
}: DescargaPanelProps) {

  const [open, setOpen] = useState(false);

  // ── Filtros ─────────────────────────────────────────────────────────────
  const [empresaIds, setEmpresaIds] = useState<number[]>([]);   // [] = todas
  const [periodo,    setPeriodo]    = useState<string>("");     // "" = últimos 6 meses
  const [nombre,     setNombre]     = useState<string>("");

  // ── Resultados ──────────────────────────────────────────────────────────
  const [resultados,    setResultados]    = useState<BusquedaResult[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [buscado,       setBuscado]       = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // ── Buscar ──────────────────────────────────────────────────────────────
  const handleBuscar = async () => {
    if (!token) return;
    setLoading(true);
    onError(null);
    // Reset de selección cuando se vuelve a buscar: evita seleccionar filas
    // que ya no están en los nuevos resultados.
    setSeleccionados(new Set());

    try {
      const params = new URLSearchParams();
      // Multi-valor: un `empresa_id` por cada ID seleccionado
      for (const id of empresaIds) {
        params.append("empresa_id", String(id));
      }
      if (periodo)       params.set("periodo", periodo);
      if (nombre.trim()) params.set("nombre", nombre.trim());

      const res = await fetch(
        `${API_BASE_URL}/objeciones/descarga/buscar?${params.toString()}`,
        { headers: getAuthHeaders(token) },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }

      const data = await res.json() as { total: number; resultados: BusquedaResult[] };
      setResultados(data.resultados || []);
      setBuscado(true);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error buscando en el SFTP");
      setResultados([]);
      setBuscado(true);
    } finally {
      setLoading(false);
    }
  };

  // Silencia warning de prop no usada en este sub-paso (se usa en 5.3).
  void onDashRefresh;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle} onClick={() => setOpen((v) => !v)}>
        <div>
          <div style={panelTitleStyle}>Descarga en Objeciones</div>
          <div style={panelDescStyle}>Buscar ficheros AOB en el SFTP e importar a BD</div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-outline ui-btn-xs"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--card-border)", padding: "14px 20px" }}>
          <DescargaFiltros
            empresas={empresas}
            empresaIds={empresaIds}
            setEmpresaIds={setEmpresaIds}
            periodo={periodo}
            setPeriodo={setPeriodo}
            nombre={nombre}
            setNombre={setNombre}
            loading={loading}
            onBuscar={handleBuscar}
          />

          {/* Barra de estado + futuro botón Ejecutar (llega en 5.3) */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 10px", background: "var(--field-bg-soft)",
            border: "1px solid var(--card-border)", borderBottom: "none",
            fontSize: 11, color: "var(--text-muted)",
          }}>
            <span>
              {loading
                ? "Buscando..."
                : buscado
                  ? `${resultados.length} resultado${resultados.length !== 1 ? "s" : ""} · ${seleccionados.size} seleccionado${seleccionados.size !== 1 ? "s" : ""}`
                  : "Sin buscar"}
            </span>
            <span style={{ fontSize: 10 }}>
              (Botón Ejecutar + modales — sub-paso 5.3)
            </span>
          </div>

          <DescargaTabla
            resultados={resultados}
            loading={loading}
            seleccionados={seleccionados}
            setSeleccionados={setSeleccionados}
            buscado={buscado}
          />
        </div>
      )}
    </div>
  );
}