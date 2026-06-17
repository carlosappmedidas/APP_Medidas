// app/erp/titulares/page.tsx
"use client";

import Link from "next/link";
import React from "react";

const cardStyle: React.CSSProperties = {
  display: "block",
  background: "rgba(255,255,255,0.03)",
  border: "0.5px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "28px 24px",
  textDecoration: "none",
  color: "var(--ds-text-primary, #F1EFE8)",
  flex: "1 1 240px",
  maxWidth: 320,
};

const OPCIONES = [
  { href: "/erp/titulares/clientes", icon: "👤", titulo: "Clientes",
    desc: "Titulares de los suministros (personas y empresas)." },
  { href: "/erp/titulares/comercializadoras", icon: "🏢", titulo: "Comercializadora",
    desc: "Comercializadoras con las que opera la distribuidora." },
];

export default function TitularesHubPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Titulares</h1>
      <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", marginBottom: 22 }}>
        Elige qué quieres gestionar.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {OPCIONES.map((o) => (
          <Link key={o.href} href={o.href} style={cardStyle}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>{o.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{o.titulo}</div>
            <div style={{ fontSize: 12, color: "rgba(241,239,232,0.55)", lineHeight: 1.4 }}>{o.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
