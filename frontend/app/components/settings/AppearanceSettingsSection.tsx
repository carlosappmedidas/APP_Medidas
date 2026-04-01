"use client";
import { useMemo, useState } from "react";
import { useAppearanceTheme, type VarKey } from "./hooks/useAppearanceTheme";

// ── Tipos ──────────────────────────────────────────────────────────────────
type Props = { token?: string | null };
type NavSection =
  | "mode" | "presets"
  | "fondo" | "tarjetas" | "texto" | "botones" | "sidebar" | "nav";

// ── Paleta de colores — Opción C: barras de ramp por familia ───────────────
type ColorFamily = { label: string; ramp: string[] };

const COLOR_FAMILIES: ColorFamily[] = [
  {
    label: "Oscuros",
    ramp: ["#020b14", "#0a1628", "#0d1b2a", "#0f2236", "#1a2e45", "#1a3a5c", "#2a4a72"],
  },
  {
    label: "Grises",
    ramp: ["#111827", "#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af", "#d1d5db"],
  },
  {
    label: "Azules",
    ramp: ["#042c53", "#0c447c", "#185fa5", "#2563eb", "#60a5fa", "#93c5fd", "#dbeafe"],
  },
  {
    label: "Cian",
    ramp: ["#164e63", "#0e7490", "#0891b2", "#06b6d4", "#22d3ee", "#7dd3fc", "#e0f2fe"],
  },
  {
    label: "Morados",
    ramp: ["#26215c", "#3c3489", "#4f46e5", "#6366f1", "#818cf8", "#a5b4fc", "#ede9fe"],
  },
  {
    label: "Verdes",
    ramp: ["#04342c", "#085041", "#059669", "#10b981", "#34d399", "#6ee7b7", "#d1fae5"],
  },
  {
    label: "Ámbar",
    ramp: ["#412402", "#854f0b", "#b45309", "#f59e0b", "#fbbf24", "#fde68a", "#fef3c7"],
  },
  {
    label: "Rojos",
    ramp: ["#501313", "#a32d2d", "#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fee2e2"],
  },
  {
    label: "Claros",
    ramp: ["#e2e8f0", "#f1f5f9", "#f8fafc", "#ffffff", "#f0fdf4", "#eff6ff", "#fef3c7"],
  },
];

// Ramp de tonos por color seleccionado
function getTonesForHex(hex: string): string[] {
  const clean = hex.toLowerCase().replace("#", "");
  for (const family of COLOR_FAMILIES) {
    const idx = family.ramp.findIndex(
      (c) => c.toLowerCase().replace("#", "") === clean
    );
    if (idx !== -1) return family.ramp;
  }
  // fallback: interpolar
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return [0.25, 0.45, 0.65, 1, 1.3, 1.6, 1.9].map((f) => {
    const cl = (n: number) => Math.min(255, Math.max(0, Math.round(n * f)));
    return `#${cl(r).toString(16).padStart(2, "0")}${cl(g).toString(16).padStart(2, "0")}${cl(b).toString(16).padStart(2, "0")}`;
  });
}

