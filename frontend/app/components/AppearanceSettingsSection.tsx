"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";

/**
 * Ajustes de aspecto (colores) vía CSS variables.
 * - Aplica overrides con document.documentElement.style.setProperty(...)
 * - Persiste en localStorage
 * - Reset global: lo dispara el padre con el evento "ui-theme-reset"
 *
 * + Presets (guardar/cargar) + export/import (JSON)
 * + BD:
 *   - Si recibes `token`, además de localStorage guarda/carga en backend (users.ui_theme_overrides)
 *   - Guardado “debounced” para no spamear la API mientras arrastras sliders
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

  const [presets, setPresets] = useState<Record<string, ThemeOverrides>>({});
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESET_ID);

  // Modo de color seleccionado (solo UI)
  const [activeModeId, setActiveModeId] = useState<"dark" | "light" | null>(null);

  // Pestañas internas de la sección Apariencia
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "mode" | "presets" | "advanced"
  >("mode");

  // Zona activa en Ajustes detallados
  const [activeDetailSection, setActiveDetailSection] = useState<
    "fondo" | "tarjetas" | "texto" | "botones" | "sidebar" | "nav"
  >("fondo");

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
          method: "PUT",
          headers: {
            ...getAuthHeaders(token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ui_theme_overrides: Object.keys(nextOverrides || {}).length
              ? nextOverrides
              : null,
          }),
        });
      } catch (err) {
        console.error("Error guardando ui_theme_overrides en backend:", err);
      }
    }, 450);
  };

  const [draftHex, setDraftHex] = useState<Record<VarKey, string>>(() => {
    const out = {} as Record<VarKey, string>;
    for (const v of vars) out[v] = "";
    return out;
  });

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
      for (const v of vars) next[v] = values[v] ?? cssFallback?.[v] ?? next[v] ?? "";
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

    if (token) {
      try {
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

  const persistPresets = (
    next: Record<string, ThemeOverrides>,
    nextActive?: string
  ) => {
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
    // Al aplicar un preset “mío”, limpiamos estado de modo de color
    setActiveModeId(null);

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
      for (const [name, presetObj] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        const clean = sanitizePresetObject(presetObj, vars);
        if (!clean) continue;
        const key = (name || "").trim();
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

  useEffect(() => {
    setMounted(true);

    const d = readDefaultsFromCss(vars);
    setDefaults(d);

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

    try {
      const ap = window.localStorage.getItem(ACTIVE_PRESET_KEY);
      if (ap && ap.trim()) setActivePresetId(ap.trim());
    } catch {
      // ignore
    }

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

    // Reset global desde page.tsx (botón "Restaurar colores")
    const onReset = () => {
      setActivePresetId(DEFAULT_PRESET_ID);
      setActiveModeId(null);
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
      const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${
        Math.round(a * 1000) / 1000
      })`;
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
    const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${
      Math.round(a * 1000) / 1000
    })`;
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
            <span>{draftAlpha[varKey] ?? currentAlphaPct(varKey)}%</span>
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

  const presetOptions = useMemo(
    () => Object.keys(presets).sort((a, b) => a.localeCompare(b)),
    [presets]
  );

  // ==============================
  // Modos de color
  // ==============================

  const DARK_MODE_OVERRIDES: ThemeOverrides = {
    "--app-bg": "#020617",
    "--main-bg": "rgba(0, 0, 0, 0)",
    "--card-bg": "#111827",
    "--card-border": "rgba(255, 255, 255, 0.08)",
    "--text": "#e5e7eb",
    "--text-muted": "rgba(228, 228, 231, 0.7)",
    "--btn-primary-bg": "#059669",
    "--btn-secondary-bg": "#4f46e5",
    "--sidebar-bg": "rgba(0, 0, 0, 0.4)",
    "--sidebar-border": "rgba(255, 255, 255, 0.08)",
    "--nav-item-bg": "rgba(255, 255, 255, 0.05)",
    "--nav-item-hover": "rgba(255, 255, 255, 0.1)",
    "--nav-item-text": "rgba(228, 228, 231, 0.95)",
    "--nav-active-bg": "#4f46e5",
    "--nav-active-text": "#ffffff",
    "--nav-sub-active-bg": "#6366f1",
  };

  const LIGHT_MODE_OVERRIDES: ThemeOverrides = {
    "--app-bg": "#f8fafc",
    "--main-bg": "rgba(255, 255, 255, 0)",
    "--card-bg": "#ffffff",
    "--card-border": "rgba(15, 23, 42, 0.1)",
    "--text": "#0f172a",
    "--text-muted": "rgba(15, 23, 42, 0.65)",
    "--btn-primary-bg": "#059669",
    "--btn-secondary-bg": "#4f46e5",
    "--sidebar-bg": "rgba(255, 255, 255, 0.6)",
    "--sidebar-border": "rgba(15, 23, 42, 0.1)",
    "--nav-item-bg": "rgba(15, 23, 42, 0.05)",
    "--nav-item-hover": "rgba(15, 23, 42, 0.08)",
    "--nav-item-text": "rgba(15, 23, 42, 0.9)",
    "--nav-active-bg": "#4f46e5",
    "--nav-active-text": "#ffffff",
    "--nav-sub-active-bg": "#6366f1",
  };

  const handleSelectMode = (mode: "dark" | "light") => {
    setActiveModeId(mode);
    // Modo de color no se guarda como preset “mío”
    setActivePresetId(DEFAULT_PRESET_ID);
    try {
      window.localStorage.setItem(ACTIVE_PRESET_KEY, DEFAULT_PRESET_ID);
    } catch {
      // ignore
    }

    const overridesToApply =
      mode === "dark" ? DARK_MODE_OVERRIDES : LIGHT_MODE_OVERRIDES;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overridesToApply));
    } catch {
      // ignore
    }

    applyFullTheme(overridesToApply);
  };

  // ==============================
  // Reset de grupo (Ajustes detallados)
  // ==============================
  const resetGroup = (keys: VarKey[]) => {
    if (!defaults) return;

    const root = document.documentElement;

    setOverrides((prev) => {
      const next = { ...prev };

      for (const k of keys) {
        const base = (defaults[k] ?? "").toString();
        if (base && base.trim() !== "") {
          next[k] = base;
          root.style.setProperty(k, base);
        } else {
          delete next[k];
          root.style.removeProperty(k);
        }
      }

      return next;
    });

    setDraftHex((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        next[k] = (defaults[k] ?? "").toString();
      }
      return next;
    });

    setDraftAlpha((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        if (k in next) {
          const base = (defaults[k] ?? "").toString();
          next[k] = alphaPctFromColorValue(base);
        }
      }
      return next;
    });
  };

  return (
    <div className="appearance-root">
      {/* Cabecera */}
      <div className="appearance-header">
        <h3 className="ui-card-title">Apariencia del panel</h3>
        <p className="ui-card-subtitle">
          Cambia los colores del panel. Se aplica al momento en todas las secciones.
        </p>
        <p className="ui-help">
          {token
            ? "✅ Guardando en local y en tu usuario (servidor)."
            : "ℹ️ Guardado solo en este navegador."}
        </p>
      </div>

      {/* Barra horizontal de pestañas */}
      <div className="mt-1 flex flex-wrap gap-2 border-b border-[color:var(--card-border)] pb-2">
        <button
          type="button"
          onClick={() => setActiveSettingsTab("mode")}
          className={[
            "ui-btn ui-btn-xs",
            activeSettingsTab === "mode" ? "ui-btn-secondary" : "ui-btn-outline",
          ].join(" ")}
        >
          Modo de color
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("presets")}
          className={[
            "ui-btn ui-btn-xs",
            activeSettingsTab === "presets" ? "ui-btn-secondary" : "ui-btn-outline",
          ].join(" ")}
        >
          Mis temas
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("advanced")}
          className={[
            "ui-btn ui-btn-xs",
            activeSettingsTab === "advanced"
              ? "ui-btn-secondary"
              : "ui-btn-outline",
          ].join(" ")}
        >
          Ajustes detallados
        </button>
      </div>

      {/* A) Modo de color */}
      {activeSettingsTab === "mode" && (
        <section className="appearance-section">
          <div className="appearance-section-header">
            <div>
              <div className="appearance-section-title">Modo de color</div>
              <p className="appearance-section-subtitle">
                Elige un modo base de color. Siempre puedes afinar abajo.
              </p>
            </div>
          </div>

          <div className="theme-mode-grid">
            <button
              type="button"
              className={[
                "theme-mode-card",
                activeModeId === "dark" ? "theme-mode-card--active" : "",
              ].join(" ")}
              onClick={() => handleSelectMode("dark")}
            >
              <div className="theme-mode-card-header">
                <span className="theme-mode-card-title">Oscuro</span>
                <span className="theme-mode-card-badge">Recomendado</span>
              </div>
              <div className="theme-mode-card-preview">
                <div className="theme-mode-card-preview-bar" />
                <div className="theme-mode-card-preview-body">
                  <div className="theme-mode-card-preview-main" />
                  <div className="theme-mode-card-preview-side" />
                </div>
              </div>
            </button>

            <button
              type="button"
              className={[
                "theme-mode-card",
                activeModeId === "light" ? "theme-mode-card--active" : "",
              ].join(" ")}
              onClick={() => handleSelectMode("light")}
            >
              <div className="theme-mode-card-header">
                <span className="theme-mode-card-title">Claro</span>
                <span className="theme-mode-card-badge">Suave</span>
              </div>
              <div className="theme-mode-card-preview">
                <div className="theme-mode-card-preview-bar" />
                <div className="theme-mode-card-preview-body">
                  <div className="theme-mode-card-preview-main" />
                  <div className="theme-mode-card-preview-side" />
                </div>
              </div>
            </button>
          </div>
        </section>
      )}

      {/* B) Mis temas (presets actuales) */}
      {activeSettingsTab === "presets" && (
        <section className="appearance-section">
          <div className="appearance-section-header">
            <div>
              <div className="appearance-section-title">Mis temas guardados</div>
              <p className="appearance-section-subtitle">
                Guarda y recupera tus propias combinaciones de colores. Se almacenan en tu
                navegador y, si aplica, en el backend.
              </p>
            </div>
          </div>

          {/* Fila 1: selector + acciones */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-[10px] ui-muted">Tema actual</label>
              <select
                className="ui-select"
                value={activePresetId}
                onChange={(e) => onSelectPreset(e.target.value)}
                aria-label="Seleccionar tema guardado"
                style={{ width: 260 }}
              >
                <option value={DEFAULT_PRESET_ID}>CSS (por defecto)</option>
                {presetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <p className="mt-1 text-[10px] ui-muted">
                {activePresetId === DEFAULT_PRESET_ID
                  ? "Usando los colores por defecto de la aplicación."
                  : "Estás usando un tema guardado. Puedes actualizarlo con tus cambios actuales."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
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
                disabled={
                  activePresetId === DEFAULT_PRESET_ID || !presets[activePresetId]
                }
              >
                Sobrescribir
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={deletePreset}
                disabled={
                  activePresetId === DEFAULT_PRESET_ID || !presets[activePresetId]
                }
              >
                Borrar
              </button>
            </div>
          </div>

          {/* Fila 2: exportar / importar */}
          <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--card-border)] pt-3 md:flex-row md:items-center md:justify-between">
            <p className="max-w-md text-[10px] ui-muted">
              Exporta tus temas a JSON para compartirlos o hacer copia de seguridad.
              Puedes importarlos más tarde en otro navegador o equipo.
            </p>

            <div className="flex flex-wrap gap-2 md:justify-end">
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
        </section>
      )}

      {/* C) Ajustes detallados */}
      {activeSettingsTab === "advanced" && (
        <section className="appearance-section">
          <div className="appearance-section-header">
            <div>
              <div className="appearance-section-title">Ajustes detallados</div>
              <p className="appearance-section-subtitle">
                Colores por sección (fondo, tarjetas, texto, botones…). No hace falta
                tocarlos para usar la app.
              </p>
              <p className="mt-1 text-[10px] ui-muted">
                Solo para ajustes finos. Cambiar estos valores afecta a toda la interfaz.
                Siempre puedes restaurar los colores desde Configuración o desde cada
                grupo.
              </p>
            </div>
          </div>

          {/* Chips de zonas */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveDetailSection("fondo")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "fondo"
                  ? "ui-btn-secondary"
                  : "ui-btn-outline",
              ].join(" ")}
            >
              Fondo
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("tarjetas")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "tarjetas"
                  ? "ui-btn-secondary"
                  : "ui-btn-outline",
              ].join(" ")}
            >
              Tarjetas
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("texto")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "texto"
                  ? "ui-btn-secondary"
                  : "ui-btn-outline",
              ].join(" ")}
            >
              Texto
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("botones")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "botones"
                  ? "ui-btn-secondary"
                  : "ui-btn-outline",
              ].join(" ")}
            >
              Botones
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("sidebar")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "sidebar"
                  ? "ui-btn-secondary"
                  : "ui-btn-outline",
              ].join(" ")}
            >
              Sidebar
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("nav")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "nav"
                  ? "ui-btn-secondary"
                  : "ui-btn-outline",
              ].join(" ")}
            >
              Navegación
            </button>
          </div>

          {/* Layout preview + controles */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {/* Columna izquierda: preview grande */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px]">
              <div className="mb-2 flex items-center justify-between">
                <span className="ui-muted">Vista previa del panel</span>
                <span className="text-[10px] ui-muted">
                  Solo visual, no afecta a datos reales.
                </span>
              </div>

              <div
                className="rounded-xl p-2"
                style={{
                  background: "var(--app-bg)",
                  color: "var(--text)",
                }}
              >
                <div
                  className="mb-2 rounded-md px-3 py-2 text-[11px] font-semibold"
                  style={{
                    background: "var(--main-bg)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  APP Medidas · Dashboard
                </div>

                <div className="flex gap-2">
                  {/* Sidebar mini */}
                  <div
                    className="flex h-32 w-24 flex-col rounded-lg border p-2"
                    style={{
                      borderColor: "var(--sidebar-border)",
                      background: "var(--sidebar-bg)",
                    }}
                  >
                    <div
                      className="mb-1 text-[10px] font-semibold truncate"
                      style={{ color: "var(--nav-item-text)" }}
                    >
                      Menú
                    </div>
                    <div className="space-y-1">
                      <div
                        className="rounded-full px-2 py-1 text-[9px]"
                        style={{
                          background: "var(--nav-item-bg)",
                          color: "var(--nav-item-text)",
                        }}
                      >
                        Item
                      </div>
                      <div
                        className="rounded-full px-2 py-1 text-[9px]"
                        style={{
                          background: "var(--nav-item-hover)",
                          color: "var(--nav-item-text)",
                        }}
                      >
                        Hover
                      </div>
                      <div
                        className="rounded-full px-2 py-1 text-[9px]"
                        style={{
                          background: "var(--nav-active-bg)",
                          color: "var(--nav-active-text)",
                        }}
                      >
                        Activo
                      </div>
                    </div>
                  </div>

                  {/* Zona de contenido */}
                  <div
                    className="flex-1 rounded-lg border p-2"
                    style={{
                      background: "var(--main-bg)",
                      borderColor: "var(--card-border)",
                    }}
                  >
                    <div
                      className="mb-2 rounded-md border p-2 text-[10px]"
                      style={{
                        background: "var(--card-bg)",
                        borderColor: "var(--card-border)",
                      }}
                    >
                      <div className="text-[10px] font-semibold">
                        Tarjeta de ejemplo
                      </div>
                      <div
                        className="mt-1 text-[9px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Texto secundario dentro de una tarjeta del panel.
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ui-btn ui-btn-primary ui-btn-xs"
                        disabled
                      >
                        Acción primaria
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary ui-btn-xs"
                        disabled
                      >
                        Acción secundaria
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[10px] ui-muted">
                Usa esta vista para ver cómo combinan los colores entre sí (fondo, tarjetas,
                sidebar, navegación y botones).
              </div>
            </div>

            {/* Columna derecha: controles por zona */}
            <div className="space-y-4">
              {activeDetailSection === "fondo" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Fondo</div>
                      <p className="text-[10px] ui-muted">
                        Colores base del fondo general de la app y del área central.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--app-bg", "--main-bg"])}
                      disabled={!defaults}
                    >
                      Restaurar fondo
                    </button>
                  </div>

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
                </div>
              )}

              {activeDetailSection === "tarjetas" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Tarjetas</div>
                      <p className="text-[10px] ui-muted">
                        Fondo y borde de las tarjetas del panel.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--card-bg", "--card-border"])}
                      disabled={!defaults}
                    >
                      Restaurar tarjetas
                    </button>
                  </div>

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
              )}

              {activeDetailSection === "texto" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Texto</div>
                      <p className="text-[10px] ui-muted">
                        Colores de texto principal y secundario en toda la app.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--text", "--text-muted"])}
                      disabled={!defaults}
                    >
                      Restaurar texto
                    </button>
                  </div>

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
              )}

              {activeDetailSection === "botones" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Botones</div>
                      <p className="text-[10px] ui-muted">
                        Colores de los botones primario y secundario.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() =>
                        resetGroup(["--btn-primary-bg", "--btn-secondary-bg"])
                      }
                      disabled={!defaults}
                    >
                      Restaurar botones
                    </button>
                  </div>

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
              )}

              {activeDetailSection === "sidebar" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Sidebar</div>
                      <p className="text-[10px] ui-muted">
                        Fondo y borde de la barra lateral de navegación.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--sidebar-bg", "--sidebar-border"])}
                      disabled={!defaults}
                    >
                      Restaurar sidebar
                    </button>
                  </div>

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
              )}

              {activeDetailSection === "nav" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Navegación</div>
                      <p className="text-[10px] ui-muted">
                        Colores de los items del menú lateral (normal, hover y activo).
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() =>
                        resetGroup([
                          "--nav-item-bg",
                          "--nav-item-hover",
                          "--nav-item-text",
                          "--nav-active-bg",
                          "--nav-active-text",
                          "--nav-sub-active-bg",
                        ])
                      }
                      disabled={!defaults}
                    >
                      Restaurar navegación
                    </button>
                  </div>

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

                  <p className="mt-2 text-[10px] ui-muted">
                    Los efectos se pueden ver en la vista previa de la izquierda (items
                    normal, hover y activo).
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 text-[10px] ui-muted">
            Todos los cambios se aplican sobre variables CSS en <code>:root</code>, así que
            afectan a toda la app.
          </div>
        </section>
      )}
    </div>
  );
}