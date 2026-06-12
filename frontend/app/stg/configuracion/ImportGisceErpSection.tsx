// app/stg/configuracion/ImportGisceErpSection.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

// --- Tipos ---
interface GisceConfigOut {
  id: number;
  empresa_id: number;
  nombre: string | null;
  host: string;
  puerto: number;
  database: string;
  usuario: string;
  activo: boolean;
  ultimo_import: string | null;
  estado: string; // "no_probado" | "ok" | "error"
  ultimo_error: string | null;
  created_at: string;
  updated_at: string;
}

interface GisceTestResult {
  ok: boolean;
  uid: number | null;
  estado: string;
  mensaje: string;
  detalle: string | null;
}

interface FormState {
  nombre: string;
  host: string;
  puerto: number;
  database: string;
  usuario: string;
  password: string;
  activo: boolean;
}

// --- Tipos para preview / execute (Paq 8f-4b) ---
interface GiscePreviewItem {
  codigo: string;
  accion: string; // "nuevo" | "modificar" | "sin_cambios" | "huerfano_local"
  detalle: string | null;
}

interface GiscePreviewResult {
  ok: boolean;
  error: string | null;
  cts_remoto_total: number;
  cups_remoto_total: number;
  cts_local_total: number;
  cups_local_total: number;
  cts_nuevos: number;
  cts_modificar: number;
  cts_sin_cambios: number;
  cts_huerfanos_local: number;
  cups_nuevos: number;
  cups_modificar: number;
  cups_sin_cambios: number;
  cups_huerfanos_local: number;
  cts_muestra: GiscePreviewItem[];
  cups_muestra: GiscePreviewItem[];
}

interface GisceExecuteResult {
  ok: boolean;
  error: string | null;
  cts_remoto_total: number;
  cts_local_total: number;
  cts_actualizados: number;
  cts_sin_cambios: number;
  cts_skipped_nuevos: number;
  cts_skipped_huerfanos: number;
  cups_remoto_total: number;
  cups_local_total: number;
  cups_creados: number;
  cups_actualizados: number;
  cups_sin_cambios: number;
  cups_skipped_sin_ct: number;
  cups_huerfanos: number;
  contadores_remoto_total: number;
  contadores_local_total: number;
  contadores_enlazados: number;
  contadores_actualizados: number;
  contadores_sin_cambios: number;
  contadores_sin_match_meter: number;
  contadores_sin_cups_local: number;
  fecha_import: string | null;
}

const FORM_INITIAL: FormState = {
  nombre: "",
  host: "",
  puerto: 8069,
  database: "",
  usuario: "",
  password: "",
  activo: true,
};

// --- Estilos compartidos (clonados de ImportExcelSection) ---
const card: React.CSSProperties = {
  padding: 14,
  background: "rgba(255,255,255,0.02)",
  borderRadius: 6,
  border: "0.5px solid rgba(255,255,255,0.12)",
};
const labelText: React.CSSProperties = { fontSize: 12, color: "rgba(241,239,232,0.5)" };
const valueText: React.CSSProperties = { fontSize: 13, color: "rgba(241,239,232,0.9)" };
const button: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "0.5px solid rgba(175,169,236,0.4)",
  background: "rgba(175,169,236,0.12)",
  color: "rgba(241,239,232,0.9)",
  fontSize: 13,
  cursor: "pointer",
};
const buttonDisabled: React.CSSProperties = { ...button, opacity: 0.5, cursor: "not-allowed" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.15)",
  borderRadius: 4,
  color: "rgba(241,239,232,0.9)",
  fontSize: 13,
};