function hexToRgbParts(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length < 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// Detecta si un color es claro (para ponerle borde visible)
function isLightColor(hex: string): boolean {
  const rgb = hexToRgbParts(hex);
  if (!rgb) return false;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 200;
}

// ── ColorPicker — Opción C ─────────────────────────────────────────────────
function ColorPicker({
  varKey,
  label,
  currentHexValue,
  currentAlphaValue,
  draftHexValue,
  showAlpha,
  onPickerChange,
  onHexChange,
  onHexBlur,
  onAlphaChange,
}: {
  varKey: VarKey;
  label: string;
  currentHexValue: string;
  currentAlphaValue: number;
  draftHexValue: string;
  showAlpha?: boolean;
  onPickerChange: (key: VarKey, hex: string) => void;
  onHexChange: (key: VarKey, val: string) => void;
  onHexBlur: (key: VarKey) => void;
  onAlphaChange: (key: VarKey, pct: number) => void;
}) {
  const [tones, setTones] = useState<string[]>(() =>
    getTonesForHex(currentHexValue)
  );
  const swatchBg = draftHexValue || currentHexValue;
  const rgb = hexToRgbParts(currentHexValue);
  const alphaTrack = rgb
    ? `linear-gradient(to right, transparent, rgb(${rgb.r},${rgb.g},${rgb.b}))`
    : "linear-gradient(to right, transparent, #ffffff)";

  function handlePick(hex: string) {
    setTones(getTonesForHex(hex));
    onPickerChange(varKey, hex);
  }

  const isActive = (c: string) =>
    currentHexValue.toLowerCase() === c.toLowerCase();

  return (
    <div
      style={{
        border: "1px solid var(--card-border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--card-bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--card-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: swatchBg,
            border: `1px solid ${isLightColor(swatchBg) ? "rgba(0,0,0,0.15)" : "var(--card-border)"}`,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {draftHexValue || currentHexValue}
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ── Familias de color (ramps) ── */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 6,
            }}
          >
            Familia de color
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {COLOR_FAMILIES.map((family) => (
              <div
                key={family.label}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {/* Etiqueta familia */}
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    width: 38,
                    flexShrink: 0,
                    fontFamily: "monospace",
                    letterSpacing: "0.02em",
                  }}
                >
                  {family.label}
                </span>
                {/* Barras de ramp */}
                <div style={{ display: "flex", gap: 2, flex: 1 }}>
                  {family.ramp.map((c) => {
                    const active = isActive(c);
                    const light = isLightColor(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        onClick={() => handlePick(c)}
                        style={{
                          flex: 1,
                          height: active ? 20 : 14,
                          borderRadius: 3,
                          background: c,
                          border: active
                            ? "1.5px solid var(--text)"
                            : light
                            ? "0.5px solid rgba(0,0,0,0.12)"
                            : "0.5px solid transparent",
                          cursor: "pointer",
                          padding: 0,
                          transition: "height 80ms",
                        }}
                        aria-label={c}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tonos del color activo ── */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 5,
            }}
          >
            Tonos
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {tones.map((c) => {
              const active = isActive(c);
              const light = isLightColor(c);
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => handlePick(c)}
                  style={{
                    flex: 1,
                    height: active ? 20 : 14,
                    borderRadius: 3,
                    background: c,
                    border: active
                      ? "1.5px solid var(--text)"
                      : light
                      ? "0.5px solid rgba(0,0,0,0.12)"
                      : "0.5px solid transparent",
                    cursor: "pointer",
                    padding: 0,
                    transition: "height 80ms",
                  }}
                  aria-label={c}
                />
              );
            })}
          </div>
        </div>

        {/* ── Slider alpha ── */}
        {showAlpha && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              <span>Transparencia (alpha)</span>
              <span>{currentAlphaValue}%</span>
            </div>
            <div
              style={{
                position: "relative",
                height: 10,
                borderRadius: 5,
                backgroundImage:
                  "repeating-conic-gradient(#888 0% 25%, transparent 0% 50%)",
                backgroundSize: "8px 8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 5,
                  background: alphaTrack,
                }}
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={currentAlphaValue}
                onChange={(e) => onAlphaChange(varKey, Number(e.target.value))}
                className="mt-1 w-full"
                style={{
                  position: "relative",
                  zIndex: 2,
                  width: "100%",
                  height: 10,
                  background: "transparent",
                  WebkitAppearance: "none",
                }}
                aria-label={`${label} alpha`}
              />
            </div>
          </div>
        )}

        {/* ── Input hex/rgba ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Código de color
          </div>
          <input
            type="text"
            className="ui-input"
            style={{ fontFamily: "monospace", fontSize: 12 }}
            value={draftHexValue || ""}
            onChange={(e) => onHexChange(varKey, e.target.value)}
            onBlur={() => onHexBlur(varKey)}
            placeholder="#rrggbb o rgba(r,g,b,a)"
            aria-label={`${label} código`}
          />
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            Acepta hex (#rrggbb), hex+alpha (#rrggbbaa) y rgba(r,g,b,a)
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Vista previa mini ──────────────────────────────────────────────────────
function MiniPreview({
  highlight,
}: {
  highlight: "fondo" | "tarjetas" | "texto" | "botones" | "sidebar" | "nav";
}) {
  const hl = (zone: typeof highlight) =>
    highlight === zone ? "2px solid var(--btn-primary-bg)" : "none";

  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--card-border)",
      }}
    >
      <div
        style={{
          background: "var(--sidebar-bg)",
          height: 9,
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      />
      <div style={{ display: "flex", minHeight: 105, background: "var(--app-bg)" }}>
        {/* sidebar */}
        <div
          style={{
            width: 58,
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--sidebar-border)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            outline: highlight === "sidebar" || highlight === "nav" ? hl("sidebar") : "none",
            outlineOffset: -2,
          }}
        >
          <div style={{ height: 12, borderRadius: 10, background: "var(--nav-item-bg)", outline: highlight === "nav" ? hl("nav") : "none", outlineOffset: -1 }} />
          <div style={{ height: 12, borderRadius: 10, background: "var(--nav-item-hover)", outline: highlight === "nav" ? hl("nav") : "none", outlineOffset: -1 }} />
          <div style={{ height: 12, borderRadius: 10, background: "var(--nav-active-bg)" }}>
            <span style={{ fontSize: 7, color: "var(--nav-active-text)", lineHeight: "12px", padding: "0 4px", display: "block" }}>Activo</span>
          </div>
        </div>
        {/* main */}
        <div
          style={{
            flex: 1,
            padding: 6,
            background: "var(--main-bg)",
            outline: hl("fondo"),
            outlineOffset: -2,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 6,
              padding: 7,
              outline: hl("tarjetas"),
              outlineOffset: -2,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text)", marginBottom: 2, outline: hl("texto"), outlineOffset: -1 }}>
              Tarjeta ejemplo
            </div>
            <div style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 5 }}>
              Texto secundario
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <div style={{ height: 12, width: 36, borderRadius: 10, background: "var(--btn-primary-bg)", outline: hl("botones"), outlineOffset: -1 }} />
              <div style={{ height: 12, width: 36, borderRadius: 10, background: "var(--btn-secondary-bg)", outline: hl("botones"), outlineOffset: -1 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── VarSection ─────────────────────────────────────────────────────────────
function VarSection({
  title,
  subtitle,
  variables,
  onReset,
  defaults,
  highlight,
  currentHex,
  currentAlphaPct,
  draftHex,
  onPickerChange,
  onHexChange,
  onHexBlur,
  onAlphaChange,
  alphaEnabled,
  extraContent,
}: {
  title: string;
  subtitle: string;
  variables: { key: VarKey; label: string; placeholder: string }[];
  onReset: () => void;
  defaults: Record<VarKey, string> | null;
  highlight: "fondo" | "tarjetas" | "texto" | "botones" | "sidebar" | "nav";
  currentHex: (key: VarKey) => string;
  currentAlphaPct: (key: VarKey) => number;
  draftHex: Record<VarKey, string>;
  onPickerChange: (key: VarKey, hex: string) => void;
  onHexChange: (key: VarKey, val: string) => void;
  onHexBlur: (key: VarKey) => void;
  onAlphaChange: (key: VarKey, pct: number) => void;
  alphaEnabled: ReadonlySet<VarKey>;
  extraContent?: React.ReactNode;
}) {
  const [activeVar, setActiveVar] = useState<VarKey>(variables[0].key);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {subtitle}
          </div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-ghost ui-btn-xs"
          onClick={onReset}
          disabled={!defaults}
        >
          Restaurar
        </button>
      </div>

      {/* 2 columnas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Izquierda: lista + preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {variables.map(({ key, label }) => {
            const isActive = activeVar === key;
            const swBg = draftHex[key] || currentHex(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveVar(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: isActive
                    ? "1.5px solid var(--text)"
                    : "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: swBg,
                    border: `1px solid ${isLightColor(swBg) ? "rgba(0,0,0,0.15)" : "var(--card-border)"}`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {draftHex[key] || currentHex(key)}
                  </div>
                </div>
              </button>
            );
          })}

          {extraContent}

          <div style={{ marginTop: 4 }}>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 5 }}
            >
              Vista previa
            </div>
            <MiniPreview highlight={highlight} />
          </div>
        </div>

        {/* Derecha: ColorPicker */}
        <ColorPicker
          key={activeVar}
          varKey={activeVar}
          label={variables.find((v) => v.key === activeVar)?.label ?? activeVar}
          currentHexValue={currentHex(activeVar)}
          currentAlphaValue={currentAlphaPct(activeVar)}
          draftHexValue={draftHex[activeVar] || ""}
          showAlpha={alphaEnabled.has(activeVar)}
          onPickerChange={onPickerChange}
          onHexChange={onHexChange}
          onHexBlur={onHexBlur}
          onAlphaChange={onAlphaChange}
        />
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function AppearanceSettingsSection({ token = null }: Props) {
  const {
    defaults,
    presets,
    activePresetId,
    activeModeId,
    draftHex,
    currentHex,
    currentAlphaPct,
    onHexChange,
    onHexBlur,
    onPickerChange,
    onAlphaChange,
    resetGroup,
    onSelectPreset,
    savePresetAs,
    overwritePreset,
    deletePreset,
    exportPresets,
    importPresets,
    handleSelectMode,
    presetOptions,
    constants,
    alphaEnabled,
  } = useAppearanceTheme({ token });

  const DEFAULT_PRESET_ID = constants?.DEFAULT_PRESET_ID ?? "__css_default__";
  const [activeNav, setActiveNav] = useState<NavSection>("mode");

  const presetDisabled = useMemo(
    () => activePresetId === DEFAULT_PRESET_ID || !presets[activePresetId],
    [activePresetId, presets, DEFAULT_PRESET_ID]
  );

  const navGroups: {
    label: string;
    items: { id: NavSection; icon: string; label: string }[];
  }[] = [
    {
      label: "General",
      items: [
        { id: "mode", icon: "◑", label: "Modo de color" },
        { id: "presets", icon: "◈", label: "Mis temas" },
      ],
    },
    {
      label: "Ajuste fino",
      items: [
        { id: "fondo", icon: "▣", label: "Fondo" },
        { id: "tarjetas", icon: "▤", label: "Tarjetas" },
        { id: "texto", icon: "T", label: "Texto" },
        { id: "botones", icon: "⬡", label: "Botones" },
        { id: "sidebar", icon: "▏", label: "Sidebar" },
        { id: "nav", icon: "≡", label: "Navegación" },
      ],
    },
  ];

  return (
    <div className="appearance-root">

      {/* Info guardado */}
      <p className="ui-help mb-3" style={{ fontSize: 11 }}>
        {token
          ? "✅ Guardando en local y en tu usuario (servidor)."
          : "ℹ️ Guardado solo en este navegador."}
      </p>

      {/* Layout principal */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "164px 1fr",
          gap: "1.5rem",
          minHeight: 520,
        }}
      >

        {/* ── Sidebar nav ─────────────────────────────────────────────── */}
        <div
          style={{
            borderRight: "1px solid var(--card-border)",
            paddingRight: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {navGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && (
                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid var(--card-border)",
                    margin: "6px 0",
                  }}
                />
              )}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 4,
                  marginTop: gi === 0 ? 0 : 4,
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: "pointer",
                      border: "none",
                      background: isActive ? "var(--nav-item-hover)" : "transparent",
                      color: isActive ? "var(--text)" : "var(--text-muted)",
                      fontWeight: isActive ? 500 : 400,
                      width: "100%",
                      textAlign: "left",
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        width: 16,
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Contenido ───────────────────────────────────────────────── */}
        <div>

          {/* MODO DE COLOR */}
          {activeNav === "mode" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  Modo de color
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  Elige la base de la paleta. Luego puedes afinar cada color en detalle.
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                {(
                  [
                    { id: "slate" as const, name: "Predeterminado", badge: "Slate azulado", bg: "#0d1b2a", bar: "#1a2e45", accent: "#2563eb", side: "#1a2e45", main: "#1a3a5c", isLight: false },
                    { id: "dark"  as const, name: "Oscuro",         badge: "Negro puro",    bg: "#111111", bar: "#222222", accent: "#6366f1", side: "#1a1a1a", main: "#1c1c1c", isLight: false },
                    { id: "light" as const, name: "Claro",          badge: "Fondo blanco",  bg: "#f8fafc", bar: "#e2e8f0", accent: "#059669", side: "#e2e8f0", main: "#ffffff", isLight: true  },
                  ] as const
                ).map((mode) => {
                  const isActive = activeModeId === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleSelectMode(mode.id)}
                      style={{
                        border: isActive
                          ? "2px solid var(--text)"
                          : "1px solid var(--card-border)",
                        borderRadius: 12,
                        padding: 14,
                        cursor: "pointer",
                        background: "var(--card-bg)",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                        {mode.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
                        {mode.badge}
                      </div>
                      <div
                        style={{
                          borderRadius: 6,
                          overflow: "hidden",
                          height: 52,
                          position: "relative",
                          background: mode.bg,
                          border: mode.isLight ? "1px solid #e2e8f0" : "none",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0, left: 0, right: 0,
                            height: 11,
                            background: mode.bar,
                            display: "flex",
                            alignItems: "center",
                            padding: "0 6px",
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 5,
                              borderRadius: 3,
                              background: mode.accent,
                            }}
                          />
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            top: 11, bottom: 0, left: 0, right: 0,
                            display: "flex",
                            gap: 3,
                            padding: 3,
                          }}
                        >
                          <div style={{ width: 22, background: mode.side, borderRadius: 3 }} />
                          <div
                            style={{
                              flex: 1,
                              background: mode.main,
                              borderRadius: 3,
                              border: mode.isLight ? "0.5px solid #e2e8f0" : "none",
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MIS TEMAS */}
          {activeNav === "presets" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  Mis temas guardados
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  Guarda y recupera tus propias combinaciones. Se almacenan en navegador y servidor.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Tema activo
                  </label>
                  <select
                    className="ui-select"
                    value={activePresetId}
                    onChange={(e) => onSelectPreset(e.target.value)}
                    aria-label="Seleccionar tema guardado"
                    style={{ width: 260 }}
                  >
                    <option value={DEFAULT_PRESET_ID}>CSS (por defecto)</option>
                    {presetOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    {activePresetId === DEFAULT_PRESET_ID
                      ? "Usando los colores por defecto de la aplicación."
                      : "Estás usando un tema guardado. Puedes actualizarlo con tus cambios."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary ui-btn-xs"
                    onClick={savePresetAs}
                  >
                    Guardar como…
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={overwritePreset}
                    disabled={presetDisabled}
                  >
                    Sobrescribir
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={deletePreset}
                    disabled={presetDisabled}
                  >
                    Borrar
                  </button>
                </div>
              </div>
              <div
                style={{
                  borderTop: "1px solid var(--card-border)",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <p style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 400 }}>
                  Exporta tus temas a JSON para compartirlos o hacer copia de seguridad.
                  Puedes importarlos en otro navegador o equipo.
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={exportPresets}
                  >
                    Exportar
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline ui-btn-xs"
                    onClick={importPresets}
                  >
                    Importar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FONDO */}
          {activeNav === "fondo" && (
            <VarSection
              title="Fondo"
              subtitle="Colores base del fondo general de la app y del área central."
              highlight="fondo"
              variables={[
                { key: "--app-bg",  label: "Fondo general (app)",       placeholder: "#020617" },
                { key: "--main-bg", label: "Fondo del contenido (main)", placeholder: "rgba(...) o #rrggbbaa" },
              ]}
              onReset={() => resetGroup(["--app-bg", "--main-bg"])}
              defaults={defaults}
              currentHex={currentHex}
              currentAlphaPct={currentAlphaPct}
              draftHex={draftHex}
              onPickerChange={onPickerChange}
              onHexChange={onHexChange}
              onHexBlur={onHexBlur}
              onAlphaChange={onAlphaChange}
              alphaEnabled={alphaEnabled}
            />
          )}

          {/* TARJETAS */}
          {activeNav === "tarjetas" && (
            <VarSection
              title="Tarjetas"
              subtitle="Fondo y borde de las tarjetas del panel."
              highlight="tarjetas"
              variables={[
                { key: "--card-bg",     label: "Fondo de tarjetas", placeholder: "#111827" },
                { key: "--card-border", label: "Borde de tarjetas", placeholder: "rgba(...) o #rrggbbaa" },
              ]}
              onReset={() => resetGroup(["--card-bg", "--card-border"])}
              defaults={defaults}
              currentHex={currentHex}
              currentAlphaPct={currentAlphaPct}
              draftHex={draftHex}
              onPickerChange={onPickerChange}
              onHexChange={onHexChange}
              onHexBlur={onHexBlur}
              onAlphaChange={onAlphaChange}
              alphaEnabled={alphaEnabled}
            />
          )}

          {/* TEXTO */}
          {activeNav === "texto" && (
            <VarSection
              title="Texto"
              subtitle="Colores de texto principal y secundario en toda la app."
              highlight="texto"
              variables={[
                { key: "--text",       label: "Texto principal",   placeholder: "#e5e7eb" },
                { key: "--text-muted", label: "Texto secundario",  placeholder: "rgba(...) o #rrggbbaa" },
              ]}
              onReset={() => resetGroup(["--text", "--text-muted"])}
              defaults={defaults}
              currentHex={currentHex}
              currentAlphaPct={currentAlphaPct}
              draftHex={draftHex}
              onPickerChange={onPickerChange}
              onHexChange={onHexChange}
              onHexBlur={onHexBlur}
              onAlphaChange={onAlphaChange}
              alphaEnabled={alphaEnabled}
            />
          )}

          {/* BOTONES */}
          {activeNav === "botones" && (
            <VarSection
              title="Botones"
              subtitle="Colores de los botones primario y secundario."
              highlight="botones"
              variables={[
                { key: "--btn-primary-bg",   label: "Botón primario",   placeholder: "#059669" },
                { key: "--btn-secondary-bg", label: "Botón secundario", placeholder: "#4f46e5" },
              ]}
              onReset={() => resetGroup(["--btn-primary-bg", "--btn-secondary-bg"])}
              defaults={defaults}
              currentHex={currentHex}
              currentAlphaPct={currentAlphaPct}
              draftHex={draftHex}
              onPickerChange={onPickerChange}
              onHexChange={onHexChange}
              onHexBlur={onHexBlur}
              onAlphaChange={onAlphaChange}
              alphaEnabled={alphaEnabled}
              extraContent={
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  <button type="button" className="ui-btn ui-btn-primary" disabled>Primario</button>
                  <button type="button" className="ui-btn ui-btn-secondary" disabled>Secundario</button>
                  <button type="button" className="ui-btn ui-btn-outline" disabled>Outline</button>
                </div>
              }
            />
          )}

          {/* SIDEBAR */}
          {activeNav === "sidebar" && (
            <VarSection
              title="Sidebar"
              subtitle="Fondo y borde de la barra lateral de navegación."
              highlight="sidebar"
              variables={[
                { key: "--sidebar-bg",     label: "Fondo sidebar", placeholder: "rgba(...) o #rrggbbaa" },
                { key: "--sidebar-border", label: "Borde sidebar", placeholder: "rgba(...) o #rrggbbaa" },
              ]}
              onReset={() => resetGroup(["--sidebar-bg", "--sidebar-border"])}
              defaults={defaults}
              currentHex={currentHex}
              currentAlphaPct={currentAlphaPct}
              draftHex={draftHex}
              onPickerChange={onPickerChange}
              onHexChange={onHexChange}
              onHexBlur={onHexBlur}
              onAlphaChange={onAlphaChange}
              alphaEnabled={alphaEnabled}
            />
          )}

          {/* NAVEGACIÓN */}
          {activeNav === "nav" && (
            <VarSection
              title="Navegación"
              subtitle="Colores de los items del menú lateral (normal, hover y activo)."
              highlight="nav"
              variables={[
                { key: "--nav-item-bg",      label: "Item normal",     placeholder: "rgba(...) o #rrggbbaa" },
                { key: "--nav-item-hover",   label: "Item hover",      placeholder: "rgba(...) o #rrggbbaa" },
                { key: "--nav-item-text",    label: "Texto item",      placeholder: "rgba(...) o #rrggbbaa" },
                { key: "--nav-active-bg",    label: "Item activo",     placeholder: "#4f46e5" },
                { key: "--nav-active-text",  label: "Texto activo",    placeholder: "#ffffff" },
                { key: "--nav-sub-active-bg",label: "Sub-item activo", placeholder: "#6366f1" },
              ]}
              onReset={() =>
                resetGroup([
                  "--nav-item-bg",
                  "--nav-item-hover",
                  "--nav-item-text",
                  "--nav-active-bg",
                  "--nav-active-text",
                  "--nav-sub-active-bg",
                ])
              }
              defaults={defaults}
              currentHex={currentHex}
              currentAlphaPct={currentAlphaPct}
              draftHex={draftHex}
              onPickerChange={onPickerChange}
              onHexChange={onHexChange}
              onHexBlur={onHexBlur}
              onAlphaChange={onAlphaChange}
              alphaEnabled={alphaEnabled}
            />
          )}

        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-muted)" }}>
        Todos los cambios se aplican sobre variables CSS en <code>:root</code> y afectan a toda la app.
      </div>
    </div>
  );
}
