// app/components/topologia/CrearCtModal.tsx
"use client";

import { useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

interface Props {
  token: string;
  empresaId: number;
  onClose: () => void;
  onCreated: () => void;
}

type FormData = Record<string, string>;

const CAMPOS: { key: string; label: string; type: "text" | "number" | "date"; required?: boolean; group: string }[] = [
  // Identificación
  { key: "id_ct",                  label: "Identificador CT",       type: "text",   required: true, group: "Identificación" },
  { key: "nombre",                 label: "Denominación",           type: "text",   required: true, group: "Identificación" },
  { key: "cini",                   label: "CINI",                   type: "text",   group: "Identificación" },
  { key: "codigo_ccuu",            label: "Código CCUU",            type: "text",   group: "Identificación" },
  // Red
  { key: "nudo_alta",              label: "Nudo alta",              type: "text",   group: "Red" },
  { key: "nudo_baja",              label: "Nudo baja",              type: "text",   group: "Red" },
  { key: "tension_kv",             label: "Tensión explotación (kV)", type: "number", group: "Red" },
  { key: "tension_construccion_kv", label: "Tensión construcción (kV)", type: "number", group: "Red" },
  { key: "potencia_kva",           label: "Potencia (kVA)",         type: "number", group: "Red" },
  // Ubicación
  { key: "lat",                    label: "Latitud",                type: "number", group: "Ubicación" },
  { key: "lon",                    label: "Longitud",               type: "number", group: "Ubicación" },
  { key: "municipio_ine",          label: "Municipio (INE)",        type: "text",   group: "Ubicación" },
  { key: "provincia",              label: "Provincia",              type: "text",   group: "Ubicación" },
  { key: "ccaa",                   label: "CCAA",                   type: "text",   group: "Ubicación" },
  { key: "zona",                   label: "Zona",                   type: "text",   group: "Ubicación" },
  // Estado
  { key: "propiedad",              label: "Propiedad",              type: "text",   group: "Estado" },
  { key: "estado",                 label: "Estado",                 type: "number", group: "Estado" },
  { key: "modelo",                 label: "Modelo",                 type: "text",   group: "Estado" },
  { key: "punto_frontera",         label: "Punto frontera",         type: "number", group: "Estado" },
  // Fechas
  { key: "fecha_aps",              label: "Fecha APS",              type: "date",   group: "Fechas" },
  { key: "causa_baja",             label: "Causa baja",             type: "number", group: "Fechas" },
  { key: "fecha_baja",             label: "Fecha baja",             type: "date",   group: "Fechas" },
  { key: "fecha_ip",               label: "Fecha IP",               type: "date",   group: "Fechas" },
  // Inversión
  { key: "tipo_inversion",         label: "Tipo inversión",         type: "number", group: "Inversión" },
  { key: "financiado",             label: "Financiado",             type: "number", group: "Inversión" },
  { key: "im_tramites",            label: "IM trámites",            type: "number", group: "Inversión" },
  { key: "im_construccion",        label: "IM construcción",        type: "number", group: "Inversión" },
  { key: "im_trabajos",            label: "IM trabajos",            type: "number", group: "Inversión" },
  { key: "subvenciones_europeas",  label: "Subvenciones europeas",  type: "number", group: "Inversión" },
  { key: "subvenciones_nacionales", label: "Subvenciones nacionales", type: "number", group: "Inversión" },
  { key: "subvenciones_prtr",      label: "Subvenciones PRTR",      type: "number", group: "Inversión" },
  { key: "valor_auditado",         label: "Valor auditado",         type: "number", group: "Inversión" },
  { key: "cuenta",                 label: "Cuenta",                 type: "text",   group: "Inversión" },
  { key: "motivacion",             label: "Motivación",             type: "text",   group: "Inversión" },
  // Otros
  { key: "avifauna",               label: "Avifauna",               type: "number", group: "Otros" },
  { key: "identificador_baja",     label: "Identificador baja",     type: "text",   group: "Otros" },
];

const GROUPS = [...new Set(CAMPOS.map(c => c.group))];

export default function CrearCtModal({ token, empresaId, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormData>({});
    const [saving, setSaving] = useState(false);

  // ── Estado envío SFTP ─────────────────────────────────────────────────────
  const [sftpModalOpen,    setSftpModalOpen]    = useState(false);
  const [sftpFichero,      setSftpFichero]      = useState<string | null>(null);
  const [sftpConfigs,      setSftpConfigs]      = useState<{id: number; nombre: string; host: string}[]>([]);
  const [sftpConfigId,     setSftpConfigId]     = useState<number | null>(null);
  const [sftpPath,         setSftpPath]         = useState<string>("/");
  const [sftpCarpetas,     setSftpCarpetas]     = useState<{nombre: string; path: string}[]>([]);
  const [sftpLoadingPath,  setSftpLoadingPath]  = useState(false);
  const [sftpEnviando,     setSftpEnviando]     = useState(false);
  const [sftpError,        setSftpError]        = useState<string | null>(null);
  const [sftpOk,           setSftpOk]           = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.id_ct?.trim() || !form.nombre?.trim()) {
      setError("Identificador CT y Denominación son obligatorios");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id_ct:  form.id_ct.trim(),
        nombre: form.nombre.trim(),
      };
      for (const campo of CAMPOS) {
        if (campo.key === "id_ct" || campo.key === "nombre") continue;
        const val = form[campo.key]?.trim();
        if (!val) continue;
        if (campo.type === "number") body[campo.key] = parseFloat(val);
        else if (campo.type === "date") body[campo.key] = val;
        else body[campo.key] = val;
      }
      const res = await fetch(`${API_BASE_URL}/topologia/cts?empresa_id=${empresaId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando CT");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = { fontSize: 11, height: 28, width: "100%" };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 2 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, width: 720, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Añadir Centro de Transformación</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Todos los campos del formulario B2 (CNMC 8/2021)</div>
          </div>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {error && <div className="ui-alert ui-alert--danger mb-3" style={{ fontSize: 11 }}>{error}</div>}

          {GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--card-border)" }}>{group}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 12px" }}>
                {CAMPOS.filter(c => c.group === group).map(campo => (
                  <div key={campo.key}>
                    <label style={labelStyle}>
                      {campo.label}
                      {campo.required && <span style={{ color: "#E24B4A" }}> *</span>}
                    </label>
                    <input
                      className="ui-input"
                      type={campo.type}
                      step={campo.type === "number" ? "any" : undefined}
                      style={inputStyle}
                      value={form[campo.key] ?? ""}
                      onChange={e => set(campo.key, e.target.value)}
                      placeholder={campo.required ? "Obligatorio" : ""}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--card-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando..." : "Crear CT"}
          </button>
        </div>
      </div>
    </div>
  );
}