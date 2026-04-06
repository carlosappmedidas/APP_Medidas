"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ── Tipos ──────────────────────────────────────────────────────────────────

type Props = {
  token: string | null;
  canManage: boolean;
};

type EmpresaItem = { id: number; nombre: string };

type AlertConfigRow = {
  alert_code: string;
  nombre: string;
  descripcion: string | null;
  is_enabled: boolean;
  threshold_value: number;
  severity: string;
  diff_unit: string;
  default_threshold: number;
  default_severity: string;
  category: string;
  comparison_type: string;
};

// ── Constantes ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  mes_anterior:  "Mes anterior",
  absoluta:      "Valor absoluto",
  anio_anterior: "Año anterior",
};
const CATEGORY_SUBLABELS: Record<string, string> = {
  mes_anterior:  "Variación respecto al mes previo",
  absoluta:      "Valores fuera de rango",
  anio_anterior: "Variación interanual",
};
const CATEGORY_COLORS: Record<string, { bg: string; color: string; border: string; headerBg: string }> = {
  mes_anterior:  { bg: "rgba(37,99,235,0.12)",  color: "#60a5fa", border: "rgba(37,99,235,0.3)",  headerBg: "rgba(37,99,235,0.05)" },
  absoluta:      { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.3)", headerBg: "rgba(245,158,11,0.05)" },
  anio_anterior: { bg: "rgba(5,150,105,0.12)",  color: "#34d399", border: "rgba(5,150,105,0.3)",  headerBg: "rgba(5,150,105,0.05)" },
};

// Rango del slider por unidad
const SLIDER_RANGE: Record<string, { min: number; max: number; step: number }> = {
  "%":  { min: 0,  max: 40, step: 0.5 },
  "pp": { min: 0,  max: 15, step: 0.5 },
};

// ── Estilos ────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: "4px 8px",
  border: "0.5px solid var(--card-border)",
  borderRadius: 6, background: "var(--card-bg)",
  color: "var(--text)",
};
const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: "4px 10px",
  border: "0.5px solid var(--card-border)",
  borderRadius: 6, background: "var(--card-bg)",
  color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap",
};
const thStyle: React.CSSProperties = {
  padding: "7px 12px", fontSize: 11, fontWeight: 500,
  color: "var(--text-muted)", borderBottom: "0.5px solid var(--card-border)",
  textAlign: "left", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: 12,
  color: "var(--text)", borderBottom: "0.5px solid var(--card-border)",
  verticalAlign: "middle",
};

// ── Componente ─────────────────────────────────────────────────────────────

