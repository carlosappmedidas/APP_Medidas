// app/components/settings/hooks/useTopologiaSettings.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import type {
  TablaLineasConfig, TablaTramosConfig, TablaCtsConfig,
  TablaCupsConfig, TablaCeldasConfig, TablaTrafosConfig,
} from "../TopologiaSettingsSection";
import {
  DEFAULT_TABLA_LINEAS, DEFAULT_TABLA_TRAMOS, DEFAULT_TABLA_CTS,
  DEFAULT_TABLA_CUPS, DEFAULT_TABLA_CELDAS, DEFAULT_TABLA_TRAFOS,
} from "../TopologiaSettingsSection";
import type {
  TooltipLineasConfig, TooltipTramosConfig, TooltipCtsConfig, TooltipCupsConfig,
} from "../../topologia/MapaLeaflet";
import {
  DEFAULT_TOOLTIP_LINEAS, DEFAULT_TOOLTIP_TRAMOS, DEFAULT_TOOLTIP_CTS, DEFAULT_TOOLTIP_CUPS,
} from "../../topologia/MapaLeaflet";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type TopologiaSettings = {
  tabla_lineas:   TablaLineasConfig;
  tabla_tramos:   TablaTramosConfig;
  tabla_cts:      TablaCtsConfig;
  tabla_cups:     TablaCupsConfig;
  tabla_celdas:   TablaCeldasConfig;
  tabla_trafos:   TablaTrafosConfig;
  tooltip_lineas: TooltipLineasConfig;
  tooltip_tramos: TooltipTramosConfig;
  tooltip_cts:    TooltipCtsConfig;
  tooltip_cups:   TooltipCupsConfig;
};

const DEFAULTS: TopologiaSettings = {
  tabla_lineas:   DEFAULT_TABLA_LINEAS,
  tabla_tramos:   DEFAULT_TABLA_TRAMOS,
  tabla_cts:      DEFAULT_TABLA_CTS,
  tabla_cups:     DEFAULT_TABLA_CUPS,
  tabla_celdas:   DEFAULT_TABLA_CELDAS,
  tabla_trafos:   DEFAULT_TABLA_TRAFOS,
  tooltip_lineas: DEFAULT_TOOLTIP_LINEAS,
  tooltip_tramos: DEFAULT_TOOLTIP_TRAMOS,
  tooltip_cts:    DEFAULT_TOOLTIP_CTS,
  tooltip_cups:   DEFAULT_TOOLTIP_CUPS,
};

// Keys de localStorage que vamos a migrar/usar como fallback
const LS_KEYS: Record<keyof TopologiaSettings, string> = {
  tabla_lineas:   "ui_topologia_tabla_lineas",
  tabla_tramos:   "ui_topologia_tabla_tramos",
  tabla_cts:      "ui_topologia_tabla_cts",
  tabla_cups:     "ui_topologia_tabla_cups",
  tabla_celdas:   "ui_topologia_tabla_celdas",
  tabla_trafos:   "ui_topologia_tabla_trafos",
  tooltip_lineas: "ui_topologia_tooltip_lineas",
  tooltip_tramos: "ui_topologia_tooltip_tramos",
  tooltip_cts:    "ui_topologia_tooltip_cts",
  tooltip_cups:   "ui_topologia_tooltip_cups",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function loadFromLocalStorage(): Partial<TopologiaSettings> {
  const result: Partial<TopologiaSettings> = {};
  try {
    for (const [key, lsKey] of Object.entries(LS_KEYS)) {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        (result as Record<string, unknown>)[key] = JSON.parse(raw);
      }
    }
  } catch { /* ignore */ }
  return result;
}

function saveToLocalStorage(settings: TopologiaSettings): void {
  try {
    for (const [key, lsKey] of Object.entries(LS_KEYS)) {
      localStorage.setItem(lsKey, JSON.stringify((settings as Record<string, unknown>)[key]));
    }
  } catch { /* ignore */ }
}

