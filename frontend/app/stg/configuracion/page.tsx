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
  estado: string;
  ultimo_ping: string | null;
  ultimo_error: string | null;
}

export default function StgConfiguracionPage() {
  const empresaId = useStgEmpresaId();
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tipo, setTipo] = useState<"gisce" | "sftp" | "api_rest" | "db_directa">("gisce");
  const [nombre, setNombre] = useState("");
  const [host, setHost] = useState("");
  const [puerto, setPuerto] = useState<number | "">("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [rutaBase, setRutaBase] = useState("");
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
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
      };
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

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  if (loading) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Cargando…</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
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
            <option value="gisce">GISCE (XML-RPC) — pendiente Paquete 4</option>
            <option value="sftp">SFTP — pendiente Paquete 3</option>
            <option value="api_rest">API REST genérica — pendiente</option>
            <option value="db_directa">BD directa — pendiente</option>
          </select>
        </Field>

        <Field label="Nombre / etiqueta">
          <Input value={nombre} onChange={setNombre} placeholder="GISCE Lersa" />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Field label="Host">
            <Input value={host} onChange={setHost} placeholder="gisce.lersa.cat" />
          </Field>
          <Field label="Puerto">
            <Input value={String(puerto)} onChange={(v) => setPuerto(v === "" ? "" : Number(v))} placeholder="8069" />
          </Field>
        </div>

        <Field label="Usuario">
          <Input value={usuario} onChange={setUsuario} placeholder="admin" />
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

        <Field label="Ruta base (solo SFTP / API)">
          <Input value={rutaBase} onChange={setRutaBase} placeholder="/stg/peticiones" />
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
    </div>
  );
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
