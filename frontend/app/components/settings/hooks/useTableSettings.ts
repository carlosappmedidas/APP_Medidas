// app/components/settings/hooks/useTableSettings.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type TableAppearance = {
  stripedRows:     boolean;  // bandas alternas
  columnGroups:    boolean;  // cabeceras de grupo coloreadas (General, M2, M7...)
  pctBadges:       boolean;  // badge verde/rojo en porcentajes
  periodSeparator: boolean;  // separador "2026 · Febrero" entre meses
};

export type TableColumnConfig = {
  columnOrder:   string[];
  hiddenColumns: string[];
};

export type TableSettings = {
  appearance: TableAppearance;
  general:    TableColumnConfig;
  ps:         TableColumnConfig;
};

// Defaults — valores por defecto cuando no hay nada guardado
const DEFAULT_APPEARANCE: TableAppearance = {
  stripedRows:     true,
  columnGroups:    true,
  pctBadges:       true,
  periodSeparator: false,
};

const STORAGE_KEY = "ui_table_settings";

// ── Helpers ────────────────────────────────────────────────────────────────

function loadFromLocalStorage(): Partial<TableSettings> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TableSettings>;
  } catch {
    return null;
  }
}

function saveToLocalStorage(settings: TableSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

function mergeWithDefaults(
  saved: Partial<TableSettings> | null,
  defaultGeneral: string[],
  defaultPs: string[],
): TableSettings {
  return {
    appearance: { ...DEFAULT_APPEARANCE, ...(saved?.appearance ?? {}) },
    general: {
      columnOrder:   saved?.general?.columnOrder   ?? defaultGeneral,
      hiddenColumns: saved?.general?.hiddenColumns ?? [],
    },
    ps: {
      columnOrder:   saved?.ps?.columnOrder   ?? defaultPs,
      hiddenColumns: saved?.ps?.hiddenColumns ?? [],
    },
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

type UseTableSettingsParams = {
  token: string | null;
  defaultGeneralOrder: string[];
  defaultPsOrder: string[];
};

export function useTableSettings({
  token,
  defaultGeneralOrder,
  defaultPsOrder,
}: UseTableSettingsParams) {
  const [settings, setSettings] = useState<TableSettings>(() =>
    mergeWithDefaults(null, defaultGeneralOrder, defaultPsOrder)
  );
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // 1. Cargar desde localStorage como inmediato
      const local = loadFromLocalStorage();
      if (local) {
        setSettings(mergeWithDefaults(local, defaultGeneralOrder, defaultPsOrder));
      }

      // 2. Si hay token, intentar cargar desde BD (fuente de verdad)
      if (token) {
        try {
          const res = await fetch(`${API_BASE_URL}/auth/ui-table-settings`, {
            headers: getAuthHeaders(token),
          });
          if (res.ok) {
            const json = await res.json() as { ui_table_settings?: Partial<TableSettings> | null };
            if (json.ui_table_settings) {
              const merged = mergeWithDefaults(
                json.ui_table_settings,
                defaultGeneralOrder,
                defaultPsOrder,
              );
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
    (next: TableSettings) => {
      saveToLocalStorage(next);
      if (!token) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          await fetch(`${API_BASE_URL}/auth/ui-table-settings`, {
            method: "PUT",
            headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
            body: JSON.stringify({ ui_table_settings: next }),
          });
        } catch { /* ignorar errores de red */ }
      }, 600);
    },
    [token],
  );

  // ── Setters de apariencia ──────────────────────────────────────────────
  const setAppearance = useCallback(
    (key: keyof TableAppearance, value: boolean) => {
      setSettings((prev) => {
        const next: TableSettings = {
          ...prev,
          appearance: { ...prev.appearance, [key]: value },
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  // ── Setters de columnas General ────────────────────────────────────────
  const setGeneralColumnOrder = useCallback(
    (order: string[]) => {
      setSettings((prev) => {
        const next: TableSettings = {
          ...prev,
          general: { ...prev.general, columnOrder: order },
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const setGeneralHiddenColumns = useCallback(
    (cols: string[]) => {
      setSettings((prev) => {
        const next: TableSettings = {
          ...prev,
          general: { ...prev.general, hiddenColumns: cols },
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  // ── Setters de columnas PS ─────────────────────────────────────────────
  const setPsColumnOrder = useCallback(
    (order: string[]) => {
      setSettings((prev) => {
        const next: TableSettings = {
          ...prev,
          ps: { ...prev.ps, columnOrder: order },
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const setPsHiddenColumns = useCallback(
    (cols: string[]) => {
      setSettings((prev) => {
        const next: TableSettings = {
          ...prev,
          ps: { ...prev.ps, hiddenColumns: cols },
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  // ── Reset total ────────────────────────────────────────────────────────
  const resetAll = useCallback(async () => {
    const fresh = mergeWithDefaults(null, defaultGeneralOrder, defaultPsOrder);
    setSettings(fresh);
    saveToLocalStorage(fresh);
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/ui-table-settings`, {
          method: "DELETE",
          headers: getAuthHeaders(token),
        });
      } catch { /* ignorar */ }
    }
  }, [token, defaultGeneralOrder, defaultPsOrder]);

  return {
    settings,
    loaded,
    // apariencia
    appearance:    settings.appearance,
    setAppearance,
    // columnas General
    generalColumnOrder:    settings.general.columnOrder,
    generalHiddenColumns:  settings.general.hiddenColumns,
    setGeneralColumnOrder,
    setGeneralHiddenColumns,
    // columnas PS
    psColumnOrder:    settings.ps.columnOrder,
    psHiddenColumns:  settings.ps.hiddenColumns,
    setPsColumnOrder,
    setPsHiddenColumns,
    // reset
    resetAll,
  };
}
