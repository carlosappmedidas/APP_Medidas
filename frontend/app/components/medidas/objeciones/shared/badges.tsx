// Badges visuales del módulo Objeciones.
// Movido desde ObjecionesSection.tsx (Fase 0 · Paso 0.4).

export function BadgeAceptacion({ valor }: { valor: string }) {
  if (!valor) return <span className="ui-badge ui-badge--neutral">Pendiente</span>;
  if (valor === "S") return <span className="ui-badge ui-badge--ok">Aceptada</span>;
  return <span className="ui-badge ui-badge--err">Rechazada</span>;
}

export function BadgeNum({ n, variant }: { n: number; variant: "neutral" | "ok" | "err" }) {
  if (n === 0) return <span className="ui-muted" style={{ fontSize: 11 }}>—</span>;
  return <span className={`ui-badge ui-badge--${variant}`}>{n}</span>;
}

// ── Badge de estado para Descarga en Objeciones (FASE 5) ─────────────────────
// ⚪ nuevo · 🟢 importado · 🟠 actualizable · ⚫ obsoleta

import type { DescargaEstado } from "./types";

const ESTADO_DESCARGA_CONFIG: Record<DescargaEstado, { label: string; color: string; bg: string; dot: string }> = {
  nuevo:        { label: "Nuevo",        color: "#e5e7eb", bg: "rgba(148,163,184,0.18)", dot: "#cbd5e1" },  // ⚪ gris claro
  importado:    { label: "Importado",    color: "#86efac", bg: "rgba(34,197,94,0.18)",   dot: "#22c55e" },  // 🟢 verde
  actualizable: { label: "Actualizable", color: "#fdba74", bg: "rgba(234,88,12,0.22)",   dot: "#f97316" },  // 🟠 naranja
  obsoleta:     { label: "Obsoleta",     color: "#9ca3af", bg: "rgba(71,85,105,0.25)",   dot: "#64748b" },  // ⚫ gris oscuro
};

export function BadgeEstadoDescarga({ estado }: { estado: DescargaEstado }) {
  const cfg = ESTADO_DESCARGA_CONFIG[estado];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 10,
      fontSize: 10, fontWeight: 500, letterSpacing: "0.02em",
      background: cfg.bg, color: cfg.color,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}