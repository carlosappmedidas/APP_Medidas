// app/stg/components/StgHeader.tsx
"use client";

import React from "react";
import StgEmpresaSelector from "./StgEmpresaSelector";

/**
 * Header superior del módulo STG.
 * Contiene un breadcrumb mínimo y el selector de empresa global del módulo.
 *
 * El selector de empresa filtra TODA la pantalla actual a la empresa
 * seleccionada (CUPS, concentradores, solicitudes, etc.).
 */
export default function StgHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 32px",
        borderBottom: "0.5px solid rgba(255,255,255,0.06)",
        background: "var(--ds-bg-page, #0E1014)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(241,239,232,0.5)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          STG
        </div>
        <div style={{ fontSize: 14, color: "var(--ds-text-primary, #F1EFE8)" }}>
          Sistema de telegestión
        </div>
      </div>
      <StgEmpresaSelector />
    </header>
  );
}