// --- Componente principal ---
export default function ImportGisceErpSection({ empresaId }: { empresaId: number | null }) {
  const [loading, setLoading] = useState<boolean>(true);
  const [config, setConfig] = useState<GisceConfigOut | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [form, setForm] = useState<FormState>(FORM_INITIAL);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<GisceTestResult | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const cargarConfig = useCallback(async () => {
    if (empresaId == null) {
      setLoading(false);
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/stg/gisce/config?empresa_id=${empresaId}`,
        { headers: authHeader },
      );
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      const data: GisceConfigOut | null = await r.json();
      setConfig(data);
      if (data) {
        setForm({
          nombre: data.nombre ?? "",
          host: data.host,
          puerto: data.puerto,
          database: data.database,
          usuario: data.usuario,
          password: "", // NUNCA viene del backend
          activo: data.activo,
        });
        setEditing(false);
      } else {
        setForm(FORM_INITIAL);
        setEditing(true);
      }
    } catch (err: any) {
      setSaveError(`No se pudo cargar la config: ${err.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, token]);

  useEffect(() => {
    setTestResult(null);
    setSaveError(null);
    cargarConfig();
  }, [empresaId, cargarConfig]);

  const handleGuardar = async () => {
    if (empresaId == null) return;
    setSaving(true);
    setSaveError(null);
    setTestResult(null);
    try {
      const r = await fetch(
        `${API_BASE_URL}/stg/gisce/config?empresa_id=${empresaId}`,
        {
          method: "PUT",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: form.nombre || null,
            host: form.host,
            puerto: form.puerto,
            database: form.database,
            usuario: form.usuario,
            password: form.password,
            activo: form.activo,
          }),
        },
      );
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      await cargarConfig();
      setForm((prev) => ({ ...prev, password: "" }));
    } catch (err: any) {
      setSaveError(`Error guardando: ${err.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleProbar = async () => {
    if (empresaId == null) return;
    setTesting(true);
    setTestResult(null);
    try {
      // ... resto de la función ...
    } finally {
      setTesting(false);
    }
  };

  // --- Paq 8f-4b: Modal preview / execute import GISCE ---
  const [showModal, setShowModal] = useState<boolean>(false);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<GiscePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [executeResult, setExecuteResult] = useState<GisceExecuteResult | null>(null);

  const handlePreview = async () => {
    if (empresaId == null) return;
    setShowModal(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setExecuteResult(null);
    try {
      const r = await fetch(
        `${API_BASE_URL}/stg/gisce/preview?empresa_id=${empresaId}`,
        { method: "POST", headers: authHeader },
      );
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      const data: GiscePreviewResult = await r.json();
      setPreviewData(data);
      if (!data.ok && data.error) {
        setPreviewError(data.error);
      }
    } catch (err: any) {
      setPreviewError(err.message ?? String(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (empresaId == null) return;
    setExecuting(true);
    setPreviewError(null);
    try {
      const r = await fetch(
        `${API_BASE_URL}/stg/gisce/execute?empresa_id=${empresaId}`,
        { method: "POST", headers: authHeader },
      );
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      const data: GisceExecuteResult = await r.json();
      setExecuteResult(data);
      setPreviewData(null);     // ocultar preview, mostrar resultado
      if (!data.ok && data.error) {
        setPreviewError(data.error);
      }
      await cargarConfig();      // refrescar ultimo_import en la card
    } catch (err: any) {
      setPreviewError(err.message ?? String(err));
    } finally {
      setExecuting(false);
    }
  };

  const closeModal = () => {
    if (executing || previewLoading) return;   // bloquear cierre durante carga
    setShowModal(false);
    setPreviewData(null);
    setPreviewError(null);
    setExecuteResult(null);
  };

  // --- Render ---
  if (empresaId == null) {
    return (
      <div style={card}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: 15 }}>Importador GISCE-ERP</h3>
        <div style={labelText}>Selecciona una empresa para configurar el importador GISCE.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={card}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: 15 }}>Importador GISCE-ERP</h3>
        <div style={labelText}>Cargando configuracion...</div>
      </div>
    );
  }

  const estadoColor =
    config?.estado === "ok" ? "rgba(120,210,140,0.9)"
    : config?.estado === "error" ? "rgba(230,130,130,0.9)"
    : "rgba(241,239,232,0.6)";

  const formIncompleto = !form.host || !form.database || !form.usuario || !form.password;

  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: 15 }}>
        Importador GISCE-ERP{" "}
        <span style={{ fontSize: 12, color: "rgba(241,239,232,0.4)" }}>(opcional)</span>
      </h3>

      <p style={{ ...labelText, marginBottom: 14, lineHeight: 1.5 }}>
        Configura aqui la conexion a GISCE-ERP via XML-RPC para importar
        automaticamente CTs, CUPS y titulares. Si no usas GISCE, deja esta
        seccion vacia y sigue importando por Excel.
      </p>

      {/* Estado actual */}
      {config && !editing && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={labelText}>Host</div>
              <div style={valueText}>{config.host}:{config.puerto}</div>
            </div>
            <div>
              <div style={labelText}>Database</div>
              <div style={valueText}>{config.database}</div>
            </div>
            <div>
              <div style={labelText}>Usuario</div>
              <div style={valueText}>{config.usuario}</div>
            </div>
            <div>
              <div style={labelText}>Estado</div>
              <div style={{ ...valueText, color: estadoColor }}>
                {config.estado}
                {config.ultimo_error ? ` - ${config.ultimo_error.substring(0, 80)}` : ""}
              </div>
            </div>
            <div>
              <div style={labelText}>Activo</div>
              <div style={valueText}>{config.activo ? "Si" : "No"}</div>
            </div>
            <div>
              <div style={labelText}>Ultimo import</div>
              <div style={valueText}>{config.ultimo_import ?? "(nunca)"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => { setEditing(true); setSaveError(null); }}
              style={button}
              disabled={saving || testing}
            >
              Editar configuracion
            </button>
            <button
              onClick={handleProbar}
              style={testing ? buttonDisabled : button}
              disabled={testing || saving}
            >
              {testing ? "Probando..." : "Probar conexion"}
            </button>
            {/* Paq 8f-4b: botón de importación */}
            <button
              onClick={handlePreview}
              style={config.estado === "ok"
                ? { ...button, background: "rgba(120,210,140,0.15)", borderColor: "rgba(120,210,140,0.4)" }
                : buttonDisabled}
              disabled={config.estado !== "ok" || saving || testing}
              title={config.estado !== "ok"
                ? "Prueba primero la conexión (estado debe ser OK)"
                : "Vista previa de qué se importará desde GISCE"}
            >
              🔍 Vista previa GISCE
            </button>
          </div>
        </div>
      )}

      {/* Formulario (nuevo o editando) */}
      {(editing || !config) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={labelText}>Nombre (opcional)</div>
              <input
                style={input}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="ej. GISCE San Jose"
              />
            </div>
            <div>
              <div style={labelText}>Activo</div>
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                style={{ marginTop: 8 }}
              />
            </div>
            <div>
              <div style={labelText}>Host *</div>
              <input
                style={input}
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="192.168.200.44 o erp.cliente.com"
              />
            </div>
            <div>
              <div style={labelText}>Puerto *</div>
              <input
                style={input}
                type="number"
                value={form.puerto}
                onChange={(e) => setForm({ ...form, puerto: Number(e.target.value) || 8069 })}
              />
            </div>
            <div>
              <div style={labelText}>Database *</div>
              <input
                style={input}
                value={form.database}
                onChange={(e) => setForm({ ...form, database: e.target.value })}
                placeholder="sanjose"
              />
            </div>
            <div>
              <div style={labelText}>Usuario *</div>
              <input
                style={input}
                value={form.usuario}
                onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                placeholder="admin"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelText}>
                Password *
                {config && " (debes volver a introducirlo para actualizar)"}
              </div>
              <input
                style={input}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="********"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleGuardar}
              style={saving || formIncompleto ? buttonDisabled : button}
              disabled={saving || formIncompleto}
            >
              {saving ? "Guardando..." : "Guardar configuracion"}
            </button>
            {config && (
              <button
                onClick={() => {
                  setEditing(false);
                  setForm({
                    nombre: config.nombre ?? "",
                    host: config.host,
                    puerto: config.puerto,
                    database: config.database,
                    usuario: config.usuario,
                    password: "",
                    activo: config.activo,
                  });
                }}
                style={button}
                disabled={saving}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Errores guardar */}
      {saveError && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 4,
          background: "rgba(230,130,130,0.1)",
          border: "0.5px solid rgba(230,130,130,0.3)",
          color: "rgba(230,130,130,0.95)",
          fontSize: 12,
        }}>
          {saveError}
        </div>
      )}

      {/* Resultado del test */}
      {testResult && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 4,
          background: testResult.ok ? "rgba(120,210,140,0.08)" : "rgba(230,130,130,0.1)",
          border: testResult.ok
            ? "0.5px solid rgba(120,210,140,0.3)"
            : "0.5px solid rgba(230,130,130,0.3)",
          color: testResult.ok
            ? "rgba(120,210,140,0.95)"
            : "rgba(230,130,130,0.95)",
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {testResult.ok ? "Conexion OK" : "Error de conexion"}
            {testResult.uid != null ? ` (uid=${testResult.uid})` : ""}
          </div>
          <div>{testResult.mensaje}</div>
          {testResult.detalle && (
            <div style={{ marginTop: 4, opacity: 0.75, fontSize: 11, fontFamily: "monospace" }}>
              {testResult.detalle}
            </div>
          )}
        </div>
      )}

      {/* Paq 8f-4b: Modal preview / execute */}
      {showModal && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20,20,24,0.98)",
              border: "0.5px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: 24,
              maxWidth: 720,
              width: "100%",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "rgba(241,239,232,0.95)" }}>
                {executeResult ? "✅ Importación completada" : "🔍 Vista previa importación GISCE"}
              </h3>
              <button
                onClick={closeModal}
                disabled={previewLoading || executing}
                style={{ background: "transparent", border: "none", color: "rgba(241,239,232,0.6)", fontSize: 22, cursor: (previewLoading || executing) ? "not-allowed" : "pointer", lineHeight: 1 }}
                title="Cerrar"
              >×</button>
            </div>

            {/* Estado: cargando preview */}
            {previewLoading && (
              <div style={{ padding: 24, textAlign: "center", color: "rgba(241,239,232,0.7)" }}>
                <div style={{ fontSize: 13 }}>Conectando con GISCE-ERP y comparando datos...</div>
                <div style={{ fontSize: 11, color: "rgba(241,239,232,0.4)", marginTop: 6 }}>Puede tardar 30-60 segundos.</div>
              </div>
            )}

            {/* Estado: ejecutando import */}
            {executing && (
              <div style={{ padding: 24, textAlign: "center", color: "rgba(241,239,232,0.7)" }}>
                <div style={{ fontSize: 13 }}>Importando datos en BD...</div>
                <div style={{ fontSize: 11, color: "rgba(241,239,232,0.4)", marginTop: 6 }}>Puede tardar 1-2 minutos. No cierres esta ventana.</div>
              </div>
            )}

            {/* Estado: error */}
            {previewError && !previewLoading && !executing && (
              <div style={{
                padding: 12,
                borderRadius: 4,
                background: "rgba(230,130,130,0.1)",
                border: "0.5px solid rgba(230,130,130,0.3)",
                color: "rgba(230,130,130,0.95)",
                fontSize: 12,
                marginBottom: 12,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Error</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "pre-wrap" }}>{previewError}</div>
              </div>
            )}

            {/* Estado: preview cargado, esperando confirmación */}
            {previewData && !executing && !executeResult && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", marginBottom: 8 }}>CTs (Centros de Transformación)</div>
                    <div style={{ fontSize: 12, color: "rgba(241,239,232,0.85)", lineHeight: 1.8 }}>
                      <div>Remoto GISCE: <strong>{previewData.cts_remoto_total}</strong></div>
                      <div>Local actual: <strong>{previewData.cts_local_total}</strong></div>
                      <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.08)", paddingTop: 6, marginTop: 6 }}>
                        🆕 Nuevos: <strong>{previewData.cts_nuevos}</strong><br/>
                        ✏️ Actualizar: <strong>{previewData.cts_modificar}</strong><br/>
                        ✓ Sin cambios: <strong>{previewData.cts_sin_cambios}</strong><br/>
                        👻 Huérfanos local: <strong>{previewData.cts_huerfanos_local}</strong>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", marginBottom: 8 }}>CUPS</div>
                    <div style={{ fontSize: 12, color: "rgba(241,239,232,0.85)", lineHeight: 1.8 }}>
                      <div>Remoto GISCE: <strong>{previewData.cups_remoto_total}</strong></div>
                      <div>Local actual: <strong>{previewData.cups_local_total}</strong></div>
                      <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.08)", paddingTop: 6, marginTop: 6 }}>
                        🆕 Nuevos: <strong>{previewData.cups_nuevos}</strong><br/>
                        ✏️ Actualizar: <strong>{previewData.cups_modificar}</strong><br/>
                        ✓ Sin cambios: <strong>{previewData.cups_sin_cambios}</strong><br/>
                        👻 Huérfanos local: <strong>{previewData.cups_huerfanos_local}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 4, background: "rgba(239,159,39,0.08)", border: "0.5px solid rgba(239,159,39,0.3)", color: "rgba(239,159,39,0.95)", fontSize: 11, marginBottom: 16 }}>
                  ⚠️ La importación es idempotente y solo modifica filas con cambios. Esta acción puede tardar 1-2 minutos.
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={closeModal} style={button}>Cancelar</button>
                  <button
                    onClick={handleExecute}
                    style={{ ...button, background: "rgba(120,210,140,0.15)", borderColor: "rgba(120,210,140,0.4)", color: "rgba(120,210,140,0.95)" }}
                  >
                    ✅ Ejecutar importación
                  </button>
                </div>
              </>
            )}

            {/* Estado: execute completado */}
            {executeResult && (
              <>
                <div style={{ padding: 12, borderRadius: 6, background: "rgba(120,210,140,0.08)", border: "0.5px solid rgba(120,210,140,0.3)", color: "rgba(120,210,140,0.95)", fontSize: 12, marginBottom: 12 }}>
                  Import completado el {executeResult.fecha_import ? new Date(executeResult.fecha_import).toLocaleString("es-ES") : "ahora"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", marginBottom: 6 }}>CTs</div>
                    <div style={{ fontSize: 12, color: "rgba(241,239,232,0.85)", lineHeight: 1.7 }}>
                      ✏️ Actualizados: <strong>{executeResult.cts_actualizados}</strong><br/>
                      ✓ Sin cambios: <strong>{executeResult.cts_sin_cambios}</strong><br/>
                      ⏭ Skipped: <strong>{executeResult.cts_skipped_nuevos + executeResult.cts_skipped_huerfanos}</strong>
                    </div>
                  </div>
                  <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", marginBottom: 6 }}>CUPS</div>
                    <div style={{ fontSize: 12, color: "rgba(241,239,232,0.85)", lineHeight: 1.7 }}>
                      🆕 Creados: <strong>{executeResult.cups_creados}</strong><br/>
                      ✏️ Actualizados: <strong>{executeResult.cups_actualizados}</strong><br/>
                      ✓ Sin cambios: <strong>{executeResult.cups_sin_cambios}</strong><br/>
                      ⏭ Skipped (sin CT): <strong>{executeResult.cups_skipped_sin_ct}</strong>
                    </div>
                  </div>
                  <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", marginBottom: 6 }}>Contadores</div>
                    <div style={{ fontSize: 12, color: "rgba(241,239,232,0.85)", lineHeight: 1.7 }}>
                      🔗 Enlazados: <strong>{executeResult.contadores_enlazados}</strong><br/>
                      ✓ Sin cambios: <strong>{executeResult.contadores_sin_cambios}</strong><br/>
                      ⏭ Sin match meter: <strong>{executeResult.contadores_sin_match_meter}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={closeModal} style={button}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
