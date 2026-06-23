// app/erp/equipos/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE_URL, readApiError } from "../../apiConfig";
import { useErpEmpresaId } from "../components/ErpEmpresaSelector";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
  return t ? { Authorization: "Bearer " + t } : {};
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface EquipoRow {
  id: number;
  numero_serie: string;
  tipo_equipo: string;
  fabricante: string | null;
  modelo: string | null;
  estado: string;
  cups: string | null;
  contrato_numero: string | null;
  activo: boolean;
}

type Opcion = { codigo: string; descripcion: string };

interface Form {
  numero_serie: string;
  tipo_equipo: string;
  fabricante: string;
  modelo: string;
  version_firmware: string;
  anio_fabricacion: string;
  tipo_telegestion: string;
  propiedad: string;
  propiedad_icp: string;
  modo_control_potencia: string;
  fecha_verificacion: string;
  fecha_caducidad_verificacion: string;
  estado: string;
  suministro_id: string;
  giro_digitos: string;
  alquiler: boolean;
  tipo_alquiler: string;
  numero_precinto: string;
  fecha_precintado: string;
  recibir_en_almacen: boolean;
  alm_ubicacion: string;
  alm_lote_compra: string;
  alm_albaran_proveedor: string;
  alm_proveedor: string;
  alm_estado_equipo: string;
  alm_fecha_garantia: string;
  alm_fecha_entrada: string;
  alm_notas: string;
  baja_fecha: string;
  baja_motivo: string;
  notas: string;
  activo: boolean;
}

const EMPTY: Form = {
  numero_serie: "", tipo_equipo: "contador", fabricante: "", modelo: "",
  version_firmware: "", anio_fabricacion: "",
  tipo_telegestion: "", propiedad: "", propiedad_icp: "", modo_control_potencia: "",
  fecha_verificacion: "", fecha_caducidad_verificacion: "",
  estado: "en_almacen", suministro_id: "",
  giro_digitos: "", alquiler: false, tipo_alquiler: "",
  numero_precinto: "", fecha_precintado: "",
  recibir_en_almacen: true,
  alm_ubicacion: "", alm_lote_compra: "", alm_albaran_proveedor: "",
  alm_proveedor: "", alm_estado_equipo: "nuevo", alm_fecha_garantia: "",
  alm_fecha_entrada: "", alm_notas: "",
  baja_fecha: "", baja_motivo: "",
  notas: "", activo: true,
};

// Derivados (solo lectura) que llegan del Out
interface Derivados {
  cups: string | null;
  contrato_numero: string | null;
  contrato_titular: string | null;
  contrato_tarifa: string | null;
  contrato_comercializadora: string | null;
  tipo_punto_medida: string | null;
}
const EMPTY_DERIV: Derivados = {
  cups: null, contrato_numero: null, contrato_titular: null,
  contrato_tarifa: null, contrato_comercializadora: null, tipo_punto_medida: null,
};

// E-7b: movimientos de instalacion
interface Instalacion {
  id: number;
  tipo_movimiento: string;
  suministro_id: number;
  cups: string | null;
  fecha_alta: string | null;
  fecha_baja: string | null;
  lectura_instalacion: number | null;
  lectura_retirada: number | null;
  tecnico: string | null;
  motivo: string | null;
  motivo_baja: string | null;
}

// E-7c: estancias en almacen
interface Almacen {
  id: number;
  ubicacion: string | null;
  lote_compra: string | null;
  albaran_proveedor: string | null;
  proveedor: string | null;
  estado_equipo_en_almacen: string;
  fecha_garantia: string | null;
  fecha_entrada: string | null;
  fecha_salida: string | null;
  notas: string | null;
  equipo_numero_serie: string | null;
}

interface RecibirForm {
  ubicacion: string;
  lote_compra: string;
  albaran_proveedor: string;
  proveedor: string;
  estado_equipo_en_almacen: string;
  fecha_garantia: string;
  fecha_entrada: string;
  notas: string;
}
const EMPTY_RECIBIR: RecibirForm = {
  ubicacion: "", lote_compra: "", albaran_proveedor: "", proveedor: "",
  estado_equipo_en_almacen: "nuevo", fecha_garantia: "", fecha_entrada: "", notas: "",
};
interface OptSuministro { id: number; cups: string; }

interface MovForm {
  suministro_id: string;
  fecha: string;
  lectura: string;
  tecnico: string;
  precintos: string;
  motivo: string;
  estado_destino: string;
}
const EMPTY_MOV: MovForm = {
  suministro_id: "", fecha: "", lectura: "", tecnico: "",
  precintos: "", motivo: "", estado_destino: "en_almacen",
};

