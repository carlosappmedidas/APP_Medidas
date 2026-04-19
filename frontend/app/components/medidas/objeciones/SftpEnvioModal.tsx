// Modal de envío SFTP para ficheros REOB del módulo Objeciones.
// Extraído de ObjecionesSection.tsx (Fase 0 · Paso 0.7).

"use client";

import { useState, useEffect } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../../apiConfig";
import { IconSend } from "./shared/icons";

interface SftpEnvioModalProps {
  open: boolean;
  fichero: string | null;
  empresaId: number | null;
  ruta: string;
  token: string | null;
  onClose: () => void;
}

interface SftpConfigMin {
  id: number;
  nombre: string;
  host: string;
  directorio_remoto: string;
}

interface SftpCarpeta {
  nombre: string;
  path: string;
}

export default function SftpEnvioModal({
  open, fichero, empresaId, ruta, token, onClose,
}: SftpEnvioModalProps) {
  const [sftpConfigs,     setSftpConfigs]     = useState<SftpConfigMin[]>([]);
  const [sftpConfigId,    setSftpConfigId]    = useState<number | null>(null);
  const [sftpPath,        setSftpPath]        = useState<string>("/");
  const [sftpCarpetas,    setSftpCarpetas]    = useState<SftpCarpeta[]>([]);
  const [sftpLoadingPath, setSftpLoadingPath] = useState(false);
  const [sftpEnviando,    setSftpEnviando]    = useState(false);
  const [sftpError,       setSftpError]       = useState<string | null>(null);
  const [sftpOk,          setSftpOk]          = useState<string | null>(null);

  // ── Al abrir: resetear y cargar configs ──────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (!token || !empresaId) return;

    // reset UI
    setSftpError(null); setSftpOk(null);
    setSftpConfigId(null); setSftpPath("/"); setSftpCarpetas([]);

    const cargar = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) });
        if (!res.ok) throw new Error();
        const configs = await res.json();
        const cs = configs.filter((c: {nombre: string; activo: boolean; empresa_id: number}) =>
          c.activo && c.nombre && c.nombre.toUpperCase().startsWith("CS") && c.empresa_id === empresaId
        );
        setSftpConfigs(cs);
        if (cs.length === 1) {
          setSftpConfigId(cs[0].id);
          const pathInicial = cs[0].directorio_remoto || "/";
          setSftpPath(pathInicial);
          await cargarCarpetasSftp(cs[0].id, pathInicial);
        }
      } catch { setSftpConfigs([]); }
    };
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, empresaId]);

  // ── Navegación carpetas SFTP ─────────────────────────────────────────────

  const cargarCarpetasSftp = async (configId: number, path: string) => {
    if (!token) return;
    setSftpLoadingPath(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ftp/explorar/${configId}?path=${encodeURIComponent(path)}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSftpCarpetas(data.carpetas ?? []);
      setSftpPath(path);
    } catch { setSftpCarpetas([]); }
    finally { setSftpLoadingPath(false); }
  };

  // ── Enviar al SFTP ───────────────────────────────────────────────────────

  const handleEnviarSftp = async () => {
    if (!token || !empresaId || !fichero || !sftpConfigId) return;
    setSftpEnviando(true); setSftpError(null); setSftpOk(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/enviar-sftp`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          nombre_fichero: fichero,
          config_id: sftpConfigId,
          directorio_destino: sftpPath,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as {detail?: string}).detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setSftpOk(`✅ Enviado: ${data.filename}`);
    } catch (e: unknown) {
      setSftpError(e instanceof Error ? e.message : "Error enviando");
    } finally { setSftpEnviando(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 20, width: 460, maxHeight: "80vh", overflowY: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Enviar al concentrador secundario</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>{fichero}</div>
          </div>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Conexión SFTP (concentrador secundario)</label>
          {sftpConfigs.length === 0 ? (
            <div style={{ fontSize: 11, color: "#E24B4A", padding: "8px 10px", background: "rgba(226,75,74,0.08)", borderRadius: 6 }}>
              No hay conexiones CS configuradas para esta empresa
            </div>
          ) : (
            <select className="ui-select" style={{ fontSize: 11, width: "100%" }}
              value={sftpConfigId ?? ""}
              onChange={async (e) => {
                const id = Number(e.target.value);
                setSftpConfigId(id);
                const cfg = sftpConfigs.find(c => c.id === id);
                const pathInicial = cfg?.directorio_remoto || "/";
                setSftpPath(pathInicial);
                setSftpCarpetas([]);
                await cargarCarpetasSftp(id, pathInicial);
              }}>

              <option value="">Selecciona conexión...</option>
              {sftpConfigs.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} — {c.host}</option>
              ))}
            </select>
          )}
        </div>

        {sftpConfigId && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Carpeta destino</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input
                type="text"
                className="ui-input"
                style={{ fontSize: 11, fontFamily: "monospace", flex: 1 }}
                value={sftpPath}
                onChange={(e) => setSftpPath(e.target.value)}
                placeholder="/ruta/destino"
              />
              {sftpPath !== "/" && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ fontSize: 10, whiteSpace: "nowrap" }}
                  onClick={() => {
                    const padre = sftpPath.split("/").filter(Boolean).slice(0, -1).join("/");
                    const nuevaRuta = padre ? `/${padre}` : "/";
                    cargarCarpetasSftp(sftpConfigId, nuevaRuta);
                  }}>← Subir</button>
              )}
            </div>
            {sftpLoadingPath ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "6px 0" }}>Cargando carpetas...</div>
            ) : sftpCarpetas.length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "6px 0" }}>Sin subcarpetas — se enviará a la ruta indicada</div>
            ) : (
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {sftpCarpetas.map(c => (
                  <button key={c.path} type="button"
                    onClick={() => cargarCarpetasSftp(sftpConfigId, c.path)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, border: "none", background: "var(--field-bg-soft)", cursor: "pointer", textAlign: "left", fontSize: 11, color: "var(--text)" }}>
                    📁 {c.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {sftpError && <div style={{ fontSize: 11, color: "#E24B4A", padding: "8px 10px", background: "rgba(226,75,74,0.08)", borderRadius: 6, marginBottom: 10 }}>{sftpError}</div>}
        {sftpOk    && <div style={{ fontSize: 11, color: "#1D9E75", padding: "8px 10px", background: "rgba(29,158,117,0.08)", borderRadius: 6, marginBottom: 10 }}>{sftpOk}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={onClose}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary ui-btn-xs"
            disabled={!sftpConfigId || sftpEnviando}
            onClick={handleEnviarSftp}
            style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IconSend />
            {sftpEnviando ? "Enviando..." : "Enviar al SFTP"}
          </button>
        </div>
      </div>
    </div>
  );
}