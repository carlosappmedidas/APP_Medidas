// app/components/ui/UiCard.tsx
"use client";

import React from "react";

// ═══════════════════════════════════════════════════════════════
// UiCard — tarjeta reutilizable del Design System v1
// Documentación: frontend/STYLEGUIDE.md
// ═══════════════════════════════════════════════════════════════

export type UiCardVariant =
  | "default"   // tarjeta principal (panel grande)
  | "nested"    // tarjeta dentro de otra (más clara)
  | "accent";   // tarjeta destacada/seleccionada (azul tenue)

export type UiCardPadding = "none" | "sm" | "md" | "lg";

export type UiCardRadius = "md" | "lg";

interface UiCardProps {
  variant?: UiCardVariant;
  padding?: UiCardPadding;
  radius?: UiCardRadius;
  /** Si se pasa onClick, el card es clickable (cambia cursor). */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Hover handlers (para efectos de borde/fondo). */
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Estilos extra opcionales (uso excepcional). */
  style?: React.CSSProperties;
  /** Clase CSS extra (uso excepcional). */
  className?: string;
  children: React.ReactNode;
}

// Mapa de variantes → estilos
const VARIANT_STYLES: Record<UiCardVariant, { background: string; border: string }> = {
  default: {
    background: "var(--card-bg)",
    border:     "0.5px solid var(--card-border)",
  },
  nested: {
    background: "var(--field-bg-soft)",
    border:     "0.5px solid var(--card-border)",
  },
  accent: {
    background: "var(--ds-surface-accent)",
    border:     "0.5px solid rgba(55,138,221,0.5)",
  },
};

const PADDING_VALUES: Record<UiCardPadding, string> = {
  none: "0",
  sm:   "8px 12px",
  md:   "14px 16px",
  lg:   "20px 24px",
};

const RADIUS_VALUES: Record<UiCardRadius, string> = {
  md: "var(--ds-r-xl)",  // 10px
  lg: "12px",
};

export default function UiCard({
  variant = "default",
  padding = "md",
  radius  = "md",
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
  className,
  children,
}: UiCardProps) {
  const variantStyle = VARIANT_STYLES[variant];

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={className}
      style={{
        background:   variantStyle.background,
        border:       variantStyle.border,
        borderRadius: RADIUS_VALUES[radius],
        padding:      PADDING_VALUES[padding],
        cursor:       onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}