const TIPO_EQUIPO_OPCIONES: Opcion[] = [
  { codigo: "contador", descripcion: "Contador" },
  { codigo: "concentrador", descripcion: "Concentrador" },
  { codigo: "modem", descripcion: "Módem" },
  { codigo: "regletas", descripcion: "Regletas de verificación" },
];
const ESTADO_OPCIONES: Opcion[] = [
  { codigo: "en_almacen", descripcion: "En almacén" },
  { codigo: "instalado", descripcion: "Instalado" },
  { codigo: "retirado", descripcion: "Retirado" },
  { codigo: "averiado", descripcion: "Averiado" },
];
const MODO_CP_OPCIONES: Opcion[] = [
  { codigo: "ICP", descripcion: "ICP" },
  { codigo: "maximetro", descripcion: "Maxímetro" },
];

// ---------------------------------------------------------------------------
// Estilos
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
function estadoBadge(estado: string): React.CSSProperties {
  const map: Record<string, string> = {
    instalado: "#7BE0A3", en_almacen: "#85B7EB", retirado: "rgba(241,239,232,0.5)", averiado: "#F0999B",
  };
  const c = map[estado] ?? "rgba(241,239,232,0.5)";
  return { background: "rgba(255,255,255,0.06)", color: c, fontSize: 12, padding: "2px 9px", borderRadius: 6 };
}

function TextField(props: {
  label: string; value: string; onChange: (v: string) => void;
  span?: boolean; type?: string; placeholder?: string; monospace?: boolean; maxLength?: number;
}) {
  const { label, value, onChange, span, type = "text", placeholder, monospace, maxLength } = props;
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? <span style={{ color: "#F0999B" }}> *</span> : null}</label>
      <input type={type} value={value} placeholder={placeholder} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        style={monospace ? { ...inputStyle, fontFamily: monoFont } : inputStyle} />
    </div>
  );
}

function SelectField(props: {
  label: string; value: string; onChange: (v: string) => void; options: Opcion[]; span?: boolean;
}) {
  const { label, value, onChange, options, span } = props;
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? <span style={{ color: "#F0999B" }}> *</span> : null}</label>
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