export default function AlertConfigSection({ token, canManage }: Props) {
  const [empresas,        setEmpresas]        = useState<EmpresaItem[]>([]);
  const [empresaId,       setEmpresaId]       = useState("none");
  const [config,          setConfig]          = useState<AlertConfigRow[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [loadingConfig,   setLoadingConfig]   = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [ok,              setOk]              = useState<string | null>(null);

  // Sub-collapsible: Medidas General abierto por defecto cuando se carga
  const [showGeneral, setShowGeneral] = useState(false);

  // ── Cargar empresas ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoadingEmpresas(true);
    fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, { headers: getAuthHeaders(token) })
      .then((r) => r.ok ? r.json() : [])
      .then((json) => {
        setEmpresas(
          (Array.isArray(json) ? json : [])
            .map((e: any) => ({ id: Number(e.id), nombre: String(e.nombre ?? `Empresa ${e.id}`) }))
            .sort((a: EmpresaItem, b: EmpresaItem) => a.nombre.localeCompare(b.nombre))
        );
      })
      .catch(() => setEmpresas([]))
      .finally(() => setLoadingEmpresas(false));
  }, [token]);

  // ── Cargar configuración ─────────────────────────────────────────────
  const loadConfig = useCallback(async (id: string) => {
    if (!token || id === "none") { setConfig([]); return; }
    setLoadingConfig(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/company-config/${id}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      setConfig(await res.json());
    } catch { setError("No se pudo cargar la configuración."); setConfig([]); }
    finally { setLoadingConfig(false); }
  }, [token]);

  useEffect(() => { loadConfig(empresaId); }, [empresaId, loadConfig]);

  // ── Guardar ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!token || empresaId === "none" || !canManage) return;
    setSaving(true); setError(null); setOk(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/company-config/${empresaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({
          items: config.map((r) => ({
            alert_code: r.alert_code,
            is_enabled: r.is_enabled,
            threshold_value: Number(r.threshold_value),
            severity: r.severity,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setConfig(await res.json());
      setOk("Configuración guardada correctamente.");
    } catch { setError("No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  };

  // ── Edición inline ───────────────────────────────────────────────────
  const setEnabled   = (code: string, v: boolean) =>
    setConfig((prev) => prev.map((r) => r.alert_code === code ? { ...r, is_enabled: v } : r));
  const setThreshold = (code: string, v: number) =>
    setConfig((prev) => prev.map((r) => r.alert_code === code ? { ...r, threshold_value: v } : r));
  const setSeverity  = (code: string, v: string) =>
    setConfig((prev) => prev.map((r) => r.alert_code === code ? { ...r, severity: v } : r));
  const resetOne     = (code: string) =>
    setConfig((prev) => prev.map((r) =>
      r.alert_code === code
        ? { ...r, is_enabled: true, threshold_value: r.default_threshold, severity: r.default_severity }
        : r
    ));

  // ── Agrupar por categoría ────────────────────────────────────────────
  const byCategory = useMemo(() => {
    const groups: Record<string, AlertConfigRow[]> = {};
    for (const r of config) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    }
    return groups;
  }, [config]);

  // ── Mini-dashboard stats ─────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       config.length,
    activas:     config.filter((r) => r.is_enabled).length,
    desactivadas:config.filter((r) => !r.is_enabled).length,
    criticas:    config.filter((r) => r.severity === "critical" && r.is_enabled).length,
    warning:     config.filter((r) => r.severity === "warning"  && r.is_enabled).length,
  }), [config]);

  // ── Render tabla por categoría ────────────────────────────────────────
  const renderCategoryTable = (cat: string, rows: AlertConfigRow[]) => {
    const c = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["mes_anterior"];
    return (
      <div key={cat} style={{ borderTop: "0.5px solid var(--card-border)" }}>
        {/* Cabecera categoría */}
        <div style={{
          padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
          background: c.headerBg,
        }}>
          <span style={{
            display: "inline-block", padding: "2px 7px", borderRadius: 4,
            fontSize: 10, fontWeight: 500, background: c.bg, color: c.color,
            border: `0.5px solid ${c.border}`, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {CATEGORY_LABELS[cat] ?? cat}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {CATEGORY_SUBLABELS[cat] ?? ""} · {rows.length} reglas
          </span>
        </div>

        {/* Tabla */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 36 }}></th>
                <th style={thStyle}>Regla</th>
                <th style={{ ...thStyle, width: 200 }}>Umbral</th>
                <th style={{ ...thStyle, width: 90 }}>Severidad</th>
                <th style={{ ...thStyle, width: 72, textAlign: "right" }}>Defecto</th>
                {canManage && <th style={{ ...thStyle, width: 72 }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const range = SLIDER_RANGE[r.diff_unit] ?? { min: 0, max: 30, step: 0.5 };
                const isDisabled = !canManage || !r.is_enabled;
                return (
                  <tr key={r.alert_code} style={{ opacity: r.is_enabled ? 1 : 0.45 }}>
                    {/* Toggle activa */}
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={r.is_enabled}
                        disabled={!canManage}
                        onChange={(e) => setEnabled(r.alert_code, e.target.checked)}
                        style={{ cursor: canManage ? "pointer" : "default", width: 14, height: 14 }}
                      />
                    </td>

                    {/* Nombre */}
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{r.nombre}</div>
                      {r.descripcion && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {r.descripcion}
                        </div>
                      )}
                    </td>

                    {/* Slider + valor */}
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={range.step}
                          value={r.threshold_value}
                          disabled={isDisabled}
                          onChange={(e) => setThreshold(r.alert_code, Number(e.target.value))}
                          style={{
                            width: 100, accentColor: "#60a5fa",
                            cursor: isDisabled ? "not-allowed" : "pointer",
                          }}
                        />
                        <span style={{
                          fontSize: 12, minWidth: 44,
                          color: isDisabled ? "var(--text-muted)" : "var(--text)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {r.threshold_value} {r.diff_unit}
                        </span>
                      </div>
                    </td>

                    {/* Severidad */}
                    <td style={tdStyle}>
                      <select
                        style={{ ...inputStyle, width: 85 }}
                        value={r.severity}
                        disabled={isDisabled}
                        onChange={(e) => setSeverity(r.alert_code, e.target.value)}
                      >
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="critical">Crítica</option>
                      </select>
                    </td>

                    {/* Defecto */}
                    <td style={{ ...tdStyle, textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>
                      {r.default_threshold} {r.diff_unit}
                    </td>

                    {/* Restaurar */}
                    {canManage && (
                      <td style={tdStyle}>
                        <button style={btnStyle} onClick={() => resetOne(r.alert_code)}>
                          Restaurar
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {error && <div className="ui-alert ui-alert--danger">{error}</div>}
      {ok && (
        <div style={{
          padding: "8px 12px", background: "rgba(5,150,105,0.1)",
          border: "0.5px solid rgba(5,150,105,0.3)", borderRadius: 8,
          fontSize: 12, color: "#34d399",
        }}>
          {ok}
        </div>
      )}

      {/* ══ Sub-collapsible: ALERTAS · MEDIDAS GENERAL ══ */}
      <div style={{
        border: "0.5px solid var(--card-border)",
        borderRadius: 10, overflow: "hidden",
        background: "var(--card-bg)",
      }}>
        {/* Trigger */}
        <button
          type="button"
          onClick={() => setShowGeneral((v) => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", background: "none", border: "none",
            borderBottom: showGeneral ? "0.5px solid var(--card-border)" : "none",
            cursor: "pointer", textAlign: "left",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
              Alertas · Medidas General
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              M1, M2, M7, M11, ART15 · variación de energía y pérdidas
            </div>
          </div>
          <span style={{
            fontSize: 11, padding: "3px 10px",
            border: "0.5px solid var(--card-border)", borderRadius: 5,
            color: "var(--text-muted)", background: "none",
          }}>
            {showGeneral ? "Ocultar" : "Mostrar"}
          </span>
        </button>

        {showGeneral && (
          <div>
            {/* Selector empresa + guardar */}
            <div style={{
              padding: "10px 16px", borderBottom: "0.5px solid var(--card-border)",
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Empresa</div>
                <select
                  style={{ ...inputStyle, minWidth: 180 }}
                  value={empresaId}
                  onChange={(e) => { setEmpresaId(e.target.value); setOk(null); setError(null); }}
                  disabled={loadingEmpresas}
                >
                  <option value="none">Selecciona una empresa</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={String(e.id)}>{e.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }} />
              {canManage && empresaId !== "none" && (
                <button
                  style={{
                    ...btnStyle,
                    background: "rgba(37,99,235,0.15)", color: "#60a5fa",
                    borderColor: "rgba(37,99,235,0.3)", padding: "5px 14px",
                  }}
                  disabled={saving || loadingConfig}
                  onClick={handleSave}
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              )}
            </div>

            {/* Mini-dashboard stats — visible solo cuando hay empresa seleccionada */}
            {empresaId !== "none" && !loadingConfig && config.length > 0 && (
              <div style={{
                padding: "10px 16px", borderBottom: "0.5px solid var(--card-border)",
                display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
              }}>
                {[
                  { label: "total reglas",  value: stats.total,        color: "#60a5fa" },
                  { label: "activas",       value: stats.activas,      color: "#34d399" },
                  { label: "desactivadas",  value: stats.desactivadas, color: "var(--text-muted)" },
                  { label: "críticas",      value: stats.criticas,     color: "#f87171" },
                  { label: "warning",       value: stats.warning,      color: "#fbbf24" },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: "var(--field-bg-soft)", borderRadius: 8,
                    padding: "7px 12px", textAlign: "center", minWidth: 58,
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{s.label}</div>
                  </div>
                ))}
                {!canManage && (
                  <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
                    Solo lectura — necesitas rol admin u owner para modificar
                  </div>
                )}
              </div>
            )}

            {/* Cargando */}
            {loadingConfig && (
              <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)" }}>
                Cargando configuración...
              </div>
            )}

            {/* Estado vacío */}
            {!loadingConfig && empresaId === "none" && (
              <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)" }}>
                Selecciona una empresa para ver y editar su configuración de alertas.
              </div>
            )}

            {/* Tablas por categoría */}
            {!loadingConfig && empresaId !== "none" && config.length > 0 && (
              <div>
                {(["mes_anterior", "absoluta", "anio_anterior"] as const).map((cat) => {
                  const rows = byCategory[cat] ?? [];
                  if (rows.length === 0) return null;
                  return renderCategoryTable(cat, rows);
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ Placeholder: futuras secciones ══ */}
      <div style={{
        border: "0.5px dashed var(--card-border)",
        borderRadius: 10, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 10,
        opacity: 0.45,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          border: "1px dashed var(--text-muted)",
        }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
            Alertas · Medidas PS
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Próximamente — tarifas 2.0TD, 3.0TD, 6.1TD…
          </div>
        </div>
      </div>

    </div>
  );
}
