"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";

export type VarKey =
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

export type ThemeOverrides = Partial<Record<VarKey, string>>;
export type AppearanceSettingsTab = "mode" | "presets" | "advanced";
export type AppearanceDetailSection =
  | "fondo"
  | "tarjetas"
  | "texto"
  | "botones"
  | "sidebar"
  | "nav";

const STORAGE_KEY = "ui_theme_overrides";
const PRESETS_KEY = "ui_theme_presets";
const ACTIVE_PRESET_KEY = "ui_theme_active_preset";
const DEFAULT_PRESET_ID = "__css_default__";

const ALL_THEME_VARS: VarKey[] = [
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
];

const ALPHA_ENABLED_KEYS: VarKey[] = [
  "--card-border",
  "--sidebar-bg",
  "--sidebar-border",
  "--nav-item-bg",
  "--nav-item-hover",
];

// ── Paleta predeterminada: Slate Electric ──────────────────────────────────
const SLATE_ELECTRIC_OVERRIDES: ThemeOverrides = {
  "--app-bg": "#0d1b2a",
  "--main-bg": "rgba(0, 0, 0, 0)",
  "--card-bg": "#1a2e45",
  "--card-border": "rgba(30, 58, 95, 0.8)",
  "--text": "#e2e8f0",
  "--text-muted": "rgba(226, 232, 240, 0.65)",
  "--btn-primary-bg": "#059669",
  "--btn-secondary-bg": "#2563eb",
  "--sidebar-bg": "rgba(13, 27, 42, 0.95)",
  "--sidebar-border": "rgba(30, 58, 95, 0.6)",
  "--nav-item-bg": "rgba(30, 58, 95, 0.25)",
  "--nav-item-hover": "rgba(30, 58, 95, 0.5)",
  "--nav-item-text": "rgba(226, 232, 240, 0.95)",
  "--nav-active-bg": "#2563eb",
  "--nav-active-text": "#ffffff",
  "--nav-sub-active-bg": "#3b82f6",
};
// ───────────────────────────────────────────────────────────────────────────

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

function normalizeHexColor(input: string): string | null {
  const v = (input || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{8}$/.test(v)) return `#${v.toLowerCase()}`;
  return null;
}

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

