"use client";

import { useEffect, useState, useId } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ObjecionRow {
  [key: string]: string;
}

export interface ObjecionDetalleConfig {
  tipo: "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL";
  camposLectura: { id: string; label: string }[];
}

interface ObjecionDetalleModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (respuesta: {
    aceptacion: string;
    motivo_no_aceptacion: string;
    comentario_respuesta: string;
  }) => void;
  config: ObjecionDetalleConfig;
  fila: ObjecionRow | null;
  saving?: boolean;
}

// ─── Tooltip códigos REE (placeholder — rellenar cuando se disponga) ──────────

const CODIGOS_REE_PLACEHOLDER = "Próximamente: códigos de respuesta aceptados por REE.";

function TooltipREE() {
  const [visible, setVisible] = useState(false);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          marginLeft: 6,
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid var(--info-border)",
          background: "var(--info-bg)",
          color: "var(--info-text)",
          fontSize: 10,
          fontWeight: 700,
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Ver códigos de respuesta REE"
      >
        i
      </button>
      {visible && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            minWidth: 240,
            maxWidth: 320,
            borderRadius: 10,
            border: "1px solid var(--popover-border)",
            background: "var(--popover-bg)",
            color: "var(--text)",
            fontSize: 11,
            padding: "8px 12px",
            boxShadow: "var(--shadow-popover)",
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
          }}
        >
          {CODIGOS_REE_PLACEHOLDER}
        </span>
      )}
    </span>
  );
}

// ─── Campo de lectura ─────────────────────────────────────────────────────────

function CampoLectura({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <label className="ui-label">{label}</label>
      <div
        className="ui-input"
        style={{
          opacity: 0.65,
          cursor: "default",
          userSelect: "text",
          minHeight: 34,
          display: "flex",
          alignItems: "center",
        }}
      >
        {valor || <span style={{ color: "var(--field-placeholder)" }}>—</span>}
      </div>
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export default function ObjecionDetalleModal({
  open,
  onClose,
  onSave,
  config,
  fila,
  saving = false,
}: ObjecionDetalleModalProps) {
  const titleId = useId();

  const [aceptacion, setAceptacion] = useState("");
  const [motivoNoAceptacion, setMotivoNoAceptacion] = useState("");
  const [comentarioRespuesta, setComentarioRespuesta] = useState("");

  // Sincronizar campos al abrir con la fila seleccionada
  useEffect(() => {
    if (open && fila) {
      setAceptacion(fila.aceptacion ?? "");
      setMotivoNoAceptacion(fila.motivo_no_aceptacion ?? "");
      setComentarioRespuesta(fila.comentario_respuesta ?? "");
    }
  }, [open, fila]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open || !fila) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (saving) return;
    if (e.target === e.currentTarget) onClose();
  };

  const handleSave = () => {
    onSave({
      aceptacion,
      motivo_no_aceptacion: motivoNoAceptacion,
      comentario_respuesta: comentarioRespuesta,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onMouseDown={handleBackdropClick}
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="ui-card ui-card--border"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 760, maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* ── Cabecera ── */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h4 id={titleId} className="ui-card-title">
              {config.tipo}
            </h4>
            <p className="ui-card-subtitle">
              Detalle de la objeción · Rellena los campos de respuesta resaltados
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="ui-btn ui-btn-ghost ui-btn-xs"
            aria-label="Cerrar"
            style={{ flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* ── Campos en lectura — grid 2 columnas ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px 20px",
            marginBottom: 20,
          }}
        >
          {config.camposLectura.map((campo) => (
            <CampoLectura
              key={campo.id}
              label={campo.label}
              valor={fila[campo.id] ?? ""}
            />
          ))}
        </div>

        {/* ── Separador ── */}
        <div className="ui-divider" style={{ marginBottom: 16 }} />

        {/* ── Campos de respuesta editables ── */}
        <div
          style={{
            borderRadius: 12,
            border: "1px solid var(--warn-border)",
            background: "var(--warn-bg)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: "var(--warn-text)",
              fontWeight: 600,
              marginBottom: 2,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Campos de respuesta
          </p>

          {/* Aceptada */}
          <div>
            <label className="ui-label" style={{ color: "var(--warn-text)" }}>
              Aceptada
            </label>
            <select
              className="ui-select"
              value={aceptacion}
              onChange={(e) => setAceptacion(e.target.value)}
              disabled={saving}
            >
              <option value="">— Sin respuesta —</option>
              <option value="S">S — Sí, aceptada</option>
              <option value="N">N — No aceptada</option>
            </select>
          </div>

          {/* Motivo de no aceptación */}
          <div>
            <label
              className="ui-label"
              style={{
                color: "var(--warn-text)",
                display: "flex",
                alignItems: "center",
              }}
            >
              Motivo de no aceptación
              <TooltipREE />
            </label>
            <input
              type="text"
              className="ui-input"
              placeholder="Código de motivo (ej: 1, 2, 3...)"
              value={motivoNoAceptacion}
              onChange={(e) => setMotivoNoAceptacion(e.target.value)}
              disabled={saving || aceptacion === "S"}
            />
            {aceptacion === "S" && (
              <p className="ui-help">No aplica si la objeción es aceptada.</p>
            )}
          </div>

          {/* Comentario de respuesta */}
          <div>
            <label className="ui-label" style={{ color: "var(--warn-text)" }}>
              Comentario del emisor de la respuesta
            </label>
            <textarea
              className="ui-textarea"
              placeholder="Comentario opcional de respuesta..."
              value={comentarioRespuesta}
              onChange={(e) => setComentarioRespuesta(e.target.value)}
              disabled={saving}
              style={{ minHeight: 70 }}
            />
          </div>
        </div>

        {/* ── Botones ── */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="ui-btn ui-btn-outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={handleSave}
            disabled={saving || !aceptacion}
          >
            {saving ? "Guardando..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
