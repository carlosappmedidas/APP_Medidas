// app/stg/layout.tsx
"use client";

import React from "react";
import StgSidebar from "./components/StgSidebar";
import StgHeader from "./components/StgHeader";

/**
 * Layout específico del módulo STG.
 *
 * Estructura:
 *   - Sidebar lateral con items propios del STG
 *   - Header superior con título de la app + selector de empresa
 *   - Área central donde se renderiza cada página /stg/*
 */
export default function StgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ds-bg-page, #0E1014)",
        color: "var(--ds-text-primary, #F1EFE8)",
      }}
    >
      <StgSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <StgHeader />
        <main style={{ flex: 1, padding: "24px 32px", minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
