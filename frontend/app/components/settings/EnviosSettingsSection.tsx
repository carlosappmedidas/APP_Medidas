// app/components/settings/EnviosSettingsSection.tsx
// Sección de Configuración para la feature "Envíos REE":
// gestiona la automatización de búsqueda de respuestas REE (.ok/.bad) en el SFTP.
// La carpeta SFTP de subida y de entrada se configuran en el módulo Comunicaciones
// (carpeta_salida y carpeta_entrada_general respectivamente), por lo que aquí
// solo hay que controlar el toggle del job automático.

"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type Props = { token: string | null };

// Tipos del bloque "Automatización" — espejo del backend.
interface AutoConfigItem {
  activa:         boolean;
  ultimo_run_at:  string | null;
  ultimo_run_ok:  boolean | null;
  ultimo_run_msg: string | null;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function EnviosSettingsSection({ token }: Props) {
  const [error, setError] = useState<string | null>(null);

  // ── Estado de la automatización ─────────────────────────────────────────────
  const [autoConfig,    setAutoConfig]    = useState<AutoConfigItem | null>(null);
  const [autoSaving,    setAutoSaving]    = useState<boolean>(false);
  const [autoRevisando, setAutoRevisando] = useState<boolean>(false);

  const cargarAutoConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/envios/automatizacion/config`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;
      const data = await res.json();
      const c = data?.buscar_respuestas_envios;
      setAutoConfig({
        activa:         !!c?.activa,
        ultimo_run_at:  c?.ultimo_run_at  ?? null,
        ultimo_run_ok:  c?.ultimo_run_ok  ?? null,
        ultimo_run_msg: c?.ultimo_run_msg ?? null,
      });
    } catch { /* silencioso */ }
  }, [token]);

  useEffect(() => { cargarAutoConfig(); }, [cargarAutoConfig]);

  const handleToggleAuto = async () => {
    if (!token || !autoConfig) return;
    const nuevoValor = !autoConfig.activa;
    setAutoSaving(true); setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/envios/automatizacion/config/buscar_respuestas_envios`,
        {
          method: "PATCH",
          headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ activa: nuevoValor }),
        },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setAutoConfig({
        activa:         !!data.activa,
        ultimo_run_at:  data.ultimo_run_at  ?? null,
        ultimo_run_ok:  data.ultimo_run_ok  ?? null,
        ultimo_run_msg: data.ultimo_run_msg ?? null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cambiar el estado");
    } finally {
      setAutoSaving(false);
    }
  };

  const handleRevisarAhora = async () => {
    if (!token) return;
    setAutoRevisando(true); setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/envios/automatizacion/revisar-ahora/buscar_respuestas_envios`,
        { method: "POST", headers: getAuthHeaders(token) },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await cargarAutoConfig();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al ejecutar");
    } finally {
      setAutoRevisando(false);
    }
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
        Gestiona la búsqueda automática de respuestas REE (.ok / .bad) para los envíos
        AGRECL / INMECL / MAGCL subidos al SFTP. La carpeta de salida (donde se suben los ficheros) y la
        carpeta de entrada general (donde REE deja las respuestas) se configuran en
        {" "}<strong style={{ color: "var(--text)" }}>Comunicaciones → Conexiones FTP</strong>.
        <br />
        <span style={{ fontSize: 10, marginTop: 4, display: "inline-block" }}>
          ℹ️ Si necesitas comprobar manualmente sin esperar al cron diario, usa el botón
          {" "}<strong style={{ color: "var(--text)" }}>Revisar respuestas REE</strong>{" "}
          desde la pantalla <strong style={{ color: "var(--text)" }}>Gestión envíos → Histórico M2</strong>.
        </span>
      </div>

      {/* Error */}
      {error && <div className="ui-alert ui-alert--danger">{error}</div>}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TARJETA AUTOMATIZACIÓN · Búsqueda de respuestas REE de envíos           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: "var(--field-bg-soft)",
        border: "0.5px solid var(--card-border)",
        borderRadius: 10,
        padding: "16px 18px",
        marginTop: 4,
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
                Automatización · Búsqueda de respuestas REE de envíos
                <span style={{ marginLeft: 8, fontSize: 10, color: "#378ADD", letterSpacing: "0.04em" }}>· 07:30</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Cada día a las 07:30 escanea la carpeta de entrada del SFTP y enlaza los ficheros .ok / .bad
                con los envíos AGRECL / INMECL / MAGCL pendientes de respuesta REE.
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
              {autoConfig?.ultimo_run_at ? (() => {
                // UTC → Madrid si el ISO no trae zona (mismo patrón que Objeciones/Publicaciones).
                const iso = autoConfig.ultimo_run_at as string;
                const isoUtc = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
                const d = new Date(isoUtc);
                const fecha = new Intl.DateTimeFormat("es-ES", {
                  timeZone: "Europe/Madrid",
                  day: "2-digit", month: "2-digit", year: "numeric",
                }).format(d);
                const hora = new Intl.DateTimeFormat("es-ES", {
                  timeZone: "Europe/Madrid",
                  hour: "2-digit", minute: "2-digit", hour12: false,
                }).format(d);
                const marker = autoConfig.ultimo_run_ok === true ? "✓" : autoConfig.ultimo_run_ok === false ? "⚠" : "";
                return <>{fecha} {hora} {marker}</>;
              })() : (
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
            disabled={autoRevisando}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ minWidth: 130 }}
          >
            {autoRevisando ? "Revisando..." : "🔄 Revisar ahora"}
          </button>
        </div>
      </div>

    </div>
  );
}