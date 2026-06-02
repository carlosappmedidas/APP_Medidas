// app/stg/components/StgSidebar.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface MenuItem {
  href: string;
  label: string;
  icon: string; // emoji por simplicidad inicial; se puede sustituir por SVG/lucide
}

const ITEMS: MenuItem[] = [
  { href: "/stg/dashboard",     label: "Dashboard",      icon: "📊" },
  { href: "/stg/cups",          label: "CUPS",           icon: "🔌" },
  { href: "/stg/concentradores", label: "Concentradores", icon: "📡" },
  { href: "/stg/solicitudes",   label: "Solicitudes",    icon: "📥" },
  { href: "/stg/configuracion", label: "Configuración",  icon: "⚙️" },
];

/**
 * Sidebar lateral del módulo STG. Estilo neutral, sin asumir el
 * design system actual de Medidas (que está en page.tsx). En futuras
 * iteraciones se unificará con el Sidebar de Medidas.
 */
export default function StgSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        background: "var(--ds-bg-sidebar, #16181D)",
        borderRight: "0.5px solid rgba(255,255,255,0.06)",
        padding: "20px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px 16px",
          textDecoration: "none",
          color: "var(--ds-text-primary, #F1EFE8)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: 20 }}>📡</span>
        <span>APP Medidas · STG</span>
      </Link>

      <div
        style={{
          fontSize: 10,
          color: "rgba(241,239,232,0.4)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          padding: "12px 12px 6px",
        }}
      >
        Módulo STG
      </div>

      {ITEMS.map((it) => {
        const active = pathname?.startsWith(it.href) ?? false;
        return (
          <Link
            key={it.href}
            href={it.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 6,
              textDecoration: "none",
              color: active
                ? "var(--ds-text-primary, #F1EFE8)"
                : "rgba(241,239,232,0.7)",
              background: active ? "rgba(255,255,255,0.06)" : "transparent",
              fontSize: 13,
            }}
          >
            <span style={{ fontSize: 16 }}>{it.icon}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}

      <div style={{ marginTop: "auto", padding: "12px" }}>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "rgba(241,239,232,0.5)",
            textDecoration: "none",
            fontSize: 12,
          }}
        >
          ← Volver a Medidas
        </Link>
      </div>
    </aside>
  );
}
