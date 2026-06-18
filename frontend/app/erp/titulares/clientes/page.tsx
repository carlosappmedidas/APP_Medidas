// app/erp/titulares/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, readApiError } from "../../../apiConfig";
import { useErpEmpresaId } from "../../components/ErpEmpresaSelector";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

// Tipo de documento (TABLA_6 ATR)
const TIPO_DOC: [string, string][] = [
  ["", "—"], ["NI", "NIF"], ["DN", "DNI"], ["CI", "CIF"], ["NE", "NIE"],
  ["PS", "Pasaporte"], ["NV", "NIVA"], ["CT", "Carta de trabajo"], ["OT", "Otro"],
];

interface Titular {
  id?: number;
  empresa_id?: number;
  tipo_persona: string;
  tipo_identificador: string | null;
  identificador: string | null;
  nombre_de_pila: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  razon_social: string | null;
  nombre: string | null;            // display autocompuesto por el backend
  dir_tipo_via: string | null;
  dir_via: string | null;
  dir_numero: string | null;
  dir_duplicador: string | null;
  dir_escalera: string | null;
  dir_piso: string | null;
  dir_puerta: string | null;
  dir_tipo_aclarador: string | null;
  dir_aclarador: string | null;
  dir_cp: string | null;
  dir_municipio: string | null;
  dir_provincia: string | null;
  dir_pais: string | null;
  persona_contacto: string | null;
  telefono: string | null;
  movil: string | null;
  email: string | null;
  notas: string | null;
  codigo_interno: string | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

const EMPTY: Titular = {
  tipo_persona: "juridica",
  tipo_identificador: "", identificador: "",
  nombre_de_pila: "", primer_apellido: "", segundo_apellido: "", razon_social: "",
  nombre: "",
  dir_tipo_via: "", dir_via: "", dir_numero: "", dir_duplicador: "",
  dir_escalera: "", dir_piso: "", dir_puerta: "", dir_tipo_aclarador: "", dir_aclarador: "",
  dir_cp: "", dir_municipio: "", dir_provincia: "", dir_pais: "España",
  persona_contacto: "",
  telefono: "", movil: "", email: "",
  notas: "", codigo_interno: "", activo: true,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "rgba(241,239,232,0.55)", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 6,
  color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13,
  padding: "8px 10px", outline: "none", boxSizing: "border-box",
};
const thStyle: React.CSSProperties = { textAlign: "left", fontWeight: 500, padding: "10px 14px" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", color: "var(--ds-text-primary, #F1EFE8)" };

// Patrón estándar de ficha A3
const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)",
  borderRadius: 10, padding: "16px 18px", marginBottom: 12,
};
const cardTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: "var(--ds-text-primary, #F1EFE8)", marginBottom: 12,
};
const gridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
};
const btnPrimary: React.CSSProperties = {
  background: "#F1EFE8", color: "#0E1014", border: "none", borderRadius: 6,
  padding: "8px 16px", fontSize: 13, fontWeight: 500,
};
const btnGhost: React.CSSProperties = {
  background: "transparent", color: "rgba(241,239,232,0.7)",
  border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 6,
  padding: "8px 14px", fontSize: 13, cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  background: "transparent", color: "#F0999B",
  border: "0.5px solid rgba(240,153,155,0.4)", borderRadius: 6,
  padding: "8px 14px", fontSize: 13, cursor: "pointer",
};

function badge(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, fontSize: 12, padding: "2px 9px", borderRadius: 6 };
}

function TextField({
  label, value, onChange, span, placeholder, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  span?: boolean; placeholder?: string; maxLength?: number;
}) {
  // Asterisco rojo si la label termina en " *"
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? <span style={{ color: "#F0999B" }}> *</span> : null}</label>
      <input style={inputStyle} value={value} placeholder={placeholder} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type Opcion = { codigo: string; descripcion: string };

function SelectField({
  label, value, onChange, options, span,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Opcion[]; span?: boolean;
}) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{label}</label>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" style={{ background: "#16181D" }}>—</option>
        {options.map((o) => (
          <option key={o.codigo} value={o.codigo} style={{ background: "#16181D" }}>
            {o.codigo} · {o.descripcion}
          </option>
        ))}
      </select>
    </div>
  );
}

