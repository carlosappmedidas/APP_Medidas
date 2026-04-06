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

// ── Etiquetas de categoría ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  mes_anterior:  "Mes anterior",
  absoluta:      "Valor absoluto",
  anio_anterior: "Año anterior",
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  mes_anterior:  { bg: "rgba(37,99,235,0.12)",  color: "#60a5fa", border: "rgba(37,99,235,0.3)" },
  absoluta:      { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  anio_anterior: { bg: "rgba(5,150,105,0.12)",  color: "#34d399", border: "rgba(5,150,105,0.3)" },
};

// ── Componente ─────────────────────────────────────────────────────────────

export default function AlertConfigSection({ token, canManage }: Props) {
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("none");
  const [config, setConfig] = useState<AlertConfigRow[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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

  // ── Cargar configuración de la empresa seleccionada ──────────────────
  const loadConfig = useCallback(async (id: string) => {
    if (!token || id === "none") { setConfig([]); return; }
    setLoadingConfig(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/company-config/${id}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConfig(await res.json());
    } catch {
      setError("No se pudo cargar la configuración.");
      setConfig([]);
    } finally { setLoadingConfig(false); }
  }, [token]);

  useEffect(() => { loadConfig(empresaId); }, [empresaId, loadConfig]);

  // ── Guardar configuración ────────────────────────────────────────────
  const handleSave = async () => {
    if (!token || empresaId === "none" || !canManage) return;
    setSaving(true);
    setError(null);
    setOk(null);
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
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConfig(await res.json());
      setOk("Configuración guardada correctamente.");
    } catch { setError("No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  };

  // ── Helpers de edición ───────────────────────────────────────────────
  const setEnabled = (code: string, v: boolean) =>
    setConfig((prev) => prev.map((r) => r.alert_code === code ? { ...r, is_enabled: v } : r));

  const setThreshold = (code: string, v: string) =>
    setConfig((prev) => prev.map((r) => r.alert_code === code ? { ...r, threshold_value: v === "" ? 0 : Number(v) } : r));

  const setSeverity = (code: string, v: string) =>
    setConfig((prev) => prev.map((r) => r.alert_code === code ? { ...r, severity: v } : r));

  const resetOne = (code: string) =>
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

  // ── Estilos reutilizables ────────────────────────────────────────────
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
    color: "var(--text)", cursor: "pointer",
  };
  const thStyle: React.CSSProperties = {
    padding: "7px 10px", fontSize: 11, fontWeight: 500,
    color: "var(--text-muted)", borderBottom: "0.5px solid var(--card-border)",
    whiteSpace: "nowrap", textAlign: "left",
  };
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px", fontSize: 12,
    color: "var(--text)", borderBottom: "0.5px solid var(--card-border)",
    verticalAlign: "middle",
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

      {/* Selector de empresa + botón guardar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Empresa</div>
          <select
            style={{ ...inputStyle, minWidth: 200 }}
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

        {canManage && empresaId !== "none" && (
          <button
            style={{ ...btnStyle, marginTop: 16, background: "rgba(37,99,235,0.15)", color: "#60a5fa", borderColor: "rgba(37,99,235,0.3)" }}
            disabled={saving || loadingConfig}
            onClick={handleSave}
          >
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
        )}
      </div>

      {/* Nota si no puede gestionar */}
      {!canManage && empresaId !== "none" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Solo puedes consultar la configuración. Necesitas rol admin u owner para modificarla.
        </div>
      )}

      {/* Cargando */}
      {loadingConfig && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
          Cargando configuración...
        </div>
      )}

      {/* Tablas por categoría */}
      {!loadingConfig && empresaId !== "none" && Object.keys(byCategory).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(["mes_anterior", "absoluta", "anio_anterior"] as const).map((cat) => {
            const rows = byCategory[cat] ?? [];
            if (rows.length === 0) return null;
            const c = CATEGORY_COLORS[cat];
            return (
              <div key={cat} style={{
                background: "var(--card-bg)",
                border: "0.5px solid var(--card-border)",
                borderRadius: 10,
                overflow: "hidden",
              }}>
                {/* Cabecera de categoría */}
                <div style={{
                  padding: "8px 14px", borderBottom: "0.5px solid var(--card-border)",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{
                    display: "inline-block", padding: "2px 7px", borderRadius: 4,
                    fontSize: 10, fontWeight: 500, background: c.bg, color: c.color,
                    border: `0.5px solid ${c.border}`, textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {rows.length} regla{rows.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Tabla */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Regla</th>
                        <th style={{ ...thStyle, textAlign: "center" }}>Activa</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Umbral</th>
                        <th style={thStyle}>Unidad</th>
                        <th style={thStyle}>Severidad</th>
                        <th style={{ ...thStyle, color: "var(--text-muted)" }}>Por defecto</th>
                        {canManage && <th style={thStyle}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.alert_code} style={{ opacity: r.is_enabled ? 1 : 0.5 }}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 500 }}>{r.nombre}</div>
                            {r.descripcion && (
                              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                                {r.descripcion}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={r.is_enabled}
                              disabled={!canManage}
                              onChange={(e) => setEnabled(r.alert_code, e.target.checked)}
                            />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <input
                              type="number"
                              step="0.1"
                              style={{ ...inputStyle, width: 70, textAlign: "right" }}
                              value={r.threshold_value}
                              disabled={!canManage || !r.is_enabled}
                              onChange={(e) => setThreshold(r.alert_code, e.target.value)}
                            />
                          </td>
                          <td style={tdStyle}>{r.diff_unit}</td>
                          <td style={tdStyle}>
                            <select
                              style={{ ...inputStyle, width: 100 }}
                              value={r.severity}
                              disabled={!canManage || !r.is_enabled}
                              onChange={(e) => setSeverity(r.alert_code, e.target.value)}
                            >
                              <option value="info">Info</option>
                              <option value="warning">Warning</option>
                              <option value="critical">Crítica</option>
                            </select>
                          </td>
                          <td style={{ ...tdStyle, color: "var(--text-muted)", fontSize: 11 }}>
                            {r.default_threshold} {r.diff_unit} · {r.default_severity}
                          </td>
                          {canManage && (
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <button style={btnStyle} onClick={() => resetOne(r.alert_code)}>
                                Restaurar
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Estado vacío */}
      {!loadingConfig && empresaId === "none" && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
          Selecciona una empresa para ver y editar su configuración de alertas.
        </div>
      )}
    </div>
  );
}
