// app/components/settings/EnviosSettingsSection.tsx
// Sección de Configuración para la feature "Envíos REE":
// gestiona DOS automatizaciones:
//   1. Búsqueda de respuestas REE (.ok / .bad) en SFTP — cron 07:30 diario
//   2. Revisar alertas de envíos (plazos M1/M2/M7) — cron 22:00 diario
// La carpeta SFTP de subida y de entrada se configuran en el módulo Comunicaciones.

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

// Metadata de cada automatización (icono SVG, título, descripción, hora).
type TipoAuto = "buscar_respuestas_envios" | "revisar_alertas_envios";

interface AutoMeta {
  tipo:        TipoAuto;
  titulo:      string;
  descripcion: string;
  hora:        string;
  iconoPath:   string;  // SVG path content
}

const AUTO_META: Record<TipoAuto, AutoMeta> = {
  buscar_respuestas_envios: {
    tipo:        "buscar_respuestas_envios",
    titulo:      "Automatización · Búsqueda de respuestas REE de envíos",
    descripcion: "Cada día a las 07:30 escanea la carpeta de entrada del SFTP y enlaza los ficheros .ok / .bad con los envíos AGRECL / INMECL / MAGCL pendientes de respuesta REE.",
    hora:        "07:30",
    // sol/icono de búsqueda
    iconoPath:   "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4",
  },
  revisar_alertas_envios: {
    tipo:        "revisar_alertas_envios",
    titulo:      "Automatización · Revisar alertas de envíos",
    descripcion: "Cada día a las 22:00 detecta alertas de envíos M1/M2/M7: plazo próximo (≤3 días), plazo vencido sin envíos y plazo vencido con .bad sin reenviar. Se ven en la pestaña Alertas.",
    hora:        "22:00",
    // campana
    iconoPath:   "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  },
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function EnviosSettingsSection({ token }: Props) {
  const [error, setError] = useState<string | null>(null);

  // ── Estado de las 2 automatizaciones ────────────────────────────────────────
  const [configs, setConfigs] = useState<Record<TipoAuto, AutoConfigItem | null>>({
    buscar_respuestas_envios: null,
    revisar_alertas_envios:   null,
  });
  const [savingTipo,    setSavingTipo]    = useState<TipoAuto | null>(null);
  const [revisandoTipo, setRevisandoTipo] = useState<TipoAuto | null>(null);

  const cargarConfigs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/envios/automatizacion/config`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;
      const data = await res.json();

      const parsearItem = (raw: Record<string, unknown> | undefined | null): AutoConfigItem | null => {
        if (!raw) return null;
        return {
          activa:         !!raw.activa,
          ultimo_run_at:  (raw.ultimo_run_at  as string | null) ?? null,
          ultimo_run_ok:  (raw.ultimo_run_ok  as boolean | null) ?? null,
          ultimo_run_msg: (raw.ultimo_run_msg as string | null) ?? null,
        };
      };

      setConfigs({
        buscar_respuestas_envios: parsearItem(data?.buscar_respuestas_envios),
        revisar_alertas_envios:   parsearItem(data?.revisar_alertas_envios),
      });
    } catch { /* silencioso */ }
  }, [token]);

  useEffect(() => { cargarConfigs(); }, [cargarConfigs]);

  // ── Toggle ON/OFF ───────────────────────────────────────────────────────────
  const handleToggle = async (tipo: TipoAuto) => {
    if (!token) return;
    const cfg = configs[tipo];
    if (!cfg) return;
    setSavingTipo(tipo); setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/envios/automatizacion/config/${tipo}`,
        {
          method: "PATCH",
          headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ activa: !cfg.activa }),
        },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setConfigs(prev => ({
        ...prev,
        [tipo]: {
          activa:         !!data.activa,
          ultimo_run_at:  data.ultimo_run_at  ?? null,
          ultimo_run_ok:  data.ultimo_run_ok  ?? null,
          ultimo_run_msg: data.ultimo_run_msg ?? null,
        },
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cambiar el estado");
    } finally {
      setSavingTipo(null);
    }
  };

  // ── Revisar ahora ───────────────────────────────────────────────────────────
  const handleRevisar = async (tipo: TipoAuto) => {
    if (!token) return;
    setRevisandoTipo(tipo); setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/envios/automatizacion/revisar-ahora/${tipo}`,
        { method: "POST", headers: getAuthHeaders(token) },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await cargarConfigs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al ejecutar");
    } finally {
      setRevisandoTipo(null);
    }
  };

  // ── Render de una tarjeta ───────────────────────────────────────────────────
  const renderTarjeta = (meta: AutoMeta) => {
    const cfg = configs[meta.tipo];
    const saving    = savingTipo    === meta.tipo;
    const revisando = revisandoTipo === meta.tipo;

    return (
      <div key={meta.tipo} style={{
        background: "var(--field-bg-soft)",
        border: "0.5px solid var(--card-border)",
        borderRadius: 10,
        padding: "16px 18px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: cfg?.activa ? "rgba(29,158,117,0.15)" : "rgba(148,163,184,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={cfg?.activa ? "#1D9E75" : "var(--text-muted)"}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={meta.iconoPath} />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text)" }}>
                {meta.titulo}
                <span style={{ marginLeft: 8, fontSize: 10, color: "#378ADD", letterSpacing: "0.04em" }}>· {meta.hora}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {meta.descripcion}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggle(meta.tipo)}
            disabled={saving || !cfg}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{
              minWidth: 100,
              color: cfg?.activa ? "#A32D2D" : "#0F6E56",
              borderColor: cfg?.activa ? "rgba(163,45,45,0.4)" : "rgba(15,110,86,0.4)",
            }}
          >
            {saving ? "..." : (cfg?.activa ? "Desactivar" : "Activar")}
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
                background: cfg?.activa ? "#1D9E75" : "#94A3B8",
              }} />
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                {cfg?.activa ? "Activa" : "Desactivada"}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Último chequeo</div>
            <div style={{ fontSize: 12, color: "var(--text)" }}>
              {cfg?.ultimo_run_at ? (() => {
                const iso = cfg.ultimo_run_at as string;
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
                const marker = cfg.ultimo_run_ok === true ? "✓" : cfg.ultimo_run_ok === false ? "⚠" : "";
                return <>{fecha} {hora} {marker}</>;
              })() : (
                <span style={{ color: "var(--text-muted)" }}>Nunca</span>
              )}
            </div>
            {cfg?.ultimo_run_msg && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {cfg.ultimo_run_msg}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleRevisar(meta.tipo)}
            disabled={revisando}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ minWidth: 130 }}
          >
            {revisando ? "Revisando..." : "🔄 Revisar ahora"}
          </button>
        </div>
      </div>
    );
  };

  // ── Render principal ────────────────────────────────────────────────────────

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
        Gestiona las automatizaciones de envíos REE: búsqueda de respuestas
        (.ok / .bad) y detección de alertas por plazo de envío M1 / M2 / M7.
        Las carpetas SFTP de salida y entrada se configuran en
        {" "}<strong style={{ color: "var(--text)" }}>Comunicaciones → Conexiones FTP</strong>.
        <br />
        <span style={{ fontSize: 10, marginTop: 4, display: "inline-block" }}>
          ℹ️ Para chequear manualmente sin esperar al cron, usa el botón
          {" "}<strong style={{ color: "var(--text)" }}>🔄 Revisar ahora</strong>{" "}
          de cada tarjeta.
        </span>
      </div>

      {/* Error */}
      {error && <div className="ui-alert ui-alert--danger">{error}</div>}

      {/* TARJETAS APILADAS */}
      {renderTarjeta(AUTO_META.buscar_respuestas_envios)}
      {renderTarjeta(AUTO_META.revisar_alertas_envios)}

    </div>
  );
}