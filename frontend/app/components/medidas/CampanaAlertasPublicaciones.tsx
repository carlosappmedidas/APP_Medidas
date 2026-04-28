// app/components/medidas/CampanaAlertasPublicaciones.tsx
// Campanita de alertas de Publicaciones REE.
// Solo se renderiza si hay alertas activas (total > 0).
// Al pulsar una alerta, navega al panel Descarga con filtros pre-aplicados.

"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type AlertaItem = {
  id:              number;
  empresa_id:      number;
  empresa_nombre:  string | null;
  tipo:            string;       // publicacion_m2|m7|m11|art15
  periodo:         string;       // YYYYMM
  fecha_hito:      string | null;
  num_pendientes:  number;
  severidad:       string;
  estado:          string;
  created_at:      string;
};

type AlertasResponse = {
  total:    number;
  activas:  number;
  items:    AlertaItem[];
};

interface Props {
  token: string | null;
  onIrADescarga: (params: {
    empresaId: number;
    periodo:   string;       // YYYY-MM (formato del filtro)
    fechaDesde?: string;     // YYYY-MM-DD (fecha del hito)
  }) => void;
}

// ── Metadatos por tipo de alerta ──────────────────────────────────────────────

const TIPO_META: Record<string, { label: string; chipBg: string; chipColor: string }> = {
  publicacion_m2:    { label: "M2",    chipBg: "rgba(55,138,221,0.18)", chipColor: "#85B7EB" },
  publicacion_m7:    { label: "M7",    chipBg: "rgba(15,110,86,0.22)",  chipColor: "#5DCAA5" },
  publicacion_m11:   { label: "M11",   chipBg: "rgba(186,117,23,0.18)", chipColor: "#FAC775" },
  publicacion_art15: { label: "ART15", chipBg: "rgba(83,74,183,0.22)",  chipColor: "#AFA9EC" },
};

const MESES_CORTOS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// "202506" → "Jun 25"
function fmtPeriodo(yyyymm: string): string {
  if (!yyyymm || yyyymm.length !== 6) return yyyymm;
  const anio = yyyymm.slice(0, 4);
  const mes  = parseInt(yyyymm.slice(4, 6), 10);
  if (mes < 1 || mes > 12) return yyyymm;
  return `${MESES_CORTOS[mes]} ${anio.slice(2)}`;
}

// "202506" → "2025-06"
function periodoToFiltro(yyyymm: string): string {
  if (!yyyymm || yyyymm.length !== 6) return "";
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

// ISO datetime → "30 abr 2026"
function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit", month: "short", year: "numeric",
    }).format(d).replace(".", "");
  } catch {
    return iso.slice(0, 10);
  }
}

// ISO datetime → "YYYY-MM-DD" (para enviar como fecha_desde al filtro)
function fechaIsoADate(iso: string | null): string | undefined {
  if (!iso) return undefined;
  return iso.slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════════════

export default function CampanaAlertasPublicaciones({ token, onIrADescarga }: Props) {
  const [data, setData]       = useState<AlertasResponse | null>(null);
  const [open, setOpen]       = useState(false);
  const dropdownRef           = useRef<HTMLDivElement | null>(null);
  const [actionId, setAction] = useState<number | null>(null);

  // Cargar alertas activas
  const cargar = async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE_URL}/measures/descarga/automatizacion/alertas?estado=activa`, {
        headers: getAuthHeaders(token),
      });
      if (!r.ok) return;
      const d: AlertasResponse = await r.json();
      setData(d);
    } catch { /* silencioso */ }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleResolver = async (e: React.MouseEvent, alertId: number) => {
    e.stopPropagation();
    if (!token) return;
    setAction(alertId);
    try {
      await fetch(`${API_BASE_URL}/measures/descarga/automatizacion/alertas/${alertId}/resolver`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      await cargar();
    } finally {
      setAction(null);
    }
  };

  const handleDescartar = async (e: React.MouseEvent, alertId: number) => {
    e.stopPropagation();
    if (!token) return;
    setAction(alertId);
    try {
      await fetch(`${API_BASE_URL}/measures/descarga/automatizacion/alertas/${alertId}/descartar`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      await cargar();
    } finally {
      setAction(null);
    }
  };

  const handleIrADescarga = (a: AlertaItem) => {
    setOpen(false);
    onIrADescarga({
      empresaId:  a.empresa_id,
      periodo:    periodoToFiltro(a.periodo),
      fechaDesde: fechaIsoADate(a.fecha_hito),
    });
  };

  // ⚠️ Si NO hay alertas activas, no renderizar nada
  const totalActivas = data?.activas ?? 0;
  if (!data || totalActivas === 0) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="ui-btn ui-btn-ghost ui-btn-xs"
        style={{
          width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, position: "relative",
        }}
        title={`${totalActivas} alerta(s) de publicaciones REE`}
        aria-label="Alertas de publicaciones"
      >
        <span style={{ fontSize: 14 }}>🔔</span>
        <span style={{
          position: "absolute", top: -3, right: -3,
          background: "#BA7517", color: "#fff",
          fontSize: 9, fontWeight: 600,
          minWidth: 16, height: 16, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px",
        }}>
          {totalActivas}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 36, right: 0,
          background: "var(--card-bg)", border: "1px solid var(--card-border)",
          borderRadius: 8, padding: 0,
          minWidth: 360, maxWidth: 420, maxHeight: 420, overflowY: "auto",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 30,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", borderBottom: "1px solid var(--card-border)",
            fontSize: 11, fontWeight: 600, color: "var(--text)",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <span>Alertas Publicaciones REE ({totalActivas})</span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Items */}
          <div>
            {data.items.map(a => {
              const meta = TIPO_META[a.tipo] ?? { label: a.tipo, chipBg: "rgba(255,255,255,0.06)", chipColor: "var(--text-muted)" };
              const procesando = actionId === a.id;
              return (
                <div key={a.id} style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--card-border)",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                  onClick={() => handleIrADescarga(a)}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(55,138,221,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      background: meta.chipBg, color: meta.chipColor,
                      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                    }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                      publicado por REE
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text)" }}>
                    <strong>{a.empresa_nombre ?? `Empresa ${a.empresa_id}`}</strong>
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}· {fmtPeriodo(a.periodo)}{a.fecha_hito ? ` · ${fmtFechaCorta(a.fecha_hito)}` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {a.num_pendientes} fichero{a.num_pendientes !== 1 ? "s" : ""} disponible{a.num_pendientes !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleIrADescarga(a); }}
                      className="ui-btn ui-btn-outline ui-btn-xs"
                      style={{ fontSize: 10, padding: "3px 8px", flex: 1 }}
                      disabled={procesando}
                    >
                      Ir a descarga →
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleResolver(e, a.id)}
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      style={{ fontSize: 10, padding: "3px 8px", color: "#5DCAA5" }}
                      disabled={procesando}
                      title="Marcar como resuelta"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDescartar(e, a.id)}
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      style={{ fontSize: 10, padding: "3px 8px", color: "var(--text-muted)" }}
                      disabled={procesando}
                      title="Descartar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}