// app/components/AppearanceSettingsSection.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";

/**
 * Ajustes de aspecto (colores) vía CSS variables.
 * - Aplica overrides con document.documentElement.style.setProperty(...)
 * - Persiste en localStorage
 * - Reset limpia overrides y vuelve a los valores del CSS (globals.css)
 *
 * + Presets (guardar/cargar) + export/import (JSON)
 *
 * + NUEVO (BD):
 * - Si recibes `token`, además de localStorage guarda/carga en backend (users.ui_theme_overrides)
 * - Guardado “debounced” para no spamear la API mientras arrastras sliders
 *
 * No toca lógica de negocio: solo UI/estilos.
 */

type VarKey =
  | "--app-bg"
  | "--main-bg"
  | "--card-bg"
  | "--card-border"
  | "--text"
  | "--text-muted"
  | "--btn-primary-bg"
  | "--btn-secondary-bg"
  | "--sidebar-bg"
  | "--sidebar-border"
  | "--nav-item-bg"
  | "--nav-item-hover"
  | "--nav-item-text"
  | "--nav-active-bg"
  | "--nav-active-text"
  | "--nav-sub-active-bg";

type ThemeOverrides = Partial<Record<VarKey, string>>;

const STORAGE_KEY = "ui_theme_overrides";

// Presets (local)
const PRESETS_KEY = "ui_theme_presets";
const ACTIVE_PRESET_KEY = "ui_theme_active_preset";
const DEFAULT_PRESET_ID = "__css_default__";

/** Normaliza HEX: "#RRGGBB"/"RRGGBB" o "#RRGGBBAA"/"RRGGBBAA" -> "#rrggbb" | "#rrggbbaa" | null */
function normalizeHexColor(input: string): string | null {
  const v = (input || "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;

  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{8}$/.test(v)) return `#${v.toLowerCase()}`;

  return null;
}

