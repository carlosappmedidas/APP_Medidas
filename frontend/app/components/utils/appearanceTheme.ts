"use client";

import type { VarKey, ThemeOverrides } from "../hooks/useAppearanceTheme";

export function normalizeHexColor(input: string): string | null {
  const v = (input || "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;

  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{8}$/.test(v)) return `#${v.toLowerCase()}`;

  return null;
}

export function normalizeRgbColor(input: string): string | null {
  const v = (input || "").trim();

  const m = v.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (!m) return null;

  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);

  if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }

  const hasAlpha = typeof m[4] === "string";
  if (!hasAlpha) {
    return `rgb(${r}, ${g}, ${b})`;
  }

  const a = Number(m[4]);
  if (Number.isNaN(a) || a < 0 || a > 1) {
    return null;
  }

  const aNorm = Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${aNorm})`;
}

export function normalizeAnyColor(input: string): string | null {
  return normalizeHexColor(input) ?? normalizeRgbColor(input);
}

export function hexToRgb(
  hex: string
): { r: number; g: number; b: number; a: number } | null {
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

export function cssColorToRgba(
  color: string
): { r: number; g: number; b: number; a: number } | null {
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

  return {
    r,
    g,
    b,
    a: Math.max(0, Math.min(1, a)),
  };
}

export function cssColorToHex(color: string): string | null {
  const rgba = cssColorToRgba(color);
  if (!rgba) return null;

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
}

export function readDefaultsFromCss(vars: VarKey[]): Record<VarKey, string> {
  const root = document.documentElement;
  const styles = getComputedStyle(root);

  const out = {} as Record<VarKey, string>;

  for (const v of vars) {
    const raw = styles.getPropertyValue(v).trim();
    out[v] = raw || "";
  }

  return out;
}

export function applyOverrides(overrides: ThemeOverrides): void {
  const root = document.documentElement;

  for (const [k, val] of Object.entries(overrides)) {
    if (!k || typeof val !== "string") continue;
    root.style.setProperty(k, val);
  }
}

export function clearOverrides(vars: VarKey[]): void {
  const root = document.documentElement;

  for (const v of vars) {
    root.style.removeProperty(v);
  }
}

export function alphaPctFromColorValue(value: string): number {
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

export function sanitizePresetObject(
  obj: unknown,
  vars: VarKey[]
): ThemeOverrides | null {
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