function cssColorToRgba(color: string): { r: number; g: number; b: number; a: number } | null {
  if (!color || typeof document === "undefined") return null;
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

function applyOverrides(overrides: ThemeOverrides): void {
  const root = document.documentElement;
  for (const [k, val] of Object.entries(overrides)) {
    if (!k || typeof val !== "string") continue;
    root.style.setProperty(k, val);
  }
}

function clearOverrides(vars: readonly VarKey[]): void {
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

function sanitizePresetObject(obj: unknown, vars: readonly VarKey[]): ThemeOverrides | null {
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

type UseAppearanceThemeParams = {
  token?: string | null;
};

type UseAppearanceThemeResult = {
  vars: readonly VarKey[];
  alphaEnabled: ReadonlySet<VarKey>;
  mounted: boolean;
  defaults: Record<VarKey, string> | null;
  overrides: ThemeOverrides;
  presets: Record<string, ThemeOverrides>;
  activePresetId: string;
  activeModeId: "dark" | "light" | "slate" | null;
  activeSettingsTab: AppearanceSettingsTab;
  activeDetailSection: AppearanceDetailSection;
  draftHex: Record<VarKey, string>;
  draftAlpha: Record<VarKey, number>;
  setActivePresetId: React.Dispatch<React.SetStateAction<string>>;
  setActiveModeId: React.Dispatch<React.SetStateAction<"dark" | "light" | "slate" | null>>;
  setActiveSettingsTab: React.Dispatch<React.SetStateAction<AppearanceSettingsTab>>;
  setActiveDetailSection: React.Dispatch<React.SetStateAction<AppearanceDetailSection>>;
  setDraftHex: React.Dispatch<React.SetStateAction<Record<VarKey, string>>>;
  setDraftAlpha: React.Dispatch<React.SetStateAction<Record<VarKey, number>>>;
  currentValue: (key: VarKey) => string;
  currentHex: (key: VarKey) => string;
  currentAlphaPct: (key: VarKey) => number;
  onHexChange: (key: VarKey, value: string) => void;
  onHexBlur: (key: VarKey) => void;
  onPickerChange: (key: VarKey, value: string) => void;
  onAlphaChange: (key: VarKey, pct: number) => void;
  resetAll: () => Promise<void>;
  resetGroup: (keys: VarKey[]) => void;
  applyFullTheme: (theme: ThemeOverrides) => void;
  snapshotTheme: () => ThemeOverrides;
  onSelectPreset: (id: string) => void;
  savePresetAs: () => void;
  overwritePreset: () => void;
  deletePreset: () => void;
  exportPresets: () => Promise<void>;
  importPresets: () => void;
  handleSelectMode: (mode: "dark" | "light" | "slate") => void;
  presetOptions: string[];
  constants: {
    STORAGE_KEY: string;
    PRESETS_KEY: string;
    ACTIVE_PRESET_KEY: string;
    DEFAULT_PRESET_ID: string;
    DARK_MODE_OVERRIDES: ThemeOverrides;
    LIGHT_MODE_OVERRIDES: ThemeOverrides;
    SLATE_ELECTRIC_OVERRIDES: ThemeOverrides;
  };
};

export function useAppearanceTheme(
  { token = null }: UseAppearanceThemeParams = {}
): UseAppearanceThemeResult {
  const vars = useMemo(() => ALL_THEME_VARS, []);
  const alphaEnabled = useMemo(() => new Set<VarKey>(ALPHA_ENABLED_KEYS), []);

  const [defaults, setDefaults] = useState<Record<VarKey, string> | null>(null);
  const [overrides, setOverrides] = useState<ThemeOverrides>({});
  const [mounted, setMounted] = useState(false);
  const [presets, setPresets] = useState<Record<string, ThemeOverrides>>({});
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [activeModeId, setActiveModeId] = useState<"dark" | "light" | "slate" | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<AppearanceSettingsTab>("mode");
  const [activeDetailSection, setActiveDetailSection] = useState<AppearanceDetailSection>("fondo");

  const saveTimerRef = useRef<number | null>(null);
  const skipNextBackendSaveRef = useRef(false);

  const [draftHex, setDraftHex] = useState<Record<VarKey, string>>(() => {
    const out = {} as Record<VarKey, string>;
    for (const v of ALL_THEME_VARS) out[v] = "";
    return out;
  });

  const [draftAlpha, setDraftAlpha] = useState<Record<VarKey, number>>(() => {
    const out = {} as Record<VarKey, number>;
    for (const v of ALPHA_ENABLED_KEYS) out[v] = 100;
    return out;
  });

  const scheduleBackendSave = (nextOverrides: ThemeOverrides): void => {
    if (!token) return;
    if (skipNextBackendSaveRef.current) {
      skipNextBackendSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await fetch(`${API_BASE_URL}/auth/ui-theme`, {
          method: "PUT",
          headers: {
            ...getAuthHeaders(token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ui_theme_overrides: Object.keys(nextOverrides).length ? nextOverrides : null,
          }),
        });
      } catch (err) {
        console.error("Error guardando ui_theme_overrides en backend:", err);
      }
    }, 450);
  };

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

  const syncDraftsFromValues = (
    values: ThemeOverrides,
    cssFallback?: Record<VarKey, string> | null
  ): void => {
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

  const setVar = (key: VarKey, value: string): void => {
    setOverrides((prev) => {
      const next: ThemeOverrides = { ...prev, [key]: value };
      applyOverrides({ [key]: value });
      return next;
    });
  };

  const applyFullTheme = (theme: ThemeOverrides): void => {
    clearOverrides(vars);
    applyOverrides(theme);
    setOverrides(theme);
    syncDraftsFromValues(theme, defaults);
  };

  const resetAll = async (): Promise<void> => {
    clearOverrides(vars);
    setOverrides({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      //
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
    window.setTimeout(() => {
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
  ): void => {
    setPresets(next);
    try {
      window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      //
    }
    if (typeof nextActive === "string") {
      setActivePresetId(nextActive);
      try {
        window.localStorage.setItem(ACTIVE_PRESET_KEY, nextActive);
      } catch {
        //
      }
    }
  };

  const onSelectPreset = (id: string): void => {
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
      //
    }
    applyFullTheme(preset);
  };

  const savePresetAs = (): void => {
    const name = (window.prompt("Nombre del preset (único):") || "").trim();
    if (!name) return;
    const snap = snapshotTheme();
    const next = { ...presets, [name]: snap };
    persistPresets(next, name);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      //
    }
    applyFullTheme(snap);
  };

  const overwritePreset = (): void => {
    if (!activePresetId || activePresetId === DEFAULT_PRESET_ID) return;
    if (!presets[activePresetId]) return;
    const snap = snapshotTheme();
    const next = { ...presets, [activePresetId]: snap };
    persistPresets(next, activePresetId);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      //
    }
    applyFullTheme(snap);
  };

  const deletePreset = (): void => {
    if (!activePresetId || activePresetId === DEFAULT_PRESET_ID) return;
    if (!presets[activePresetId]) return;
    const ok = window.confirm(`¿Borrar preset "${activePresetId}"?`);
    if (!ok) return;
    const next = { ...presets };
    delete next[activePresetId];
    persistPresets(next, DEFAULT_PRESET_ID);
    void resetAll();
  };

  const exportPresets = async (): Promise<void> => {
    const payload = JSON.stringify(presets, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        window.alert("Presets copiados al portapapeles ✅");
        return;
      }
    } catch {
      //
    }
    window.prompt("Copia este JSON:", payload);
  };

  const importPresets = (): void => {
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

  const handleSelectMode = (mode: "dark" | "light" | "slate"): void => {
    setActiveModeId(mode);
    setActivePresetId(DEFAULT_PRESET_ID);
    try {
      window.localStorage.setItem(ACTIVE_PRESET_KEY, DEFAULT_PRESET_ID);
    } catch {
      //
    }
    const overridesToApply =
      mode === "dark"
        ? DARK_MODE_OVERRIDES
        : mode === "light"
        ? LIGHT_MODE_OVERRIDES
        : SLATE_ELECTRIC_OVERRIDES;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overridesToApply));
    } catch {
      //
    }
    applyFullTheme(overridesToApply);
  };

  const resetGroup = (keys: VarKey[]): void => {
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

  const onHexChange = (key: VarKey, value: string): void => {
    setDraftHex((prev) => ({ ...prev, [key]: value }));
    const norm = normalizeAnyColor(value);
    if (norm) setVar(key, norm);
  };

  const onHexBlur = (key: VarKey): void => {
    const norm = normalizeAnyColor(draftHex[key]);
    if (norm) {
      if (draftHex[key] !== norm) {
        setDraftHex((prev) => ({ ...prev, [key]: norm }));
      }
      setVar(key, norm);
      return;
    }
    const fallback = currentValue(key);
    setDraftHex((prev) => ({ ...prev, [key]: fallback }));
  };

  const onPickerChange = (key: VarKey, value: string): void => {
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

  const onAlphaChange = (key: VarKey, pct: number): void => {
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
      //
    }

    try {
      const ap = window.localStorage.getItem(ACTIVE_PRESET_KEY);
      if (ap && ap.trim()) {
        setActivePresetId(ap.trim());
      }
    } catch {
      //
    }

    // ── Carga del tema guardado ───────────────────────────────────────────
    let loaded: ThemeOverrides = {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ThemeOverrides;
        // Solo usar si tiene al menos una variable real (ignorar {} vacío)
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          loaded = parsed;
          setOverrides(parsed);
          applyOverrides(parsed);
        }
      }
    } catch {
      //
    }

    // ── Si no hay nada válido guardado → Slate Electric por defecto ───────
    if (!Object.keys(loaded).length) {
      applyOverrides(SLATE_ELECTRIC_OVERRIDES);
      setOverrides(SLATE_ELECTRIC_OVERRIDES);
      setActiveModeId("slate");
      loaded = SLATE_ELECTRIC_OVERRIDES;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SLATE_ELECTRIC_OVERRIDES));
      } catch {
        //
      }
    }
    // ─────────────────────────────────────────────────────────────────────

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

    const onReset = (): void => {
      setActivePresetId(DEFAULT_PRESET_ID);
      setActiveModeId(null);
      try {
        window.localStorage.setItem(ACTIVE_PRESET_KEY, DEFAULT_PRESET_ID);
      } catch {
        //
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
      //
    }
    scheduleBackendSave(overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, mounted]);

  const presetOptions = useMemo(
    () => Object.keys(presets ?? {}).sort((a, b) => a.localeCompare(b)),
    [presets]
  );

  const constants = useMemo(
    () => ({
      STORAGE_KEY,
      PRESETS_KEY,
      ACTIVE_PRESET_KEY,
      DEFAULT_PRESET_ID,
      DARK_MODE_OVERRIDES,
      LIGHT_MODE_OVERRIDES,
      SLATE_ELECTRIC_OVERRIDES,
    }),
    []
  );

  return {
    vars,
    alphaEnabled,
    mounted,
    defaults,
    overrides,
    presets,
    activePresetId,
    activeModeId,
    activeSettingsTab,
    activeDetailSection,
    draftHex,
    draftAlpha,
    setActivePresetId,
    setActiveModeId,
    setActiveSettingsTab,
    setActiveDetailSection,
    setDraftHex,
    setDraftAlpha,
    currentValue,
    currentHex,
    currentAlphaPct,
    onHexChange,
    onHexBlur,
    onPickerChange,
    onAlphaChange,
    resetAll,
    resetGroup,
    applyFullTheme,
    snapshotTheme,
    onSelectPreset,
    savePresetAs,
    overwritePreset,
    deletePreset,
    exportPresets,
    importPresets,
    handleSelectMode,
    presetOptions,
    constants,
  };
}