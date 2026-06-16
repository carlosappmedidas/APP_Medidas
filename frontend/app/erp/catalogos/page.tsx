// app/erp/catalogos/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, readApiError } from "../../apiConfig";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
  return t ? { Authorization: "Bearer " + t } : {};
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface TarifaPeriodo {
  id: number;
  periodo: string;
  tipo: string;
  orden: number;
  descripcion: string | null;
}
interface Tarifa {
  id: number;
  codigo: string;
  descripcion: string;
  codigo_ree: string | null;
  nivel_tension: string;
  num_periodos_energia: number;
  num_periodos_potencia: number;
  referencia_normativa: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  orden: number | null;
  activo: boolean;
  notas: string | null;
  periodos: TarifaPeriodo[];
}
interface Comercializadora {
  id?: number;
  nombre: string;
  cif: string;
  codigo_ree: string;
  codigo_cnmc: string | null;
  codigo_liquidacion_cnmc: string | null;
  fecha_alta_cnmc: string | null;
  fecha_baja_cnmc: string | null;
  es_cur: boolean;
  activo: boolean;
  notas: string | null;
}

const EMPTY_COM: Comercializadora = {
  nombre: "", cif: "", codigo_ree: "",
  codigo_cnmc: null, codigo_liquidacion_cnmc: null, fecha_alta_cnmc: null, fecha_baja_cnmc: null,
  es_cur: false, activo: true, notas: "",
};

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#9aa4b2", marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "#0f1623",
  border: "1px solid #2a3441", borderRadius: 6, color: "#e5e7eb",
  fontSize: 14, boxSizing: "border-box",
};
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#9aa4b2", fontWeight: 500, padding: "10px 12px", borderBottom: "1px solid #1f2733" };
const tdStyle: React.CSSProperties = { padding: "12px", fontSize: 14, borderBottom: "1px solid #161c26" };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

