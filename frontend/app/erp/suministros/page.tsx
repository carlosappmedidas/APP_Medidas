"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE_URL } from "../../apiConfig";
import { useErpEmpresaId } from "../components/ErpEmpresaSelector";

// Cabeceras de autenticación: lee el token de localStorage (igual que el resto de la app)
function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return t ? { Authorization: "Bearer " + t } : {};
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface SuministroRow {
  id: number;
  cups: string;
  distribuidora: string | null;
  dir_municipio: string | null;
  tension_normalizada: string | null;
  tension_v: number | null;
  activo: boolean;
}

interface Form {
  cups: string;
  distribuidora: string;
  tipo_punto_medida: string;
  acometida: string;
  dir_tipo_via: string;
  dir_via: string;
  dir_numero: string;
  dir_resto: string;
  dir_aclarador: string;
  dir_cp: string;
  dir_municipio: string;
  dir_poblacion: string;
  dir_provincia: string;
  municipio_codigo_ine: string;
  poligono: string;
  parcela: string;
  ref_catastral: string;
  latitud: string;
  longitud: string;
  zona: string;
  orden: string;
  centro_transformador: string;
  linea: string;
  tension_normalizada: string;
  tension_v: string;
  pot_max_admisible_cie_kw: string;
  potencia_adscrita_kw: string;
  potencia_adscrita_bloqueada: boolean;
  fecha_vigencia_adscrita: string;
  fase_1: boolean;
  fase_2: boolean;
  fase_3: boolean;
  neutro: boolean;
  fecha_alta: string;
  fecha_baja: string;
  notas: string;
  activo: boolean;
}

const EMPTY: Form = {
  cups: "", distribuidora: "", tipo_punto_medida: "", acometida: "",
  dir_tipo_via: "", dir_via: "", dir_numero: "", dir_resto: "", dir_aclarador: "",
  dir_cp: "", dir_municipio: "", dir_poblacion: "", dir_provincia: "",
  municipio_codigo_ine: "", poligono: "", parcela: "", ref_catastral: "",
  latitud: "", longitud: "",
  zona: "", orden: "", centro_transformador: "", linea: "",
  tension_normalizada: "", tension_v: "", pot_max_admisible_cie_kw: "",
  potencia_adscrita_kw: "", potencia_adscrita_bloqueada: false, fecha_vigencia_adscrita: "",
  fase_1: false, fase_2: false, fase_3: false, neutro: false,
  fecha_alta: "", fecha_baja: "",
  notas: "", activo: true,
};

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "#9aa4b2", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "#0f1623",
  border: "1px solid #2a3441", borderRadius: 6, color: "#e5e7eb",
  fontSize: 14, boxSizing: "border-box",
};
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "#6b7280", margin: "18px 0 8px",
};
const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 12, color: "#9aa4b2", fontWeight: 500,
  padding: "10px 12px", borderBottom: "1px solid #1f2733",
};
const tdStyle: React.CSSProperties = {
  padding: "12px", fontSize: 14, borderBottom: "1px solid #161c26",
};
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

function badge(activo: boolean) {
  return (
    <span
      style={{
        fontSize: 12, padding: "2px 8px", borderRadius: 999,
        background: activo ? "#0e2a1a" : "#23262d",
        color: activo ? "#34d399" : "#9aa4b2",
        border: `1px solid ${activo ? "#1f5138" : "#2a3441"}`,
      }}
    >
      {activo ? "activo" : "baja"}
    </span>
  );
}

