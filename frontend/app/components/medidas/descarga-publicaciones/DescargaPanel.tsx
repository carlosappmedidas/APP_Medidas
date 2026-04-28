// Panel "Descarga de Publicaciones REE" — explorar SFTP e importar BALD.
// Autocontenido: carga las empresas él mismo y se monta como CollapsibleCard.

"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type { BusquedaResult, EjecutarResponse, EmpresaOption } from "./types";
import DescargaFiltros from "./DescargaFiltros";
import DescargaTabla from "./DescargaTabla";
import DescargaConfirmReemplazoModal from "./DescargaConfirmReemplazoModal";
import DescargaResultadoModal from "./DescargaResultadoModal";

interface DescargaPanelProps {
  token: string | null;
  /**
   * Filtros pre-aplicados desde la campanita de alertas.
   * Cuando cambia el `nonce`, el panel se abre, aplica los filtros y dispara Buscar.
   */
  filtrosDescarga?: {
    empresaId: number;
    periodo: string;        // "YYYY-MM"
    fechaDesde?: string;    // "YYYY-MM-DD"
    nonce: number;
  } | null;
}

function keyOf(r: BusquedaResult): string {
  return `${r.empresa_id}|${r.nombre}`;
}

export default function DescargaPanel({ token, filtrosDescarga }: DescargaPanelProps) {

  // CollapsibleCard cerrada por defecto (como pediste).
  const [open, setOpen] = useState(false);

  // Empresas (las cargamos aquí mismo).
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  useEffect(() => {
    if (!token) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) });
        if (!res.ok) return;
        const data: EmpresaOption[] = await res.json();
        setEmpresas(data);
      } catch { /* silencioso */ }
    };
    void fetch_();
  }, [token]);

  // ── Filtros ───────────────────────────────────────────────────────────
  const [empresaIds, setEmpresaIds] = useState<number[]>([]);
  const [periodo,    setPeriodo]    = useState<string>("");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");
  const [nombre,     setNombre]     = useState<string>("");

  // ── Resultados ────────────────────────────────────────────────────────
  const [resultados,    setResultados]    = useState<BusquedaResult[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [buscado,       setBuscado]       = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [error,         setError]         = useState<string | null>(null);

  // ── Ejecución ─────────────────────────────────────────────────────────
  const [ejecutando,       setEjecutando]       = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [resultadoModal,   setResultadoModal]   = useState<EjecutarResponse | null>(null);

  // ── Derivados ─────────────────────────────────────────────────────────
  const itemsSeleccionados = useMemo(
    () => resultados.filter((r) => seleccionados.has(keyOf(r))),
    [resultados, seleccionados],
  );
  const actualizablesSeleccionados = useMemo(
    () => itemsSeleccionados.filter((r) => r.estado === "actualizable"),
    [itemsSeleccionados],
  );
  const hayActualizables = actualizablesSeleccionados.length > 0;

  // ── Buscar ────────────────────────────────────────────────────────────
  const handleBuscar = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSeleccionados(new Set());

    try {
      const params = new URLSearchParams();
      for (const id of empresaIds) params.append("empresa_id", String(id));
      if (periodo)        params.set("periodo", periodo);
      if (fechaDesde)     params.set("fecha_desde", fechaDesde);
      if (fechaHasta)     params.set("fecha_hasta", fechaHasta);
      if (nombre.trim())  params.set("nombre", nombre.trim());

      const res = await fetch(`${API_BASE_URL}/measures/descarga/buscar?${params}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setResultados(data.resultados ?? []);
      setBuscado(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error buscando en SFTP");
      setResultados([]);
      setBuscado(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Ejecutar ──────────────────────────────────────────────────────────
  const ejecutarItems = async (replace: boolean) => {
    if (!token) return;
    setEjecutando(true);
    setError(null);

    try {
      const items = itemsSeleccionados.map((r) => ({
        empresa_id: r.empresa_id,
        config_id:  r.config_id,
        ruta_sftp:  r.ruta_sftp,
        nombre:     r.nombre,
        estado:     r.estado,
      }));

      const res = await fetch(`${API_BASE_URL}/measures/descarga/ejecutar`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ items, replace }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const data: EjecutarResponse = await res.json();
      setResultadoModal(data);
      setSeleccionados(new Set());
      // Refrescar la búsqueda para que los nuevos estados se vean (importados).
      void handleBuscar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error ejecutando descarga");
    } finally {
      setEjecutando(false);
      setConfirmModalOpen(false);
    }
  };

  const handleEjecutarClick = () => {
    if (itemsSeleccionados.length === 0) return;
    if (hayActualizables) {
      setConfirmModalOpen(true);
    } else {
      void ejecutarItems(false);
    }
  };

  const handleConfirmReemplazo = () => {
    void ejecutarItems(true);
  };

  // ── Aplicar filtros venidos desde la campanita de alertas ──────────────
  // Cuando `filtrosDescarga.nonce` cambia, abrimos el panel, aplicamos los
  // filtros y disparamos Buscar automáticamente.
  useEffect(() => {
    if (!filtrosDescarga || !token) return;
    setOpen(true);
    setEmpresaIds([filtrosDescarga.empresaId]);
    setPeriodo(filtrosDescarga.periodo);
    setFechaDesde(filtrosDescarga.fechaDesde ?? "");
    setFechaHasta("");
    setNombre("");
    // Disparar la búsqueda en el siguiente tick para que React aplique los
    // setState antes de que `handleBuscar` lea sus valores.
    const t = setTimeout(() => { void handleBuscar(); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosDescarga?.nonce]);

  // ── Estilos ───────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 12,
  };
  const panelHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 20px", cursor: "pointer", userSelect: "none",
  };
  const panelTitleStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--text)",
  };
  const panelDescStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--text-muted)", marginTop: 3,
  };

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle} onClick={() => setOpen((v) => !v)}>
        <div>
          <div style={panelTitleStyle}>Descarga de publicaciones REE</div>
          <div style={panelDescStyle}>
            Explora el SFTP y descarga ficheros BALD publicados por REE para importarlos a BD.
          </div>
        </div>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {open && (
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--card-border)" }}>
          {error && <div className="ui-alert ui-alert--danger" style={{ marginBottom: 12 }}>{error}</div>}

          <DescargaFiltros
            empresas={empresas}
            empresaIds={empresaIds} setEmpresaIds={setEmpresaIds}
            periodo={periodo} setPeriodo={setPeriodo}
            fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
            fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
            nombre={nombre} setNombre={setNombre}
            loading={loading}
            onBuscar={handleBuscar}
          />

          {/* Aviso del filtro automático cuando no hay filtros explícitos */}
          {!periodo && !fechaDesde && !fechaHasta && !nombre.trim() && (
            <div style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontStyle: "italic",
              marginBottom: 10,
              marginTop: -4,
              padding: "6px 10px",
              background: "var(--field-bg-soft)",
              borderRadius: 6,
              border: "0.5px solid var(--card-border)",
            }}>
              ℹ️ Por defecto se muestran ficheros publicados desde el primer hito REE del mes anterior. Usa los filtros de fecha o periodo para buscar otras fechas.
            </div>
          )}

          {/* Barra de acción Ejecutar — ENTRE filtros y tabla, igual que en Objeciones */}
          {buscado && resultados.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12, padding: "6px 10px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {itemsSeleccionados.length === 0 ? (
                  <>Selecciona ficheros ⚪ <em>nuevos</em> o 🟠 <em>actualizables</em> para importar.</>
                ) : (
                  <>
                    <strong style={{ color: "var(--text)" }}>{itemsSeleccionados.length}</strong> seleccionado{itemsSeleccionados.length !== 1 ? "s" : ""}
                    {hayActualizables && (
                      <span style={{ marginLeft: 8, color: "#fdba74" }}>
                        · {actualizablesSeleccionados.length} reemplazo{actualizablesSeleccionados.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-xs"
                onClick={handleEjecutarClick}
                disabled={ejecutando || itemsSeleccionados.length === 0}
              >
                {ejecutando ? "Ejecutando..." : `Ejecutar (${itemsSeleccionados.length})`}
              </button>
            </div>
          )}

          <DescargaTabla
            resultados={resultados}
            loading={loading}
            seleccionados={seleccionados}
            setSeleccionados={setSeleccionados}
            buscado={buscado}
          />
        </div>
      )}

      <DescargaConfirmReemplazoModal
        open={confirmModalOpen}
        actualizables={actualizablesSeleccionados}
        onCancel={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmReemplazo}
      />

      <DescargaResultadoModal
        open={resultadoModal !== null}
        resultado={resultadoModal}
        onClose={() => setResultadoModal(null)}
      />
    </div>
  );
}