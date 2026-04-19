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