// TextField FUERA del componente para no perder el foco al re-render
function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  monospace?: boolean;
}) {
  const { label, value, onChange, type = "text", placeholder, monospace } = props;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={monospace ? { ...inputStyle, ...mono } : inputStyle}
      />
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#e5e7eb" }}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function SuministrosPage() {
  const router = useRouter();
  const empresaId = useErpEmpresaId();

  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<SuministroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("auth_token")) {
      router.push("/login");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const cargar = useCallback(async () => {
    if (empresaId == null) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("empresa_id", String(empresaId));
      if (search.trim()) params.set("search", search.trim());
      if (soloActivos) params.set("solo_activos", "true");
      const r = await fetch(`${API_BASE_URL}/erp/suministros?${params.toString()}`, {
        headers: authHeaders(),
      });
      const data: unknown = r.ok ? await r.json() : [];
      setItems(Array.isArray(data) ? (data as SuministroRow[]) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, search, soloActivos]);

  useEffect(() => {
    const t = setTimeout(() => {
      cargar();
    }, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function abrirNuevo() {
    setForm(EMPTY);
    setEditingId(null);
    setErrorMsg(null);
    setPanelOpen(true);
  }

  async function abrirFicha(id: number) {
    setErrorMsg(null);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/suministros/${id}`, { headers: authHeaders() });
      if (!r.ok) return;
      const s = await r.json();
      setForm({
        cups: s.cups ?? "",
        distribuidora: s.distribuidora ?? "",
        tipo_punto_medida: s.tipo_punto_medida != null ? String(s.tipo_punto_medida) : "",
        acometida: s.acometida ?? "",
        dir_tipo_via: s.dir_tipo_via ?? "",
        dir_via: s.dir_via ?? "",
        dir_numero: s.dir_numero ?? "",
        dir_resto: s.dir_resto ?? "",
        dir_aclarador: s.dir_aclarador ?? "",
        dir_cp: s.dir_cp ?? "",
        dir_municipio: s.dir_municipio ?? "",
        dir_poblacion: s.dir_poblacion ?? "",
        dir_provincia: s.dir_provincia ?? "",
        municipio_codigo_ine: s.municipio_codigo_ine ?? "",
        poligono: s.poligono ?? "",
        parcela: s.parcela ?? "",
        ref_catastral: s.ref_catastral ?? "",
        latitud: s.latitud != null ? String(s.latitud) : "",
        longitud: s.longitud != null ? String(s.longitud) : "",
        zona: s.zona ?? "",
        orden: s.orden ?? "",
        centro_transformador: s.centro_transformador ?? "",
        linea: s.linea ?? "",
        tension_normalizada: s.tension_normalizada ?? "",
        tension_v: s.tension_v != null ? String(s.tension_v) : "",
        pot_max_admisible_cie_kw: s.pot_max_admisible_cie_kw != null ? String(s.pot_max_admisible_cie_kw) : "",
        potencia_adscrita_kw: s.potencia_adscrita_kw != null ? String(s.potencia_adscrita_kw) : "",
        potencia_adscrita_bloqueada: !!s.potencia_adscrita_bloqueada,
        fecha_vigencia_adscrita: s.fecha_vigencia_adscrita ?? "",
        fase_1: !!s.fase_1, fase_2: !!s.fase_2, fase_3: !!s.fase_3, neutro: !!s.neutro,
        fecha_alta: s.fecha_alta ?? "",
        fecha_baja: s.fecha_baja ?? "",
        notas: s.notas ?? "",
        activo: !!s.activo,
      });
      setEditingId(id);
      setPanelOpen(true);
    } catch {
      /* noop */
    }
  }

  function cerrar() {
    setPanelOpen(false);
    setEditingId(null);
    setErrorMsg(null);
  }

  function buildPayload() {
    const s = (v: string) => (v.trim() === "" ? null : v.trim());
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    return {
      cups: form.cups.trim(),
      distribuidora: s(form.distribuidora),
      tipo_punto_medida: n(form.tipo_punto_medida),
      acometida: s(form.acometida),
      dir_tipo_via: s(form.dir_tipo_via),
      dir_via: s(form.dir_via),
      dir_numero: s(form.dir_numero),
      dir_resto: s(form.dir_resto),
      dir_aclarador: s(form.dir_aclarador),
      dir_cp: s(form.dir_cp),
      dir_municipio: s(form.dir_municipio),
      dir_poblacion: s(form.dir_poblacion),
      dir_provincia: s(form.dir_provincia),
      municipio_codigo_ine: s(form.municipio_codigo_ine),
      poligono: s(form.poligono),
      parcela: s(form.parcela),
      ref_catastral: s(form.ref_catastral),
      latitud: n(form.latitud),
      longitud: n(form.longitud),
      zona: s(form.zona),
      orden: s(form.orden),
      centro_transformador: s(form.centro_transformador),
      linea: s(form.linea),
      tension_normalizada: s(form.tension_normalizada),
      tension_v: n(form.tension_v),
      pot_max_admisible_cie_kw: n(form.pot_max_admisible_cie_kw),
      potencia_adscrita_kw: n(form.potencia_adscrita_kw),
      potencia_adscrita_bloqueada: form.potencia_adscrita_bloqueada,
      fecha_vigencia_adscrita: s(form.fecha_vigencia_adscrita),
      fase_1: form.fase_1, fase_2: form.fase_2, fase_3: form.fase_3, neutro: form.neutro,
      fecha_alta: s(form.fecha_alta),
      fecha_baja: s(form.fecha_baja),
      notas: s(form.notas),
      activo: form.activo,
    };
  }

  async function guardar() {
    if (!form.cups.trim() || empresaId == null) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = buildPayload();
      let r: Response;
      if (editingId != null) {
        r = await fetch(`${API_BASE_URL}/erp/suministros/${editingId}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`${API_BASE_URL}/erp/suministros?empresa_id=${empresaId}`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!r.ok) {
        if (r.status === 409) {
          setErrorMsg("Ya existe un suministro con ese CUPS en esta empresa.");
        } else {
          setErrorMsg("No se pudo guardar el suministro.");
        }
        return;
      }
      cerrar();
      cargar();
    } catch {
      setErrorMsg("Error de conexión al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function desactivar() {
    if (editingId == null) return;
    if (!window.confirm("¿Dar de baja este suministro?")) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/suministros/${editingId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (r.ok) {
        cerrar();
        cargar();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked) return null;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Suministros</h1>
      <p style={{ color: "#9aa4b2", marginTop: 4, marginBottom: 18 }}>
        Puntos de suministro (CUPS) con sus datos físicos.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por CUPS, municipio o distribuidora…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9aa4b2", fontSize: 14, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
        <button
          onClick={abrirNuevo}
          style={{
            padding: "9px 14px", background: "#1f2733", color: "#e5e7eb",
            border: "1px solid #2a3441", borderRadius: 8, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          + Nuevo suministro
        </button>
      </div>

      {empresaId == null ? (
        <p style={{ color: "#6b7280" }}>Selecciona una empresa en el selector de arriba.</p>
      ) : loading ? (
        <p style={{ color: "#6b7280" }}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          {search.trim() ? "Sin resultados para la búsqueda." : "No hay suministros en esta empresa todavía."}
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>CUPS</th>
              <th style={thStyle}>Distribuidora</th>
              <th style={thStyle}>Municipio</th>
              <th style={thStyle}>Tensión</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr
                key={s.id}
                onClick={() => abrirFicha(s.id)}
                style={{ cursor: "pointer", opacity: s.activo ? 1 : 0.55 }}
              >
                <td style={{ ...tdStyle, ...mono }}>{s.cups}</td>
                <td style={tdStyle}>{s.distribuidora ?? "—"}</td>
                <td style={tdStyle}>{s.dir_municipio ?? "—"}</td>
                <td style={tdStyle}>
                  {s.tension_normalizada ?? (s.tension_v != null ? `${s.tension_v} V` : "—")}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{badge(s.activo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {panelOpen && (
        <>
          <div
            onClick={cerrar}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
          />
          <div
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "92vw",
              background: "#0b0f17", borderLeft: "1px solid #1f2733", zIndex: 50,
              padding: 24, overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {editingId != null ? form.cups || "Suministro" : "Nuevo suministro"}
                </div>
                <div style={{ fontSize: 13, color: "#9aa4b2" }}>
                  {editingId != null ? "Editar suministro" : "Alta de suministro"}
                </div>
              </div>
              <button onClick={cerrar} style={{ background: "none", border: "none", color: "#9aa4b2", fontSize: 22, cursor: "pointer" }}>
                ×
              </button>
            </div>

            {errorMsg && (
              <div style={{ background: "#2a1416", border: "1px solid #5b2330", color: "#f7a3ad", padding: "8px 10px", borderRadius: 6, fontSize: 13, margin: "8px 0" }}>
                {errorMsg}
              </div>
            )}

            <div style={sectionLabelStyle}>Identificación</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="CUPS *" value={form.cups} onChange={(v) => set("cups", v)} monospace />
              <TextField label="Distribuidora" value={form.distribuidora} onChange={(v) => set("distribuidora", v)} />
              <div>
                <label style={labelStyle}>Tipo punto de medida</label>
                <select value={form.tipo_punto_medida} onChange={(e) => set("tipo_punto_medida", e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
              <TextField label="Acometida" value={form.acometida} onChange={(v) => set("acometida", v)} />
            </div>

            <div style={sectionLabelStyle}>Dirección</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Tipo vía" value={form.dir_tipo_via} onChange={(v) => set("dir_tipo_via", v)} />
              <TextField label="Número" value={form.dir_numero} onChange={(v) => set("dir_numero", v)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <TextField label="Vía" value={form.dir_via} onChange={(v) => set("dir_via", v)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <TextField label="Resto (esc./planta/puerta)" value={form.dir_resto} onChange={(v) => set("dir_resto", v)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <TextField label="Aclarador" value={form.dir_aclarador} onChange={(v) => set("dir_aclarador", v)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <TextField label="C.P." value={form.dir_cp} onChange={(v) => set("dir_cp", v)} />
              <TextField label="Municipio" value={form.dir_municipio} onChange={(v) => set("dir_municipio", v)} />
              <TextField label="Población" value={form.dir_poblacion} onChange={(v) => set("dir_poblacion", v)} />
              <TextField label="Provincia" value={form.dir_provincia} onChange={(v) => set("dir_provincia", v)} />
              <TextField label="Código INE municipio" value={form.municipio_codigo_ine} onChange={(v) => set("municipio_codigo_ine", v)} />
              <TextField label="Ref. catastral" value={form.ref_catastral} onChange={(v) => set("ref_catastral", v)} />
              <TextField label="Polígono" value={form.poligono} onChange={(v) => set("poligono", v)} />
              <TextField label="Parcela" value={form.parcela} onChange={(v) => set("parcela", v)} />
              <TextField label="Latitud" value={form.latitud} onChange={(v) => set("latitud", v)} type="number" />
              <TextField label="Longitud" value={form.longitud} onChange={(v) => set("longitud", v)} type="number" />
            </div>

            <div style={sectionLabelStyle}>Trazabilidad de red</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Zona" value={form.zona} onChange={(v) => set("zona", v)} />
              <TextField label="Orden" value={form.orden} onChange={(v) => set("orden", v)} />
              <TextField label="Centro transformador" value={form.centro_transformador} onChange={(v) => set("centro_transformador", v)} />
              <TextField label="Línea" value={form.linea} onChange={(v) => set("linea", v)} />
            </div>

            <div style={sectionLabelStyle}>Datos eléctricos</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Tensión normalizada" value={form.tension_normalizada} onChange={(v) => set("tension_normalizada", v)} />
              <TextField label="Tensión (V)" value={form.tension_v} onChange={(v) => set("tension_v", v)} type="number" />
              <TextField label="Pot. máx. admisible CIE (kW)" value={form.pot_max_admisible_cie_kw} onChange={(v) => set("pot_max_admisible_cie_kw", v)} type="number" />
              <TextField label="Potencia adscrita (kW)" value={form.potencia_adscrita_kw} onChange={(v) => set("potencia_adscrita_kw", v)} type="number" />
              <TextField label="Fecha vigencia adscrita" value={form.fecha_vigencia_adscrita} onChange={(v) => set("fecha_vigencia_adscrita", v)} type="date" />
            </div>
            <div style={{ marginTop: 12 }}>
              <Check label="Potencia adscrita bloqueada" checked={form.potencia_adscrita_bloqueada} onChange={(v) => set("potencia_adscrita_bloqueada", v)} />
            </div>

            <div style={sectionLabelStyle}>Fases</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Check label="Fase 1" checked={form.fase_1} onChange={(v) => set("fase_1", v)} />
              <Check label="Fase 2" checked={form.fase_2} onChange={(v) => set("fase_2", v)} />
              <Check label="Fase 3" checked={form.fase_3} onChange={(v) => set("fase_3", v)} />
              <Check label="Neutro" checked={form.neutro} onChange={(v) => set("neutro", v)} />
            </div>

            <div style={sectionLabelStyle}>Fechas y otros</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Fecha alta" value={form.fecha_alta} onChange={(v) => set("fecha_alta", v)} type="date" />
              <TextField label="Fecha baja" value={form.fecha_baja} onChange={(v) => set("fecha_baja", v)} type="date" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Notas</label>
              <textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Check label="Activo" checked={form.activo} onChange={(v) => set("activo", v)} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={guardar}
                  disabled={saving || !form.cups.trim()}
                  style={{
                    padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
                    background: form.cups.trim() ? "#2563eb" : "#1f2733",
                    color: "#fff", border: "none", opacity: saving ? 0.6 : 1,
                  }}
                >
                  Guardar
                </button>
                {editingId != null && (
                  <button
                    onClick={desactivar}
                    disabled={saving}
                    style={{
                      padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
                      background: "none", color: "#f7a3ad", border: "1px solid #5b2330",
                    }}
                  >
                    Desactivar
                  </button>
                )}
              </div>
              <button
                onClick={cerrar}
                style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer", background: "none", color: "#9aa4b2", border: "1px solid #2a3441" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