/** Valida rgb()/rgba() de forma simple (no perfecta, pero segura) */
function normalizeRgbColor(input: string): string | null {
  const v = (input || "").trim();

  // rgb(0,0,0) / rgba(0,0,0,0.5)
  const m = v.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (!m) return null;

  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;

  const hasAlpha = typeof m[4] === "string";
  if (!hasAlpha) return `rgb(${r}, ${g}, ${b})`;

  const a = Number(m[4]);
  if (Number.isNaN(a) || a < 0 || a > 1) return null;

  const aNorm = Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${aNorm})`;
}

/** Acepta HEX o rgb/rgba */
function normalizeAnyColor(input: string): string | null {
  return normalizeHexColor(input) ?? normalizeRgbColor(input);
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } | null {
  const norm = normalizeHexColor(hex);
  if (!norm) return null;

  const h = norm.replace("#", "");
  const hasAlpha = h.length === 8;

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = hasAlpha ? parseInt(h.slice(6, 8), 16) / 255 : 1;

  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

/** Convierte un valor CSS color cualquiera a rgba(r,g,b,a) si el navegador lo resuelve (fallback: null). */
function cssColorToRgba(color: string): { r: number; g: number; b: number; a: number } | null {
  if (!color) return null;

  const el = document.createElement("div");
  el.style.color = color;
  document.body.appendChild(el);

  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);

  const m = computed.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (!m) return null;

  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] === undefined ? 1 : Number(m[4]);

  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a: Math.max(0, Math.min(1, a)) };
}

/** Convierte a HEX sin alpha para alimentar <input type="color"> */
function cssColorToHex(color: string): string | null {
  const rgba = cssColorToRgba(color);
  if (!rgba) return null;

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
}

function readDefaultsFromCss(vars: VarKey[]): Record<VarKey, string> {
  const root = document.documentElement;
  const styles = getComputedStyle(root);

  const out = {} as Record<VarKey, string>;
  for (const v of vars) {
    const raw = styles.getPropertyValue(v).trim();
    out[v] = raw || "";
  }
  return out;
}

function applyOverrides(overrides: ThemeOverrides) {
  const root = document.documentElement;
  for (const [k, val] of Object.entries(overrides)) {
    if (!k) continue;
    if (typeof val !== "string") continue;
    root.style.setProperty(k, val);
  }
}

function clearOverrides(vars: VarKey[]) {
  const root = document.documentElement;
  for (const v of vars) root.style.removeProperty(v);
}

function alphaPctFromColorValue(value: string): number {
  const v = (value || "").trim();
  const normHex = normalizeHexColor(v);
  if (normHex) {
    const rgb = hexToRgb(normHex);
    if (rgb) return Math.round(rgb.a * 100);
    return 100;
  }

  const rgba = cssColorToRgba(v);
  if (rgba) return Math.round(rgba.a * 100);

  return 100;
}

/** Limpia/valida un preset importado */
function sanitizePresetObject(obj: unknown, vars: VarKey[]): ThemeOverrides | null {
  if (!obj || typeof obj !== "object") return null;
  const out: ThemeOverrides = {};
  const allowed = new Set(vars);

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!allowed.has(k as VarKey)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    out[k as VarKey] = trimmed;
  }

  return out;
}

type Props = {
  /** ✅ Pásalo desde page.tsx para habilitar guardado/carga en BD */
  token?: string | null;
};

export default function AppearanceSettingsSection({ token = null }: Props) {
  const vars: VarKey[] = useMemo(
    () => [
      "--app-bg",
      "--main-bg",
      "--card-bg",
      "--card-border",
      "--text",
      "--text-muted",
      "--btn-primary-bg",
      "--btn-secondary-bg",
      "--sidebar-bg",
      "--sidebar-border",
      "--nav-item-bg",
      "--nav-item-hover",
      "--nav-item-text",
      "--nav-active-bg",
      "--nav-active-text",
      "--nav-sub-active-bg",
    ],
    []
  );

  const [defaults, setDefaults] = useState<Record<VarKey, string> | null>(null);
  const [overrides, setOverrides] = useState<ThemeOverrides>({});
  const [mounted, setMounted] = useState(false);

  // Presets (local)
  const [presets, setPresets] = useState<Record<string, ThemeOverrides>>({});
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESET_ID);

  // Debounce guardado en backend
  const saveTimerRef = useRef<number | null>(null);
  const skipNextBackendSaveRef = useRef(false);

  const scheduleBackendSave = (nextOverrides: ThemeOverrides) => {
    if (!token) return;

    if (skipNextBackendSaveRef.current) {
      skipNextBackendSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await fetch(`${API_BASE_URL}/auth/ui-theme`, {
          // ✅ backend que tienes: PUT /auth/ui-theme
          method: "PUT",
          headers: {
            ...getAuthHeaders(token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ui_theme_overrides: Object.keys(nextOverrides || {}).length ? nextOverrides : null,
          }),
        });
      } catch (err) {
        console.error("Error guardando ui_theme_overrides en backend:", err);
      }
    }, 450);
  };

  // Inputs editables por variable
  const [draftHex, setDraftHex] = useState<Record<VarKey, string>>(() => {
    const out = {} as Record<VarKey, string>;
    for (const v of [
      "--app-bg",
      "--main-bg",
      "--card-bg",
      "--card-border",
      "--text",
      "--text-muted",
      "--btn-primary-bg",
      "--btn-secondary-bg",
      "--sidebar-bg",
      "--sidebar-border",
      "--nav-item-bg",
      "--nav-item-hover",
      "--nav-item-text",
      "--nav-active-bg",
      "--nav-active-text",
      "--nav-sub-active-bg",
    ] as VarKey[]) {
      out[v] = "";
    }
    return out;
  });

  // Alpha sliders
  const alphaEnabled = useMemo<Set<VarKey>>(
    () =>
      new Set<VarKey>([
        "--card-border",
        "--sidebar-bg",
        "--sidebar-border",
        "--nav-item-bg",
        "--nav-item-hover",
      ]),
    []
  );

  const [draftAlpha, setDraftAlpha] = useState<Record<VarKey, number>>(() => {
    const out = {} as Record<VarKey, number>;
    for (const v of [
      "--card-border",
      "--sidebar-bg",
      "--sidebar-border",
      "--nav-item-bg",
      "--nav-item-hover",
    ] as VarKey[]) {
      out[v] = 100;
    }
    return out;
  });

  const currentValue = (key: VarKey): string => {
    const ov = overrides[key];
    if (ov && ov.trim() !== "") return ov;
    if (!defaults) return "";
    return defaults[key] ?? "";
  };

  const currentHex = (key: VarKey): string => {
    const v = currentValue(key);
    if (!mounted) return "#000000";

    const norm = normalizeHexColor(v);
    if (norm) {
      const rgb = hexToRgb(norm);
      if (rgb) {
        const toHex = (n: number) => n.toString(16).padStart(2, "0");
        return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
      }
      return norm.length === 9 ? norm.slice(0, 7) : norm;
    }

    const hex = cssColorToHex(v);
    return hex ?? "#000000";
  };

  const currentAlphaPct = (key: VarKey): number => {
    if (!mounted) return 100;
    return alphaPctFromColorValue(currentValue(key));
  };

  const setVar = (key: VarKey, value: string) => {
    setOverrides((prev) => {
      const next: ThemeOverrides = { ...prev, [key]: value };
      applyOverrides({ [key]: value });
      return next;
    });
  };

  const syncDraftsFromValues = (
    values: ThemeOverrides,
    cssFallback?: Record<VarKey, string> | null
  ) => {
    setDraftHex((prev) => {
      const next = { ...prev };
      for (const v of vars) {
        next[v] = values[v] ?? cssFallback?.[v] ?? next[v] ?? "";
      }
      return next;
    });

    setDraftAlpha((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(prev) as VarKey[]) {
        const base = (values[k] ?? cssFallback?.[k] ?? "").toString();
        next[k] = alphaPctFromColorValue(base);
      }
      return next;
    });
  };

  const applyFullTheme = (theme: ThemeOverrides) => {
    clearOverrides(vars);
    applyOverrides(theme);
    setOverrides(theme);
    syncDraftsFromValues(theme, defaults);
  };

  const resetAll = async () => {
    clearOverrides(vars);
    setOverrides({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    // ✅ limpiar en backend: DELETE /auth/ui-theme (tu router lo tiene)
    if (token) {
      try {
        // evitamos que el useEffect de overrides vuelva a intentar guardar "vacío" inmediatamente
        skipNextBackendSaveRef.current = true;

        await fetch(`${API_BASE_URL}/auth/ui-theme`, {
          method: "DELETE",
          headers: getAuthHeaders(token),
        });
      } catch (err) {
        console.error("Error limpiando ui_theme_overrides en backend:", err);
      }
    }

    setTimeout(() => {
      setDraftHex((prev) => {
        const next = { ...prev };
        for (const v of vars) next[v] = (defaults?.[v] ?? "").toString();
        return next;
      });

      setDraftAlpha((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(prev) as VarKey[]) {
          const base = (defaults?.[k] ?? "").toString();
          next[k] = alphaPctFromColorValue(base);
        }
        return next;
      });
    }, 0);
  };

  const snapshotTheme = (): ThemeOverrides => {
    const snap: ThemeOverrides = {};
    for (const v of vars) {
      const val = currentValue(v);
      if (val && val.trim() !== "") snap[v] = val.trim();
    }
    return snap;
  };

  const persistPresets = (next: Record<string, ThemeOverrides>, nextActive?: string) => {
    setPresets(next);
    try {
      window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }

    if (typeof nextActive === "string") {
      setActivePresetId(nextActive);
      try {
        window.localStorage.setItem(ACTIVE_PRESET_KEY, nextActive);
      } catch {
        // ignore
      }
    }
  };

  const onSelectPreset = (id: string) => {
    if (id === DEFAULT_PRESET_ID) {
      persistPresets(presets, DEFAULT_PRESET_ID);
      void resetAll();
      return;
    }

    const preset = presets[id];
    if (!preset) return;

    persistPresets(presets, id);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
    } catch {
      // ignore
    }

    applyFullTheme(preset);
  };

  const savePresetAs = () => {
    const name = (window.prompt("Nombre del preset (único):") || "").trim();
    if (!name) return;

    const snap = snapshotTheme();
    const next = { ...presets, [name]: snap };

    persistPresets(next, name);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      // ignore
    }

    applyFullTheme(snap);
  };

  const overwritePreset = () => {
    if (!activePresetId || activePresetId === DEFAULT_PRESET_ID) return;
    if (!presets[activePresetId]) return;

    const snap = snapshotTheme();
    const next = { ...presets, [activePresetId]: snap };

    persistPresets(next, activePresetId);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      // ignore
    }

    applyFullTheme(snap);
  };

  const deletePreset = () => {
    if (!activePresetId || activePresetId === DEFAULT_PRESET_ID) return;
    if (!presets[activePresetId]) return;

    const ok = window.confirm(`¿Borrar preset "${activePresetId}"?`);
    if (!ok) return;

    const next = { ...presets };
    delete next[activePresetId];

    persistPresets(next, DEFAULT_PRESET_ID);
    void resetAll();
  };

  const exportPresets = async () => {
    const payload = JSON.stringify(presets, null, 2);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        window.alert("Presets copiados al portapapeles ✅");
        return;
      }
    } catch {
      // ignore
    }

    window.prompt("Copia este JSON:", payload);
  };

  const importPresets = () => {
    const raw = window.prompt(
      'Pega el JSON de presets (formato: { "Nombre": {"--var": "..."} })'
    );
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        window.alert("JSON inválido.");
        return;
      }

      const incoming: Record<string, ThemeOverrides> = {};
      for (const [name, presetObj] of Object.entries(parsed as Record<string, unknown>)) {
        const clean = sanitizePresetObject(presetObj, vars);
        if (!clean) continue;
        if (!name || typeof name !== "string") continue;
        const key = name.trim();
        if (!key) continue;
        incoming[key] = clean;
      }

      const merged = { ...presets, ...incoming };
      persistPresets(merged, activePresetId);
      window.alert("Presets importados ✅");
    } catch {
      window.alert("No pude parsear el JSON.");
    }
  };

  // Montaje: leer defaults, cargar overrides, aplicar + inicializar drafts + presets.
  useEffect(() => {
    setMounted(true);

    const d = readDefaultsFromCss(vars);
    setDefaults(d);

    // presets
    try {
      const rawPresets = window.localStorage.getItem(PRESETS_KEY);
      if (rawPresets) {
        const parsed = JSON.parse(rawPresets) as Record<string, unknown>;
        const clean: Record<string, ThemeOverrides> = {};
        if (parsed && typeof parsed === "object") {
          for (const [name, presetObj] of Object.entries(parsed)) {
            const sanitized = sanitizePresetObject(presetObj, vars);
            if (!sanitized) continue;
            const key = (name || "").trim();
            if (!key) continue;
            clean[key] = sanitized;
          }
        }
        setPresets(clean);
      }
    } catch {
      // ignore
    }

    // active preset
    try {
      const ap = window.localStorage.getItem(ACTIVE_PRESET_KEY);
      if (ap && ap.trim()) setActivePresetId(ap.trim());
    } catch {
      // ignore
    }

    // overrides actuales (localStorage)
    let loaded: ThemeOverrides = {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ThemeOverrides;
        if (parsed && typeof parsed === "object") {
          loaded = parsed;
          setOverrides(parsed);
          applyOverrides(parsed);
        }
      }
    } catch {
      // ignore
    }

    setDraftHex((prev) => {
      const next = { ...prev };
      for (const v of vars) next[v] = loaded[v] ?? d[v] ?? "";
      return next;
    });

    setDraftAlpha((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(prev) as VarKey[]) {
        const base = (loaded[k] ?? d[k] ?? "").toString();
        next[k] = alphaPctFromColorValue(base);
      }
      return next;
    });

    // Reset global desde page.tsx
    const onReset = () => {
      setActivePresetId(DEFAULT_PRESET_ID);
      try {
        window.localStorage.setItem(ACTIVE_PRESET_KEY, DEFAULT_PRESET_ID);
      } catch {
        // ignore
      }
      void resetAll();
    };
    window.addEventListener("ui-theme-reset", onReset as EventListener);

    return () => {
      window.removeEventListener("ui-theme-reset", onReset as EventListener);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistir overrides (localStorage) + backend (debounced)
  useEffect(() => {
    if (!mounted) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // ignore
    }

    scheduleBackendSave(overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, mounted]);

  // Helpers de UI: actualiza draft + aplica si válido
  const onHexChange = (key: VarKey, value: string) => {
    setDraftHex((prev) => ({ ...prev, [key]: value }));

    const norm = normalizeAnyColor(value);
    if (norm) setVar(key, norm);
  };

  const onHexBlur = (key: VarKey) => {
    const norm = normalizeAnyColor(draftHex[key]);
    if (norm) {
      if (draftHex[key] !== norm) setDraftHex((prev) => ({ ...prev, [key]: norm }));
      setVar(key, norm);
      return;
    }

    const fallback = currentValue(key);
    setDraftHex((prev) => ({ ...prev, [key]: fallback }));
  };

  const onPickerChange = (key: VarKey, value: string) => {
    const norm = normalizeHexColor(value);
    if (!norm) return;

    if (alphaEnabled.has(key)) {
      const pct = draftAlpha[key] ?? currentAlphaPct(key);
      const rgb = hexToRgb(norm);
      if (!rgb) return;
      const a = Math.max(0, Math.min(1, pct / 100));
      const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(a * 1000) / 1000})`;
      setDraftHex((prev) => ({ ...prev, [key]: rgba }));
      setVar(key, rgba);
      return;
    }

    setDraftHex((prev) => ({ ...prev, [key]: norm }));
    setVar(key, norm);
  };

  const onAlphaChange = (key: VarKey, pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setDraftAlpha((prev) => ({ ...prev, [key]: clamped }));

    const baseHex = currentHex(key);
    const rgb = hexToRgb(baseHex);
    if (!rgb) return;

    const a = clamped / 100;
    const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(a * 1000) / 1000})`;

    setDraftHex((prev) => ({ ...prev, [key]: rgba }));
    setVar(key, rgba);
  };

  const ColorRow = ({
    varKey,
    label,
    placeholder,
    aria,
    showAlpha,
  }: {
    varKey: VarKey;
    label: string;
    placeholder: string;
    aria: string;
    showAlpha?: boolean;
  }) => (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={currentHex(varKey)}
          onChange={(e) => onPickerChange(varKey, e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
          aria-label={`${aria} picker`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] ui-muted">{label}</div>
          <input
            type="text"
            className="ui-input mt-1"
            value={draftHex[varKey] || ""}
            onChange={(e) => onHexChange(varKey, e.target.value)}
            onBlur={() => onHexBlur(varKey)}
            placeholder={placeholder}
            aria-label={aria}
          />
        </div>
      </div>

      {showAlpha && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] ui-muted">
            <span>Alpha</span>
            <span>{(draftAlpha[varKey] ?? currentAlphaPct(varKey))}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftAlpha[varKey] ?? currentAlphaPct(varKey)}
            onChange={(e) => onAlphaChange(varKey, Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={`${aria} alpha`}
          />
        </div>
      )}
    </div>
  );

  const presetOptions = useMemo(() => {
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
    return names;
  }, [presets]);

  return (
    <section className="ui-card ui-card--border text-sm">
      <header className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-semibold">Ajustes · Aspecto</h3>
            <p className="mt-1 text-xs ui-muted">
              Personaliza colores del panel (se guarda en este navegador). Usa “Reset” para volver a
              los valores por defecto.
            </p>
          </div>

          {/* Presets (local) */}
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] ui-muted">Preset</label>
              <select
                className="ui-select"
                value={activePresetId}
                onChange={(e) => onSelectPreset(e.target.value)}
                aria-label="Seleccionar preset"
                style={{ width: 220 }}
              >
                <option value={DEFAULT_PRESET_ID}>CSS (Default)</option>
                {presetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={savePresetAs}
              >
                Guardar como…
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={overwritePreset}
                disabled={activePresetId === DEFAULT_PRESET_ID || !presets[activePresetId]}
                title={
                  activePresetId === DEFAULT_PRESET_ID
                    ? "Selecciona un preset guardado para sobrescribir"
                    : "Sobrescribe el preset actual"
                }
              >
                Sobrescribir
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={deletePreset}
                disabled={activePresetId === DEFAULT_PRESET_ID || !presets[activePresetId]}
                title="Borra el preset seleccionado"
              >
                Borrar
              </button>

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

            {token ? (
              <div className="text-[10px] ui-muted">✅ Guardando también en BD (admin/owner).</div>
            ) : (
              <div className="text-[10px] ui-muted">ℹ️ Solo local (no hay token en el componente).</div>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Fondo */}
        <div className="ui-panel">
          <div className="mb-2 text-xs font-semibold">Fondo</div>

          <ColorRow
            varKey="--app-bg"
            label="fondo general (app)"
            placeholder="#020617"
            aria="Color fondo general"
          />

          <div className="mt-3">
            <ColorRow
              varKey="--main-bg"
              label="fondo del contenido (main)"
              placeholder="rgba(...) o #rrggbbaa"
              aria="Color fondo main"
            />
          </div>

          <p className="mt-3 text-[10px] ui-muted">
            Tip: “app” es el fondo global; “main” es el fondo del área central.
          </p>
        </div>

        {/* Tarjetas */}
        <div className="ui-panel">
          <div className="mb-2 text-xs font-semibold">Tarjetas</div>

          <ColorRow
            varKey="--card-bg"
            label="fondo de tarjetas"
            placeholder="#111827"
            aria="Color fondo tarjetas"
          />

          <div className="mt-3">
            <ColorRow
              varKey="--card-border"
              label="borde de tarjetas"
              placeholder="rgba(...) o #rrggbbaa"
              aria="Color borde tarjetas"
              showAlpha
            />
          </div>
        </div>

        {/* Texto */}
        <div className="ui-panel">
          <div className="mb-2 text-xs font-semibold">Texto</div>

          <ColorRow
            varKey="--text"
            label="texto principal"
            placeholder="#e5e7eb"
            aria="Color texto principal"
          />

          <div className="mt-3">
            <ColorRow
              varKey="--text-muted"
              label="texto secundario"
              placeholder="rgba(...) o #rrggbbaa"
              aria="Color texto secundario"
            />
          </div>
        </div>

        {/* Botones */}
        <div className="ui-panel">
          <div className="mb-2 text-xs font-semibold">Botones</div>

          <ColorRow
            varKey="--btn-primary-bg"
            label="botón primario"
            placeholder="#059669"
            aria="Color botón primario"
          />

          <div className="mt-3">
            <ColorRow
              varKey="--btn-secondary-bg"
              label="botón secundario"
              placeholder="#4f46e5"
              aria="Color botón secundario"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="ui-btn ui-btn-primary" disabled>
              Primario
            </button>
            <button type="button" className="ui-btn ui-btn-secondary" disabled>
              Secundario
            </button>
            <button type="button" className="ui-btn ui-btn-outline" disabled>
              Outline
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="ui-panel">
          <div className="mb-2 text-xs font-semibold">Sidebar</div>

          <ColorRow
            varKey="--sidebar-bg"
            label="fondo sidebar"
            placeholder="rgba(...) o #rrggbbaa"
            aria="Color fondo sidebar"
            showAlpha
          />

          <div className="mt-3">
            <ColorRow
              varKey="--sidebar-border"
              label="borde sidebar"
              placeholder="rgba(...) o #rrggbbaa"
              aria="Color borde sidebar"
              showAlpha
            />
          </div>
        </div>

        {/* Navegación + Preview */}
        <div className="ui-panel">
          <div className="mb-2 text-xs font-semibold">Navegación</div>

          <ColorRow
            varKey="--nav-item-bg"
            label="fondo item (normal)"
            placeholder="rgba(...) o #rrggbbaa"
            aria="Color item normal"
            showAlpha
          />

          <div className="mt-3">
            <ColorRow
              varKey="--nav-item-hover"
              label="fondo item (hover)"
              placeholder="rgba(...) o #rrggbbaa"
              aria="Color item hover"
              showAlpha
            />
          </div>

          <div className="mt-3">
            <ColorRow
              varKey="--nav-item-text"
              label="texto item"
              placeholder="rgba(...) o #rrggbbaa"
              aria="Color texto item"
            />
          </div>

          <div className="mt-3">
            <ColorRow
              varKey="--nav-active-bg"
              label="fondo item activo"
              placeholder="#4f46e5"
              aria="Color fondo activo"
            />
          </div>

          <div className="mt-3">
            <ColorRow
              varKey="--nav-active-text"
              label="texto activo"
              placeholder="#ffffff"
              aria="Color texto activo"
            />
          </div>

          <div className="mt-3">
            <ColorRow
              varKey="--nav-sub-active-bg"
              label="fondo sub-item activo"
              placeholder="#6366f1"
              aria="Color fondo sub activo"
            />
          </div>

          {/* Preview Sidebar */}
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-[11px] ui-muted">Preview sidebar</div>

            <div
              className="rounded-xl border"
              style={{
                borderColor: "var(--sidebar-border)",
                background: "var(--sidebar-bg)",
              }}
            >
              <div className="p-3">
                <div className="text-[11px] font-semibold" style={{ color: "var(--nav-item-text)" }}>
                  APP Medidas
                </div>
                <div className="mt-2 space-y-2">
                  <div
                    className="rounded-full px-3 py-2 text-[11px]"
                    style={{
                      background: "var(--nav-item-bg)",
                      color: "var(--nav-item-text)",
                    }}
                  >
                    Item normal
                  </div>
                  <div
                    className="rounded-full px-3 py-2 text-[11px]"
                    style={{
                      background: "var(--nav-item-hover)",
                      color: "var(--nav-item-text)",
                    }}
                  >
                    Item hover (simulado)
                  </div>
                  <div
                    className="rounded-full px-3 py-2 text-[11px]"
                    style={{
                      background: "var(--nav-active-bg)",
                      color: "var(--nav-active-text)",
                    }}
                  >
                    Item activo
                  </div>
                  <div className="pl-4">
                    <div
                      className="rounded-full px-3 py-2 text-[11px]"
                      style={{
                        background: "var(--nav-sub-active-bg)",
                        color: "var(--nav-active-text)",
                      }}
                    >
                      Sub-item activo
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-[10px] ui-muted">
              Esto no cambia nada: solo sirve para ver cómo quedan tus colores.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="text-[10px] ui-muted">Se aplica al momento (variables CSS en :root).</div>

        <button
          type="button"
          onClick={() => {
            setActivePresetId(DEFAULT_PRESET_ID);
            try {
              window.localStorage.setItem(ACTIVE_PRESET_KEY, DEFAULT_PRESET_ID);
            } catch {
              // ignore
            }
            void resetAll();
          }}
          className="ui-btn ui-btn-outline ui-btn-xs"
          title="Volver a los colores por defecto"
        >
          Reset
        </button>
      </div>
    </section>
  );
}