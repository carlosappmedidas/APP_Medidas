// Modal de resumen post-ejecución.

"use client";

import type { EjecutarResponse } from "./types";

interface Props {
  open:        boolean;
  resultado:   EjecutarResponse | null;
  onClose:     () => void;
}

const RESULTADO_CONFIG: Record<"ok" | "reemplazado" | "error", { label: string; color: string; bg: string; icon: string }> = {
  ok:          { label: "Importado",   color: "#86efac", bg: "rgba(34,197,94,0.18)", icon: "✓" },
  reemplazado: { label: "Reemplazado", color: "#fdba74", bg: "rgba(234,88,12,0.22)", icon: "↻" },
  error:       { label: "Error",       color: "#fca5a5", bg: "rgba(239,68,68,0.22)", icon: "✗" },
};

export default function DescargaResultadoModal({ open, resultado, onClose }: Props) {
  if (!open || !resultado) return null;

  const total = resultado.importados + resultado.reemplazados + resultado.errores;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          width: "100%", maxWidth: 680,
          maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--card-border)" }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "var(--text)",
          }}>
            Resultado de la descarga
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            {total} item{total !== 1 ? "s" : ""} procesado{total !== 1 ? "s" : ""}
          </div>
        </div>

        <div style={{ padding: "14px 20px", display: "flex", gap: 10 }}>
          <div style={{ flex: 1, padding: "10px 12px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: "#86efac", textTransform: "uppercase", letterSpacing: "0.06em" }}>Importados</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#86efac", marginTop: 2 }}>{resultado.importados}</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.35)", borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: "#fdba74", textTransform: "uppercase", letterSpacing: "0.06em" }}>Reemplazados</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#fdba74", marginTop: 2 }}>{resultado.reemplazados}</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: "#fca5a5", textTransform: "uppercase", letterSpacing: "0.06em" }}>Errores</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#fca5a5", marginTop: 2 }}>{resultado.errores}</div>
          </div>
        </div>

        <div style={{ padding: "0 20px 14px 20px", overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Detalle por item:
          </div>
          <div style={{
            border: "1px solid var(--card-border)",
            borderRadius: 6,
            maxHeight: 280,
            overflowY: "auto",
          }}>
            {resultado.detalle.map((d, idx) => {
              const cfg = RESULTADO_CONFIG[d.resultado];
              return (
                <div
                  key={`${idx}-${d.nombre}`}
                  style={{
                    padding: "8px 10px",
                    borderBottom: idx < resultado.detalle.length - 1 ? "0.5px solid var(--card-border)" : "none",
                    display: "flex", alignItems: "flex-start", gap: 10, fontSize: 11,
                  }}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 20, height: 20, borderRadius: "50%",
                    background: cfg.bg, color: cfg.color,
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>
                    {cfg.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.nombre}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
                      {d.mensaje}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--card-border)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}