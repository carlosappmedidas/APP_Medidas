// app/erp/suministros/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE_URL, readApiError } from "../../apiConfig";
import { useErpEmpresaId } from "../components/ErpEmpresaSelector";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

// Cabeceras de autenticación: lee el token de localStorage
function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
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

type Opcion = { codigo: string; descripcion: string };

interface Form {
  cups: string;
  distribuidora: string;
  acometida: string;
  dir_tipo_via: string;
  dir_via: string;
  dir_numero: string;
  dir_duplicador: string;
  dir_escalera: string;
  dir_piso: string;
  dir_puerta: string;
  dir_tipo_aclarador: string;
  dir_aclarador: string;
  dir_cp: string;
  dir_municipio: string;
  dir_poblacion: string;
  dir_provincia: string;
  dir_pais: string;
  municipio_codigo_ine: string;
  poligono: string;
  parcela: string;
  ref_catastral: string;
  latitud: string;
  longitud: string;
  utm_x: string;
  utm_y: string;
  utm_huso: string;
  utm_banda: string;
  zona: string;
  orden: string;
  centro_transformador: string;
  linea: string;
  pot_max_admisible_cie_kw: string;
  potencia_adscrita_kw: string;
  potencia_adscrita_bloqueada: boolean;
  fecha_vigencia_adscrita: string;
  potencia_convenio_kw: string;
  criterio_regulatorio: string;
  fecha_alta: string;
  fecha_baja: string;
  notas: string;
  activo: boolean;
}

const EMPTY: Form = {
  cups: "", distribuidora: "", acometida: "",
  dir_tipo_via: "", dir_via: "", dir_numero: "", dir_duplicador: "",
  dir_escalera: "", dir_piso: "", dir_puerta: "", dir_tipo_aclarador: "", dir_aclarador: "",
  dir_cp: "", dir_municipio: "", dir_poblacion: "", dir_provincia: "", dir_pais: "España",
  municipio_codigo_ine: "", poligono: "", parcela: "", ref_catastral: "",
  latitud: "", longitud: "",
  utm_x: "", utm_y: "", utm_huso: "", utm_banda: "",
  zona: "", orden: "", centro_transformador: "", linea: "",
  pot_max_admisible_cie_kw: "",
  potencia_adscrita_kw: "", potencia_adscrita_bloqueada: false, fecha_vigencia_adscrita: "",
  potencia_convenio_kw: "", criterio_regulatorio: "",
  fecha_alta: "", fecha_baja: "",
  notas: "", activo: true,
};

// ---------------------------------------------------------------------------
// Estilos (estándar ficha A3)
// ---------------------------------------------------------------------------
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "rgba(241,239,232,0.55)", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 6,
  color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13,
  padding: "8px 10px", outline: "none", boxSizing: "border-box",
};
const monoFont = "ui-monospace, SFMono-Regular, Menlo, monospace";
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

function badge(activo: boolean): React.CSSProperties {
  return activo
    ? { background: "rgba(74,222,128,0.15)", color: "#7BE0A3", fontSize: 12, padding: "2px 9px", borderRadius: 6 }
    : { background: "rgba(255,255,255,0.06)", color: "rgba(241,239,232,0.5)", fontSize: 12, padding: "2px 9px", borderRadius: 6 };
}

// TextField FUERA del componente para no perder el foco al re-render.
// Si la label termina en " *", pinta asterisco rojo. `span` ocupa toda la fila.
function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  span?: boolean;
  type?: string;
  placeholder?: string;
  monospace?: boolean;
  maxLength?: number;
}) {
  const { label, value, onChange, span, type = "text", placeholder, monospace, maxLength } = props;
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? <span style={{ color: "#F0999B" }}> *</span> : null}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        style={monospace ? { ...inputStyle, fontFamily: monoFont } : inputStyle}
      />
    </div>
  );
}

