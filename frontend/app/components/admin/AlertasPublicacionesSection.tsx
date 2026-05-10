// app/components/admin/AlertasPublicacionesSection.tsx
// Sección "ALERTAS · PUBLICACIONES REE": listado de alertas generadas por el
// scheduler de búsqueda de publicaciones REE en SFTP. Mismo patrón visual y
// funcional que AlertasObjecionesSection: filtros + listado + botones
// (Abrir en Descarga / Resolver / Descartar).
//
// Comparte endpoint con la campanita 🔔 de Resumen Tablas, así que resolver
// o descartar desde aquí se refleja allí al refrescar y viceversa.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import UiChip from "../ui/UiChip";
import UiCard from "../ui/UiCard";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AlertaRead {
  id:             number;
  tenant_id:      number;
  empresa_id:     number;
  empresa_nombre: string | null;
  tipo:           string;          // publicacion_m2 | _m7 | _m11 | _art15
  periodo:        string;          // YYYYMM
  fecha_hito:     string | null;
  num_pendientes: number;
  severidad:      string;
  estado:         string;          // "activa" | "resuelta" | "descartada"
  created_at:     string | null;
}

type AlertasResponse = {
  total:   number;
  activas: number;
  items:   AlertaRead[];
};

type EstadoFiltro = "activa" | "resuelta" | "descartada" | "todas";

interface Props {
  token: string | null;
  onNavigateToTablasResumen?: () => void;
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

// Chips por tipo — mismas variantes que la campanita de Publicaciones.
const TIPO_META: Record<string, { label: string; variant: "info" | "success" | "warning" | "accent" }> = {
  publicacion_m2:    { label: "M2",    variant: "info" },
  publicacion_m7:    { label: "M7",    variant: "success" },
  publicacion_m11:   { label: "M11",   variant: "warning" },
  publicacion_art15: { label: "ART15", variant: "accent" },
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function AlertasPublicacionesSection({ token, onNavigateToTablasResumen }: Props) {
  const [alertas, setAlertas] = useState<AlertaRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Filtros
  const [filtroEstado, setFiltroEstado]   = useState<EstadoFiltro>("activa");
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("");
  const [filtroTipo, setFiltroTipo]       = useState<string>("");

  // Estado transitorio por alerta
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  // ── Cargar alertas ───────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEstado !== "todas") params.set("estado", filtroEstado);
      const url = `${API_BASE_URL}/measures/descarga/automatizacion/alertas${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: AlertasResponse = await res.json();
      setAlertas(Array.isArray(data.items) ? data.items : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando alertas");
    } finally {
      setLoading(false);
    }
  }, [token, filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Filtrado client-side ─────────────────────────────────────────────────
  const alertasVisibles = useMemo(() => {
    return alertas.filter(a => {
      if (filtroEmpresa && (a.empresa_nombre ?? "") !== filtroEmpresa) return false;
      if (filtroPeriodo && a.periodo !== filtroPeriodo) return false;
      if (filtroTipo    && a.tipo    !== filtroTipo)    return false;
      return true;
    });
  }, [alertas, filtroEmpresa, filtroPeriodo, filtroTipo]);

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

  const tiposOpciones = useMemo(() => {
    const set = new Set<string>();
    alertas.forEach(a => { if (a.tipo) set.add(a.tipo); });
    return Array.from(set).sort();
  }, [alertas]);

  // ── Acciones sobre una alerta ────────────────────────────────────────────
  const accion = async (id: number, verbo: "descartar" | "resolver") => {
    if (!token) return;
    setProcesandoId(id); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/measures/descarga/automatizacion/alertas/${id}/${verbo}`, {
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
    // Convertir periodo YYYYMM → YYYY-MM
    const periodoDashed = a.periodo.length === 6
      ? `${a.periodo.substring(0, 4)}-${a.periodo.substring(4, 6)}`
      : a.periodo;

    // Criterio campana: fecha_desde = fecha_hito (sin sumar día) — coherente
    // con CampanaAlertasPublicaciones.
    const fechaDesde = a.fecha_hito ? a.fecha_hito.slice(0, 10) : undefined;

    // Guardar intención en localStorage. Clave distinta a la de objeciones
    // para que TablasDashboardPanel sepa que es para publicaciones.
    try {
      localStorage.setItem("publicaciones_autoabrir_descarga", JSON.stringify({
        empresa_id:  a.empresa_id,
        periodo:     periodoDashed,
        fecha_desde: fechaDesde,
        timestamp:   Date.now(),
      }));
    } catch { /* silencioso */ }

    if (onNavigateToTablasResumen) {
      onNavigateToTablasResumen();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="text-sm" style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Filtros */}
      <UiCard
        variant="nested"
        padding="none"
        style={{
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          padding: "8px 10px",
          borderRadius: 8,
        }}
      >
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
            style={{ fontSize: 11, height: 30, minWidth: 110 }}
          >
            <option value="">Todos</option>
            {tiposOpciones.map(t => (
              <option key={t} value={t}>{TIPO_META[t]?.label ?? t}</option>
            ))}
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
            style={{ fontSize: 11, height: 30, minWidth: 130 }}
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
            style={{ fontSize: 11, height: 30, minWidth: 130 }}
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
      </UiCard>

      {error && <div className="ui-alert ui-alert--danger">{error}</div>}

      {/* Listado */}
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "16px 8px", textAlign: "center" }}>
          Cargando alertas...
        </div>
      ) : alertasVisibles.length === 0 ? (
        <UiCard
          variant="nested"
          padding="none"
          style={{
            fontSize: 11, color: "var(--text-muted)",
            padding: "24px 8px", textAlign: "center",
            borderRadius: 8,
          }}
        >
          {filtroEstado === "activa" ? "No hay alertas activas." : "No hay alertas que coincidan con los filtros."}
        </UiCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alertasVisibles.map(a => {
            const proc = procesandoId === a.id;
            const colorPunto = colorEstado[a.estado] || "#94A3B8";
            const meta = TIPO_META[a.tipo] ?? { label: a.tipo, variant: "muted" as const };
            return (
              <UiCard
                key={a.id}
                variant="nested"
                padding="none"
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: 8,
                }}
              >
                {/* Punto de estado */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: colorPunto,
                }} />

                {/* Info central */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <UiChip variant={meta.variant} size="sm">
                      {meta.label}
                    </UiChip>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                      {a.empresa_nombre || "Empresa desconocida"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>·</span>
                    <span style={{ fontSize: 12, color: "var(--text)" }}>{periodoLabel(a.periodo)}</span>
                    <UiChip variant="danger" size="sm">
                      {a.num_pendientes} fichero{a.num_pendientes !== 1 ? "s" : ""} disponible{a.num_pendientes !== 1 ? "s" : ""}
                    </UiChip>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                    Fecha hito: {fechaCorta(a.fecha_hito)}
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
              </UiCard>
            );
          })}
        </div>
      )}
    </div>
  );
}