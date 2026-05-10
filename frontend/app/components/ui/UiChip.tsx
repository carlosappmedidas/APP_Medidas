// app/components/ui/UiChip.tsx
"use client";

import React from "react";

// ═══════════════════════════════════════════════════════════════
// UiChip — chip reutilizable del Design System v1
// Documentación: frontend/STYLEGUIDE.md
// ═══════════════════════════════════════════════════════════════

export type UiChipVariant =
  | "m1"        // azul — periodo M1
  | "m2"        // morado — periodo M2
  | "m7"        // naranja — periodo M7
  | "success"   // verde — OK, completado
  | "danger"    // rojo — BAD, error
  | "info"      // azul tenue — activo, seleccionado
  | "warning"   // naranja — aviso, vence pronto
  | "accent"    // morado — destacado (ART15, especial)
  | "muted";    // gris — neutral, genérico

export type UiChipSize = "sm" | "md";

interface UiChipProps {
  variant?: UiChipVariant;
  size?: UiChipSize;
  children: React.ReactNode;
  /** Estilos extra opcionales (uso excepcional). */
  style?: React.CSSProperties;
  /** Clase CSS extra (uso excepcional). */
  className?: string;
  /** Si se pasa un onClick, el chip es clickable (cambia el cursor). */
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  /** Tooltip al pasar el ratón. */
  title?: string;
}

// Mapa de variantes → tokens del Design System
const VARIANT_STYLES: Record<UiChipVariant, { bg: string; color: string }> = {
  m1:      { bg: "var(--ds-bg-m1-soft)",      color: "var(--ds-text-m1)" },
  m2:      { bg: "var(--ds-bg-m2-soft)",      color: "var(--ds-text-m2)" },
  m7:      { bg: "var(--ds-bg-m7-soft)",      color: "var(--ds-text-m7)" },
  success: { bg: "var(--ds-bg-success-soft)", color: "var(--ds-text-success)" },
  danger:  { bg: "var(--ds-bg-danger-soft)",  color: "var(--ds-text-danger)" },
  info:    { bg: "var(--ds-bg-info-soft)",    color: "var(--ds-text-info)" },
  warning: { bg: "var(--ds-bg-warning-soft)", color: "var(--ds-text-warning)" },
  accent:  { bg: "rgba(83,74,183,0.22)",      color: "#AFA9EC" },
  muted:   { bg: "var(--ds-bg-muted-soft)",   color: "rgba(241,239,232,0.85)" },
};

// Mapa de tamaños → padding + fontSize
const SIZE_STYLES: Record<UiChipSize, { padding: string; fontSize: string }> = {
  sm: { padding: "1px 6px", fontSize: "9px" },
  md: { padding: "2px 8px", fontSize: "var(--ds-text-sm)" },
};

export default function UiChip({
  variant = "muted",
  size = "md",
  children,
  style,
  className,
  onClick,
  title,
}: UiChipProps) {
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <span
      onClick={onClick}
      title={title}
      className={className}
      style={{
        display: "inline-block",
        background: variantStyle.bg,
        color: variantStyle.color,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        borderRadius: "var(--ds-r-xl)",
        fontWeight: 500,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}