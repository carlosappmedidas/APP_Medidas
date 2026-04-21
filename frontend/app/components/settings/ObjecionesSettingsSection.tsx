// app/components/settings/ObjecionesSettingsSection.tsx
// Sección de Configuración para la feature "Descarga en Objeciones":
// lista las conexiones FTP activas del tenant y permite editar su campo `carpeta_aob`.
// No crea ni borra conexiones — eso se hace desde el módulo Comunicaciones.

"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = { token: string | null };

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FtpConfig {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  nombre: string | null;
  host: string;
  puerto: number;
  usuario: string;
  directorio_remoto: string;
  carpeta_aob: string | null;
  usar_tls: boolean;
  activo: boolean;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ObjecionesSettingsSection({ token }: Props) {
  const [configs, setConfigs]     = useState<FtpConfig[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Draft local por id — permite tener cambios pendientes sin perder los guardados
  const [drafts, setDrafts]       = useState<Record<number, string>>({});
  const [savingId, setSavingId]   = useState<number | null>(null);
  const [savedId, setSavedId]     = useState<number | null>(null);

  // ── Automatización: estado local ─────────────────────────────────────────────
  const [autoConfig, setAutoConfig] = useState<{
    activa: boolean;
    ultimo_run_at: string | null;
    ultimo_run_ok: boolean | null;
    ultimo_run_msg: string | null;
  } | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [revisando, setRevisando]   = useState(false);

  // ── Cargar configs del tenant ───────────────────────────────────────────────
  const cargarConfigs = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: FtpConfig[] = await res.json();
      // Solo conexiones activas (Opción A)
      setConfigs(data.filter(c => c.activo));
      // Inicializar drafts con valores actuales
      const initial: Record<number, string> = {};
      for (const c of data) {
        if (c.activo) initial[c.id] = c.carpeta_aob ?? "";
      }
      setDrafts(initial);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando conexiones");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { cargarConfigs(); }, [cargarConfigs]);

  // ── Cargar config de automatización ─────────────────────────────────────────
  const cargarAutoConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/automatizacion/config`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAutoConfig({
        activa:         !!data.activa,
        ultimo_run_at:  data.ultimo_run_at ?? null,
        ultimo_run_ok:  data.ultimo_run_ok ?? null,
        ultimo_run_msg: data.ultimo_run_msg ?? null,
      });
    } catch { /* silencioso */ }
  }, [token]);

  useEffect(() => { cargarAutoConfig(); }, [cargarAutoConfig]);

  // ── Toggle activa/desactiva ─────────────────────────────────────────────────
  const handleToggleAuto = async () => {
    if (!token || !autoConfig) return;
    const nuevoValor = !autoConfig.activa;
    setAutoSaving(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/automatizacion/config`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ activa: nuevoValor }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setAutoConfig({
        activa:         !!data.activa,
        ultimo_run_at:  data.ultimo_run_at ?? null,
        ultimo_run_ok:  data.ultimo_run_ok ?? null,
        ultimo_run_msg: data.ultimo_run_msg ?? null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cambiar el estado");
    } finally {
      setAutoSaving(false);
    }
  };

  // ── Revisar ahora (ejecuta el job manualmente) ──────────────────────────────
  const handleRevisarAhora = async () => {
    if (!token) return;
    setRevisando(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/automatizacion/revisar-ahora`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      // Refrescar la config para ver el nuevo ultimo_run_at/ok/msg
      await cargarAutoConfig();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al ejecutar");
    } finally {
      setRevisando(false);
    }
  };

  // ── Cambio en input ─────────────────────────────────────────────────────────
  const handleChange = (id: number, value: string) => {
    setDrafts(prev => ({ ...prev, [id]: value }));
    if (savedId === id) setSavedId(null); // al editar, se quita el ✓
  };

  // ── Guardar cambios de una fila (PATCH individual) ──────────────────────────
  const handleSave = async (id: number) => {
    if (!token) return;
    const draftValue = drafts[id] ?? "";
    // Enviamos el string trimmed tal cual (incluido "" para limpiar).
    // El backend aplica `if carpeta_aob is not None` → "" se persiste en BD.
    const valueToSend: string = draftValue.trim();

    setSavingId(id); setError(null); setSavedId(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/configs/${id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ carpeta_aob: valueToSend }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const updated: FtpConfig = await res.json();
      // Actualizar la config en el listado
      setConfigs(prev => prev.map(c => c.id === id ? { ...c, carpeta_aob: updated.carpeta_aob } : c));
      // Normalizar draft al valor persistido — "" y null se tratan igual visualmente
      setDrafts(prev => ({ ...prev, [id]: updated.carpeta_aob ?? "" }));
      setSavedId(id);
      // Quitar el ✓ a los 2 segundos
      setTimeout(() => setSavedId(cur => cur === id ? null : cur), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSavingId(null);
    }
  };

  const hasChanges = (id: number, original: string | null): boolean => {
    const draft = (drafts[id] ?? "").trim();
    const orig  = (original ?? "").trim();
    return draft !== orig;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="text-sm" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Banner de ayuda */}
      <div style={{
        padding: "10px 14px",
        background: "var(--field-bg-soft)",
        border: "0.5px solid var(--card-border)",
        borderRadius: 8,
        fontSize: 11,
        color: "var(--text-muted)",
        lineHeight: 1.5,
      }}>
        Indica la ruta SFTP donde cada conexión almacena los ficheros de <strong style={{ color: "var(--text)" }}>objeciones</strong> (AOB).
        Puedes usar paths fijos o dinámicos con los placeholders:
        {" "}<code style={{ padding: "1px 5px", background: "var(--card-bg)", borderRadius: 4, fontSize: 10 }}>{"{mes_actual}"}</code>
        {" y "}<code style={{ padding: "1px 5px", background: "var(--card-bg)", borderRadius: 4, fontSize: 10 }}>{"{mes_anterior}"}</code>
        {". "}Ejemplo: <code style={{ padding: "1px 5px", background: "var(--card-bg)", borderRadius: 4, fontSize: 10 }}>/AOB/{"{mes_actual}"}</code>
        {". "}Deja el campo vacío si esta conexión no se usa para objeciones.
        <br />
        <span style={{ fontSize: 10, marginTop: 4, display: "inline-block" }}>
          ℹ️ Las conexiones se dan de alta en <strong style={{ color: "var(--text)" }}>Comunicaciones → Conexiones FTP</strong>. Aquí solo configuras su carpeta AOB.
        </span>
      </div>

      {/* Error */}
      {error && <div className="ui-alert ui-alert--danger">{error}</div>}

      {/* Tabla */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              <th className="ui-th">Nombre</th>
              <th className="ui-th">Empresa</th>
              <th className="ui-th">Host</th>
              <th className="ui-th">Carpeta AOB</th>
              <th className="ui-th" style={{ width: 110 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="ui-tr">
                <td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>
                  Cargando conexiones...
                </td>
              </tr>
            ) : configs.length === 0 ? (
              <tr className="ui-tr">
                <td colSpan={5} className="ui-td text-center ui-muted" style={{ padding: "24px 16px" }}>
                  No hay conexiones FTP activas. Añade una en <strong>Comunicaciones → Conexiones FTP</strong>.
                </td>
              </tr>
            ) : configs.map(c => {
              const changed = hasChanges(c.id, c.carpeta_aob);
              const saving  = savingId === c.id;
              const saved   = savedId === c.id;
              return (
                <tr key={c.id} className="ui-tr">
                  <td className="ui-td" style={{ fontWeight: 500 }}>
                    {c.nombre || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin nombre</span>}
                  </td>
                  <td className="ui-td">{c.empresa_nombre}</td>
                  <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>
                    {c.host}
                  </td>
                  <td className="ui-td" style={{ minWidth: 260 }}>
                    <input
                      className="ui-input"
                      style={{ width: "100%", fontSize: 11, height: 28, fontFamily: "monospace" }}
                      value={drafts[c.id] ?? ""}
                      onChange={e => handleChange(c.id, e.target.value)}
                      placeholder="/AOB/{mes_actual}"
                      disabled={saving}
                    />
                  </td>
                  <td className="ui-td">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="ui-btn ui-btn-outline ui-btn-xs"
                        onClick={() => handleSave(c.id)}
                        disabled={saving || !changed}
                      >
                        {saving ? "Guardando..." : "Guardar"}
                      </button>
                      {saved && (
                        <span style={{ fontSize: 10, color: "#1D9E75", fontWeight: 500 }}>
                          ✓ guardado
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TARJETA AUTOMATIZACIÓN — FIN RECEPCIÓN OBJECIONES                       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: "var(--field-bg-soft)",
        border: "0.5px solid var(--card-border)",
        borderRadius: 10,
        padding: "16px 18px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: autoConfig?.activa ? "rgba(29,158,117,0.15)" : "rgba(148,163,184,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={autoConfig?.activa ? "#1D9E75" : "var(--text-muted)"}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text)" }}>
                Automatización · Fin recepción objeciones
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Cada día a las 23:00 revisa el SFTP si el calendario REE tuvo ayer un cierre de recepción.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleAuto}
            disabled={autoSaving || !autoConfig}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{
              minWidth: 100,
              color: autoConfig?.activa ? "#A32D2D" : "#0F6E56",
              borderColor: autoConfig?.activa ? "rgba(163,45,45,0.4)" : "rgba(15,110,86,0.4)",
            }}
          >
            {autoSaving ? "..." : (autoConfig?.activa ? "Desactivar" : "Activar")}
          </button>
        </div>

        {/* Estado + último run + botón Revisar ahora */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14,
          alignItems: "center",
          paddingTop: 12, borderTop: "0.5px solid var(--card-border)",
        }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Estado</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: autoConfig?.activa ? "#1D9E75" : "#94A3B8",
              }} />
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                {autoConfig?.activa ? "Activa" : "Desactivada"}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Último chequeo</div>
            <div style={{ fontSize: 12, color: "var(--text)" }}>
              {autoConfig?.ultimo_run_at ? (
                <>
                  {new Date(autoConfig.ultimo_run_at).toLocaleString("es-ES", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                  {" "}
                  {autoConfig.ultimo_run_ok === true ? "✓" : autoConfig.ultimo_run_ok === false ? "⚠" : ""}
                </>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>Nunca</span>
              )}
            </div>
            {autoConfig?.ultimo_run_msg && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {autoConfig.ultimo_run_msg}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRevisarAhora}
            disabled={revisando}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ minWidth: 130 }}
          >
            {revisando ? "Revisando..." : "🔄 Revisar ahora"}
          </button>
        </div>
      </div>

    </div>
  );
}