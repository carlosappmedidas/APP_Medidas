"use client";
import { useEffect } from "react";

const STORAGE_KEY = "ui_theme_overrides";

const SLATE_ELECTRIC_DEFAULTS: Record<string, string> = {
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

export default function ThemeBootstrap() {
  useEffect(() => {
    const root = document.documentElement;
    let loaded: Record<string, string> = {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string" && v.trim()) {
              loaded[k] = v.trim();
            }
          }
        }
      }
    } catch {
      //
    }
    if (!Object.keys(loaded).length) {
      loaded = SLATE_ELECTRIC_DEFAULTS;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SLATE_ELECTRIC_DEFAULTS));
      } catch {
        //
      }
    }
    for (const [k, v] of Object.entries(loaded)) {
      root.style.setProperty(k, v);
    }
  }, []);

  return null;
}