function mergeWithDefaults(saved: Partial<TopologiaSettings> | null): TopologiaSettings {
  return {
    tabla_lineas:   { ...DEFAULTS.tabla_lineas,   ...(saved?.tabla_lineas ?? {}) },
    tabla_tramos:   { ...DEFAULTS.tabla_tramos,   ...(saved?.tabla_tramos ?? {}) },
    tabla_cts:      { ...DEFAULTS.tabla_cts,      ...(saved?.tabla_cts ?? {}) },
    tabla_cups:     { ...DEFAULTS.tabla_cups,      ...(saved?.tabla_cups ?? {}) },
    tabla_celdas:   { ...DEFAULTS.tabla_celdas,   ...(saved?.tabla_celdas ?? {}) },
    tabla_trafos:   { ...DEFAULTS.tabla_trafos,   ...(saved?.tabla_trafos ?? {}) },
    tooltip_lineas: { ...DEFAULTS.tooltip_lineas, ...(saved?.tooltip_lineas ?? {}) },
    tooltip_tramos: { ...DEFAULTS.tooltip_tramos, ...(saved?.tooltip_tramos ?? {}) },
    tooltip_cts:    { ...DEFAULTS.tooltip_cts,    ...(saved?.tooltip_cts ?? {}) },
    tooltip_cups:   { ...DEFAULTS.tooltip_cups,   ...(saved?.tooltip_cups ?? {}) },
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTopologiaSettings(token: string | null) {
  const [settings, setSettings] = useState<TopologiaSettings>(() => mergeWithDefaults(null));
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // 1. localStorage como inmediato (migración de datos existentes)
      const local = loadFromLocalStorage();
      if (Object.keys(local).length > 0) {
        setSettings(mergeWithDefaults(local));
      }

      // 2. Si hay token, BD es fuente de verdad
      if (token) {
        try {
          const res = await fetch(`${API_BASE_URL}/auth/ui-topologia-settings`, {
            headers: getAuthHeaders(token),
          });
          if (res.ok) {
            const json = await res.json() as { ui_topologia_settings?: Partial<TopologiaSettings> | null };
            if (json.ui_topologia_settings) {
              const merged = mergeWithDefaults(json.ui_topologia_settings);
              setSettings(merged);
              saveToLocalStorage(merged);
            }
          }
        } catch { /* fallback a localStorage ya cargado */ }
      }

      setLoaded(true);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Persistencia con debounce ──────────────────────────────────────────
  const persistSettings = useCallback(
    (next: TopologiaSettings) => {
      saveToLocalStorage(next);
      if (!token) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          await fetch(`${API_BASE_URL}/auth/ui-topologia-settings`, {
            method: "PUT",
            headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
            body: JSON.stringify({ ui_topologia_settings: next }),
          });
        } catch { /* ignorar errores de red */ }
      }, 600);
    },
    [token],
  );

  // ── Setter genérico (una sub-config) ───────────────────────────────────
  const update = useCallback(
    <K extends keyof TopologiaSettings>(key: K, value: TopologiaSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  // ── Reset total ────────────────────────────────────────────────────────
  const resetAll = useCallback(async () => {
    const fresh = mergeWithDefaults(null);
    setSettings(fresh);
    saveToLocalStorage(fresh);
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/ui-topologia-settings`, {
          method: "DELETE",
          headers: getAuthHeaders(token),
        });
      } catch { /* ignorar */ }
    }
  }, [token]);

  return {
    loaded,
    // Tablas
    tablaLineas:  settings.tabla_lineas,
    tablaTramos:  settings.tabla_tramos,
    tablaCts:     settings.tabla_cts,
    tablaCups:    settings.tabla_cups,
    tablaCeldas:  settings.tabla_celdas,
    tablaTrafos:  settings.tabla_trafos,
    setTablaLineas:  (v: TablaLineasConfig)  => update("tabla_lineas", v),
    setTablaTramos:  (v: TablaTramosConfig)  => update("tabla_tramos", v),
    setTablaCts:     (v: TablaCtsConfig)     => update("tabla_cts", v),
    setTablaCups:    (v: TablaCupsConfig)    => update("tabla_cups", v),
    setTablaCeldas:  (v: TablaCeldasConfig)  => update("tabla_celdas", v),
    setTablaTrafos:  (v: TablaTrafosConfig)  => update("tabla_trafos", v),
    // Tooltips
    tooltipLineas: settings.tooltip_lineas,
    tooltipTramos: settings.tooltip_tramos,
    tooltipCts:    settings.tooltip_cts,
    tooltipCups:   settings.tooltip_cups,
    setTooltipLineas: (v: TooltipLineasConfig)  => update("tooltip_lineas", v),
    setTooltipTramos: (v: TooltipTramosConfig)  => update("tooltip_tramos", v),
    setTooltipCts:    (v: TooltipCtsConfig)     => update("tooltip_cts", v),
    setTooltipCups:   (v: TooltipCupsConfig)    => update("tooltip_cups", v),
    // Reset
    resetAll,
  };
}