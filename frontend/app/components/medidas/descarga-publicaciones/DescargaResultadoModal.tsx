"use client";

import React, { useMemo, useState } from "react";
import type { EjecutarResponse } from "./types";

type Props = {
  open:       boolean;
  resultado:  EjecutarResponse | null;
  onClose:    () => void;
};

type LogFilter = "all" | "ok" | "warnings" | "errors" | "omitted";

// ── Estilos inline (espejo de CargaSection.tsx) ──────────────────────────
const S = {
  actionBtn: {
    fontSize: 11, padding: "5px 13px", borderRadius: 8, cursor: "pointer",
    whiteSpace: "nowrap" as const, border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(0,0,0,0.2)", color: "var(--text)", height: 30,
    display: "flex", alignItems: "center", gap: 4,
  } as React.CSSProperties,
  disabled: { opacity: 0.45, cursor: "not-allowed" } as React.CSSProperties,
  lbl: {
    fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em",
    color: "rgba(226,232,240,0.55)", display: "block", marginBottom: 3,
  } as React.CSSProperties,
  kpi: {
    background: "rgba(0,0,0,0.2)", border: "1px solid rgba(30,58,95,0.6)",
    borderRadius: 8, padding: "7px 10px", display: "flex",
    justifyContent: "space-between", alignItems: "center",
  } as React.CSSProperties,
  logBox: {
    fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
    padding: "10px 12px", minHeight: 90, color: "rgba(226,232,240,0.55)",
    lineHeight: 1.6, overflowY: "auto" as const, maxHeight: 360,
  } as React.CSSProperties,
};

export default function DescargaResultadoModal({ open, resultado, onClose }: Props) {
  const [logFilter, setLogFilter] = useState<LogFilter>("all");

  const logs    = useMemo<string[]>(() => resultado?.logs ?? [], [resultado]);
  const detalle = useMemo(() => resultado?.detalle ?? [], [resultado]);

  // KPIs derivados — fuente única de verdad: las líneas del log + contadores del backend
  const summary = useMemo(() => {
    let avisos = 0, omitidos = 0;
    for (const line of logs) {
      if (line.includes("⚠ Avisos") || line.includes("↳ ⚠") || line.includes("⚠ Fichero")) avisos += 1;
      if (line.includes("Se omite")) omitidos += 1;
    }
    return {
      total:        detalle.length,
      importados:   resultado?.importados   ?? 0,
      reemplazados: resultado?.reemplazados ?? 0,
      errores:      resultado?.errores      ?? 0,
      avisos,
      omitidos,
    };
  }, [logs, detalle, resultado]);

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return logs;
    return logs.filter((line) => {
      if (logFilter === "warnings") return line.includes("⚠ Avisos") || line.includes("↳ ⚠") || line.includes("⚠ Fichero");
      if (logFilter === "errors")   return line.includes("❌") || line.includes("↳ Motivo:");
      if (logFilter === "ok")       return line.includes("✅") || line.includes("✔ Carga");
      if (logFilter === "omitted")  return line.includes("Se omite");
      return true;
    });
  }, [logFilter, logs]);

  if (!open || !resultado) return null;

  const handleDownloadLogs = () => {
    if (logs.length === 0) return;
    const blob = new Blob([logs.join("\n")], { type: "text/plain;charset=utf-8" });
    const url  = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `descarga_publicaciones_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const LogPill = ({ f, label }: { f: LogFilter; label: string }) => (
    <button
      type="button"
      onClick={() => setLogFilter(f)}
      style={{
        fontSize: 10, padding: "2px 7px", borderRadius: 20, cursor: "pointer",
        border:      logFilter === f ? "1px solid rgba(37,99,235,0.4)" : "1px solid rgba(255,255,255,0.12)",
        background:  logFilter === f ? "rgba(37,99,235,0.25)"          : "transparent",
        color:       logFilter === f ? "#93c5fd"                        : "rgba(226,232,240,0.5)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 12,
          padding: 18,
          width: "min(900px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
          color: "var(--text)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.03em" }}>
              RESULTADO DE LA DESCARGA
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Logs detallados de la descarga del SFTP y la importación a BD.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ ...S.actionBtn, fontSize: 10, padding: "3px 9px", height: "auto" }}
          >
            Cerrar
          </button>
        </div>

        {/* KPIs + Log box (idéntico layout a CargaSection) */}
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          {/* Columna izquierda: KPIs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ ...S.lbl, marginBottom: 3 }}>Resumen</span>
            {[
              { label: "Total",        val: summary.total,        color: "var(--text)" },
              { label: "Importados",   val: summary.importados,   color: "#34d399" },
              { label: "Reemplazados", val: summary.reemplazados, color: "#93c5fd" },
              { label: "Errores",      val: summary.errores,      color: "#fca5a5" },
              { label: "Avisos",       val: summary.avisos,       color: "#fbbf24" },
              { label: "Omitidos",     val: summary.omitidos,     color: "rgba(226,232,240,0.4)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={S.kpi}>
                <span style={{ fontSize: 10, color: "rgba(226,232,240,0.5)" }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 500, fontFamily: "monospace", color }}>{val}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "rgba(226,232,240,0.3)", marginTop: 2 }}>
              Completado
            </div>
          </div>

          {/* Columna derecha: Log box */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>Logs</span>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                <LogPill f="all"      label="Todos"    />
                <LogPill f="ok"       label="OK"       />
                <LogPill f="warnings" label="Avisos"   />
                <LogPill f="errors"   label="Errores"  />
                <LogPill f="omitted"  label="Omitidos" />
              </div>
            </div>
            <div style={S.logBox}>
              {logs.length === 0 ? (
                <span style={{ color: "rgba(226,232,240,0.35)" }}>Sin logs disponibles.</span>
              ) : filteredLogs.length === 0 ? (
                <span style={{ color: "rgba(226,232,240,0.35)" }}>No hay líneas para el filtro seleccionado.</span>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {filteredLogs.map((line, idx) => (
                    <li key={`${logFilter}-${idx}`}>• {line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleDownloadLogs}
                disabled={logs.length === 0}
                title="Descargar logs como fichero .txt"
                style={{ ...S.actionBtn, ...(logs.length === 0 ? S.disabled : {}) }}
              >
                ↓ Logs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}