// app/components/medidas/CampanaAlertasEnvios.tsx
// Campanita de alertas de Envíos REE (clon adaptado de CampanaAlertasObjeciones).
// Solo se renderiza si hay alertas activas (total > 0).
// Comparte endpoint con la pestaña "Alertas" → resolver/descartar desde
// cualquier lado se sincroniza en cuanto se recargue.

"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type AlertaItem = {
  id:                  number;
  empresa_id:          number;
  empresa_nombre:      string | null;
  empresa_codigo_ree:  string | null;
  tipo:                string;            // plazo_proximo | plazo_vencido_bad | ...
  m_clas:              string;            // M1 | M2 | M7
  periodo:             string;            // YYYY-MM (mes_envio)
  plazo_fecha:         string | null;
  num_pendientes:      number;
  detalle:             Record<string, unknown> | unknown[] | null;
  severidad:           string;            // info | warning | critical
  estado:              string;
  created_at:          string;
};

interface Props {
  token: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES_CORTOS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// "2026-05" o "202605" → "May 26"
function fmtPeriodo(periodo: string): string {
  if (!periodo) return "—";
  const limpio = periodo.replace("-", "");
  if (limpio.length !== 6) return periodo;
  const anio = limpio.slice(0, 4);
  const mes  = parseInt(limpio.slice(4, 6), 10);
  if (mes < 1 || mes > 12) return periodo;
  return `${MESES_CORTOS[mes]} ${anio.slice(2)}`;
}

// ISO datetime → "12 may 2026"
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

// Etiquetas y colores por tipo de alerta
const TIPO_META: Record<string, { label: string; chipBg: string; chipColor: string }> = {
  plazo_proximo:           { label: "Próximo",  chipBg: "rgba(239,159,39,0.18)", chipColor: "#FAC775" },
  plazo_vencido_bad:       { label: "Bad",      chipBg: "rgba(226,75,74,0.20)",  chipColor: "#F08585" },
  plazo_vencido_pendiente: { label: "Vencido",  chipBg: "rgba(226,75,74,0.20)",  chipColor: "#F08585" },
  respuesta_ree:           { label: "Resp.",    chipBg: "rgba(55,138,221,0.20)", chipColor: "#6FB1F0" },
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════════════

export default function CampanaAlertasEnvios({ token }: Props) {
  const [items, setItems]      = useState<AlertaItem[]>([]);
  const [open, setOpen]        = useState(false);
  const dropdownRef            = useRef<HTMLDivElement | null>(null);
  const [actionId, setAction]  = useState<number | null>(null);

  // Cargar alertas activas
  const cargar = async () => {
    if (!token) return;
    try {
      const r = await fetch(
        `${API_BASE_URL}/envios/alertas?estado=activa`,
        { headers: getAuthHeaders(token) },
      );
      if (!r.ok) return;
      const d: AlertaItem[] = await r.json();
      setItems(Array.isArray(d) ? d : []);
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
      await fetch(`${API_BASE_URL}/envios/alertas/${alertId}/resolver`, {
        method: "PATCH",
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
      await fetch(`${API_BASE_URL}/envios/alertas/${alertId}/descartar`, {
        method: "PATCH",
        headers: getAuthHeaders(token),
      });
      await cargar();
    } finally {
      setAction(null);
    }
  };

  // ⚠️ Si NO hay alertas activas, no renderizar nada
  const totalActivas = items.length;
  if (totalActivas === 0) return null;

  // Color del badge según severidad mayor presente
  const haySevera = items.some(a => a.severidad === "critical");
  const colorBadge = haySevera ? "#A32D2D" : "#BA7517";

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="ui-btn ui-btn-ghost ui-btn-xs"
        style={{
          width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, position: "relative",
        }}
        title={`${totalActivas} alerta(s) de envíos`}
        aria-label="Alertas de envíos"
      >
        <span style={{ fontSize: 14 }}>🔔</span>
        <span style={{
          position: "absolute", top: -3, right: -3,
          background: colorBadge, color: "#fff",
          fontSize: 9, fontWeight: 600,
          minWidth: 16, height: 16, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px",
        }}>
          {totalActivas}
        </span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: 36, right: 0,
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: 8, padding: 0,
            minWidth: 380, maxWidth: 440, maxHeight: 460, overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 30,
          }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", borderBottom: "1px solid var(--card-border)",
            fontSize: 11, fontWeight: 600, color: "var(--text)",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <span>Alertas Envíos ({totalActivas})</span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Items */}
          <div>
            {items.map(a => {
              const meta = TIPO_META[a.tipo] ?? { label: a.tipo.toUpperCase(), chipBg: "rgba(255,255,255,0.06)", chipColor: "var(--text-muted)" };
              const procesando = actionId === a.id;

              // Detalle adicional según tipo
              let detalleExtra = "";
              if (a.detalle && typeof a.detalle === "object" && !Array.isArray(a.detalle)) {
                const d = a.detalle as Record<string, unknown>;
                if (typeof d.dias_restantes === "number") {
                  detalleExtra = `Faltan ${d.dias_restantes} días`;
                } else if (typeof d.num_bads === "number" && d.num_bads > 0) {
                  detalleExtra = `${d.num_bads} fichero${d.num_bads !== 1 ? "s" : ""} .bad`;
                }
              }

              return (
                <div key={a.id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--card-border)",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(55,138,221,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{
                      background: meta.chipBg, color: meta.chipColor,
                      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                    }}>
                      {meta.label}
                    </span>
                    <span style={{
                      background: "rgba(55,138,221,0.18)", color: "#6FB1F0",
                      padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                    }}>
                      {a.m_clas}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                      {fmtPeriodo(a.periodo)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text)" }}>
                    <strong>{a.empresa_nombre ?? `Empresa ${a.empresa_id}`}</strong>
                    {a.empresa_codigo_ree && (
                      <span style={{ color: "var(--text-muted)", fontFamily: "monospace", marginLeft: 6 }}>
                        {a.empresa_codigo_ree}
                      </span>
                    )}
                  </div>
                  {(detalleExtra || a.plazo_fecha) && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                      {detalleExtra}
                      {detalleExtra && a.plazo_fecha && " · "}
                      {a.plazo_fecha && <>Plazo: {fmtFechaCorta(a.plazo_fecha)}</>}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => handleResolver(e, a.id)}
                      className="ui-btn ui-btn-outline ui-btn-xs"
                      style={{ fontSize: 10, padding: "3px 8px", flex: 1, color: "#0F6E56", borderColor: "rgba(15,110,86,0.4)" }}
                      disabled={procesando}
                      title="Marcar como resuelta"
                    >
                      ✓ Resolver
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