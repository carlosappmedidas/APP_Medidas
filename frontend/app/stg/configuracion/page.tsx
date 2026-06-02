// app/stg/configuracion/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

interface Conexion {
  id: number;
  empresa_id: number;
  tipo: string;
  nombre: string | null;
  activo: boolean;
  host: string | null;
  puerto: number | null;
  usuario: string | null;
  ruta_base: string | null;
  carpeta_recepcion: string | null;
  carpeta_envio: string | null;
  usar_tls: boolean;
  estado: string;
  ultimo_ping: string | null;
  ultimo_error: string | null;
}

interface SftpFichero {
  nombre: string;
  tamano_bytes: number;
  modificado: string | null;
}

interface SftpListado {
  empresa_id: number;
  ruta_consultada: string;
  total: number;
  items: SftpFichero[];
}

export default function StgConfiguracionPage() {
  const empresaId = useStgEmpresaId();
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state - conexión
  const [tipo, setTipo] = useState<"gisce" | "sftp" | "api_rest" | "db_directa">("sftp");
  const [nombre, setNombre] = useState("");
  const [host, setHost] = useState("");
  const [puerto, setPuerto] = useState<number | "">("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [rutaBase, setRutaBase] = useState("");
  const [activo, setActivo] = useState(true);

  // Form state - específico de SFTP
  const [carpetaRecepcion, setCarpetaRecepcion] = useState("");
  const [carpetaEnvio, setCarpetaEnvio] = useState("");
  const [usarTls, setUsarTls] = useState(true);

  // Listado SFTP
  const [listing, setListing] = useState(false);
  const [listadoSftp, setListadoSftp] = useState<SftpListado | null>(null);
  const [listadoError, setListadoError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setListadoSftp(null);
    setListadoError(null);
    fetch(`${API_BASE_URL}/stg/conexion?empresa_id=${empresaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Conexion | null) => {
        if (data) {
          setConexion(data);
          setTipo(data.tipo as any);
          setNombre(data.nombre || "");
          setHost(data.host || "");
          setPuerto(data.puerto ?? "");
          setUsuario(data.usuario || "");
          setRutaBase(data.ruta_base || "");
          setCarpetaRecepcion(data.carpeta_recepcion || "");
          setCarpetaEnvio(data.carpeta_envio || "");
          setUsarTls(data.usar_tls);
          setActivo(data.activo);
        }
      })
      .finally(() => setLoading(false));
  }, [empresaId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        empresa_id: empresaId,
        tipo,
        nombre,
        host: host || null,
        puerto: puerto === "" ? null : Number(puerto),
        usuario: usuario || null,
        ruta_base: rutaBase || null,
        activo,
        usar_tls: usarTls,
      };
      // Solo enviamos carpetas si son SFTP (no llenamos basura para otros tipos)
      if (tipo === "sftp") {
        payload.carpeta_recepcion = carpetaRecepcion || null;
        payload.carpeta_envio = carpetaEnvio || null;
      }
      if (password) payload.password = password;

      const r = await fetch(`${API_BASE_URL}/stg/conexion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setConexion(data);
      setPassword("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API_BASE_URL}/stg/conexion/test?empresa_id=${empresaId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setTestResult(`${data.ok ? "✅" : "❌"} ${data.mensaje}${data.tiempo_ms ? ` (${data.tiempo_ms}ms)` : ""}`);
    } catch (e) {
      setTestResult(`❌ ${e}`);
    } finally {
      setTesting(false);
    }
  };

  const handleListar = async () => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setListing(true);
    setListadoError(null);
    setListadoSftp(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (filtro) params.append("filtro", filtro);
      const r = await fetch(`${API_BASE_URL}/stg/sftp/listar?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      const data: SftpListado = await r.json();
      setListadoSftp(data);
    } catch (e) {
      setListadoError(String(e));
    } finally {
      setListing(false);
    }
  };

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  if (loading) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Cargando…</div>;
  }

  const esSftp = tipo === "sftp";

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 24px" }}>
        Configuración de conexión STG
      </h1>

      {conexion && (
        <div style={{ marginBottom: 16, padding: 12, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 12, color: "rgba(241,239,232,0.7)" }}>
          Estado actual: <EstadoBadge estado={conexion.estado} />
          {conexion.ultimo_ping && (
            <> · Último ping: {new Date(conexion.ultimo_ping).toLocaleString("es-ES")}</>
          )}
          {conexion.ultimo_error && (
            <div style={{ marginTop: 6, color: "#E24B4A" }}>Último error: {conexion.ultimo_error}</div>
          )}
        </div>
      )}

      <form onSubmit={handleSave} style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 24 }}>
        <Field label="Tipo de conexión">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as any)}
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13, outline: "none" }}
          >
            <option value="sftp">SFTP — funcional (Paquete 3)</option>
            <option value="gisce">GISCE (XML-RPC) — pendiente Paquete 4</option>
            <option value="api_rest">API REST genérica — pendiente</option>
            <option value="db_directa">BD directa — pendiente</option>
          </select>
        </Field>

        <Field label="Nombre / etiqueta">
          <Input value={nombre} onChange={setNombre} placeholder="SFTP Lersa" />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Field label="Host">
            <Input value={host} onChange={setHost} placeholder="sftp.cliente.com" />
          </Field>
          <Field label="Puerto">
            <Input value={String(puerto)} onChange={(v) => setPuerto(v === "" ? "" : Number(v))} placeholder="22" />
          </Field>
        </div>

        <Field label="Usuario">
          <Input value={usuario} onChange={setUsuario} placeholder="usuario_stg" />
        </Field>

        <Field label="Password (déjalo vacío para no cambiar)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13, outline: "none" }}
          />
        </Field>

        <Field label="Directorio remoto raíz">
          <Input value={rutaBase} onChange={setRutaBase} placeholder="/stg/cliente_x" />
        </Field>

        {esSftp && (
          <>
            <div style={{ marginTop: 8, marginBottom: 8, padding: 12, background: "rgba(55,138,221,0.06)", border: "0.5px solid rgba(55,138,221,0.2)", borderRadius: 6, fontSize: 11, color: "rgba(241,239,232,0.7)" }}>
              <strong style={{ color: "#AFA9EC" }}>Carpetas funcionales SFTP.</strong>
              {" "}Las rutas son relativas al directorio remoto raíz de arriba.
              {" "}En "Carpeta de recepción" puedes usar plantillas:
              {" "}<code>{"{anio}"}</code>, <code>{"{mes}"}</code>, <code>{"{mes_actual}"}</code> (= YYYY-MM),
              {" "}<code>{"{mes_anterior}"}</code>.
              {" "}La carpeta de envío es FIJA (sin plantillas).
            </div>

            <Field label="Carpeta de recepción (con plantillas opcionales)">
              <Input value={carpetaRecepcion} onChange={setCarpetaRecepcion} placeholder='respuestas/{mes_actual}' />
            </Field>

            <Field label="Carpeta de envío (fija, para futuras peticiones — Paquete 5)">
              <Input value={carpetaEnvio} onChange={setCarpetaEnvio} placeholder="peticiones" />
            </Field>
          </>
        )}

        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)" }}>
            <input type="checkbox" checked={usarTls} onChange={(e) => setUsarTls(e.target.checked)} />
            Usar TLS / SSH cifrado
          </label>
        </Field>

        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)" }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Conexión activa
          </label>
        </Field>

        {error && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
            {error}
          </div>
        )}

        {testResult && (
          <div style={{ background: "rgba(255,255,255,0.04)", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)" }}>
            {testResult}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !conexion}
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(241,239,232,0.7)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: testing ? "wait" : "pointer", opacity: testing || !conexion ? 0.5 : 1 }}
          >
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ background: "rgba(83,74,183,0.22)", color: "#AFA9EC", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>

      {/* -- Listado de ficheros SFTP (solo Paquete 3 / tipo SFTP) -- */}
      {esSftp && conexion && conexion.tipo === "sftp" && (
        <div style={{ marginTop: 24, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>Explorar SFTP</h2>
          <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", margin: "0 0 16px" }}>
            Lista los ficheros disponibles en la carpeta de recepción (resolviendo plantillas en runtime). Solo lectura.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nombre (opcional)"
              style={{ flex: 1, minWidth: 200, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13, outline: "none" }}
            />
            <button
              type="button"
              onClick={handleListar}
              disabled={listing}
              style={{ background: "rgba(83,74,183,0.22)", color: "#AFA9EC", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: listing ? "wait" : "pointer", opacity: listing ? 0.6 : 1 }}
            >
              {listing ? "Listando…" : "Listar ficheros"}
            </button>
          </div>

          {listadoError && (
            <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
              {listadoError}
            </div>
          )}

          {listadoSftp && (
            <>
              <div style={{ fontSize: 11, color: "rgba(241,239,232,0.6)", marginBottom: 8 }}>
                Ruta consultada: <code style={{ background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4 }}>{listadoSftp.ruta_consultada || "(vacía)"}</code>
                {" · "}{listadoSftp.total} fichero{listadoSftp.total === 1 ? "" : "s"}
              </div>
              {listadoSftp.items.length === 0 ? (
                <div style={{ padding: 14, color: "rgba(241,239,232,0.5)", fontSize: 12, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                  No hay ficheros en esa carpeta (ni que coincidan con el filtro).
                </div>
              ) : (
                <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                        <th style={thStyle}>Nombre</th>
                        <th style={thStyle}>Tamaño</th>
                        <th style={thStyle}>Modificado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listadoSftp.items.map((f, i) => (
                        <tr key={i} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                          <td style={tdStyle}><span style={{ fontFamily: "monospace" }}>{f.nombre}</span></td>
                          <td style={tdStyle}>{formatBytes(f.tamano_bytes)}</td>
                          <td style={tdStyle}>{f.modificado ? new Date(f.modificado).toLocaleString("es-ES") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- helpers UI ----

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 500,
  fontSize: 11,
  color: "rgba(241,239,232,0.5)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "var(--ds-text-primary, #F1EFE8)",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n = n / 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{ display: "block", fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13, outline: "none" }}
    />
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    ok:           { bg: "rgba(29,158,117,0.2)",   color: "#1D9E75" },
    error:        { bg: "rgba(226,75,74,0.2)",    color: "#E24B4A" },
    no_probado:   { bg: "rgba(239,159,39,0.2)",   color: "#EF9F27" },
    desconocido:  { bg: "rgba(255,255,255,0.08)", color: "rgba(241,239,232,0.6)" },
  };
  const s = map[estado] || map.desconocido;
  return (
    <span style={{ display: "inline-block", background: s.bg, color: s.color, fontSize: 11, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {estado}
    </span>
  );
}
