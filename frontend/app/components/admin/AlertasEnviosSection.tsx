// app/components/admin/AlertasEnviosSection.tsx
// Sección "ALERTAS · ENVÍOS REE": listado de alertas generadas por el scheduler
// de revisión de envíos M1/M2/M7. Permite resolver, descartar, y filtrar por
// estado, tipo, M, empresa.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AlertaRead {
  id: number;
  tenant_id: number;
  empresa_id: number;
  empresa_nombre: string | null;
  empresa_codigo_ree: string | null;
  tipo: string;
  m_clas: string;
  periodo: string;
  plazo_fecha: string | null;
  num_pendientes: number;
  detalle: Record<string, unknown> | unknown[] | null;
  severidad: string;
  estado: string;
  resuelta_at: string | null;
  resuelta_by: number | null;
  created_at: string;
  updated_at: string;
}

type EstadoFiltro = "activa" | "resuelta" | "descartada" | "todas";

interface Props {
  token: string | null;
  onNavigateToEnvios?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const periodoLabel = (yyyymm: string): string => {
  if (!yyyymm) return "—";
  const limpio = yyyymm.replace("-", "");
  if (limpio.length !== 6) return yyyymm;
  const anio = limpio.substring(0, 4);
  const mes  = parseInt(limpio.substring(4, 6), 10);
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

const TIPOS_LABEL: Record<string, string> = {
  plazo_proximo:           "Plazo próximo",
  plazo_vencido_bad:       "Plazo vencido + .bad",
  plazo_vencido_pendiente: "Plazo vencido sin envío",
  respuesta_ree:           "Respuesta REE",
};

const colorTipo: Record<string, { bg: string; fg: string }> = {
  plazo_proximo:           { bg: "rgba(239,159,39,0.12)",  fg: "#B7791F" },
  plazo_vencido_bad:       { bg: "rgba(226,75,74,0.12)",   fg: "#A32D2D" },
  plazo_vencido_pendiente: { bg: "rgba(226,75,74,0.12)",   fg: "#A32D2D" },
  respuesta_ree:           { bg: "rgba(55,138,221,0.12)",  fg: "#1D5DA5" },
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function AlertasEnviosSection({ token, onNavigateToEnvios }: Props) {
  const [alertas, setAlertas] = useState<AlertaRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  // Filtros
  const [filtroEstado, setFiltroEstado]   = useState<EstadoFiltro>("activa");
  const [filtroTipo, setFiltroTipo]       = useState<string>("");
  const [filtroM, setFiltroM]             = useState<string>("");
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");

  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  const toggleExpandido = (id: number) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Cargar alertas ───────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEstado !== "todas") params.set("estado", filtroEstado);
      if (filtroTipo)               params.set("tipo", filtroTipo);
      if (filtroM)                  params.set("m_clas", filtroM);
      const url = `${API_BASE_URL}/envios/alertas${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setAlertas(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando alertas");
    } finally {
      setLoading(false);
    }
  }, [token, filtroEstado, filtroTipo, filtroM]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Filtrado client-side por empresa ─────────────────────────────────────
  const alertasVisibles = useMemo(() => {
    if (!filtroEmpresa.trim()) return alertas;
    const q = filtroEmpresa.trim().toLowerCase();
    return alertas.filter(a => (a.empresa_nombre ?? "").toLowerCase().includes(q));
  }, [alertas, filtroEmpresa]);

  // ── Opciones dinámicas para filtro empresa ───────────────────────────────
  const empresasOpciones = useMemo(() => {
    const set = new Set<string>();
    alertas.forEach(a => { if (a.empresa_nombre) set.add(a.empresa_nombre); });
    return Array.from(set).sort();
  }, [alertas]);

  // ── Acciones sobre una alerta ────────────────────────────────────────────
  const accion = async (id: number, verbo: "descartar" | "resolver") => {
    if (!token) return;
    setProcesandoId(id); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios/alertas/${id}/${verbo}`, {
        method: "PATCH",
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

  // ── Recalcular alertas (botón global) ────────────────────────────────────
  const handleRecalcular = async () => {
    if (!token) return;
    setRecalculando(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios/alertas/recalcular`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al recalcular");
    } finally {
      setRecalculando(false);
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
            style={{ fontSize: 11, height: 30, minWidth: 110 }}
          >
            <option value="activa">Activas</option>
            <option value="resuelta">Resueltas</option>
            <option value="descartada">Descartadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Tipo
          </label>
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="ui-input"
            style={{ fontSize: 11, height: 32, minWidth: 180 }}
          >
            <option value="">Todos</option>
            <option value="plazo_proximo">Plazo próximo</option>
            <option value="plazo_vencido_bad">Plazo vencido + .bad</option>
            <option value="plazo_vencido_pendiente">Plazo vencido sin envío</option>
            <option value="respuesta_ree">Respuesta REE</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Ventana M
          </label>
          <select
            value={filtroM}
            onChange={e => setFiltroM(e.target.value)}
            className="ui-input"
            style={{ fontSize: 11, height: 32, minWidth: 90 }}
          >
            <option value="">Todas</option>
            <option value="M1">M1</option>
            <option value="M2">M2</option>
            <option value="M7">M7</option>
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
            style={{ fontSize: 11, height: 32, minWidth: 130 }}
          >
            <option value="">Todas</option>
            {empresasOpciones.map(e => (
              <option key={e} value={e}>{e}</option>
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
            onClick={handleRecalcular}
            disabled={recalculando}
            title="Recalcular alertas ahora sin esperar al cron"
          >
            {recalculando ? "Recalculando..." : "🔁 Recalcular"}
          </button>
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
            const tipoColors = colorTipo[a.tipo] || { bg: "rgba(148,163,184,0.12)", fg: "#64748B" };
            const tipoLabel  = TIPOS_LABEL[a.tipo] || a.tipo;

            // Detalle adicional según el tipo (parsea detalle si es objeto)
            let detalleExtra = "";
            if (a.detalle && typeof a.detalle === "object" && !Array.isArray(a.detalle)) {
              const d = a.detalle as Record<string, unknown>;
              if (typeof d.dias_restantes === "number") {
                detalleExtra = ` · faltan ${d.dias_restantes} días`;
              } else if (typeof d.num_bads === "number" && d.num_bads > 0) {
                detalleExtra = ` · ${d.num_bads} ficheros .bad`;
              }
              if (typeof d.periodo_dato === "string") {
                detalleExtra += ` · periodo dato ${d.periodo_dato}`;
              }
            }

            const tieneFicheros = a.tipo === "respuesta_ree" && Array.isArray(a.detalle) && a.detalle.length > 0;

            return (
              <div key={a.id} style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 14px",
                background: "var(--field-bg-soft)",
                border: "0.5px solid var(--card-border)",
                borderRadius: 8,
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}>
                  {/* Punto coloreado izquierda */}
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
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        padding: "2px 6px", borderRadius: 4,
                        background: "rgba(55,138,221,0.12)",
                        color: "#1D5DA5",
                      }}>
                        {a.m_clas}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text)" }}>{periodoLabel(a.periodo)}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        padding: "2px 7px", borderRadius: 10,
                        background: tipoColors.bg,
                        color: tipoColors.fg,
                      }}>
                        {tipoLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                      {a.plazo_fecha && <>Plazo: {fechaCorta(a.plazo_fecha)}</>}
                      {detalleExtra}
                      {a.estado !== "activa" && (
                        <> · <span style={{ color: colorPunto, fontWeight: 500 }}>{a.estado}</span></>
                      )}
                    </div>
                    {tieneFicheros && (
                      <button
                        type="button"
                        onClick={() => toggleExpandido(a.id)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          padding: "4px 0", marginTop: 2,
                          fontSize: 10, color: "#1D5DA5",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <span style={{
                          display: "inline-block",
                          transform: expandidos.has(a.id) ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 0.15s",
                        }}>▶</span>
                        Ver ficheros ({(a.detalle as unknown[]).length})
                      </button>
                    )}
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {onNavigateToEnvios && (
                      <button
                        type="button"
                        className="ui-btn ui-btn-outline ui-btn-xs"
                        onClick={onNavigateToEnvios}
                        disabled={proc}
                        style={{ color: "#378ADD", borderColor: "rgba(55,138,221,0.4)" }}
                      >
                        Ir a envíos
                      </button>
                    )}
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

                {/* Desplegable de ficheros .bad */}
                {tieneFicheros && expandidos.has(a.id) && (
                  <div style={{
                    padding: "8px 10px",
                    background: "rgba(55,138,221,0.05)",
                    border: "0.5px solid rgba(55,138,221,0.18)",
                    borderRadius: 6,
                    maxHeight: 220, overflowY: "auto",
                    fontSize: 10, fontFamily: "monospace",
                  }}>
                    {(a.detalle as Array<Record<string, unknown>>).map((it, idx) => {
                      const fichero = typeof it.fichero === "string" ? it.fichero : "?";
                      const detectadoAt = typeof it.detectado_at === "string" ? it.detectado_at : null;
                      const badN = typeof it.bad_n === "number" ? it.bad_n : null;
                      return (
                        <div key={idx} style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "3px 0",
                          borderBottom: idx < (a.detalle as unknown[]).length - 1 ? "0.5px dashed rgba(55,138,221,0.12)" : "none",
                          gap: 8,
                        }}>
                          <span style={{ color: "var(--text)", wordBreak: "break-all" }}>
                            {fichero}
                            {badN !== null && (
                              <span style={{ color: "#A32D2D", marginLeft: 6, fontWeight: 600 }}>
                                .bad{badN}
                              </span>
                            )}
                          </span>
                          {detectadoAt && (
                            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                              {fechaCorta(detectadoAt)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}