// Desplegable cerrado (listas CNMC de verdad: tipo de vía, tipo de aclarador, fases)
function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Opcion[];
  span?: boolean;
}) {
  const { label, value, onChange, options, span } = props;
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

// Escribible con sugerencias (piso/puerta: X(3) libre + códigos CNMC como pistas)
function ComboField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Opcion[];
  maxLength?: number;
  span?: boolean;
}) {
  const { label, value, onChange, options, maxLength, span } = props;
  const listId = `dl-sum-${label.replace(/\s+/g, "-").toLowerCase()}`;
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

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(241,239,232,0.8)" }}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
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
  const [catalogos, setCatalogos] = useState<{ tipo_via: Opcion[]; piso: Opcion[]; puerta: Opcion[]; aclarador_finca: Opcion[] }>(
    { tipo_via: [], piso: [], puerta: [], aclarador_finca: [] }
  );

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
    if (!token) return;
    fetch(`${API_BASE_URL}/erp/cnmc-catalogos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCatalogos(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
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
        acometida: s.acometida ?? "",
        dir_tipo_via: s.dir_tipo_via ?? "",
        dir_via: s.dir_via ?? "",
        dir_numero: s.dir_numero ?? "",
        dir_duplicador: s.dir_duplicador ?? "",
        dir_escalera: s.dir_escalera ?? "",
        dir_piso: s.dir_piso ?? "",
        dir_puerta: s.dir_puerta ?? "",
        dir_tipo_aclarador: s.dir_tipo_aclarador ?? "",
        dir_aclarador: s.dir_aclarador ?? "",
        dir_cp: s.dir_cp ?? "",
        dir_municipio: s.dir_municipio ?? "",
        dir_poblacion: s.dir_poblacion ?? "",
        dir_provincia: s.dir_provincia ?? "",
        dir_pais: s.dir_pais ?? "",
        municipio_codigo_ine: s.municipio_codigo_ine ?? "",
        poligono: s.poligono ?? "",
        parcela: s.parcela ?? "",
        ref_catastral: s.ref_catastral ?? "",
        latitud: s.latitud != null ? String(s.latitud) : "",
        longitud: s.longitud != null ? String(s.longitud) : "",
        utm_x: s.utm_x != null ? String(s.utm_x) : "",
        utm_y: s.utm_y != null ? String(s.utm_y) : "",
        utm_huso: s.utm_huso != null ? String(s.utm_huso) : "",
        utm_banda: s.utm_banda ?? "",
        zona: s.zona ?? "",
        orden: s.orden ?? "",
        centro_transformador: s.centro_transformador ?? "",
        linea: s.linea ?? "",
        pot_max_admisible_cie_kw: s.pot_max_admisible_cie_kw != null ? String(s.pot_max_admisible_cie_kw) : "",
        potencia_adscrita_kw: s.potencia_adscrita_kw != null ? String(s.potencia_adscrita_kw) : "",
        potencia_adscrita_bloqueada: !!s.potencia_adscrita_bloqueada,
        fecha_vigencia_adscrita: s.fecha_vigencia_adscrita ?? "",
        potencia_convenio_kw: s.potencia_convenio_kw != null ? String(s.potencia_convenio_kw) : "",
        criterio_regulatorio: s.criterio_regulatorio ?? "",
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
    if (saving) return;
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
      acometida: s(form.acometida),
      dir_tipo_via: s(form.dir_tipo_via),
      dir_via: s(form.dir_via),
      dir_numero: s(form.dir_numero),
      dir_duplicador: s(form.dir_duplicador),
      dir_escalera: s(form.dir_escalera),
      dir_piso: s(form.dir_piso),
      dir_puerta: s(form.dir_puerta),
      dir_tipo_aclarador: s(form.dir_tipo_aclarador),
      dir_aclarador: s(form.dir_aclarador),
      dir_cp: s(form.dir_cp),
      dir_municipio: s(form.dir_municipio),
      dir_poblacion: s(form.dir_poblacion),
      dir_provincia: s(form.dir_provincia),
      dir_pais: s(form.dir_pais),
      municipio_codigo_ine: s(form.municipio_codigo_ine),
      poligono: s(form.poligono),
      parcela: s(form.parcela),
      ref_catastral: s(form.ref_catastral),
      latitud: n(form.latitud),
      longitud: n(form.longitud),
      utm_x: n(form.utm_x),
      utm_y: n(form.utm_y),
      utm_huso: n(form.utm_huso),
      utm_banda: s(form.utm_banda),
      zona: s(form.zona),
      orden: s(form.orden),
      centro_transformador: s(form.centro_transformador),
      linea: s(form.linea),
      pot_max_admisible_cie_kw: n(form.pot_max_admisible_cie_kw),
      potencia_adscrita_kw: n(form.potencia_adscrita_kw),
      potencia_adscrita_bloqueada: form.potencia_adscrita_bloqueada,
      fecha_vigencia_adscrita: s(form.fecha_vigencia_adscrita),
      potencia_convenio_kw: n(form.potencia_convenio_kw),
      criterio_regulatorio: s(form.criterio_regulatorio),
      fecha_alta: s(form.fecha_alta),
      fecha_baja: s(form.fecha_baja),
      notas: s(form.notas),
      activo: form.activo,
    };
  }

  // Obligatorios según ATR (TiposComplejos.xsd, tipo Direccion):
  // CUPS + provincia + municipio + C.P. + vía + número.
  const puedeGuardar =
    !!form.cups.trim() &&
    !!form.dir_provincia.trim() &&
    !!form.dir_municipio.trim() &&
    !!form.dir_cp.trim() &&
    !!form.dir_via.trim() &&
    !!form.dir_numero.trim();

  async function guardar() {
    if (!puedeGuardar || empresaId == null) return;
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
          setErrorMsg(await readApiError(r, "No se pudo guardar el suministro."));
        }
        return;
      }
      setPanelOpen(false);
      setEditingId(null);
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
        setPanelOpen(false);
        setEditingId(null);
        cargar();
      }
    } finally {
      setSaving(false);
    }
  }

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
              ← Suministros
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 0", fontFamily: editingId != null ? monoFont : undefined }}>
              {editingId != null ? (form.cups || "Suministro") : "Nuevo suministro"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button type="button" role="switch" aria-checked={form.activo} aria-label="Activo"
              onClick={() => set("activo", !form.activo)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(241,239,232,0.75)", fontSize: 13, padding: 0 }}>
              {form.activo ? "Activo" : "Baja"}
              <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: form.activo ? "#7BE0A3" : "rgba(255,255,255,0.15)", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: form.activo ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left .15s" }} />
              </span>
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {editingId != null ? (
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

        {errorMsg && (
          <div style={{ background: "rgba(240,153,155,0.1)", border: "0.5px solid rgba(240,153,155,0.4)", color: "#F0999B", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        <SectionCard title="Identificación">
          <TextField label="CUPS *" span value={form.cups} onChange={(v) => set("cups", v)} monospace />
          <TextField label="Distribuidora" value={form.distribuidora} onChange={(v) => set("distribuidora", v)} />
          <TextField label="Acometida" value={form.acometida} onChange={(v) => set("acometida", v)} />
        </SectionCard>

        <SectionCard title="Dirección del suministro">
          <SelectField label="Tipo vía" value={form.dir_tipo_via} options={catalogos.tipo_via} onChange={(v) => set("dir_tipo_via", v)} />
          <TextField label="Vía *" value={form.dir_via} maxLength={30} onChange={(v) => set("dir_via", v)} />
          <TextField label="Número *" value={form.dir_numero} maxLength={5} onChange={(v) => set("dir_numero", v)} />
          <TextField label="Duplicador" value={form.dir_duplicador} maxLength={3} onChange={(v) => set("dir_duplicador", v)} />
          <TextField label="Escalera" value={form.dir_escalera} maxLength={3} onChange={(v) => set("dir_escalera", v)} />
          <ComboField label="Piso" value={form.dir_piso} options={catalogos.piso} maxLength={3} onChange={(v) => set("dir_piso", v)} />
          <ComboField label="Puerta" value={form.dir_puerta} options={catalogos.puerta} maxLength={3} onChange={(v) => set("dir_puerta", v)} />
          <SelectField label="Tipo de aclarador" value={form.dir_tipo_aclarador} options={catalogos.aclarador_finca} onChange={(v) => set("dir_tipo_aclarador", v)} />
          <TextField label="Aclarador" value={form.dir_aclarador} maxLength={40} onChange={(v) => set("dir_aclarador", v)} />
          <TextField label="C.P. *" value={form.dir_cp} maxLength={10} onChange={(v) => set("dir_cp", v)} />
          <TextField label="Municipio *" value={form.dir_municipio} maxLength={120} onChange={(v) => set("dir_municipio", v)} />
          <TextField label="Población" value={form.dir_poblacion} maxLength={120} onChange={(v) => set("dir_poblacion", v)} />
          <TextField label="Provincia *" value={form.dir_provincia} maxLength={120} onChange={(v) => set("dir_provincia", v)} />
          <TextField label="País" value={form.dir_pais} maxLength={120} onChange={(v) => set("dir_pais", v)} />
          <TextField label="Código INE municipio" value={form.municipio_codigo_ine} onChange={(v) => set("municipio_codigo_ine", v)} />
          <TextField label="Ref. catastral" value={form.ref_catastral} onChange={(v) => set("ref_catastral", v)} />
          <TextField label="Polígono" value={form.poligono} onChange={(v) => set("poligono", v)} />
          <TextField label="Parcela" value={form.parcela} onChange={(v) => set("parcela", v)} />
        </SectionCard>

        <SectionCard title="Geolocalización">
          <TextField label="UTM X (ETRS89)" value={form.utm_x} onChange={(v) => set("utm_x", v)} type="number" />
          <TextField label="UTM Y (ETRS89)" value={form.utm_y} onChange={(v) => set("utm_y", v)} type="number" />
          <TextField label="UTM huso" value={form.utm_huso} onChange={(v) => set("utm_huso", v)} type="number" />
          <TextField label="UTM banda" value={form.utm_banda} onChange={(v) => set("utm_banda", v)} />
          <TextField label="Latitud" value={form.latitud} onChange={(v) => set("latitud", v)} type="number" />
          <TextField label="Longitud" value={form.longitud} onChange={(v) => set("longitud", v)} type="number" />
        </SectionCard>

        <SectionCard title="Trazabilidad de red">
          <TextField label="Zona" value={form.zona} onChange={(v) => set("zona", v)} />
          <TextField label="Orden" value={form.orden} onChange={(v) => set("orden", v)} />
          <TextField label="Centro transformador" value={form.centro_transformador} onChange={(v) => set("centro_transformador", v)} />
          <TextField label="Línea" value={form.linea} onChange={(v) => set("linea", v)} />
        </SectionCard>

        <SectionCard title="Datos eléctricos">
          <TextField label="Pot. máx. admisible CIE (kW)" value={form.pot_max_admisible_cie_kw} onChange={(v) => set("pot_max_admisible_cie_kw", v)} type="number" />
          <TextField label="Potencia adscrita (kW)" value={form.potencia_adscrita_kw} onChange={(v) => set("potencia_adscrita_kw", v)} type="number" />
          <TextField label="Potencia de convenio (kW)" value={form.potencia_convenio_kw} onChange={(v) => set("potencia_convenio_kw", v)} type="number" />
          <TextField label="Criterio regulatorio" value={form.criterio_regulatorio} onChange={(v) => set("criterio_regulatorio", v)} />
          <TextField label="Fecha vigencia adscrita" value={form.fecha_vigencia_adscrita} onChange={(v) => set("fecha_vigencia_adscrita", v)} type="date" />
          <div style={{ gridColumn: "1 / -1" }}>
            <Check label="Potencia adscrita bloqueada" checked={form.potencia_adscrita_bloqueada} onChange={(v) => set("potencia_adscrita_bloqueada", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Fechas y otros">
          <TextField label="Fecha alta" value={form.fecha_alta} onChange={(v) => set("fecha_alta", v)} type="date" />
          <TextField label="Fecha baja" value={form.fecha_baja} onChange={(v) => set("fecha_baja", v)} type="date" />
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notas</label>
            <textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={3} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
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
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Suministros</h1>
      <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", marginBottom: 18 }}>
        Puntos de suministro (CUPS) con sus datos físicos.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por CUPS, municipio o distribuidora…"
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(241,239,232,0.7)", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} /> Solo activos
        </label>
        <button onClick={abrirNuevo}
          style={{ background: "#F1EFE8", color: "#0E1014", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Nuevo suministro
        </button>
      </div>

      {empresaId == null ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Selecciona una empresa en el selector de arriba.</div>
      ) : loading ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
          {search.trim() ? "Sin resultados para la búsqueda." : "No hay suministros en esta empresa todavía."}
        </div>
      ) : (
        <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
                <th style={thStyle}>CUPS</th>
                <th style={thStyle}>Distribuidora</th>
                <th style={thStyle}>Municipio</th>
                <th style={thStyle}>Tensión</th>
                <th style={{ ...thStyle, width: 90 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} onClick={() => abrirFicha(s.id)}
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer", opacity: s.activo ? 1 : 0.55 }}>
                  <td style={{ ...tdStyle, fontFamily: monoFont, fontSize: 12 }}>{s.cups}</td>
                  <td style={tdStyle}>{s.distribuidora ?? "—"}</td>
                  <td style={tdStyle}>{s.dir_municipio ?? "—"}</td>
                  <td style={tdStyle}>{s.tension_normalizada ?? (s.tension_v != null ? `${s.tension_v} V` : "—")}</td>
                  <td style={tdStyle}>
                    <span style={badge(s.activo)}>{s.activo ? "activo" : "baja"}</span>
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