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
    </div>
  );
}