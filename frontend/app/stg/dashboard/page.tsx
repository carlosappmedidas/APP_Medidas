// app/stg/dashboard/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

interface DashboardSummary {
  empresa_id: number;
  cups_total: number;
  cups_online: number;
  cups_offline: number;
  porcentaje_online: number;
  concentradores_total: number;
  concentradores_alerta: number;
  concentradores_offline: number;
  solicitudes_pendientes: number;
  solicitudes_en_proceso: number;
}

export default function StgDashboardPage() {
  const empresaId = useStgEmpresaId();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evita hydration mismatch: en SSR localStorage no existe, así que el
  // primer render del cliente debe coincidir con el del servidor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/stg/dashboard/summary?empresa_id=${empresaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSummary)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [empresaId]);

  if (!mounted) {
    return null;
  }

  if (!empresaId) {
    return (
      <div style={{ color: "rgba(241,239,232,0.5)" }}>
        Selecciona una empresa en el desplegable de arriba.
      </div>
    );
  }

  if (loading) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Cargando…</div>;
  }

  if (error) {
    return (
      <div style={{ color: "#E24B4A" }}>
        Error cargando el dashboard: {error}
      </div>
    );
  }

  if (!summary) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Sin datos.</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 24px" }}>
        Dashboard STG
      </h1>

      {/* KPI grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Kpi label="CUPS telegestionados" value={summary.cups_total.toLocaleString("es-ES")} />
        <Kpi
          label="Online (24h)"
          value={`${summary.porcentaje_online.toFixed(1)}%`}
          subtitle={`${summary.cups_online.toLocaleString("es-ES")} de ${summary.cups_total.toLocaleString("es-ES")}`}
          tone={summary.porcentaje_online > 90 ? "ok" : summary.porcentaje_online > 75 ? "warn" : "bad"}
        />
        <Kpi
          label="Concentradores"
          value={summary.concentradores_total.toString()}
          subtitle={
            summary.concentradores_alerta + summary.concentradores_offline > 0
              ? `${summary.concentradores_alerta + summary.concentradores_offline} con incidencias`
              : "todo OK"
          }
          tone={summary.concentradores_offline > 0 ? "bad" : summary.concentradores_alerta > 0 ? "warn" : "ok"}
        />
        <Kpi
          label="Solicitudes activas"
          value={(summary.solicitudes_pendientes + summary.solicitudes_en_proceso).toString()}
          subtitle={`${summary.solicitudes_pendientes} pendientes · ${summary.solicitudes_en_proceso} en proceso`}
        />
      </div>

      {/* Banner informativo: solo cuando no hay datos todavía */}
      {summary.cups_total === 0 && (
        <div
          style={{
            padding: 16,
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: "rgba(241,239,232,0.7)",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            <strong>Sin datos todavía</strong>
          </p>
          <p style={{ margin: 0 }}>
            Aún no hay contadores detectados para esta empresa.
            Configura la conexión STG y descarga los primeros ficheros S24
            desde Configuración (menú izquierdo).
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneColor = tone === "ok" ? "#1D9E75" : tone === "warn" ? "#EF9F27" : tone === "bad" ? "#E24B4A" : undefined;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "rgba(241,239,232,0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 500,
          color: toneColor ?? "var(--ds-text-primary, #F1EFE8)",
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
