// app/stg/wsprime/components/WsPrimeConfigPanel.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../apiConfig";
import {
  ConcentradorBasico,
  Fabricante,
  FABRICANTES_OPTIONS,
  WsPrimeConfigCreatePayload,
  WsPrimeConfigOut,
  WsPrimeConfigUpdatePayload,
  WsPrimeInfoGeneral,
  WsPrimeTestResult,
} from "./WsPrimeTypes";

interface Props {
  concentrador: ConcentradorBasico;
  onClose: () => void;
  onConfigChanged: () => void; // callback para refrescar lista padre
}

export default function WsPrimeConfigPanel({ concentrador, onClose, onConfigChanged }: Props) {
  const [config, setConfig] = useState<WsPrimeConfigOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<WsPrimeTestResult | null>(null);
  const [infoResult, setInfoResult] = useState<WsPrimeInfoGeneral | null>(null);

  // Form state
  const [fabricante, setFabricante] = useState<Fabricante>("mock");
  const [url, setUrl] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [timeout, setTimeoutSec] = useState(30);
  const [verifySsl, setVerifySsl] = useState(true);
  const [activo, setActivo] = useState(true);

  // Cargar config existente (si la hay)
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/stg/wsprime/config/${concentrador.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: WsPrimeConfigOut | null) => {
        if (data) {
          setConfig(data);
          setFabricante(data.fabricante);
          setUrl(data.url);
          setUsuario(data.usuario);
          setTimeoutSec(data.timeout_segundos);
          setVerifySsl(data.verify_ssl);
          setActivo(data.activo);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [concentrador.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setSaving(true);
    setError(null);
    setTestResult(null);
    setInfoResult(null);

    try {
      let response: Response;
      if (config) {
        // PATCH (update)
        const payload: WsPrimeConfigUpdatePayload = {
          fabricante, url, usuario, timeout_segundos: timeout,
          verify_ssl: verifySsl, activo,
        };
        if (password) payload.password = password;
        response = await fetch(`${API_BASE_URL}/stg/wsprime/config/${concentrador.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      } else {
        // POST (create)
        if (!password) {
          throw new Error("La password es obligatoria al crear una config nueva.");
        }
        const payload: WsPrimeConfigCreatePayload = {
          concentrador_id: concentrador.id,
          fabricante, url, usuario, password,
          timeout_segundos: timeout, verify_ssl: verifySsl, activo,
        };
        response = await fetch(`${API_BASE_URL}/stg/wsprime/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`HTTP ${response.status}: ${txt.slice(0, 200)}`);
      }
      const data: WsPrimeConfigOut = await response.json();
      setConfig(data);
      setPassword("");
      onConfigChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API_BASE_URL}/stg/wsprime/test/${concentrador.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: WsPrimeTestResult = await r.json();
      setTestResult(data);

      // Refresca config para ver ultima_conexion_*
      const r2 = await fetch(`${API_BASE_URL}/stg/wsprime/config/${concentrador.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r2.ok) setConfig(await r2.json());
      onConfigChanged();
    } catch (e) {
      setTestResult({ ok: false, mensaje: String(e), info: null });
    } finally {
      setTesting(false);
    }
  };

  const handleInfo = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoadingInfo(true);
    setInfoResult(null);
    try {
      const r = await fetch(`${API_BASE_URL}/stg/wsprime/info/${concentrador.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: WsPrimeInfoGeneral = await r.json();
      setInfoResult(data);
    } catch (e) {
      setInfoResult({ ok: false, mensaje: String(e), info: null });
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar la configuración WS-PRIME del concentrador ${concentrador.codigo_ct}?`)) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/stg/wsprime/config/${concentrador.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
      setConfig(null);
      setFabricante("mock");
      setUrl("");
      setUsuario("");
      setPassword("");
      setTimeoutSec(30);
      setVerifySsl(true);
      setActivo(true);
      setTestResult(null);
      setInfoResult(null);
      onConfigChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, color: "rgba(241,239,232,0.5)" }}>Cargando…</div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>
            WS-PRIME · {concentrador.codigo_ct}
          </h2>
          <p style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", margin: 0 }}>
            {concentrador.nombre || "(sin nombre)"} · {concentrador.fabricante || "?"} {concentrador.modelo || ""}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{ background: "transparent", color: "rgba(241,239,232,0.5)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
        >
          Cerrar
        </button>
      </div>

      {config && (
        <div style={{ marginBottom: 16, padding: 10, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 11, color: "rgba(241,239,232,0.7)" }}>
          Último test:{" "}
          {config.ultima_conexion_ok === null ? (
            <span style={{ color: "#EF9F27" }}>nunca probado</span>
          ) : config.ultima_conexion_ok ? (
            <span style={{ color: "#1D9E75" }}>✅ OK</span>
          ) : (
            <span style={{ color: "#E24B4A" }}>❌ FALLÓ</span>
          )}
          {config.ultima_conexion_at && (
            <> · {new Date(config.ultima_conexion_at).toLocaleString("es-ES")}</>
          )}
          {config.ultima_conexion_error && (
            <div style={{ marginTop: 4, color: "#E24B4A" }}>Error: {config.ultima_conexion_error}</div>
          )}
        </div>
      )}

      <form onSubmit={handleSave} style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 20 }}>
        <FieldL label="Fabricante">
          <select
            value={fabricante}
            onChange={(e) => setFabricante(e.target.value as Fabricante)}
            style={inputStyle}
          >
            {FABRICANTES_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={!opt.disponible}>
                {opt.label} {!opt.disponible ? "(próximamente)" : ""}
              </option>
            ))}
          </select>
        </FieldL>

        <FieldL label="URL del endpoint WS-PRIME">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://concentrador.local:443/wsprime"
            style={inputStyle}
            required
          />
        </FieldL>

        <FieldL label="Usuario">
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="admin"
            style={inputStyle}
            required
          />
        </FieldL>

        <FieldL label={config ? "Password (vacío = no cambiar)" : "Password"}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
            required={!config}
          />
        </FieldL>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldL label="Timeout (s)">
            <input
              type="number"
              min={1}
              max={300}
              value={timeout}
              onChange={(e) => setTimeoutSec(Math.max(1, Number(e.target.value) || 30))}
              style={inputStyle}
            />
          </FieldL>
          <FieldL label="Verify SSL">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)", marginTop: 6 }}>
              <input type="checkbox" checked={verifySsl} onChange={(e) => setVerifySsl(e.target.checked)} />
              Verificar certificado SSL
            </label>
          </FieldL>
        </div>

        <FieldL label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)" }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Configuración activa
          </label>
        </FieldL>

        {error && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {config && (
              <>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || saving}
                  style={btnSecondary(testing)}
                >
                  {testing ? "Probando…" : "Probar conexión"}
                </button>
                <button
                  type="button"
                  onClick={handleInfo}
                  disabled={loadingInfo || saving}
                  style={btnSecondary(loadingInfo)}
                >
                  {loadingInfo ? "Leyendo…" : "Info general"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  style={btnDanger(saving)}
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            style={btnPrimary(saving)}
          >
            {saving ? "Guardando…" : config ? "Actualizar" : "Crear"}
          </button>
        </div>
      </form>

      {testResult && (
        <div style={{ marginTop: 16, padding: 12, background: testResult.ok ? "rgba(29,158,117,0.1)" : "rgba(226,75,74,0.1)", border: `0.5px solid ${testResult.ok ? "rgba(29,158,117,0.4)" : "rgba(226,75,74,0.4)"}`, borderRadius: 6, fontSize: 13, color: testResult.ok ? "#1D9E75" : "#E24B4A" }}>
          {testResult.ok ? "✅" : "❌"} {testResult.mensaje}
          {testResult.info && (
            <pre style={{ marginTop: 8, color: "rgba(241,239,232,0.7)", fontSize: 11, overflow: "auto" }}>
              {JSON.stringify(testResult.info, null, 2)}
            </pre>
          )}
        </div>
      )}

      {infoResult && (
        <div style={{ marginTop: 16, padding: 12, background: "rgba(83,74,183,0.06)", border: "0.5px solid rgba(83,74,183,0.2)", borderRadius: 6, fontSize: 13 }}>
          <div style={{ color: infoResult.ok ? "#AFA9EC" : "#E24B4A", marginBottom: 8 }}>
            {infoResult.ok ? "ℹ️" : "❌"} {infoResult.mensaje}
          </div>
          {infoResult.info && (
            <pre style={{ color: "rgba(241,239,232,0.7)", fontSize: 11, overflow: "auto", margin: 0 }}>
              {JSON.stringify(infoResult.info, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Estilos compartidos ----
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  padding: "8px 12px",
  color: "var(--ds-text-primary, #F1EFE8)",
  fontSize: 13,
  outline: "none",
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: "rgba(83,74,183,0.22)",
    color: "#AFA9EC",
    border: "none",
    borderRadius: 6,
    padding: "8px 20px",
    fontSize: 13,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.04)",
    color: "rgba(241,239,232,0.7)",
    border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function btnDanger(disabled: boolean): React.CSSProperties {
  return {
    background: "rgba(226,75,74,0.1)",
    color: "#E24B4A",
    border: "0.5px solid rgba(226,75,74,0.3)",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function FieldL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ display: "block", fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}