function badge(activo: boolean) {
  return (
    <span style={{
      fontSize: 12, padding: "2px 8px", borderRadius: 999,
      background: activo ? "#0e2a1a" : "#23262d",
      color: activo ? "#34d399" : "#9aa4b2",
      border: `1px solid ${activo ? "#1f5138" : "#2a3441"}`,
    }}>
      {activo ? "activo" : "baja"}
    </span>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 16px", fontSize: 14, cursor: "pointer", borderRadius: 8,
    border: "1px solid " + (active ? "#2a3441" : "transparent"),
    background: active ? "#1f2733" : "transparent",
    color: active ? "#e5e7eb" : "#9aa4b2",
  };
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; monospace?: boolean }) {
  const { label, value, onChange, placeholder, monospace } = props;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input style={monospace ? { ...inputStyle, ...mono } : inputStyle} value={value}
        placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#e5e7eb" }}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function CatalogosPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<"tarifas" | "comercializadoras">("tarifas");

  // Tarifas
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loadingTar, setLoadingTar] = useState(false);

  // Comercializadoras
  const [coms, setComs] = useState<Comercializadora[]>([]);
  const [loadingCom, setLoadingCom] = useState(false);
  const [search, setSearch] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<Comercializadora>(EMPTY_COM);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) { router.replace("/login"); return; }
    } catch { /* */ }
    setAuthChecked(true);
  }, [router]);

  const cargarTarifas = useCallback(async () => {
    setLoadingTar(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/tarifas`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setTarifas(Array.isArray(data) ? (data as Tarifa[]) : []);
    } catch { setTarifas([]); }
    finally { setLoadingTar(false); }
  }, []);

  const cargarComs = useCallback(async () => {
    setLoadingCom(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (soloActivas) params.set("solo_activas", "true");
      const r = await fetch(`${API_BASE_URL}/erp/comercializadoras?${params.toString()}`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setComs(Array.isArray(data) ? (data as Comercializadora[]) : []);
    } catch { setComs([]); }
    finally { setLoadingCom(false); }
  }, [search, soloActivas]);

  useEffect(() => {
    if (!authChecked || tab !== "tarifas") return;
    cargarTarifas();
  }, [authChecked, tab, cargarTarifas]);

  useEffect(() => {
    if (!authChecked || tab !== "comercializadoras") return;
    const t = setTimeout(() => cargarComs(), 250);
    return () => clearTimeout(t);
  }, [authChecked, tab, cargarComs]);

  const abrirNuevo = () => { setForm({ ...EMPTY_COM }); setErrorMsg(null); setPanelOpen(true); };
  const abrirEditar = (c: Comercializadora) => { setForm({ ...EMPTY_COM, ...c }); setErrorMsg(null); setPanelOpen(true); };
  const cerrar = () => { if (!saving) setPanelOpen(false); };

  const puedeGuardar = !!(form.nombre.trim() && form.cif.trim() && form.codigo_ree.trim());

  const guardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true); setErrorMsg(null);
    try {
      const esNuevo = form.id == null;
      const url = esNuevo
        ? `${API_BASE_URL}/erp/comercializadoras`
        : `${API_BASE_URL}/erp/comercializadoras/${form.id}`;
      const payload = {
        nombre: form.nombre, cif: form.cif, codigo_ree: form.codigo_ree,
        codigo_cnmc: form.codigo_cnmc || null,
        codigo_liquidacion_cnmc: form.codigo_liquidacion_cnmc || null,
        fecha_alta_cnmc: form.fecha_alta_cnmc || null,
        fecha_baja_cnmc: form.fecha_baja_cnmc || null,
        es_cur: form.es_cur, activo: form.activo, notas: form.notas,
      };
      const r = await fetch(url, {
        method: esNuevo ? "POST" : "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        if (r.status === 409) setErrorMsg("Ya existe una comercializadora con ese código REE.");
        else setErrorMsg(await readApiError(r, "No se pudo guardar la comercializadora."));
        return;
      }
      setPanelOpen(false);
      await cargarComs();
    } catch {
      setErrorMsg("Error de conexión al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const desactivar = async () => {
    if (form.id == null) return;
    if (!window.confirm("¿Dar de baja esta comercializadora?")) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/comercializadoras/${form.id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (r.ok) { setPanelOpen(false); await cargarComs(); }
    } finally { setSaving(false); }
  };

  if (!authChecked) return null;

  const periodosTxt = (t: Tarifa, tipo: string) =>
    t.periodos.filter((p) => p.tipo === tipo).sort((a, b) => a.orden - b.orden).map((p) => p.periodo).join(" ") || "—";

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Catálogos</h1>
      <p style={{ color: "#9aa4b2", marginTop: 4, marginBottom: 18 }}>
        Tablas reguladas, comunes a todas las empresas.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button style={tabBtn(tab === "tarifas")} onClick={() => setTab("tarifas")}>Tarifas</button>
        <button style={tabBtn(tab === "comercializadoras")} onClick={() => setTab("comercializadoras")}>Comercializadoras</button>
      </div>

      {tab === "tarifas" ? (
        loadingTar ? (
          <p style={{ color: "#6b7280" }}>Cargando…</p>
        ) : tarifas.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No hay tarifas. Ejecuta el seed (scripts/seed_erp_tarifas.py).</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Código</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>REE</th>
                <th style={thStyle}>Nivel</th>
                <th style={thStyle}>Periodos energía</th>
                <th style={thStyle}>Periodos potencia</th>
                <th style={thStyle}>Vigencia</th>
                <th style={thStyle}>Norma</th>
              </tr>
            </thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id}>
                  <td style={{ ...tdStyle, ...mono, fontWeight: 600 }}>{t.codigo}</td>
                  <td style={tdStyle}>{t.descripcion}</td>
                  <td style={{ ...tdStyle, ...mono }}>{t.codigo_ree ?? "—"}</td>
                  <td style={tdStyle}>{t.nivel_tension}</td>
                  <td style={{ ...tdStyle, ...mono, fontSize: 12 }}>{periodosTxt(t, "energia")}</td>
                  <td style={{ ...tdStyle, ...mono, fontSize: 12 }}>{periodosTxt(t, "potencia")}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>
                    {t.vigencia_desde ?? "—"}{t.vigencia_hasta ? ` → ${t.vigencia_hasta}` : ""}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: "#9aa4b2" }}>{t.referencia_normativa ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, CIF o código REE…" style={{ ...inputStyle, flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9aa4b2", fontSize: 14, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} /> Solo activas
            </label>
            <button onClick={abrirNuevo}
              style={{ padding: "9px 14px", background: "#1f2733", color: "#e5e7eb", border: "1px solid #2a3441", borderRadius: 8, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
              + Nueva comercializadora
            </button>
          </div>

          {loadingCom ? (
            <p style={{ color: "#6b7280" }}>Cargando…</p>
          ) : coms.length === 0 ? (
            <p style={{ color: "#6b7280" }}>
              {search.trim() ? "Sin resultados." : "No hay comercializadoras todavía."}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>CIF</th>
                  <th style={thStyle}>Código REE</th>
                  <th style={thStyle}>CUR</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {coms.map((c) => (
                  <tr key={c.id} onClick={() => abrirEditar(c)} style={{ cursor: "pointer", opacity: c.activo ? 1 : 0.55 }}>
                    <td style={tdStyle}>{c.nombre}</td>
                    <td style={{ ...tdStyle, ...mono }}>{c.cif}</td>
                    <td style={{ ...tdStyle, ...mono }}>{c.codigo_ree}</td>
                    <td style={tdStyle}>{c.es_cur ? "Sí" : "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{badge(c.activo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {panelOpen && (
        <>
          <div onClick={cerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 460, maxWidth: "92vw", background: "#0b0f17", borderLeft: "1px solid #1f2733", zIndex: 50, padding: 24, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{form.id != null ? (form.nombre || "Comercializadora") : "Nueva comercializadora"}</div>
                <div style={{ fontSize: 13, color: "#9aa4b2" }}>{form.id != null ? "Editar" : "Alta"}</div>
              </div>
              <button onClick={cerrar} style={{ background: "none", border: "none", color: "#9aa4b2", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            {errorMsg && (
              <div style={{ background: "#2a1416", border: "1px solid #5b2330", color: "#f7a3ad", padding: "8px 10px", borderRadius: 6, fontSize: 13, margin: "8px 0" }}>{errorMsg}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <TextField label="Nombre *" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
              </div>
              <TextField label="CIF *" value={form.cif} onChange={(v) => setForm({ ...form, cif: v })} monospace />
              <TextField label="Código REE *" value={form.codigo_ree} onChange={(v) => setForm({ ...form, codigo_ree: v })} monospace />
              <TextField label="Código CNMC (R2-XXX)" value={form.codigo_cnmc ?? ""} onChange={(v) => setForm({ ...form, codigo_cnmc: v })} monospace />
              <TextField label="Código liquidación CNMC" value={form.codigo_liquidacion_cnmc ?? ""} onChange={(v) => setForm({ ...form, codigo_liquidacion_cnmc: v })} />
              <div>
                <label style={labelStyle}>Fecha alta CNMC</label>
                <input type="date" style={inputStyle} value={form.fecha_alta_cnmc ?? ""} onChange={(e) => setForm({ ...form, fecha_alta_cnmc: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Fecha baja CNMC</label>
                <input type="date" style={inputStyle} value={form.fecha_baja_cnmc ?? ""} onChange={(e) => setForm({ ...form, fecha_baja_cnmc: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Check label="Comercializadora de referencia (CUR/COR)" checked={form.es_cur} onChange={(v) => setForm({ ...form, es_cur: v })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Notas</label>
              <textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Check label="Activa" checked={form.activo} onChange={(v) => setForm({ ...form, activo: v })} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={guardar} disabled={saving || !puedeGuardar}
                  style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: saving || !puedeGuardar ? "default" : "pointer", background: puedeGuardar ? "#2563eb" : "#1f2733", color: "#fff", border: "none", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                {form.id != null && (
                  <button onClick={desactivar} disabled={saving}
                    style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer", background: "none", color: "#f7a3ad", border: "1px solid #5b2330" }}>
                    Desactivar
                  </button>
                )}
              </div>
              <button onClick={cerrar} style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer", background: "none", color: "#9aa4b2", border: "1px solid #2a3441" }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
