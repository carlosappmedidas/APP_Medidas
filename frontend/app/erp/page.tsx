// app/erp/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

export default function ErpHomePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!t) { router.replace("/login"); return; }
    } catch { /* */ }
    setAuthChecked(true);
  }, [router]);

  if (!authChecked) return null;

  const secciones = [
    { titulo: "Titulares",   desc: "Personas y empresas titulares de los suministros.", icon: "👤" },
    { titulo: "Suministros", desc: "Puntos de suministro (CUPS) con sus datos físicos.", icon: "🔌" },
    { titulo: "Contratos",   desc: "Pólizas: tarifa, potencias, comercializadora y estado.", icon: "📄" },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
        ERP — Maestro de suministros y contratos
      </h1>
      <p style={{ fontSize: 13, color: "rgba(241,239,232,0.6)", marginBottom: 28 }}>
        Módulo en construcción. Estas son las secciones que iremos habilitando.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {secciones.map((s) => (
          <div key={s.titulo}
            style={{ padding: "20px 18px", background: "var(--ds-bg-sidebar, #16181D)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{s.titulo}</div>
            <div style={{ fontSize: 12, color: "rgba(241,239,232,0.55)", lineHeight: 1.5 }}>{s.desc}</div>
            <div style={{ fontSize: 10, color: "rgba(241,239,232,0.4)", marginTop: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Próximamente
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}