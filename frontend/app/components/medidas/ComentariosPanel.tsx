"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ComentariosMedidaGeneral = {
  comentario_m1:    string | null;
  comentario_m2:    string | null;
  comentario_m7:    string | null;
  comentario_m11:   string | null;
  comentario_art15: string | null;
};

interface Props {
  open: boolean;
  token: string | null;
  medidaId: number | null;
  // Contexto para el header del panel
  empresaNombre: string;
  empresaCodigo: string;
  anio: number;
  mes: number;
  // Valores iniciales (los que ya están en BD para esa fila)
  initial: ComentariosMedidaGeneral;
  // Callbacks
  onClose: () => void;
  onSaved: (nuevos: ComentariosMedidaGeneral) => void;
}

// ── Etiquetas por ventana (mismos colores que las cabeceras de grupo) ────────

const VENTANAS: Array<{
  campo: keyof ComentariosMedidaGeneral;
  label: string;
  bg: string;
  color: string;
}> = [
  { campo: "comentario_m1",    label: "M1",    bg: "rgba(37,99,235,0.18)",  color: "#60a5fa" },
  { campo: "comentario_m2",    label: "M2",    bg: "rgba(5,150,105,0.18)",  color: "#34d399" },
  { campo: "comentario_m7",    label: "M7",    bg: "rgba(245,158,11,0.18)", color: "#fbbf24" },
  { campo: "comentario_m11",   label: "M11",   bg: "rgba(168,85,247,0.18)", color: "#c084fc" },
  { campo: "comentario_art15", label: "ART15", bg: "rgba(239,68,68,0.18)",  color: "#f87171" },
];

// ── Componente ───────────────────────────────────────────────────────────────

export default function ComentariosPanel({
  open, token, medidaId,
  empresaNombre, empresaCodigo, anio, mes,
  initial, onClose, onSaved,
}: Props) {
  const [draft, setDraft]   = useState<ComentariosMedidaGeneral>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Si cambia la fila seleccionada, reinicia el draft con sus valores iniciales
  useEffect(() => {
    setDraft(initial);
    setError(null);
  }, [medidaId, initial]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, saving]);

  if (!open || medidaId === null) return null;

  const handleChange = (campo: keyof ComentariosMedidaGeneral, value: string) => {
    setDraft(prev => ({ ...prev, [campo]: value }));
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      // Solo enviamos los campos que cambiaron respecto al inicial (o todos si quieres más simple)
      // Simplificamos: enviamos los 5 con su valor actual del draft.
      const body: Record<string, string | null> = {};
      for (const v of VENTANAS) {
        const actual   = (draft[v.campo] ?? "").trim();
        const inicial  = (initial[v.campo] ?? "").trim();
        if (actual !== inicial) {
          body[v.campo] = actual === "" ? null : actual;
        }
      }
      // Si no cambió nada → cerrar sin tocar
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      const r = await fetch(`${API_BASE_URL}/medidas/general/${medidaId}/comentarios`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.substring(0, 150)}`);
      }
      const updated = await r.json();
      // Devolver al padre los 5 valores actualizados (los que vinieron del servidor)
      onSaved({
        comentario_m1:    updated.comentario_m1    ?? null,
        comentario_m2:    updated.comentario_m2    ?? null,
        comentario_m7:    updated.comentario_m7    ?? null,
        comentario_m11:   updated.comentario_m11   ?? null,
        comentario_art15: updated.comentario_art15 ?? null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error guardando comentarios");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop semi-transparente — click cierra el panel */}
      <div
        onClick={() => { if (!saving) onClose(); }}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          zIndex: 40,
        }}
      />
      {/* Panel lateral derecho */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: "95vw",
        background: "var(--card-bg)",
        borderLeft: "1px solid var(--card-border)",
        boxShadow: "-4px 0 12px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column",
        zIndex: 41,
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--card-border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
              Comentarios
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
              {empresaNombre} · {empresaCodigo} · {anio}-{String(mes).padStart(2, "0")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: "none", border: "none",
              color: "var(--text-muted)", cursor: saving ? "not-allowed" : "pointer",
              fontSize: 14, padding: "4px 6px", lineHeight: 1, borderRadius: 4,
            }}
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Body con los 5 textareas */}
        <div style={{ padding: "12px 14px", flex: 1, overflowY: "auto" }}>
          {error && (
            <div className="ui-alert ui-alert--danger" style={{ marginBottom: 10, fontSize: 11 }}>
              {error}
            </div>
          )}
          {VENTANAS.map(v => (
            <div key={v.campo} style={{ marginBottom: 14 }}>
              <span style={{
                fontSize: 10, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 5,
                display: "inline-block", padding: "2px 7px", borderRadius: 4,
                background: v.bg, color: v.color,
              }}>
                {v.label}
              </span>
              <textarea
                value={draft[v.campo] ?? ""}
                onChange={(e) => handleChange(v.campo, e.target.value)}
                placeholder={`Añadir comentario para ${v.label}…`}
                disabled={saving}
                style={{
                  width: "100%", minHeight: 60,
                  background: "rgba(13,27,42,0.5)",
                  border: "0.5px solid var(--card-border)",
                  borderRadius: 6, padding: "7px 9px",
                  color: "var(--text)",
                  fontSize: 11, fontFamily: "inherit",
                  resize: "vertical", lineHeight: 1.4,
                  boxSizing: "border-box", marginTop: 5,
                }}
              />
            </div>
          ))}
        </div>

        {/* Footer con botones */}
        <div style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--card-border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="ui-btn ui-btn-ghost ui-btn-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !token}
            className="ui-btn ui-btn-primary ui-btn-xs"
          >
            {saving ? "Guardando..." : "Guardar comentarios"}
          </button>
        </div>
      </div>
    </>
  );
}