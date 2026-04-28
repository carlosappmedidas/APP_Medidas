// Modal de confirmación cuando hay ficheros 🟠 Actualizables seleccionados.

"use client";

import type { BusquedaResult } from "./types";

interface Props {
  open:            boolean;
  actualizables:   BusquedaResult[];
  onCancel:        () => void;
  onConfirm:       () => void;
}

export default function DescargaConfirmReemplazoModal({
  open, actualizables, onCancel, onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          width: "100%", maxWidth: 560,
          maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--card-border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text)",
            }}>
              Confirmar reemplazo
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              {actualizables.length} fichero{actualizables.length !== 1 ? "s" : ""} sustituirá{actualizables.length !== 1 ? "n" : ""} a una versión ya importada
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 20px", overflowY: "auto", flex: 1 }}>
          <p style={{ fontSize: 12, color: "var(--text)", marginBottom: 10, lineHeight: 1.5 }}>
            Estás a punto de <strong>reemplazar {actualizables.length} fichero{actualizables.length !== 1 ? "s" : ""}</strong> ya importado{actualizables.length !== 1 ? "s" : ""} en BD por {actualizables.length !== 1 ? "sus" : "su"} nueva{actualizables.length !== 1 ? "s" : ""} versi{actualizables.length !== 1 ? "ones" : "ón"}.
          </p>
          <div style={{
            padding: "8px 10px",
            background: "rgba(234,88,12,0.12)",
            border: "1px solid rgba(234,88,12,0.35)",
            borderRadius: 6,
            fontSize: 11, color: "#fdba74",
            marginBottom: 12,
            lineHeight: 1.5,
          }}>
            <strong>Importante:</strong> esto <u>borrará los datos importados</u> de la versión anterior y los sustituirá por los de la nueva. Esta acción no se puede deshacer.
          </div>

          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Ficheros afectados:
          </div>
          <div style={{
            border: "1px solid var(--card-border)",
            borderRadius: 6,
            maxHeight: 200,
            overflowY: "auto",
          }}>
            {actualizables.map((r, idx) => (
              <div
                key={`${r.empresa_id}|${r.nombre}`}
                style={{
                  padding: "6px 10px",
                  borderBottom: idx < actualizables.length - 1 ? "0.5px solid var(--card-border)" : "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, fontSize: 11,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.nombre}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {r.empresa_nombre} · v.{r.version_importada ?? "?"} → v.{r.version}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--card-border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-xs"
            onClick={onConfirm}
            style={{
              background: "#f97316", color: "white",
              border: "1px solid #ea580c",
            }}
          >
            Reemplazar {actualizables.length} fichero{actualizables.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}