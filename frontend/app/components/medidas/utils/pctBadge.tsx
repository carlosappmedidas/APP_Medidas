// frontend/app/components/medidas/utils/pctBadge.tsx
//
// Util compartido para mostrar porcentajes de pérdidas técnicas
// con coloreado por rangos (badge).
//
// Modificar aquí si cambia el criterio:
//   negativo              → ámbar  (anómalo, no debería haber pérdidas negativas)
//   0 % a NORMAL          → verde  (pérdidas técnicas aceptables)
//   NORMAL % a ALTO       → ámbar  (pérdidas elevadas, vigilar)
//   > ALTO %              → rojo   (pérdidas no normales, revisar)

import type { ReactNode } from "react";

// ── Umbrales de pérdidas técnicas ─────────────────────────────────────────
export const PCT_UMBRAL_NORMAL = 8;
export const PCT_UMBRAL_ALTO   = 12;

// ── Formato número en es-ES con N decimales ───────────────────────────────
export const formatNumberEs = (v: number | null | undefined, decimals = 2): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

// ── Formato porcentaje "X,XX %" en es-ES (con espacio antes del %) ────────
export const formatPercentEs = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return `${formatNumberEs(v, 2)} %`;
};

// ── Badge de porcentaje de pérdidas ───────────────────────────────────────
export function PctCell({
  value,
  pctBadges,
  text,
}: {
  value: number | null | undefined;
  pctBadges: boolean;
  /**
   * Texto a mostrar (opcional). Si no se pasa, se calcula con formatPercentEs(value).
   * Útil si quieres mostrar el % en otro formato (ej: "15,0%" sin espacio antes del %)
   * pero conservando el coloreado por rangos.
   */
  text?: string;
}): ReactNode {
  const display = text ?? formatPercentEs(value);
  if (!pctBadges || display === "-") return <>{display}</>;

  let bg: string;
  let color: string;

  if (typeof value !== "number") {
    bg = "rgba(30,58,95,0.2)";    color = "var(--text-muted)";
  } else if (value < 0) {
    bg = "rgba(245,158,11,0.2)";  color = "#fbbf24";   // ámbar — negativo anómalo
  } else if (value <= PCT_UMBRAL_NORMAL) {
    bg = "rgba(5,150,105,0.18)";  color = "#34d399";   // verde — pérdidas normales
  } else if (value <= PCT_UMBRAL_ALTO) {
    bg = "rgba(245,158,11,0.2)";  color = "#fbbf24";   // ámbar — pérdidas elevadas
  } else {
    bg = "rgba(239,68,68,0.18)";  color = "#f87171";   // rojo — revisar
  }

  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: "inherit", fontWeight: 500, background: bg, color,
    }}>
      {display}
    </span>
  );
}