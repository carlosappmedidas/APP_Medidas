// app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

export default function AppSelectorPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!t) {
        router.replace("/login");
        return;
      }
    } catch { /* */ }
    setAuthChecked(true);
  }, [router]);

  if (!authChecked) {
    return (
      <div className="ui-login-shell">
        <div className="ui-login-panel">
          <div className="ui-login-brand mb-4 text-center">
            <h1 className="text-xl font-semibold">APP Medidas</h1>
            <p className="mt-1 text-xs ui-muted">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ds-bg-page, #0E1014)",
        color: "var(--ds-text-primary, #F1EFE8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 880, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
            APP Medidas
          </h1>
          <p style={{ fontSize: 14, color: "rgba(241,239,232,0.6)" }}>
            Selecciona la aplicación con la que quieres trabajar
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
          }}
        >
          {/* Card APP Medidas */}
          <Link
            href="/medidas"
            style={{
              padding: "32px 24px",
              background: "var(--ds-bg-sidebar, #16181D)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              textDecoration: "none",
              color: "var(--ds-text-primary, #F1EFE8)",
              transition: "background 0.15s",
              cursor: "pointer",
              display: "block",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>
              APP Medidas
            </div>
            <div style={{ fontSize: 12, color: "rgba(241,239,232,0.55)", lineHeight: 1.5 }}>
              Gestión y análisis de medidas eléctricas: publicaciones REE,
              objeciones, envíos, alertas y pérdidas.
            </div>
          </Link>

          {/* Card APP STG */}
          <Link
            href="/stg/dashboard"
            style={{
              padding: "32px 24px",
              background: "var(--ds-bg-sidebar, #16181D)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              textDecoration: "none",
              color: "var(--ds-text-primary, #F1EFE8)",
              transition: "background 0.15s",
              cursor: "pointer",
              display: "block",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>
              APP STG
            </div>
            <div style={{ fontSize: 12, color: "rgba(241,239,232,0.55)", lineHeight: 1.5 }}>
              Sistema de telegestión: equipos de medida, concentradores,
              solicitudes S0X y configuración GISCE.
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}