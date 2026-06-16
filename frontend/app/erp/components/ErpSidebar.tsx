// app/erp/components/ErpSidebar.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  disabled?: boolean;
}

const ITEMS: MenuItem[] = [
  { href: "/erp",             label: "Inicio",      icon: "🏠" },
  { href: "/erp/titulares",   label: "Titulares",   icon: "👤" },
  { href: "/erp/suministros", label: "Suministros", icon: "🔌" },
  { href: "/erp/contratos",   label: "Contratos",   icon: "📄" },
  { href: "/erp/catalogos",   label: "Catálogos",   icon: "📚" },
];

export default function ErpSidebar() {
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
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px 16px", textDecoration: "none", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 14, fontWeight: 500 }}
      >
        <span style={{ fontSize: 20 }}>🗂️</span>
        <span>APP Medidas · ERP</span>
      </Link>

      <div style={{ fontSize: 10, color: "rgba(241,239,232,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "12px 12px 6px" }}>
        Módulo ERP
      </div>

      {ITEMS.map((it) => {
        const active = it.href === "/erp" ? pathname === "/erp" : (pathname?.startsWith(it.href) ?? false);

        if (it.disabled) {
          return (
            <div key={it.href} title="Próximamente"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderRadius: 6, color: "rgba(241,239,232,0.35)", fontSize: 13, cursor: "default" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>{it.icon}</span>
                <span>{it.label}</span>
              </span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>pronto</span>
            </div>
          );
        }

        return (
          <Link key={it.href} href={it.href}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 6, textDecoration: "none", color: active ? "var(--ds-text-primary, #F1EFE8)" : "rgba(241,239,232,0.7)", background: active ? "rgba(255,255,255,0.06)" : "transparent", fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>{it.icon}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}

      <div style={{ marginTop: "auto", padding: "12px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(241,239,232,0.5)", textDecoration: "none", fontSize: 12 }}>
          ← Volver al inicio
        </Link>
      </div>
    </aside>
  );
}
