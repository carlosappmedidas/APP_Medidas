// app/erp/layout.tsx
"use client";

import React from "react";
import ErpSidebar from "./components/ErpSidebar";
import ErpEmpresaSelector from "./components/ErpEmpresaSelector";

/**
 * Layout del módulo ERP: sidebar + header + área central /erp/*.
 */
export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ds-bg-page, #0E1014)",
        color: "var(--ds-text-primary, #F1EFE8)",
      }}
    >
      <ErpSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
            <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              ERP
            </div>
            <div style={{ fontSize: 14, color: "var(--ds-text-primary, #F1EFE8)" }}>
              Maestro de suministros y contratos
            </div>
          </div>
          <ErpEmpresaSelector />
        </header>
        <main style={{ flex: 1, padding: "24px 32px", minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}