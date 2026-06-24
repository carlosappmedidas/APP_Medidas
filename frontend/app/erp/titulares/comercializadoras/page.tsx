// app/erp/titulares/comercializadoras/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, readApiError } from "../../../apiConfig";
import { useErpEmpresaId } from "../../components/ErpEmpresaSelector";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

// Comercializadora del catálogo global (para el desplegable + derivados)
interface CatalogoCom {
  id: number;
  nombre: string;
  cif: string | null;
  codigo_ree: string | null;
  codigo_cnmc: string | null;
  codigo_liquidacion_cnmc: string | null;
  es_cur: boolean | null;
}

// Relación comercializadora ↔ empresa (datos propios + derivados read-only)
interface ComEmpresa {
  id?: number;
  empresa_id?: number;
  comercializadora_id: number | null;
  direccion: string | null;
  tipo_pago: string | null;
  datos_acceso_p0: string | null;
  fecha_alta_erp: string | null;
  fecha_baja_erp: string | null;
  activo: boolean;
  // derivados del catálogo (read-only)
  com_nombre?: string | null;
  com_cif?: string | null;
  com_codigo_ree?: string | null;
  com_codigo_cnmc?: string | null;
  com_codigo_liquidacion_cnmc?: string | null;
  com_es_cur?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

const EMPTY: ComEmpresa = {
  comercializadora_id: null,
  direccion: "", tipo_pago: "", datos_acceso_p0: "",
  fecha_alta_erp: "", fecha_baja_erp: "",
  activo: true,
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
  label, value, onChange, span, placeholder, maxLength, type, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  span?: boolean; placeholder?: string; maxLength?: number; type?: string; disabled?: boolean;
}) {
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? <span style={{ color: "#F0999B" }}> *</span> : null}</label>
      <input style={inputStyle} type={type} value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Campo derivado del catálogo: solo lectura
function ReadField({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ ...inputStyle, background: "rgba(255,255,255,0.02)", color: "rgba(241,239,232,0.6)", minHeight: 35, display: "flex", alignItems: "center" }}>
        {value || "—"}
      </div>
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

