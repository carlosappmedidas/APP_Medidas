// app/components/admin/AlertasObjecionesSection.tsx
// Sección "ALERTAS · OBJECIONES": listado de alertas generadas por el scheduler
// de fin de recepción de objeciones. Permite descartar, resolver, y abrir la
// descarga filtrada por empresa + periodo.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AlertaRead {
  id: number;
  tenant_id: number;
  empresa_id: number;
  tipo: string;
  periodo: string;              // YYYYMM
  fecha_hito: string | null;
  num_pendientes: number;
  severidad: string;
  estado: string;               // "activa" | "resuelta" | "descartada"
  detalle: unknown[] | null;
  resuelta_at: string | null;
  resuelta_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  empresa_nombre: string | null;
  empresa_codigo_ree: string | null;
}

type EstadoFiltro = "activa" | "resuelta" | "descartada" | "todas";

interface Props {
  token: string | null;
  onNavigateToObjeciones?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const periodoLabel = (yyyymm: string): string => {
  if (!yyyymm || yyyymm.length !== 6) return yyyymm;
  const anio = yyyymm.substring(0, 4);
  const mes  = parseInt(yyyymm.substring(4, 6), 10);
  const nombres = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${nombres[mes] || mes} ${anio}`;
};

const fechaCorta = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
};

const colorEstado: Record<string, string> = {
  activa:     "#EF9F27",
  resuelta:   "#1D9E75",
  descartada: "#94A3B8",
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function AlertasObjecionesSection({ token, onNavigateToObjeciones }: Props) {
  const [alertas, setAlertas] = useState<AlertaRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Filtros
  const [filtroEstado, setFiltroEstado]     = useState<EstadoFiltro>("activa");
  const [filtroEmpresa, setFiltroEmpresa]   = useState<string>("");    // nombre empresa o ""
  const [filtroPeriodo, setFiltroPeriodo]   = useState<string>("");    // YYYYMM o ""

  // Estado transitorio por alerta (descartando/resolviendo)
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  // ── Cargar alertas ───────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEstado !== "todas") params.set("estado", filtroEstado);
      if (filtroPeriodo)            params.set("periodo", filtroPeriodo);
      const url = `${API_BASE_URL}/objeciones/alertas${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setAlertas(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando alertas");
    } finally {
      setLoading(false);
    }
  }, [token, filtroEstado, filtroPeriodo]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Filtrado client-side por empresa ─────────────────────────────────────
  const alertasVisibles = useMemo(() => {
    if (!filtroEmpresa.trim()) return alertas;
    const q = filtroEmpresa.trim().toLowerCase();
    return alertas.filter(a => (a.empresa_nombre ?? "").toLowerCase().includes(q));
  }, [alertas, filtroEmpresa]);

  // ── Opciones dinámicas para filtros (empresas y periodos únicos) ─────────
  const empresasOpciones = useMemo(() => {
    const set = new Set<string>();
    alertas.forEach(a => { if (a.empresa_nombre) set.add(a.empresa_nombre); });
    return Array.from(set).sort();
  }, [alertas]);

  const periodosOpciones = useMemo(() => {
    const set = new Set<string>();
    alertas.forEach(a => { if (a.periodo) set.add(a.periodo); });
    return Array.from(set).sort().reverse();
  }, [alertas]);

  // ── Acciones sobre una alerta ────────────────────────────────────────────
  const accion = async (id: number, verbo: "descartar" | "resolver") => {
    if (!token) return;
    setProcesandoId(id); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/alertas/${id}/${verbo}`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Error al ${verbo}`);
    } finally {
      setProcesandoId(null);
    }
  };

  const handleAbrirDescarga = (a: AlertaRead) => {
    // Convertir periodo YYYYMM → YYYY-MM para el panel Descarga
    const periodoDashed = a.periodo.length === 6
      ? `${a.periodo.substring(0, 4)}-${a.periodo.substring(4, 6)}`
      : a.periodo;

    // Guardar intención en localStorage — el DescargaPanel la leerá al montarse
    try {
      localStorage.setItem("objeciones_autoabrir_descarga", JSON.stringify({
        empresa_id: a.empresa_id,
        periodo:    periodoDashed,
        timestamp:  Date.now(),
      }));
    } catch { /* silencioso */ }

    // Navegar a Medidas > Objeciones (el padre se encarga)
    if (onNavigateToObjeciones) {
      onNavigateToObjeciones();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="text-sm" style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Filtros */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        padding: "8px 10px",
        background: "var(--field-bg-soft)",
        border: "0.5px solid var(--card-border)",
        borderRadius: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Estado
          </label>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value as EstadoFiltro)}
            className="ui-input"
            style={{ fontSize: 11, height: 26, minWidth: 110 }}
          >
            <option value="activa">Activas</option>
            <option value="resuelta">Resueltas</option>
            <option value="descartada">Descartadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Empresa
          </label>
          <select
            value={filtroEmpresa}
            onChange={e => setFiltroEmpresa(e.target.value)}
            className="ui-input"
            style={{ fontSize: 11, height: 26, minWidth: 130 }}
          >
            <option value="">Todas</option>
            {empresasOpciones.map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Periodo
          </label>
          <select
            value={filtroPeriodo}
            onChange={e => setFiltroPeriodo(e.target.value)}
            className="ui-input"
            style={{ fontSize: 11, height: 26, minWidth: 130 }}
          >
            <option value="">Todos</option>
            {periodosOpciones.map(p => (
              <option key={p} value={p}>{periodoLabel(p)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {alertasVisibles.length} de {alertas.length}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={cargar}
            disabled={loading}
          >
            {loading ? "Cargando..." : "🔄 Refrescar"}
          </button>
        </div>
      </div>

      {error && <div className="ui-alert ui-alert--danger">{error}</div>}

      {/* Listado */}
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "16px 8px", textAlign: "center" }}>
          Cargando alertas...
        </div>
      ) : alertasVisibles.length === 0 ? (
        <div style={{
          fontSize: 11, color: "var(--text-muted)",
          padding: "24px 8px", textAlign: "center",
          background: "var(--field-bg-soft)", borderRadius: 8,
          border: "0.5px solid var(--card-border)",
        }}>
          {filtroEstado === "activa" ? "No hay alertas activas." : "No hay alertas que coincidan con los filtros."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alertasVisibles.map(a => {
            const proc = procesandoId === a.id;
            const colorPunto = colorEstado[a.estado] || "#94A3B8";
            return (
              <div key={a.id} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                background: "var(--field-bg-soft)",
                border: "0.5px solid var(--card-border)",
                borderRadius: 8,
              }}>
                {/* Icono izquierda */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: colorPunto,
                }} />

                {/* Info central */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                      {a.empresa_nombre || "Empresa desconocida"}
                    </span>
                    {a.empresa_codigo_ree && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {a.empresa_codigo_ree}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>·</span>
                    <span style={{ fontSize: 12, color: "var(--text)" }}>{periodoLabel(a.periodo)}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: "2px 7px", borderRadius: 10,
                      background: "rgba(226,75,74,0.12)",
                      color: "#A32D2D",
                    }}>
                      {a.num_pendientes} AOBs pendientes
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                    Fin recepción: {fechaCorta(a.fecha_hito)}
                    {a.estado !== "activa" && (
                      <> · <span style={{ color: colorPunto, fontWeight: 500 }}>{a.estado}</span></>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={() => handleAbrirDescarga(a)}
                    disabled={proc}
                    style={{ color: "#378ADD", borderColor: "rgba(55,138,221,0.4)" }}
                  >
                    Abrir en Descarga
                  </button>
                  {a.estado === "activa" && (
                    <>
                      <button
                        type="button"
                        className="ui-btn ui-btn-outline ui-btn-xs"
                        onClick={() => accion(a.id, "resolver")}
                        disabled={proc}
                        style={{ color: "#0F6E56", borderColor: "rgba(15,110,86,0.4)" }}
                      >
                        {proc ? "..." : "Resolver"}
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-outline ui-btn-xs"
                        onClick={() => accion(a.id, "descartar")}
                        disabled={proc}
                        style={{ color: "#94A3B8" }}
                      >
                        Descartar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}