// Panel "Descarga en Objeciones" — explorar SFTP e importar ficheros AOB.
// FASE 5 · Sub-paso 5.3 — botón Ejecutar + modales + refresh Dashboard.

"use client";

import { useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { BusquedaResult, EjecutarResponse, EmpresaOption } from "./shared/types";
import DescargaFiltros from "./DescargaFiltros";
import DescargaTabla from "./DescargaTabla";
import DescargaConfirmReemplazoModal from "./DescargaConfirmReemplazoModal";
import DescargaResultadoModal from "./DescargaResultadoModal";

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

function keyOf(r: BusquedaResult): string {
  return `${r.empresa_id}|${r.nombre}`;
}

export default function DescargaPanel({
  token, empresas, onDashRefresh, onError,
}: DescargaPanelProps) {

  const [open, setOpen] = useState(false);

  // ── Filtros ─────────────────────────────────────────────────────────────
  const [empresaIds, setEmpresaIds] = useState<number[]>([]);
  const [periodo,    setPeriodo]    = useState<string>("");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");
  const [nombre,     setNombre]     = useState<string>("");

  // ── Resultados ──────────────────────────────────────────────────────────
  const [resultados,    setResultados]    = useState<BusquedaResult[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [buscado,       setBuscado]       = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // ── Ejecución ───────────────────────────────────────────────────────────
  const [ejecutando,       setEjecutando]       = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [resultadoModal,   setResultadoModal]   = useState<EjecutarResponse | null>(null);

  // ── Derivados ───────────────────────────────────────────────────────────

  // Lista de items seleccionados en el orden de la tabla.
  const itemsSeleccionados = useMemo(
    () => resultados.filter((r) => seleccionados.has(keyOf(r))),
    [resultados, seleccionados],
  );

  // Cuántos de los seleccionados son "actualizables" (requieren confirmación).
  const actualizablesSeleccionados = useMemo(
    () => itemsSeleccionados.filter((r) => r.estado === "actualizable"),
    [itemsSeleccionados],
  );

  const hayActualizables = actualizablesSeleccionados.length > 0;

  // ── Buscar ──────────────────────────────────────────────────────────────
  const handleBuscar = async () => {
    if (!token) return;
    setLoading(true);
    onError(null);
    setSeleccionados(new Set());

    try {
      const params = new URLSearchParams();
      for (const id of empresaIds) params.append("empresa_id", String(id));
      if (periodo)           params.set("periodo", periodo);
      if (fechaDesde)        params.set("fecha_desde", fechaDesde);
      if (fechaHasta)        params.set("fecha_hasta", fechaHasta);
      if (nombre.trim())     params.set("nombre", nombre.trim());

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

  // ── Ejecutar (núcleo) ──────────────────────────────────────────────────
  const ejecutarDescarga = async (replace: boolean) => {
    if (!token || itemsSeleccionados.length === 0) return;

    setEjecutando(true);
    onError(null);

    try {
      const body = {
        items: itemsSeleccionados.map((r) => ({
          empresa_id: r.empresa_id,
          config_id:  r.config_id,
          ruta_sftp:  r.ruta_sftp,
          nombre:     r.nombre,
          estado:     r.estado,
        })),
        replace,
      };

      const res = await fetch(`${API_BASE_URL}/objeciones/descarga/ejecutar`, {
        method:  "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }

      const data = await res.json() as EjecutarResponse;
      setResultadoModal(data);
      // Refrescar el dashboard (el resto del refresh es al cerrar el modal).
      onDashRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error ejecutando la descarga");
    } finally {
      setEjecutando(false);
    }
  };

  // ── Flujo del botón Ejecutar ───────────────────────────────────────────
  const handleClickEjecutar = () => {
    if (itemsSeleccionados.length === 0) return;
    if (hayActualizables) {
      // Abre el modal de confirmación — si acepta, llamaremos a ejecutarDescarga(true).
      setConfirmModalOpen(true);
    } else {
      // Todos son "nuevo" → ejecuta sin confirmación.
      void ejecutarDescarga(false);
    }
  };

  const handleConfirmReemplazo = () => {
    setConfirmModalOpen(false);
    void ejecutarDescarga(true);
  };

  const handleCloseResultado = async () => {
    setResultadoModal(null);
    // Tras cerrar, rehacer la búsqueda para refrescar los estados (⚪→🟢).
    if (buscado) {
      await handleBuscar();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
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
              fechaDesde={fechaDesde}
              setFechaDesde={setFechaDesde}
              fechaHasta={fechaHasta}
              setFechaHasta={setFechaHasta}
              nombre={nombre}
              setNombre={setNombre}
              loading={loading}
              onBuscar={handleBuscar}
            />

            {/* Barra de estado + botón Ejecutar */}
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
                    ? `${resultados.length} resultado${resultados.length !== 1 ? "s" : ""} · ${seleccionados.size} seleccionado${seleccionados.size !== 1 ? "s" : ""}${hayActualizables ? ` (${actualizablesSeleccionados.length} actualizable${actualizablesSeleccionados.length !== 1 ? "s" : ""})` : ""}`
                    : "Sin buscar"}
              </span>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-xs"
                onClick={handleClickEjecutar}
                disabled={ejecutando || itemsSeleccionados.length === 0}
              >
                {ejecutando ? "Ejecutando..." : `Ejecutar ${itemsSeleccionados.length > 0 ? `(${itemsSeleccionados.length})` : ""}`}
              </button>
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

      {/* ── Modales ──────────────────────────────────────────────────── */}
      <DescargaConfirmReemplazoModal
        open={confirmModalOpen}
        actualizables={actualizablesSeleccionados}
        onCancel={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmReemplazo}
      />
      <DescargaResultadoModal
        open={resultadoModal !== null}
        resultado={resultadoModal}
        onClose={handleCloseResultado}
      />
    </>
  );
}