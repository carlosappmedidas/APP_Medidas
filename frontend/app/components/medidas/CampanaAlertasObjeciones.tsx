// app/components/medidas/CampanaAlertasObjeciones.tsx
// Campanita de alertas de Objeciones (clon adaptado de CampanaAlertasPublicaciones).
// Solo se renderiza si hay alertas activas (total > 0).
// Comparte endpoint con la pestaña "Alertas" → resolver/descartar desde
// cualquier lado se sincroniza en cuanto se recargue.
//
// Al pulsar "Abrir en Descarga" guarda en localStorage la misma intención que
// usa AlertasObjecionesSection (clave: "objeciones_autoabrir_descarga"), y
// llama a `onAbrirDescarga()` para que el padre haga remount del DescargaPanel
// y éste vuelva a leer la intención.

"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import UiChip from "../ui/UiChip";

type AlertaItem = {
  id:                  number;
  empresa_id:          number;
  empresa_nombre:      string | null;
  empresa_codigo_ree:  string | null;
  tipo:                string;
  periodo:             string;          // YYYYMM
  fecha_hito:          string | null;
  num_pendientes:      number;
  severidad:           string;
  estado:              string;
  created_at:          string | null;
};

interface Props {
  token: string | null;
  /**
   * Llamado tras pulsar "Abrir en Descarga" en una alerta. El padre debe
   * cambiar el `key` del DescargaPanel para que se remonte y vuelva a
   * leer `localStorage.objeciones_autoabrir_descarga`.
   */
  onAbrirDescarga: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Etiquetas por tipo de alerta. Cada tipo se mapea a una variante semántica
// del Design System (UiChip).
const TIPO_META: Record<string, { label: string; variant: "warning" | "success" }> = {
  fin_recepcion:         { label: "AOB",     variant: "warning" },
  fin_resolucion:        { label: "Pend.",   variant: "warning" },
  buscar_respuestas_ree: { label: "Resp.",   variant: "success" },
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════════════

export default function CampanaAlertasObjeciones({ token, onAbrirDescarga }: Props) {
  const [items, setItems]      = useState<AlertaItem[]>([]);
  const [open, setOpen]        = useState(false);
  const dropdownRef            = useRef<HTMLDivElement | null>(null);
  const [actionId, setAction]  = useState<number | null>(null);

  // Cargar alertas activas
  const cargar = async () => {
    if (!token) return;
    try {
      const r = await fetch(
        `${API_BASE_URL}/objeciones/alertas?estado=activa`,
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
      await fetch(`${API_BASE_URL}/objeciones/alertas/${alertId}/resolver`, {
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
      await fetch(`${API_BASE_URL}/objeciones/alertas/${alertId}/descartar`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      await cargar();
    } finally {
      setAction(null);
    }
  };

  // Pulsar "Abrir en Descarga" — replicamos el patrón de AlertasObjecionesSection
  // (localStorage) para que el DescargaPanel auto-aplique filtros al remontarse.
  // fecha_desde = fecha_hito + 1 día (el AOB aparece en SFTP el día siguiente al hito).
  const handleAbrirDescarga = (a: AlertaItem) => {
    setOpen(false);

    let fechaDesde: string | undefined;
    if (a.fecha_hito) {
      try {
        const d = new Date(a.fecha_hito);
        d.setDate(d.getDate() + 1);
        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, "0");
        const dd   = String(d.getDate()).padStart(2, "0");
        fechaDesde = `${yyyy}-${mm}-${dd}`;
      } catch { /* sin fecha_desde */ }
    }

    try {
      localStorage.setItem("objeciones_autoabrir_descarga", JSON.stringify({
        empresa_id:  a.empresa_id,
        periodo:     periodoToFiltro(a.periodo),
        fecha_desde: fechaDesde,
        timestamp:   Date.now(),
      }));
    } catch { /* silencioso */ }
    onAbrirDescarga();
  };

  // ⚠️ Si NO hay alertas activas, no renderizar nada
  const totalActivas = items.length;
  if (totalActivas === 0) return null;

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
        title={`${totalActivas} alerta(s) de objeciones`}
        aria-label="Alertas de objeciones"
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
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
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
            <span>Alertas Objeciones ({totalActivas})</span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Items */}
          <div>
            {items.map(a => {
              const meta = TIPO_META[a.tipo] ?? { label: a.tipo.toUpperCase(), variant: "muted" as const };
              const procesando = actionId === a.id;
              return (
                <div key={a.id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--card-border)",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onClick={() => handleAbrirDescarga(a)}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(55,138,221,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <UiChip variant={meta.variant} size="sm">
                      {meta.label}
                    </UiChip>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                      Objeciones pendientes
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text)" }}>
                    <strong>{a.empresa_nombre ?? `Empresa ${a.empresa_id}`}</strong>
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}· {fmtPeriodo(a.periodo)}{a.fecha_hito ? ` · ${fmtFechaCorta(a.fecha_hito)}` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {a.num_pendientes} AOB{a.num_pendientes !== 1 ? "s" : ""} pendiente{a.num_pendientes !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleAbrirDescarga(a); }}
                      className="ui-btn ui-btn-outline ui-btn-xs"
                      style={{ fontSize: 10, padding: "3px 8px", flex: 1 }}
                      disabled={procesando}
                    >
                      Abrir en Descarga →
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