function ReadField(props: { label: string; value: string | null; span?: boolean; monospace?: boolean }) {
  const { label, value, span, monospace } = props;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ ...inputStyle, background: "rgba(255,255,255,0.02)", color: "rgba(241,239,232,0.55)",
        fontFamily: monospace ? monoFont : undefined, minHeight: 36, display: "flex", alignItems: "center" }}>
        {value && value.trim() ? value : "—"}
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

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function EquiposPage() {
  const router = useRouter();
  const empresaId = useErpEmpresaId();

  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<EquipoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [deriv, setDeriv] = useState<Derivados>(EMPTY_DERIV);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cat, setCat] = useState<{ propiedad_aparato: Opcion[]; telegestion: Opcion[] }>(
    { propiedad_aparato: [], telegestion: [] }
  );

  // E-7b: historial de movimientos + modal instalar/retirar
  const [historial, setHistorial] = useState<Instalacion[]>([]);
  // E-7c: historial de almacen + modal recibir
  const [almacen, setAlmacen] = useState<Almacen[]>([]);
  const [recibirOpen, setRecibirOpen] = useState(false);
  const [recibirForm, setRecibirForm] = useState<RecibirForm>(EMPTY_RECIBIR);
  const [recibirSaving, setRecibirSaving] = useState(false);
  const [recibirError, setRecibirError] = useState<string | null>(null);
  const [sumOpts, setSumOpts] = useState<OptSuministro[]>([]);
  const [modal, setModal] = useState<null | "instalar" | "retirar">(null);
  const [movForm, setMovForm] = useState<MovForm>(EMPTY_MOV);
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
    if (!token) return;
    fetch(`${API_BASE_URL}/erp/cnmc-catalogos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCat({ propiedad_aparato: d.propiedad_aparato ?? [], telegestion: d.telegestion ?? [] }); })
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
    if (empresaId == null) { setItems([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("empresa_id", String(empresaId));
      if (search.trim()) params.set("search", search.trim());
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (soloActivos) params.set("solo_activos", "true");
      const r = await fetch(`${API_BASE_URL}/erp/equipos?${params.toString()}`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setItems(Array.isArray(data) ? (data as EquipoRow[]) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, search, estadoFiltro, soloActivos]);

  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function abrirNuevo() {
    setForm(EMPTY);
    setDeriv(EMPTY_DERIV);
    setEditingId(null);
    setErrorMsg(null);
    setPanelOpen(true);
  }

  async function abrirFicha(id: number) {
    setErrorMsg(null);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/equipos/${id}`, { headers: authHeaders() });
      if (!r.ok) return;
      const s = await r.json();
      setForm({
        ...EMPTY,
        numero_serie: s.numero_serie ?? "",
        tipo_equipo: s.tipo_equipo ?? "contador",
        fabricante: s.fabricante ?? "",
        modelo: s.modelo ?? "",
        version_firmware: s.version_firmware ?? "",
        anio_fabricacion: s.anio_fabricacion != null ? String(s.anio_fabricacion) : "",
        tipo_telegestion: s.tipo_telegestion ?? "",
        propiedad: s.propiedad ?? "",
        propiedad_icp: s.propiedad_icp ?? "",
        modo_control_potencia: s.modo_control_potencia ?? "",
        fecha_verificacion: s.fecha_verificacion ?? "",
        fecha_caducidad_verificacion: s.fecha_caducidad_verificacion ?? "",
        estado: s.estado ?? "en_almacen",
        suministro_id: s.suministro_id != null ? String(s.suministro_id) : "",
        giro_digitos: s.giro_digitos != null ? String(s.giro_digitos) : "",
        alquiler: !!s.alquiler,
        tipo_alquiler: s.tipo_alquiler ?? "",
        numero_precinto: s.numero_precinto ?? "",
        fecha_precintado: s.fecha_precintado ?? "",
        baja_fecha: s.baja_fecha ?? "",
        baja_motivo: s.baja_motivo ?? "",
        notas: s.notas ?? "",
        activo: !!s.activo,
      });
      setDeriv({
        cups: s.cups ?? null,
        contrato_numero: s.contrato_numero ?? null,
        contrato_titular: s.contrato_titular ?? null,
        contrato_tarifa: s.contrato_tarifa ?? null,
        contrato_comercializadora: s.contrato_comercializadora ?? null,
        tipo_punto_medida: s.tipo_punto_medida ?? null,
      });
      setEditingId(id);
      setPanelOpen(true);
      cargarHistorial(id);
      cargarAlmacen(id);
    } catch {
      /* noop */
    }
  }

  const cargarHistorial = useCallback(async (id: number) => {
    try {
      const r = await fetch(`${API_BASE_URL}/erp/equipos/${id}/instalaciones`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setHistorial(Array.isArray(data) ? (data as Instalacion[]) : []);
    } catch {
      setHistorial([]);
    }
  }, []);

  const cargarAlmacen = useCallback(async (id: number) => {
    try {
      const r = await fetch(`${API_BASE_URL}/erp/equipos/${id}/almacen`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setAlmacen(Array.isArray(data) ? (data as Almacen[]) : []);
    } catch {
      setAlmacen([]);
    }
  }, []);

  function abrirRecibir() {
    setRecibirForm({ ...EMPTY_RECIBIR, fecha_entrada: new Date().toISOString().slice(0, 10) });
    setRecibirError(null);
    setRecibirOpen(true);
  }

  async function guardarRecibir() {
    if (editingId == null) return;
    setRecibirSaving(true);
    setRecibirError(null);
    try {
      const txt = (v: string) => (v.trim() === "" ? null : v.trim());
      const body: Record<string, unknown> = {
        ubicacion: txt(recibirForm.ubicacion),
        lote_compra: txt(recibirForm.lote_compra),
        albaran_proveedor: txt(recibirForm.albaran_proveedor),
        proveedor: txt(recibirForm.proveedor),
        estado_equipo_en_almacen: recibirForm.estado_equipo_en_almacen || "nuevo",
        fecha_garantia: txt(recibirForm.fecha_garantia),
        fecha_entrada: txt(recibirForm.fecha_entrada),
        notas: txt(recibirForm.notas),
      };
      const r = await fetch(`${API_BASE_URL}/erp/equipos/${editingId}/almacen`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setRecibirError(await readApiError(r, "No se pudo recibir en almacén."));
        return;
      }
      setRecibirOpen(false);
      abrirFicha(editingId);
      cargar();
    } catch {
      setRecibirError("Error de conexión.");
    } finally {
      setRecibirSaving(false);
    }
  }

  async function cargarSuministrosAlmacen() {
    if (empresaId == null) return;
    try {
      const r = await fetch(`${API_BASE_URL}/erp/suministros?empresa_id=${empresaId}&solo_activos=true`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      const arr = Array.isArray(data) ? (data as Array<{ id: number; cups: string }>) : [];
      setSumOpts(arr.map((s) => ({ id: s.id, cups: s.cups })));
    } catch {
      setSumOpts([]);
    }
  }

  function abrirModal(tipo: "instalar" | "retirar") {
    setMovForm({ ...EMPTY_MOV, fecha: new Date().toISOString().slice(0, 10) });
    setMovError(null);
    setModal(tipo);
    if (tipo === "instalar") cargarSuministrosAlmacen();
  }

  async function guardarMov() {
    if (editingId == null || modal == null) return;
    setMovSaving(true);
    setMovError(null);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const txt = (v: string) => (v.trim() === "" ? null : v.trim());
      let body: Record<string, unknown>;
      let url: string;
      if (modal === "instalar") {
        if (!movForm.suministro_id) { setMovError("Selecciona un suministro (CUPS)."); setMovSaving(false); return; }
        url = `${API_BASE_URL}/erp/equipos/${editingId}/instalar`;
        body = {
          suministro_id: Number(movForm.suministro_id),
          fecha: txt(movForm.fecha), lectura: num(movForm.lectura),
          tecnico: txt(movForm.tecnico), precintos: txt(movForm.precintos),
          motivo: txt(movForm.motivo),
        };
      } else {
        url = `${API_BASE_URL}/erp/equipos/${editingId}/retirar`;
        body = {
          fecha: txt(movForm.fecha), lectura: num(movForm.lectura),
          motivo: txt(movForm.motivo), estado_destino: movForm.estado_destino || "en_almacen",
        };
      }
      const r = await fetch(url, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setMovError(await readApiError(r, "No se pudo completar el movimiento."));
        return;
      }
      setModal(null);
      // refrescar ficha + historial
      abrirFicha(editingId);
      cargar();
    } catch {
      setMovError("Error de conexión.");
    } finally {
      setMovSaving(false);
    }
  }

  function cerrar() {
    setPanelOpen(false);
    setEditingId(null);
    setErrorMsg(null);
    setHistorial([]);
    setAlmacen([]);
    setRecibirOpen(false);
  }

  function buildPayload(): Record<string, unknown> {
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const txt = (v: string) => (v.trim() === "" ? null : v.trim());

    // Campos comunes del equipo
    const base: Record<string, unknown> = {
      numero_serie: form.numero_serie.trim(),
      tipo_equipo: form.tipo_equipo || "contador",
      fabricante: txt(form.fabricante),
      modelo: txt(form.modelo),
      version_firmware: txt(form.version_firmware),
      anio_fabricacion: num(form.anio_fabricacion),
      tipo_telegestion: txt(form.tipo_telegestion),
      propiedad: txt(form.propiedad),
      propiedad_icp: txt(form.propiedad_icp),
      modo_control_potencia: txt(form.modo_control_potencia),
      fecha_verificacion: txt(form.fecha_verificacion),
      fecha_caducidad_verificacion: txt(form.fecha_caducidad_verificacion),
      giro_digitos: num(form.giro_digitos),
      alquiler: form.alquiler,
      tipo_alquiler: txt(form.tipo_alquiler),
      numero_precinto: txt(form.numero_precinto),
      fecha_precintado: txt(form.fecha_precintado),
      notas: txt(form.notas),
      activo: form.activo,
    };

    if (editingId == null) {
      // ALTA: no se fija suministro_id ni estado (eso lo hace Instalar / el backend).
      // Se incluye la entrada en almacen (Opcion A).
      return {
        ...base,
        recibir_en_almacen: form.recibir_en_almacen,
        alm_ubicacion: txt(form.alm_ubicacion),
        alm_lote_compra: txt(form.alm_lote_compra),
        alm_albaran_proveedor: txt(form.alm_albaran_proveedor),
        alm_proveedor: txt(form.alm_proveedor),
        alm_estado_equipo: form.alm_estado_equipo || "nuevo",
        alm_fecha_garantia: txt(form.alm_fecha_garantia),
        alm_fecha_entrada: txt(form.alm_fecha_entrada),
        alm_notas: txt(form.alm_notas),
      };
    }

    // EDICION: mantiene estado y campos de baja (no toca suministro_id: derivado por Instalar)
    return {
      ...base,
      estado: form.estado || "en_almacen",
      baja_fecha: txt(form.baja_fecha),
      baja_motivo: txt(form.baja_motivo),
    };
  }

  const puedeGuardar = !!form.numero_serie.trim();

  async function guardar() {
    if (!puedeGuardar || empresaId == null) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = buildPayload();
      let r: Response;
      if (editingId != null) {
        r = await fetch(`${API_BASE_URL}/erp/equipos/${editingId}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`${API_BASE_URL}/erp/equipos?empresa_id=${empresaId}`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!r.ok) {
        if (r.status === 409) {
          setErrorMsg("Ya existe un equipo con ese número de serie en esta empresa.");
        } else {
          setErrorMsg(await readApiError(r, "No se pudo guardar el equipo."));
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
    if (!window.confirm("¿Dar de baja este equipo?")) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/equipos/${editingId}`, {
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
  // Vista FICHA
  // ============================================================
  if (panelOpen) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <button onClick={cerrar}
              style={{ background: "none", border: "none", color: "rgba(241,239,232,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}>
              ← Equipos de medida
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 0", fontFamily: editingId != null ? monoFont : undefined }}>
              {editingId != null ? (form.numero_serie || "Equipo") : "Nuevo equipo"}
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
          <TextField label="Número de serie *" value={form.numero_serie} onChange={(v) => set("numero_serie", v)} monospace />
          <SelectField label="Tipo de equipo" value={form.tipo_equipo} onChange={(v) => set("tipo_equipo", v)} options={TIPO_EQUIPO_OPCIONES} />
          <TextField label="Fabricante" value={form.fabricante} onChange={(v) => set("fabricante", v)} />
          <TextField label="Modelo" value={form.modelo} onChange={(v) => set("modelo", v)} />
          <TextField label="Versión firmware" value={form.version_firmware} onChange={(v) => set("version_firmware", v)} />
          <TextField label="Año fabricación" type="number" value={form.anio_fabricacion} onChange={(v) => set("anio_fabricacion", v)} />
        </SectionCard>

        <SectionCard title="Regulatorio (CNMC)">
          <SelectField label="Tipo de telegestión" value={form.tipo_telegestion} onChange={(v) => set("tipo_telegestion", v)} options={cat.telegestion} />
          <SelectField label="Propiedad del contador" value={form.propiedad} onChange={(v) => set("propiedad", v)} options={cat.propiedad_aparato} />
          <SelectField label="Propiedad del ICP" value={form.propiedad_icp} onChange={(v) => set("propiedad_icp", v)} options={cat.propiedad_aparato} />
          <SelectField label="Modo control potencia" value={form.modo_control_potencia} onChange={(v) => set("modo_control_potencia", v)} options={MODO_CP_OPCIONES} />
        </SectionCard>

        <SectionCard title="Verificación metrológica">
          <TextField label="Fecha verificación" type="date" value={form.fecha_verificacion} onChange={(v) => set("fecha_verificacion", v)} />
          <TextField label="Caducidad verificación" type="date" value={form.fecha_caducidad_verificacion} onChange={(v) => set("fecha_caducidad_verificacion", v)} />
        </SectionCard>

        <SectionCard title="Contador / alquiler / precinto">
          <TextField label="Giro (dígitos totalizador)" type="number" value={form.giro_digitos} onChange={(v) => set("giro_digitos", v)} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(241,239,232,0.8)" }}>
            <input type="checkbox" checked={form.alquiler} onChange={(e) => set("alquiler", e.target.checked)} />
            Alquiler
          </label>
          <TextField label="Tipo de alquiler" value={form.tipo_alquiler} onChange={(v) => set("tipo_alquiler", v)} />
          <TextField label="Nº precinto" value={form.numero_precinto} onChange={(v) => set("numero_precinto", v)} />
          <TextField label="Fecha precintado" type="date" value={form.fecha_precintado} onChange={(v) => set("fecha_precintado", v)} />
        </SectionCard>

        {editingId != null && (
          <SectionCard title="Ubicación / estado">
            <SelectField label="Estado" value={form.estado} onChange={(v) => set("estado", v)} options={ESTADO_OPCIONES} />
          </SectionCard>
        )}

        {editingId == null && (
          <SectionCard title="Almacén / entrada en stock">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(241,239,232,0.8)", gridColumn: "1 / -1", marginBottom: 4 }}>
              <input type="checkbox" checked={form.recibir_en_almacen}
                onChange={(e) => set("recibir_en_almacen", e.target.checked)} />
              Recibir en almacén al crear (recomendado para equipos nuevos)
            </label>
            {form.recibir_en_almacen && (
              <>
                <TextField label="Ubicación" value={form.alm_ubicacion} onChange={(v) => set("alm_ubicacion", v)} />
                <SelectField label="Estado en almacén" value={form.alm_estado_equipo} onChange={(v) => set("alm_estado_equipo", v)}
                  options={[
                    { codigo: "nuevo", descripcion: "Nuevo" },
                    { codigo: "reacondicionado", descripcion: "Reacondicionado" },
                    { codigo: "averiado-pendiente", descripcion: "Averiado (pendiente)" },
                    { codigo: "para-desguace", descripcion: "Para desguace" },
                  ]} />
                <TextField label="Lote de compra" value={form.alm_lote_compra} onChange={(v) => set("alm_lote_compra", v)} />
                <TextField label="Albarán proveedor" value={form.alm_albaran_proveedor} onChange={(v) => set("alm_albaran_proveedor", v)} />
                <TextField label="Proveedor" value={form.alm_proveedor} onChange={(v) => set("alm_proveedor", v)} />
                <TextField label="Fecha entrada" type="date" value={form.alm_fecha_entrada} onChange={(v) => set("alm_fecha_entrada", v)} />
                <TextField label="Fecha garantía" type="date" value={form.alm_fecha_garantia} onChange={(v) => set("alm_fecha_garantia", v)} />
                <TextField label="Notas almacén" span value={form.alm_notas} onChange={(v) => set("alm_notas", v)} />
              </>
            )}
          </SectionCard>
        )}

        {editingId != null && (
          <SectionCard title="Contrato asociado (derivado vía CUPS · solo lectura)">
            <ReadField label="CUPS" value={deriv.cups} monospace />
            <ReadField label="Nº contrato" value={deriv.contrato_numero} />
            <ReadField label="Titular" value={deriv.contrato_titular} />
            <ReadField label="Tarifa" value={deriv.contrato_tarifa} />
            <ReadField label="Comercializadora" value={deriv.contrato_comercializadora} />
            <ReadField label="Tipo punto medida" value={deriv.tipo_punto_medida} />
          </SectionCard>
        )}

        {editingId != null && (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={cardTitleStyle}>Instalación / movimientos</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => abrirModal("instalar")}
                  disabled={form.estado === "instalado"}
                  style={{ ...btnGhost, opacity: form.estado === "instalado" ? 0.4 : 1, cursor: form.estado === "instalado" ? "default" : "pointer" }}>
                  + Instalar
                </button>
                <button type="button" onClick={() => abrirModal("retirar")}
                  disabled={form.estado !== "instalado"}
                  style={{ ...btnGhost, opacity: form.estado !== "instalado" ? 0.4 : 1, cursor: form.estado !== "instalado" ? "default" : "pointer" }}>
                  Retirar
                </button>
              </div>
            </div>
            {historial.length === 0 ? (
              <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: 0 }}>Sin movimientos registrados.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: "rgba(241,239,232,0.5)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Tipo</th>
                    <th style={{ padding: "6px 8px" }}>CUPS</th>
                    <th style={{ padding: "6px 8px" }}>Alta</th>
                    <th style={{ padding: "6px 8px" }}>Lect. inst.</th>
                    <th style={{ padding: "6px 8px" }}>Baja</th>
                    <th style={{ padding: "6px 8px" }}>Lect. ret.</th>
                    <th style={{ padding: "6px 8px" }}>Técnico</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px" }}>{h.tipo_movimiento}</td>
                      <td style={{ padding: "6px 8px", fontFamily: monoFont }}>{h.cups ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{h.fecha_alta ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{h.lectura_instalacion ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{h.fecha_baja ?? <span style={{ color: "#7BE0A3" }}>vigente</span>}</td>
                      <td style={{ padding: "6px 8px" }}>{h.lectura_retirada ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{h.tecnico ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {editingId != null && (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={cardTitleStyle}>Almacén / stock</div>
              <button type="button" onClick={abrirRecibir}
                disabled={form.estado !== "en_almacen" || almacen.some((a) => a.fecha_salida == null)}
                style={{ ...btnGhost,
                  opacity: form.estado !== "en_almacen" || almacen.some((a) => a.fecha_salida == null) ? 0.4 : 1,
                  cursor: form.estado !== "en_almacen" || almacen.some((a) => a.fecha_salida == null) ? "default" : "pointer" }}>
                + Recibir en almacén
              </button>
            </div>
            {almacen.length === 0 ? (
              <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: 0 }}>Sin estancias en almacén registradas.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: "rgba(241,239,232,0.5)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Entrada</th>
                    <th style={{ padding: "6px 8px" }}>Salida</th>
                    <th style={{ padding: "6px 8px" }}>Estado</th>
                    <th style={{ padding: "6px 8px" }}>Ubicación</th>
                    <th style={{ padding: "6px 8px" }}>Lote</th>
                    <th style={{ padding: "6px 8px" }}>Proveedor</th>
                    <th style={{ padding: "6px 8px" }}>Garantía</th>
                  </tr>
                </thead>
                <tbody>
                  {almacen.map((a) => (
                    <tr key={a.id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px" }}>{a.fecha_entrada ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.fecha_salida ?? <span style={{ color: "#7BE0A3" }}>en almacén</span>}</td>
                      <td style={{ padding: "6px 8px" }}>{a.estado_equipo_en_almacen}</td>
                      <td style={{ padding: "6px 8px" }}>{a.ubicacion ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.lote_compra ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.proveedor ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.fecha_garantia ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <SectionCard title="Baja del parque / notas">
          <TextField label="Fecha baja" type="date" value={form.baja_fecha} onChange={(v) => set("baja_fecha", v)} />
          <TextField label="Motivo baja" span value={form.baja_motivo} onChange={(v) => set("baja_motivo", v)} />
          <TextField label="Notas" span value={form.notas} onChange={(v) => set("notas", v)} />
        </SectionCard>

        {modal && (
          <div onClick={() => !movSaving && setModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: "#16181D", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 12, width: "min(520px, 100%)", maxHeight: "86vh", overflow: "auto", padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 14px" }}>
                {modal === "instalar" ? "Instalar equipo en un CUPS" : "Retirar equipo"}
              </h2>

              {movError && (
                <div style={{ background: "rgba(240,153,155,0.1)", border: "0.5px solid rgba(240,153,155,0.4)", color: "#F0999B", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                  {movError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                {modal === "instalar" ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Suministro (CUPS) <span style={{ color: "#F0999B" }}>*</span></label>
                    <select style={inputStyle} value={movForm.suministro_id}
                      onChange={(e) => setMovForm({ ...movForm, suministro_id: e.target.value })}>
                      <option value="" style={{ background: "#16181D" }}>— elegir —</option>
                      {sumOpts.map((s) => (
                        <option key={s.id} value={String(s.id)} style={{ background: "#16181D" }}>{s.cups}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>Estado destino</label>
                    <select style={inputStyle} value={movForm.estado_destino}
                      onChange={(e) => setMovForm({ ...movForm, estado_destino: e.target.value })}>
                      <option value="en_almacen" style={{ background: "#16181D" }}>En almacén</option>
                      <option value="averiado" style={{ background: "#16181D" }}>Averiado</option>
                      <option value="retirado" style={{ background: "#16181D" }}>Retirado</option>
                    </select>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input type="date" style={inputStyle} value={movForm.fecha}
                    onChange={(e) => setMovForm({ ...movForm, fecha: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{modal === "instalar" ? "Lectura instalación" : "Lectura retirada"}</label>
                  <input type="number" style={inputStyle} value={movForm.lectura}
                    onChange={(e) => setMovForm({ ...movForm, lectura: e.target.value })} />
                </div>
                {modal === "instalar" && (
                  <>
                    <div>
                      <label style={labelStyle}>Técnico</label>
                      <input style={inputStyle} value={movForm.tecnico}
                        onChange={(e) => setMovForm({ ...movForm, tecnico: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Precintos</label>
                      <input style={inputStyle} value={movForm.precintos}
                        onChange={(e) => setMovForm({ ...movForm, precintos: e.target.value })} />
                    </div>
                  </>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Motivo</label>
                  <input style={inputStyle} value={movForm.motivo}
                    onChange={(e) => setMovForm({ ...movForm, motivo: e.target.value })} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button onClick={() => setModal(null)} disabled={movSaving} style={btnGhost}>Cancelar</button>
                <button onClick={guardarMov} disabled={movSaving}
                  style={{ ...btnPrimary, cursor: movSaving ? "default" : "pointer", opacity: movSaving ? 0.5 : 1 }}>
                  {movSaving ? "Guardando…" : (modal === "instalar" ? "Instalar" : "Retirar")}
                </button>
              </div>
            </div>
          </div>
        )}

        {recibirOpen && (
          <div onClick={() => !recibirSaving && setRecibirOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: "#16181D", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 12, width: "min(520px, 100%)", maxHeight: "86vh", overflow: "auto", padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 14px" }}>Recibir equipo en almacén</h2>

              {recibirError && (
                <div style={{ background: "rgba(240,153,155,0.1)", border: "0.5px solid rgba(240,153,155,0.4)", color: "#F0999B", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                  {recibirError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Ubicación</label>
                  <input style={inputStyle} value={recibirForm.ubicacion}
                    onChange={(e) => setRecibirForm({ ...recibirForm, ubicacion: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Estado en almacén</label>
                  <select style={inputStyle} value={recibirForm.estado_equipo_en_almacen}
                    onChange={(e) => setRecibirForm({ ...recibirForm, estado_equipo_en_almacen: e.target.value })}>
                    <option value="nuevo" style={{ background: "#16181D" }}>Nuevo</option>
                    <option value="reacondicionado" style={{ background: "#16181D" }}>Reacondicionado</option>
                    <option value="averiado-pendiente" style={{ background: "#16181D" }}>Averiado (pendiente)</option>
                    <option value="para-desguace" style={{ background: "#16181D" }}>Para desguace</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Lote de compra</label>
                  <input style={inputStyle} value={recibirForm.lote_compra}
                    onChange={(e) => setRecibirForm({ ...recibirForm, lote_compra: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Albarán proveedor</label>
                  <input style={inputStyle} value={recibirForm.albaran_proveedor}
                    onChange={(e) => setRecibirForm({ ...recibirForm, albaran_proveedor: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Proveedor</label>
                  <input style={inputStyle} value={recibirForm.proveedor}
                    onChange={(e) => setRecibirForm({ ...recibirForm, proveedor: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha entrada</label>
                  <input type="date" style={inputStyle} value={recibirForm.fecha_entrada}
                    onChange={(e) => setRecibirForm({ ...recibirForm, fecha_entrada: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha garantía</label>
                  <input type="date" style={inputStyle} value={recibirForm.fecha_garantia}
                    onChange={(e) => setRecibirForm({ ...recibirForm, fecha_garantia: e.target.value })} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Notas</label>
                  <input style={inputStyle} value={recibirForm.notas}
                    onChange={(e) => setRecibirForm({ ...recibirForm, notas: e.target.value })} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button onClick={() => setRecibirOpen(false)} disabled={recibirSaving} style={btnGhost}>Cancelar</button>
                <button onClick={guardarRecibir} disabled={recibirSaving}
                  style={{ ...btnPrimary, cursor: recibirSaving ? "default" : "pointer", opacity: recibirSaving ? 0.5 : 1 }}>
                  {recibirSaving ? "Guardando…" : "Recibir"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // Vista LISTA
  // ============================================================
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Equipos de medida</h1>
        <button onClick={abrirNuevo} style={{ ...btnPrimary, cursor: "pointer" }}>+ Nuevo equipo</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Buscar nº serie, fabricante, modelo…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 320 }} />
        <select style={{ ...inputStyle, maxWidth: 180 }} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
          <option value="" style={{ background: "#16181D" }}>Todos los estados</option>
          {ESTADO_OPCIONES.map((o) => (
            <option key={o.codigo} value={o.codigo} style={{ background: "#16181D" }}>{o.descripcion}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(241,239,232,0.7)" }}>
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
      </div>

      <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
              <th style={thStyle}>Nº serie</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Fabricante</th>
              <th style={thStyle}>Modelo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>CUPS</th>
              <th style={thStyle}>Contrato</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={tdStyle} colSpan={8}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td style={{ ...tdStyle, color: "rgba(241,239,232,0.5)" }} colSpan={8}>No hay equipos.</td></tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} onClick={() => abrirFicha(it.id)}
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)", cursor: "pointer" }}>
                  <td style={{ ...tdStyle, fontFamily: monoFont, fontWeight: 600 }}>{it.numero_serie}</td>
                  <td style={tdStyle}>{it.tipo_equipo}</td>
                  <td style={tdStyle}>{it.fabricante ?? "—"}</td>
                  <td style={tdStyle}>{it.modelo ?? "—"}</td>
                  <td style={tdStyle}><span style={estadoBadge(it.estado)}>{it.estado}</span></td>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>{it.cups ?? "—"}</td>
                  <td style={tdStyle}>{it.contrato_numero ?? "—"}</td>
                  <td style={tdStyle}><span style={badge(it.activo)}>{it.activo ? "Activo" : "Baja"}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