export default function ErpComercializadorasEmpresaPage() {
  const router = useRouter();
  const empresaId = useErpEmpresaId();

  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<ComEmpresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [modo, setModo] = useState<"ver" | "editar">("editar");
  const [original, setOriginal] = useState<ComEmpresa | null>(null);
  const [form, setForm] = useState<ComEmpresa>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoCom[]>([]);

  // Catálogo global de comercializadoras (para el desplegable de "Nueva")
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    fetch(`${API_BASE_URL}/erp/comercializadoras?solo_activas=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d)) setCatalogo(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!t) { router.replace("/login"); return; }
    } catch { /* */ }
    setAuthChecked(true);
  }, [router]);

  const cargar = useCallback(async () => {
    if (empresaId == null) { setItems([]); return; }
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (search.trim()) params.set("search", search.trim());
      if (soloActivas) params.set("solo_activas", "true");
      const r = await fetch(`${API_BASE_URL}/erp/comercializadoras-empresa?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setItems(await r.json());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, search, soloActivas]);

  useEffect(() => {
    if (!authChecked) return;
    const t = setTimeout(() => { cargar(); }, 250);
    return () => clearTimeout(t);
  }, [authChecked, cargar]);

  const abrirNuevo = () => { setForm({ ...EMPTY }); setOriginal(null); setModo("editar"); setPanelOpen(true); };
  const abrirEditar = (it: ComEmpresa) => { setForm({ ...EMPTY, ...it }); setOriginal(it); setModo("ver"); setPanelOpen(true); };
  const cerrar = () => { if (!saving) setPanelOpen(false); };
  const cancelar = () => {
    if (saving) return;
    if (original) { setForm({ ...EMPTY, ...original }); setModo("ver"); }
    else { setPanelOpen(false); }
  };

  // Al elegir comercializadora del catálogo, autocompletamos los derivados (display)
  const onSelectCatalogo = (idStr: string) => {
    const id = idStr ? Number(idStr) : null;
    const c = catalogo.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      comercializadora_id: id,
      com_nombre: c?.nombre ?? null,
      com_cif: c?.cif ?? null,
      com_codigo_ree: c?.codigo_ree ?? null,
      com_codigo_cnmc: c?.codigo_cnmc ?? null,
      com_codigo_liquidacion_cnmc: c?.codigo_liquidacion_cnmc ?? null,
      com_es_cur: c?.es_cur ?? null,
    }));
  };

  const esNuevo = form.id == null;
  const ver = modo === "ver";
  const editar = () => setModo("editar");
  const puedeGuardar = form.comercializadora_id != null;

  const guardar = async () => {
    if (empresaId == null || !puedeGuardar) return;
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    setSaving(true);
    try {
      const url = esNuevo
        ? `${API_BASE_URL}/erp/comercializadoras-empresa?empresa_id=${empresaId}`
        : `${API_BASE_URL}/erp/comercializadoras-empresa/${form.id}`;
      const base = {
        direccion: form.direccion || null,
        tipo_pago: form.tipo_pago || null,
        datos_acceso_p0: form.datos_acceso_p0 || null,
        fecha_alta_erp: form.fecha_alta_erp || null,
        fecha_baja_erp: form.fecha_baja_erp || null,
        activo: form.activo,
      };
      // En PUT no se envía comercializadora_id (no se cambia tras crear)
      const payload = esNuevo ? { comercializadora_id: form.comercializadora_id, ...base } : base;
      const r = await fetch(url, {
        method: esNuevo ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        alert(await readApiError(r, "No se pudo guardar la comercializadora."));
        return;
      }
      setPanelOpen(false);
      await cargar();
    } catch {
      alert("No se pudo guardar la comercializadora.");
    } finally {
      setSaving(false);
    }
  };

  const desactivar = async () => {
    if (form.id == null) return;
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    if (!confirm("¿Dar de baja esta comercializadora en la empresa? (se marca inactiva, no se borra)")) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/comercializadoras-empresa/${form.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setPanelOpen(false);
      await cargar();
    } catch {
      alert("No se pudo desactivar la comercializadora.");
    } finally {
      setSaving(false);
    }
  };

  if (!authChecked) return null;

  // ============================================================
  // Vista FICHA
  // ============================================================
  if (panelOpen) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <button onClick={cerrar}
              style={{ background: "none", border: "none", color: "rgba(241,239,232,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}>
              ← Comercializadoras
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 0" }}>
              {form.id ? (form.com_nombre || "Editar comercializadora") : "Nueva comercializadora"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button type="button" role="switch" aria-checked={form.activo} aria-label="Activo" disabled={ver}
              onClick={() => setForm({ ...form, activo: !form.activo })}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(241,239,232,0.75)", fontSize: 13, padding: 0 }}>
              {form.activo ? "Activa" : "Baja"}
              <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: form.activo ? "#7BE0A3" : "rgba(255,255,255,0.15)", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: form.activo ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left .15s" }} />
              </span>
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {ver ? (
                <>
                  <button onClick={cerrar} disabled={saving} style={btnGhost}>Cerrar</button>
                  <button onClick={editar} style={{ ...btnPrimary, cursor: "pointer" }}>Editar</button>
                </>
              ) : (
                <>
                  {form.id ? (
                    <button onClick={desactivar} disabled={saving} style={btnDanger}>Desactivar</button>
                  ) : null}
                  <button onClick={cancelar} disabled={saving} style={btnGhost}>Cancelar</button>
                  <button onClick={guardar} disabled={saving || !puedeGuardar}
                style={{ ...btnPrimary, cursor: saving || !puedeGuardar ? "default" : "pointer", opacity: saving || !puedeGuardar ? 0.5 : 1 }}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, borderBottom: "0.5px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
          <span style={{ fontSize: 14, padding: "8px 2px", borderBottom: "2px solid #F1EFE8", color: "var(--ds-text-primary, #F1EFE8)" }}>
            Datos generales
          </span>
        </div>

        <SectionCard title="Comercializadora (del catálogo)">
          {esNuevo ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Comercializadora<span style={{ color: "#F0999B" }}> *</span></label>
              <select style={inputStyle} disabled={ver} value={form.comercializadora_id ?? ""}
                onChange={(e) => onSelectCatalogo(e.target.value)}>
                <option value="" style={{ background: "#16181D" }}>— Selecciona —</option>
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: "#16181D" }}>
                    {c.nombre}{c.codigo_ree ? ` · ${c.codigo_ree}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <ReadField label="Comercializadora" span value={form.com_nombre ?? ""} />
          )}

          <ReadField label="CIF" value={form.com_cif ?? ""} />
          <ReadField label="Código REE" value={form.com_codigo_ree ?? ""} />
          <ReadField label="Código CNMC" value={form.com_codigo_cnmc ?? ""} />
          <ReadField label="Código liquidación CNMC" value={form.com_codigo_liquidacion_cnmc ?? ""} />
          <ReadField label="COR (CUR)" value={form.com_es_cur == null ? "" : (form.com_es_cur ? "Sí" : "No")} />
        </SectionCard>

        <SectionCard title="Relación con la distribuidora">
          <TextField disabled={ver} label="Dirección" span value={form.direccion ?? ""} maxLength={255}
            onChange={(v) => setForm({ ...form, direccion: v })} />
          <TextField disabled={ver} label="Tipo de pago" value={form.tipo_pago ?? ""} maxLength={120}
            onChange={(v) => setForm({ ...form, tipo_pago: v })} />
          <TextField disabled={ver} label="Fecha de alta (ERP)" type="date" value={form.fecha_alta_erp ?? ""}
            onChange={(v) => setForm({ ...form, fecha_alta_erp: v })} />
          <TextField disabled={ver} label="Fecha de baja (ERP)" type="date" value={form.fecha_baja_erp ?? ""}
            onChange={(v) => setForm({ ...form, fecha_baja_erp: v })} />
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Datos de acceso P0</label>
            <textarea disabled={ver} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.datos_acceso_p0 ?? ""}
              onChange={(e) => setForm({ ...form, datos_acceso_p0: e.target.value })} />
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
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Comercializadoras</h1>
      <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", marginBottom: 18 }}>
        Comercializadoras con las que opera la distribuidora.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, CIF o código REE…"
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(241,239,232,0.7)", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} /> Solo activas
        </label>
        <button onClick={abrirNuevo}
          style={{ background: "#F1EFE8", color: "#0E1014", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Nueva comercializadora
        </button>
      </div>

      {empresaId == null ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
          Selecciona una empresa en el selector de arriba.
        </div>
      ) : loading ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
          {search.trim() ? "Sin resultados para la búsqueda." : "No hay comercializadoras dadas de alta en esta empresa todavía."}
        </div>
      ) : (
        <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
                <th style={thStyle}>Comercializadora</th>
                <th style={thStyle}>Cód. REE</th>
                <th style={thStyle}>CIF</th>
                <th style={{ ...thStyle, width: 90 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} onClick={() => abrirEditar(it)}
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15 }}>🏢</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.com_nombre || "—"}
                          {it.com_es_cur ? <span style={{ ...badge("rgba(123,224,163,0.12)", "#7BE0A3"), marginLeft: 8 }}>COR</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{it.com_codigo_ree || "—"}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{it.com_cif || "—"}</td>
                  <td style={tdStyle}>
                    {it.activo
                      ? <span style={badge("rgba(74,222,128,0.15)", "#7BE0A3")}>activa</span>
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