function ComboField({
  label, value, onChange, options, maxLength, span,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Opcion[]; maxLength?: number; span?: boolean;
}) {
  const listId = `dl-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={value} list={listId} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.descripcion}</option>
        ))}
      </datalist>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
      <div style={gridStyle}>{children}</div>
    </div>
  );
}

export default function ErpTitularesPage() {
  const router = useRouter();
  const empresaId = useErpEmpresaId();

  const [authChecked, setAuthChecked] = useState(false);
  const [titulares, setTitulares] = useState<Titular[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<Titular>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [catalogos, setCatalogos] = useState<{ tipo_via: Opcion[]; piso: Opcion[]; puerta: Opcion[]; aclarador_finca: Opcion[] }>(
    { tipo_via: [], piso: [], puerta: [], aclarador_finca: [] }
  );

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    fetch(`${API_BASE_URL}/erp/cnmc-catalogos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCatalogos(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!t) { router.replace("/login"); return; }
    } catch { /* */ }
    setAuthChecked(true);
  }, [router]);

  const cargarTitulares = useCallback(async () => {
    if (empresaId == null) { setTitulares([]); return; }
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (search.trim()) params.set("search", search.trim());
      if (soloActivos) params.set("solo_activos", "true");
      const r = await fetch(`${API_BASE_URL}/erp/titulares?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setTitulares(await r.json());
    } catch {
      setTitulares([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, search, soloActivos]);

  useEffect(() => {
    if (!authChecked) return;
    const t = setTimeout(() => { cargarTitulares(); }, 250);
    return () => clearTimeout(t);
  }, [authChecked, cargarTitulares]);

  const abrirNuevo = () => { setForm({ ...EMPTY }); setPanelOpen(true); };
  const abrirEditar = (t: Titular) => { setForm({ ...EMPTY, ...t }); setPanelOpen(true); };
  const cerrar = () => { if (!saving) setPanelOpen(false); };

  // Validación de nombre según normativa
  const nombreOk =
    form.tipo_persona === "fisica"
      ? !!(form.nombre_de_pila?.trim() && form.primer_apellido?.trim())
      : !!form.razon_social?.trim();
  // ATR (TiposComplejos.xsd, IdCliente): tipo de documento + identificador obligatorios
  const docOk = !!(form.tipo_identificador?.trim() && form.identificador?.trim());
  const puedeGuardar = nombreOk && docOk;

  const guardar = async () => {
     if (empresaId == null || !puedeGuardar) return;
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    setSaving(true);
    try {
      const esNuevo = form.id == null;
      const url = esNuevo
        ? `${API_BASE_URL}/erp/titulares?empresa_id=${empresaId}`
        : `${API_BASE_URL}/erp/titulares/${form.id}`;
      const payload = {
        tipo_persona: form.tipo_persona,
        tipo_identificador: form.tipo_identificador || null,
        identificador: form.identificador,
        nombre_de_pila: form.nombre_de_pila,
        primer_apellido: form.primer_apellido,
        segundo_apellido: form.segundo_apellido,
        razon_social: form.razon_social,
        dir_tipo_via: form.dir_tipo_via, dir_via: form.dir_via, dir_numero: form.dir_numero,
        dir_duplicador: form.dir_duplicador, dir_escalera: form.dir_escalera,
        dir_piso: form.dir_piso, dir_puerta: form.dir_puerta,
        dir_tipo_aclarador: form.dir_tipo_aclarador, dir_aclarador: form.dir_aclarador,
        dir_cp: form.dir_cp, dir_municipio: form.dir_municipio,
        dir_provincia: form.dir_provincia, dir_pais: form.dir_pais,
        persona_contacto: form.tipo_persona === "juridica" ? form.persona_contacto : null,
        telefono: form.telefono, movil: form.movil, email: form.email,
        notas: form.notas, codigo_interno: form.codigo_interno, activo: form.activo,
      };
      const r = await fetch(url, {
        method: esNuevo ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        alert(await readApiError(r, "No se pudo guardar el titular."));
        return;
      }
      setPanelOpen(false);
      await cargarTitulares();
    } catch {
      alert("No se pudo guardar el titular.");
    } finally {
      setSaving(false);
    }
  };

  const desactivar = async () => {
    if (form.id == null) return;
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    if (!confirm("¿Dar de baja este titular? (se marca inactivo, no se borra)")) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/titulares/${form.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setPanelOpen(false);
      await cargarTitulares();
    } catch {
      alert("No se pudo desactivar el titular.");
    } finally {
      setSaving(false);
    }
  };

  if (!authChecked) return null;

  // ============================================================
  // Vista FICHA (estándar A3: página completa, una pestaña, Activo arriba)
  // ============================================================
  if (panelOpen) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <button onClick={cerrar}
              style={{ background: "none", border: "none", color: "rgba(241,239,232,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}>
              ← Titulares
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 0" }}>
              {form.id ? "Editar titular" : "Nuevo titular"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button type="button" role="switch" aria-checked={form.activo} aria-label="Activo"
              onClick={() => setForm({ ...form, activo: !form.activo })}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(241,239,232,0.75)", fontSize: 13, padding: 0 }}>
              {form.activo ? "Activo" : "Baja"}
              <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: form.activo ? "#7BE0A3" : "rgba(255,255,255,0.15)", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: form.activo ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left .15s" }} />
              </span>
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {form.id ? (
                <button onClick={desactivar} disabled={saving} style={btnDanger}>Desactivar</button>
              ) : null}
              <button onClick={cerrar} disabled={saving} style={btnGhost}>Cancelar</button>
              <button onClick={guardar} disabled={saving || !puedeGuardar}
                style={{ ...btnPrimary, cursor: saving || !puedeGuardar ? "default" : "pointer", opacity: saving || !puedeGuardar ? 0.5 : 1 }}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, borderBottom: "0.5px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
          <span style={{ fontSize: 14, padding: "8px 2px", borderBottom: "2px solid #F1EFE8", color: "var(--ds-text-primary, #F1EFE8)" }}>
            Datos generales
          </span>
        </div>

        <SectionCard title="Identificación">
          <div>
            <label style={labelStyle}>Tipo persona</label>
            <select style={inputStyle} value={form.tipo_persona}
              onChange={(e) => setForm({ ...form, tipo_persona: e.target.value })}>
              <option value="juridica" style={{ background: "#16181D" }}>Jurídica</option>
              <option value="fisica" style={{ background: "#16181D" }}>Física</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo de documento<span style={{ color: "#F0999B" }}> *</span></label>
            <select style={inputStyle} value={form.tipo_identificador ?? ""}
              onChange={(e) => setForm({ ...form, tipo_identificador: e.target.value })}>
              {TIPO_DOC.map(([v, l]) => (
                <option key={v} value={v} style={{ background: "#16181D" }}>{l}</option>
              ))}
            </select>
          </div>
          <TextField label="Identificador (nº) *" span value={form.identificador ?? ""} onChange={(v) => setForm({ ...form, identificador: v })} />

          {form.tipo_persona === "fisica" ? (
            <>
              <TextField label="Nombre *" value={form.nombre_de_pila ?? ""} onChange={(v) => setForm({ ...form, nombre_de_pila: v })} />
              <TextField label="Primer apellido *" value={form.primer_apellido ?? ""} onChange={(v) => setForm({ ...form, primer_apellido: v })} />
              <TextField label="Segundo apellido" span value={form.segundo_apellido ?? ""} onChange={(v) => setForm({ ...form, segundo_apellido: v })} />
            </>
          ) : (
            <TextField label="Razón social *" span value={form.razon_social ?? ""} onChange={(v) => setForm({ ...form, razon_social: v })} />
          )}
        </SectionCard>

        <SectionCard title="Dirección fiscal">
          <SelectField label="Tipo de vía" value={form.dir_tipo_via ?? ""} options={catalogos.tipo_via} onChange={(v) => setForm({ ...form, dir_tipo_via: v })} />
          <TextField label="Vía" value={form.dir_via ?? ""} maxLength={30} onChange={(v) => setForm({ ...form, dir_via: v })} />
          <TextField label="Número" value={form.dir_numero ?? ""} maxLength={5} onChange={(v) => setForm({ ...form, dir_numero: v })} />
          <TextField label="Duplicador" value={form.dir_duplicador ?? ""} maxLength={3} onChange={(v) => setForm({ ...form, dir_duplicador: v })} />
          <TextField label="Escalera" value={form.dir_escalera ?? ""} maxLength={3} onChange={(v) => setForm({ ...form, dir_escalera: v })} />
          <ComboField label="Piso" value={form.dir_piso ?? ""} options={catalogos.piso} maxLength={3} onChange={(v) => setForm({ ...form, dir_piso: v })} />
          <ComboField label="Puerta" value={form.dir_puerta ?? ""} options={catalogos.puerta} maxLength={3} onChange={(v) => setForm({ ...form, dir_puerta: v })} />
          <SelectField label="Tipo de aclarador" value={form.dir_tipo_aclarador ?? ""} options={catalogos.aclarador_finca} onChange={(v) => setForm({ ...form, dir_tipo_aclarador: v })} />
          <TextField label="Aclarador" value={form.dir_aclarador ?? ""} maxLength={40} onChange={(v) => setForm({ ...form, dir_aclarador: v })} />
          <TextField label="C.P." value={form.dir_cp ?? ""} maxLength={10} onChange={(v) => setForm({ ...form, dir_cp: v })} />
          <TextField label="Municipio" value={form.dir_municipio ?? ""} maxLength={120} onChange={(v) => setForm({ ...form, dir_municipio: v })} />
          <TextField label="Provincia" value={form.dir_provincia ?? ""} maxLength={120} onChange={(v) => setForm({ ...form, dir_provincia: v })} />
          <TextField label="País" value={form.dir_pais ?? ""} maxLength={120} onChange={(v) => setForm({ ...form, dir_pais: v })} />
        </SectionCard>

        <SectionCard title="Contacto">
          {form.tipo_persona === "juridica" && (
            <TextField label="Persona de contacto" span value={form.persona_contacto ?? ""} maxLength={120} onChange={(v) => setForm({ ...form, persona_contacto: v })} />
          )}
          <TextField label="Teléfono" value={form.telefono ?? ""} onChange={(v) => setForm({ ...form, telefono: v })} />
          <TextField label="Móvil" value={form.movil ?? ""} onChange={(v) => setForm({ ...form, movil: v })} />
          <TextField label="Email" span value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
        </SectionCard>

        <SectionCard title="Otros">
          <TextField label="Código interno" value={form.codigo_interno ?? ""} onChange={(v) => setForm({ ...form, codigo_interno: v })} />
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notas</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </SectionCard>
      </div>
    );
  }

  // ============================================================
  // Vista LISTADO
  // ============================================================
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Titulares</h1>
      <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", marginBottom: 18 }}>
        Personas y empresas titulares de los suministros.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento o código…"
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(241,239,232,0.7)", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} /> Solo activos
        </label>
        <button onClick={abrirNuevo}
          style={{ background: "#F1EFE8", color: "#0E1014", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Nuevo titular
        </button>
      </div>

      {empresaId == null ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
          Selecciona una empresa en el selector de arriba.
        </div>
      ) : loading ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando titulares…</div>
      ) : titulares.length === 0 ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
          {search.trim() ? "Sin resultados para la búsqueda." : "No hay titulares en esta empresa todavía."}
        </div>
      ) : (
        <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Documento</th>
                <th style={thStyle}>Municipio</th>
                <th style={{ ...thStyle, width: 90 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {titulares.map((t) => (
                <tr key={t.id} onClick={() => abrirEditar(t)}
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15 }}>{t.tipo_persona === "fisica" ? "👤" : "🏢"}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.nombre || "—"}</div>
                        {t.codigo_interno ? (
                          <div style={{ fontSize: 11, color: "rgba(241,239,232,0.4)" }}>{t.codigo_interno}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{t.identificador || "—"}</td>
                  <td style={tdStyle}>{t.dir_municipio || "—"}</td>
                  <td style={tdStyle}>
                    {t.activo
                      ? <span style={badge("rgba(74,222,128,0.15)", "#7BE0A3")}>activo</span>
                      : <span style={badge("rgba(255,255,255,0.06)", "rgba(241,239,232,0.5)")}>baja</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}