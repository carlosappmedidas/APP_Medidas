"use client";

import type { TooltipLineasConfig } from "../topologia/MapaLeaflet";

interface Props {
  config:    TooltipLineasConfig;
  onChange:  (config: TooltipLineasConfig) => void;
}

const CAMPOS_LINEAS: { key: keyof TooltipLineasConfig; label: string; desc: string }[] = [
  { key: "mostrar_tension",     label: "Tensión (kV)",           desc: "Tensión de explotación de la línea" },
  { key: "mostrar_longitud",    label: "Longitud (km)",           desc: "Longitud del tramo" },
  { key: "mostrar_intensidad",  label: "Intensidad máx. (A)",     desc: "Intensidad nominal del tramo" },
  { key: "mostrar_resistencia", label: "Resistencia (Ω)",         desc: "Resistencia del tramo" },
  { key: "mostrar_reactancia",  label: "Reactancia (Ω)",          desc: "Reactancia del tramo" },
  { key: "mostrar_fecha_aps",   label: "Fecha puesta en servicio", desc: "Fecha de autorización de explotación" },
  { key: "mostrar_operacion",   label: "Estado (activo/abierto)", desc: "Estado habitual de operación del tramo" },
  { key: "mostrar_cini",        label: "CINI",                    desc: "Código de identificación normalizado" },
];

export default function TopologiaSettingsSection({ config, onChange }: Props) {

  const toggle = (key: keyof TooltipLineasConfig) => {
    onChange({ ...config, [key]: !config[key] });
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
        Selecciona los campos que se mostrarán al hacer clic en una línea del mapa.
        Los cambios se aplican de inmediato y se guardan automáticamente.
      </div>

      {/* Líneas */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10,
        }}>
          Tooltip — Líneas eléctricas
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {CAMPOS_LINEAS.map(({ key, label, desc }) => (
            <label key={key} style={{
              display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
              background: "var(--field-bg-soft)", border: "1px solid var(--card-border)",
              borderRadius: 8, padding: "10px 12px",
            }}>
              <input
                type="checkbox"
                checked={config[key]}
                onChange={() => toggle(key)}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{label}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
