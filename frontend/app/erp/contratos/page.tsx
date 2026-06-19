// app/erp/contratos/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, readApiError } from "../../apiConfig";
import { useErpEmpresaId } from "../components/ErpEmpresaSelector";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";
function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
  return t ? { Authorization: "Bearer " + t } : {};
}

interface PeriodoTarifa { periodo: string; tipo: string; orden: number; }
interface Tarifa { id: number; codigo: string; num_periodos_potencia: number; periodos: PeriodoTarifa[]; }
interface OptTitular { id: number; nombre: string | null; }
interface OptSuministro { id: number; cups: string; }
interface OptCom { id: number; com_nombre: string | null; }
interface ContratoPotencia { periodo: string; potencia_kw: number; }
interface Contrato {
  id: number;
  numero_contrato: string;
  codigo_interno: string | null;
  tipo_contrato_atr: string;
  estado: string;
  fecha_alta: string | null;
  fecha_baja: string | null;
  titular_id: number;
  comercializadora_empresa_id: number | null;
  suministro_id: number;
  tarifa_id: number;
  es_autoconsumo: boolean;
  bono_social: boolean;
  electrointensivo: boolean;
  no_cortable: boolean;
  exencion_iese: boolean;
  peaje_directo: boolean;
  telegestion: boolean;
  vivienda_habitual: boolean | null;

  tension_normalizada: string | null;
  tension_v: number | null;
  tipo_punto_medida: number | null;
  modo_control_potencia: string | null;
  cnae: string | null;
  notas: string | null;
  activo: boolean;
  potencias: ContratoPotencia[];
  titular_nombre: string | null;
  cups: string | null;
  tarifa_codigo: string | null;
  comercializadora_nombre: string | null;
}

interface VersionListItem {
  id: number;
  version: number;
  tipo_atr: string | null;
  comercializadora: string | null;
  tarifa: string | null;
  potencia: string | null;
  fecha_alta: string | null;
  fecha_baja: string | null;
  fecha_modificacion: string | null;
  estado: string;
}
interface CambioDetectado { campo: string; etiqueta: string; antes: unknown; despues: unknown; }
interface VersionDetalle {
  id: number;
  contrato_id: number;
  version: number;
  tipo_atr: string | null;
  motivo: string | null;
  referencia: string | null;
  fecha_alta: string | null;
  fecha_baja: string | null;
  fecha_modificacion: string | null;
  estado: string;
  snapshot: Record<string, unknown>;
  cambios: CambioDetectado[] | null;
}

interface Form {
  id?: number;
  numero_contrato: string;
  codigo_interno: string;
  tipo_contrato_atr: string;
  estado: string;
  fecha_alta: string;
  fecha_baja: string;
  titular_id: number | "";
  suministro_id: number | "";
  tarifa_id: number | "";
  comercializadora_empresa_id: number | "";
  es_autoconsumo: boolean;
  bono_social: boolean;
  electrointensivo: boolean;
  no_cortable: boolean;
  exencion_iese: boolean;
  peaje_directo: boolean;
  telegestion: boolean;
  vivienda_habitual: boolean;
  tension_normalizada: string;
  tension_v: string;
  tipo_punto_medida: string;
  modo_control_potencia: string;
  cnae: string;
  notas: string;
  activo: boolean;
  potencias: Record<string, string>;
}

const EMPTY: Form = {
  numero_contrato: "", codigo_interno: "", tipo_contrato_atr: "", estado: "activo",
  fecha_alta: "", fecha_baja: "",
  titular_id: "", suministro_id: "", tarifa_id: "", comercializadora_empresa_id: "",
  es_autoconsumo: false, bono_social: false,
  electrointensivo: false, no_cortable: false, peaje_directo: false, telegestion: false,
  exencion_iese: false,
  vivienda_habitual: false,
  tension_normalizada: "", tension_v: "", tipo_punto_medida: "", modo_control_potencia: "",
  cnae: "",
  notas: "", activo: true, potencias: {},
};

function formFromContrato(c: Contrato): Form {
  const pot: Record<string, string> = {};
  c.potencias.forEach((p) => { pot[p.periodo] = String(p.potencia_kw); });
  return {
    id: c.id, numero_contrato: c.numero_contrato, codigo_interno: c.codigo_interno ?? "",
    tipo_contrato_atr: c.tipo_contrato_atr, estado: c.estado,
    fecha_alta: c.fecha_alta ?? "", fecha_baja: c.fecha_baja ?? "",
    titular_id: c.titular_id, suministro_id: c.suministro_id, tarifa_id: c.tarifa_id,
    comercializadora_empresa_id: c.comercializadora_empresa_id ?? "",
    es_autoconsumo: c.es_autoconsumo,
    bono_social: c.bono_social, electrointensivo: c.electrointensivo, no_cortable: c.no_cortable,
    peaje_directo: c.peaje_directo, telegestion: c.telegestion,
    exencion_iese: c.exencion_iese,
    vivienda_habitual: c.vivienda_habitual ?? false,
    tension_normalizada: c.tension_normalizada ?? "",
    tension_v: c.tension_v != null ? String(c.tension_v) : "",
    tipo_punto_medida: c.tipo_punto_medida != null ? String(c.tipo_punto_medida) : "",
    modo_control_potencia: c.modo_control_potencia ?? "",
    cnae: c.cnae ?? "",
    notas: c.notas ?? "", activo: c.activo, potencias: pot,
  };
}

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
const reqMark = <span style={{ color: "#F0999B" }}> *</span>;
const optDark: React.CSSProperties = { background: "#16181D" };

function estadoBadge(estado: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    activo: ["rgba(74,222,128,0.15)", "#7BE0A3"],
    borrador: ["rgba(224,201,123,0.15)", "#E0C97B"],
    baja: ["rgba(255,255,255,0.06)", "rgba(241,239,232,0.5)"],
  };
  const [bg, color] = map[estado] || map.baja;
  return { background: bg, color, fontSize: 12, padding: "2px 9px", borderRadius: 6 };
}

// TextField FUERA del componente para no perder el foco al re-render.
function TextField(props: {
  label: string; value: string; onChange: (v: string) => void;
  span?: boolean; type?: string; monospace?: boolean; disabled?: boolean;
}) {
  const { label, value, onChange, span, type = "text", monospace, disabled } = props;
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? reqMark : null}</label>
      <input type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={monospace ? { ...inputStyle, fontFamily: monoFont } : inputStyle} />
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(241,239,232,0.8)" }}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

function BoolField(props: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>{props.label}</label>
      <div style={{ height: 34, display: "flex", alignItems: "center" }}>
        <input type="checkbox" checked={props.checked} disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.checked)} style={{ width: 16, height: 16 }} />
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

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: "none", border: "none", cursor: "pointer",
  fontSize: 14, padding: "8px 2px",
  borderBottom: active ? "2px solid #F1EFE8" : "2px solid transparent",
  color: active ? "var(--ds-text-primary, #F1EFE8)" : "rgba(241,239,232,0.55)",
});

const txt = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : String(v));
const SI_NO = (v: unknown): string => (v === true ? "Sí" : v === false ? "No" : "—");
const fmtVal = (v: unknown): string => {
  if (v === true) return "Sí";
  if (v === false) return "No";
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
};
const fmtPotencias = (p: unknown): string => {
  if (!p || typeof p !== "object") return "—";
  const obj = p as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return keys.length ? keys.map((k) => `${k}: ${obj[k] ?? "—"}`).join("   ") : "—";
};

function FotoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)", padding: "6px 0" }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function ContratosPage() {
  const router = useRouter();
  const empresaId = useErpEmpresaId();

  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [titulares, setTitulares] = useState<OptTitular[]>([]);
  const [suministros, setSuministros] = useState<OptSuministro[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [coms, setComs] = useState<OptCom[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [modo, setModo] = useState<"ver" | "editar">("editar");
  const [original, setOriginal] = useState<Contrato | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const ver = modo === "ver";

  const [tab, setTab] = useState<"datos" | "historico">("datos");
  const [versiones, setVersiones] = useState<VersionListItem[]>([]);
  const [versionesLoading, setVersionesLoading] = useState(false);
  const [versionSel, setVersionSel] = useState<VersionDetalle | null>(null);
  const [subTab, setSubTab] = useState<"modificacion" | "cambios">("modificacion");
  const [confirmCambios, setConfirmCambios] = useState<{ etiqueta: string; antes: string; despues: string }[] | null>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) { router.replace("/login"); return; } } catch { /* */ }
    setAuthChecked(true);
  }, [router]);

  const cargarContratos = useCallback(async () => {
    if (empresaId == null) { setItems([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (search.trim()) params.set("search", search.trim());
      const r = await fetch(`${API_BASE_URL}/erp/contratos?${params.toString()}`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setItems(Array.isArray(data) ? (data as Contrato[]) : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [empresaId, search]);

  const cargarOpts = useCallback(async () => {
    if (empresaId == null) return;
    const ep = String(empresaId);
    try {
      const [tit, sum, tar, com] = await Promise.all([
        fetch(`${API_BASE_URL}/erp/titulares?empresa_id=${ep}&solo_activos=true`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/erp/suministros?empresa_id=${ep}&solo_activos=true`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/erp/tarifas?solo_activas=true`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/erp/comercializadoras-empresa?empresa_id=${ep}`, { headers: authHeaders() }),
      ]);
      setTitulares(tit.ok ? await tit.json() : []);
      setSuministros(sum.ok ? await sum.json() : []);
      setTarifas(tar.ok ? await tar.json() : []);
      setComs(com.ok ? await com.json() : []);
    } catch { /* */ }
  }, [empresaId]);

  useEffect(() => {
    if (!authChecked) return;
    const t = setTimeout(() => cargarContratos(), 250);
    return () => clearTimeout(t);
  }, [authChecked, cargarContratos]);

  useEffect(() => { if (authChecked) cargarOpts(); }, [authChecked, cargarOpts]);

  const tarifaSel = useMemo(() => tarifas.find((t) => t.id === form.tarifa_id), [tarifas, form.tarifa_id]);
  const periodosPotencia = useMemo(
    () => (tarifaSel?.periodos || []).filter((p) => p.tipo === "potencia").sort((a, b) => a.orden - b.orden),
    [tarifaSel]
  );

  const cargarVersiones = useCallback(async () => {
    if (form.id == null) { setVersiones([]); return; }
    setVersionesLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/contratos/${form.id}/versiones`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setVersiones(Array.isArray(data) ? (data as VersionListItem[]) : []);
    } catch { setVersiones([]); }
    finally { setVersionesLoading(false); }
  }, [form.id]);

  const abrirVersion = async (vid: number) => {
    if (form.id == null) return;
    try {
      const r = await fetch(`${API_BASE_URL}/erp/contratos/${form.id}/versiones/${vid}`, { headers: authHeaders() });
      if (r.ok) { setVersionSel((await r.json()) as VersionDetalle); setSubTab("modificacion"); }
    } catch { /* */ }
  };

  const abrirNuevo = () => { setOriginal(null); setForm({ ...EMPTY }); setModo("editar"); setErrorMsg(null); setTab("datos"); setVersiones([]); setVersionSel(null); setPanelOpen(true); };
  const abrirFicha = (c: Contrato) => { setOriginal(c); setForm(formFromContrato(c)); setModo("ver"); setErrorMsg(null); setTab("datos"); setVersiones([]); setVersionSel(null); setPanelOpen(true); };
  const cerrar = () => { if (!saving) { setPanelOpen(false); setVersionSel(null); } };
  const editar = () => { setErrorMsg(null); setModo("editar"); };
  const corte = () => { window.alert("Corte de suministro: acción pendiente de definir."); };
  const cancelar = () => {
    if (saving) return;
    if (original) { setForm(formFromContrato(original)); setErrorMsg(null); setModo("ver"); }
    else { setPanelOpen(false); }
  };

  const puedeGuardar = !!(form.numero_contrato.trim() && form.tipo_contrato_atr.trim()
    && form.titular_id !== "" && form.suministro_id !== "" && form.tarifa_id !== "");

  const diffPreview = (): { etiqueta: string; antes: string; despues: string }[] => {
    if (!original) return [];
    const out: { etiqueta: string; antes: string; despues: string }[] = [];
    const push = (etiqueta: string, a: unknown, d: unknown) => {
      const aS = fmtVal(a); const dS = fmtVal(d);
      if (aS !== dS) out.push({ etiqueta, antes: aS, despues: dS });
    };
    const titNombre = (id: number | "") => titulares.find((t) => t.id === id)?.nombre ?? null;
    const cupsDe = (id: number | "") => suministros.find((s) => s.id === id)?.cups ?? null;
    const tarCod = (id: number | "") => tarifas.find((t) => t.id === id)?.codigo ?? null;
    const comNom = (id: number | "") => (id === "" ? null : (coms.find((c) => c.id === id)?.com_nombre ?? null));
    push("Nº contrato", original.numero_contrato, form.numero_contrato);
    push("Tipo ATR", original.tipo_contrato_atr, form.tipo_contrato_atr);
    push("Estado", original.estado, form.estado);
    push("Titular", original.titular_nombre, titNombre(form.titular_id));
    push("CUPS", original.cups, cupsDe(form.suministro_id));
    push("Comercializadora", original.comercializadora_nombre, comNom(form.comercializadora_empresa_id));
    push("CNAE", original.cnae, form.cnae || null);
    push("Tarifa", original.tarifa_codigo, tarCod(form.tarifa_id));
    push("Modo control potencia", original.modo_control_potencia, form.modo_control_potencia || null);
    push("Tensión (V)", original.tension_v, form.tension_v.trim() === "" ? null : Number(form.tension_v));
    push("Tensión normalizada", original.tension_normalizada, form.tension_normalizada || null);
    push("Tipo punto de medida", original.tipo_punto_medida, form.tipo_punto_medida === "" ? null : Number(form.tipo_punto_medida));
    push("Autoconsumo", original.es_autoconsumo, form.es_autoconsumo);
    push("Telegestión", original.telegestion, form.telegestion);
    push("Bono social", original.bono_social, form.bono_social);
    push("Esencial (no cortable)", original.no_cortable, form.no_cortable);
    push("Electrointensivo", original.electrointensivo, form.electrointensivo);
    push("Exención IESE", original.exencion_iese, form.exencion_iese);
    push("Vivienda habitual", original.vivienda_habitual, form.vivienda_habitual);
    push("Peaje directo", original.peaje_directo, form.peaje_directo);
    const origPot: Record<string, number> = {};
    original.potencias.forEach((p) => { origPot[p.periodo] = p.potencia_kw; });
    periodosPotencia.forEach((p) => {
      const raw = form.potencias[p.periodo] ?? "";
      const aS = origPot[p.periodo] === undefined ? "—" : String(origPot[p.periodo]);
      const dS = raw.trim() === "" ? "—" : String(Number(raw));
      if (aS !== dS) out.push({ etiqueta: `Potencia ${p.periodo}`, antes: aS, despues: dS });
    });
    return out;
  };

  const guardar = () => {
    if (!puedeGuardar || empresaId == null) return;
    if (form.id == null) { void guardarReal(); return; }       // alta: sin confirmación
    const cambios = diffPreview();
    if (cambios.length === 0) { void guardarReal(); return; }   // sin cambios reales
    setConfirmCambios(cambios);
  };

  const guardarReal = async () => {
    setSaving(true); setErrorMsg(null);
    try {
      const esNuevo = form.id == null;
      const url = esNuevo
        ? `${API_BASE_URL}/erp/contratos?empresa_id=${empresaId}`
        : `${API_BASE_URL}/erp/contratos/${form.id}`;
      const potencias = periodosPotencia
        .filter((p) => (form.potencias[p.periodo] ?? "").trim() !== "")
        .map((p) => ({ periodo: p.periodo, potencia_kw: Number(form.potencias[p.periodo]) }));
      const payload = {
        numero_contrato: form.numero_contrato, codigo_interno: form.codigo_interno || null,
        tipo_contrato_atr: form.tipo_contrato_atr, estado: form.estado,
        fecha_alta: form.fecha_alta || null, fecha_baja: form.fecha_baja || null,
        titular_id: Number(form.titular_id), suministro_id: Number(form.suministro_id),
        tarifa_id: Number(form.tarifa_id),
        comercializadora_empresa_id: form.comercializadora_empresa_id === "" ? null : Number(form.comercializadora_empresa_id),
        es_autoconsumo: form.es_autoconsumo,
        bono_social: form.bono_social,
        electrointensivo: form.electrointensivo, no_cortable: form.no_cortable,
        peaje_directo: form.peaje_directo, telegestion: form.telegestion,
        vivienda_habitual: form.vivienda_habitual,
        exencion_iese: form.exencion_iese,
        tension_normalizada: form.tension_normalizada || null,
        tension_v: form.tension_v.trim() === "" ? null : Number(form.tension_v),
        tipo_punto_medida: form.tipo_punto_medida === "" ? null : Number(form.tipo_punto_medida),
        modo_control_potencia: form.modo_control_potencia || null,
        cnae: form.cnae || null,
        notas: form.notas || null, activo: form.activo, potencias,
      };
      const r = await fetch(url, {
        method: esNuevo ? "POST" : "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        setErrorMsg(await readApiError(r, "No se pudo guardar el contrato."));
        return;
      }
      setPanelOpen(false);
      await cargarContratos();
    } catch {
      setErrorMsg("Error de conexión al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const desactivar = async () => {
    if (form.id == null) return;
    if (!window.confirm("¿Dar de baja este contrato? (estado=baja, libera el suministro)")) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/contratos/${form.id}`, { method: "DELETE", headers: authHeaders() });
      if (r.ok) { setPanelOpen(false); await cargarContratos(); }
    } finally { setSaving(false); }
  };

  if (!authChecked) return null;

  // ============================================================
  // Vista FICHA (estándar A3) — layout Hoja1
  // ============================================================
  if (panelOpen) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <button onClick={cerrar}
              style={{ background: "none", border: "none", color: "rgba(241,239,232,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}>
              ← Contratos
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 0", fontFamily: form.id != null ? monoFont : undefined }}>
              {form.id != null ? (form.numero_contrato || "Contrato") : "Nuevo contrato"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button type="button" role="switch" aria-checked={form.activo} aria-label="Activo"
              disabled={ver}
              onClick={() => { if (!ver) setForm({ ...form, activo: !form.activo }); }}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: ver ? "default" : "pointer", color: "rgba(241,239,232,0.75)", fontSize: 13, padding: 0, opacity: ver ? 0.7 : 1 }}>
              {form.activo ? "Activo" : "Baja"}
              <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: form.activo ? "#7BE0A3" : "rgba(255,255,255,0.15)", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: form.activo ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left .15s" }} />
              </span>
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {ver ? (
                <>
                  <button onClick={editar} style={btnGhost}>Editar</button>
                  <button onClick={corte} style={btnGhost}>Corte</button>
                  {form.id != null ? (
                    <button onClick={desactivar} disabled={saving} style={btnDanger}>Baja</button>
                  ) : null}
                </>
              ) : (
                <>
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
          <button onClick={() => setTab("datos")} style={tabStyle(tab === "datos")}>Datos generales</button>
          {form.id != null ? (
            <button onClick={() => { setTab("historico"); cargarVersiones(); }} style={tabStyle(tab === "historico")}>
              Histórico del contrato
            </button>
          ) : null}
        </div>

        {errorMsg && (
          <div style={{ background: "rgba(240,153,155,0.1)", border: "0.5px solid rgba(240,153,155,0.4)", color: "#F0999B", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        {tab === "datos" && (
        <>
        {/* T1 — Identificación */}
        <SectionCard title="Identificación">

          <TextField label="Nº contrato *" monospace disabled={ver} value={form.numero_contrato} onChange={(v) => setForm({ ...form, numero_contrato: v })} />
          <div>
            <label style={labelStyle}>Tipo contrato ATR{reqMark}</label>
            <select style={inputStyle} disabled={ver} value={form.tipo_contrato_atr} onChange={(e) => setForm({ ...form, tipo_contrato_atr: e.target.value })}>
              <option value="" style={optDark}>— seleccionar —</option>
              <option value="anual" style={optDark}>Anual (prórroga tácita)</option>
              <option value="eventual" style={optDark}>Eventual (hasta 12 meses)</option>
              <option value="temporada" style={optDark}>Temporada</option>
              <option value="obras" style={optDark}>Suministro de obras</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Estado</label>
            <select style={inputStyle} disabled={ver} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              <option value="borrador" style={optDark}>borrador</option>
              <option value="activo" style={optDark}>activo</option>
              <option value="baja" style={optDark}>baja</option>
            </select>
          </div>
          <TextField label="Fecha alta" type="date" disabled={ver} value={form.fecha_alta} onChange={(v) => setForm({ ...form, fecha_alta: v })} />
          <TextField label="Fecha baja" type="date" disabled={ver} value={form.fecha_baja} onChange={(v) => setForm({ ...form, fecha_baja: v })} />
          <TextField label="Código interno" disabled={ver} value={form.codigo_interno} onChange={(v) => setForm({ ...form, codigo_interno: v })} />
        </SectionCard>

        {/* T2 — Datos contrato */}
        <SectionCard title="Datos contrato">
          <div>
            <label style={labelStyle}>Titular{reqMark}</label>
            <select style={inputStyle} disabled={ver} value={form.titular_id} onChange={(e) => setForm({ ...form, titular_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— seleccionar —</option>
              {titulares.map((t) => <option key={t.id} value={t.id} style={optDark}>{t.nombre || `#${t.id}`}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>CUPS (suministro){reqMark}</label>
            <select style={inputStyle} disabled={ver} value={form.suministro_id} onChange={(e) => setForm({ ...form, suministro_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— seleccionar —</option>
              {suministros.map((s) => <option key={s.id} value={s.id} style={optDark}>{s.cups}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Comercializadora</label>
            <select style={inputStyle} disabled={ver} value={form.comercializadora_empresa_id} onChange={(e) => setForm({ ...form, comercializadora_empresa_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— ninguna —</option>
              {coms.map((c) => <option key={c.id} value={c.id} style={optDark}>{c.com_nombre ?? `#${c.id}`}</option>)}
            </select>
          </div>
          <TextField label="CNAE" disabled={ver} value={form.cnae} onChange={(v) => setForm({ ...form, cnae: v })} />
        </SectionCard>

        {/* T3 — Datos técnicos (2 columnas de campos + Potencias a la derecha) */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Datos técnicos</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, alignItems: "start" }}>
            {/* Campos: 2 columnas, filas alineadas (cada celda = etiqueta + control misma altura) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px", alignItems: "start" }}>
              <div>
                <label style={labelStyle}>Tarifa{reqMark}</label>
                <select style={inputStyle} disabled={ver} value={form.tarifa_id} onChange={(e) => setForm({ ...form, tarifa_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="" style={optDark}>— seleccionar —</option>
                  {tarifas.map((t) => <option key={t.id} value={t.id} style={optDark}>{t.codigo}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Modo control potencia</label>
                <select style={inputStyle} disabled={ver} value={form.modo_control_potencia} onChange={(e) => setForm({ ...form, modo_control_potencia: e.target.value })}>
                  <option value="" style={optDark}>— sin especificar —</option>
                  <option value="icp" style={optDark}>ICP</option>
                  <option value="maximetro" style={optDark}>Maxímetro</option>
                </select>
              </div>
              <TextField label="Tensión (V)" type="number" disabled={ver} value={form.tension_v} onChange={(v) => setForm({ ...form, tension_v: v })} />
              <TextField label="Tensión normalizada" disabled={ver} value={form.tension_normalizada} onChange={(v) => setForm({ ...form, tension_normalizada: v })} />
              <div>
                <label style={labelStyle}>Tipo punto de medida</label>
                <input style={{ ...inputStyle, opacity: 0.7 }} disabled value={form.tipo_punto_medida || "— se calcula al guardar (según potencia) —"} readOnly />
              </div>
              <div />
              <BoolField label="Autoconsumo" disabled={ver} checked={form.es_autoconsumo} onChange={(v) => setForm({ ...form, es_autoconsumo: v })} />
              <BoolField label="Telegestión" disabled={ver} checked={form.telegestion} onChange={(v) => setForm({ ...form, telegestion: v })} />
            </div>

            {/* Potencias contratadas: columna derecha, en 2 columnas internas */}
            <div>
              <label style={labelStyle}>Potencias contratadas (kW)</label>
              {form.tarifa_id === "" ? (
                <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: "4px 0 0" }}>Elige una tarifa.</p>
              ) : periodosPotencia.length === 0 ? (
                <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: "4px 0 0" }}>La tarifa no tiene periodos de potencia.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {periodosPotencia.map((p) => (
                    <div key={p.periodo}>
                      <label style={labelStyle}>{p.periodo}</label>
                      <input type="number" disabled={ver} value={form.potencias[p.periodo] ?? ""}
                        onChange={(e) => setForm({ ...form, potencias: { ...form.potencias, [p.periodo]: e.target.value } })}
                        style={inputStyle} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* T4 — Datos administrativos */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Datos administrativos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px 16px", alignItems: "center" }}>
            <Check label="Bono social" disabled={ver} checked={form.bono_social} onChange={(v) => setForm({ ...form, bono_social: v })} />
            <Check label="Esencial (no cortable)" disabled={ver} checked={form.no_cortable} onChange={(v) => setForm({ ...form, no_cortable: v })} />
            <Check label="Peaje directo" disabled={ver} checked={form.peaje_directo} onChange={(v) => setForm({ ...form, peaje_directo: v })} />
            <Check label="Vivienda habitual" disabled={ver} checked={form.vivienda_habitual} onChange={(v) => setForm({ ...form, vivienda_habitual: v })} />
            <Check label="Electrointensivo" disabled={ver} checked={form.electrointensivo} onChange={(v) => setForm({ ...form, electrointensivo: v })} />
            <Check label="Exención IESE" disabled={ver} checked={form.exencion_iese} onChange={(v) => setForm({ ...form, exencion_iese: v })} />
          </div>
        </div>

        {/* T5 — Notas */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Notas</div>
          <textarea value={form.notas} disabled={ver} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} />
        </div>
        </>
        )}

        {tab === "historico" && (
          <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
            {versionesLoading ? (
              <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "20px 14px" }}>Cargando…</div>
            ) : versiones.length === 0 ? (
              <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "20px 14px" }}>
                Sin versiones todavía. Se crea una al guardar el contrato.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
                    <th style={thStyle}>Versión</th>
                    <th style={thStyle}>Comercializadora</th>
                    <th style={thStyle}>Tarifa</th>
                    <th style={thStyle}>Potencia</th>
                    <th style={thStyle}>Fecha alta</th>
                    <th style={thStyle}>Fecha baja</th>
                    <th style={thStyle}>Fecha modif.</th>
                    <th style={{ ...thStyle, width: 90 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {versiones.map((v) => (
                    <tr key={v.id} onClick={() => abrirVersion(v.id)}
                      style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                      <td style={{ ...tdStyle, fontFamily: monoFont }}>v{v.version}{v.tipo_atr ? ` · ${v.tipo_atr}` : ""}</td>
                      <td style={tdStyle}>{v.comercializadora ?? "—"}</td>
                      <td style={tdStyle}>{v.tarifa ?? "—"}</td>
                      <td style={tdStyle}>{v.potencia ?? "—"}</td>
                      <td style={tdStyle}>{v.fecha_alta ?? "—"}</td>
                      <td style={tdStyle}>{v.fecha_baja ?? "—"}</td>
                      <td style={tdStyle}>{v.fecha_modificacion ?? "—"}</td>
                      <td style={tdStyle}>
                        <span style={v.estado === "Activa" ? estadoBadge("activo") : estadoBadge("baja")}>{v.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {versionSel && (
          <div onClick={() => setVersionSel(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: "#16181D", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 12, width: "min(760px, 100%)", maxHeight: "86vh", overflow: "auto", padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, fontFamily: monoFont }}>
                  Versión v{versionSel.version}{versionSel.tipo_atr ? ` · ${versionSel.tipo_atr}` : ""}
                </h2>
                <button onClick={() => setVersionSel(null)} style={btnGhost}>Cerrar</button>
              </div>

              <div style={{ display: "flex", gap: 18, borderBottom: "0.5px solid rgba(255,255,255,0.08)", marginBottom: 14 }}>
                <button onClick={() => setSubTab("modificacion")} style={tabStyle(subTab === "modificacion")}>Modificación</button>
                <button onClick={() => setSubTab("cambios")} style={tabStyle(subTab === "cambios")}>Cambios detectados</button>
              </div>

              {subTab === "modificacion" ? (
                <>
                  <SectionCard title="Información de la modificación">
                    <FotoField label="Versión" value={`v${versionSel.version}`} />
                    <FotoField label="Tipo ATR" value={txt(versionSel.tipo_atr)} />
                    <FotoField label="Fecha alta" value={txt(versionSel.fecha_alta)} />
                    <FotoField label="Fecha baja" value={txt(versionSel.fecha_baja)} />
                    <FotoField label="Fecha modificación" value={txt(versionSel.fecha_modificacion)} />
                    <FotoField label="Estado" value={txt(versionSel.estado)} />
                  </SectionCard>
                  <SectionCard title="Datos contrato">
                    <FotoField label="Titular" value={txt(versionSel.snapshot.titular_nombre)} />
                    <FotoField label="CUPS" value={txt(versionSel.snapshot.cups)} />
                    <FotoField label="Comercializadora" value={txt(versionSel.snapshot.comercializadora_nombre)} />
                    <FotoField label="CNAE" value={txt(versionSel.snapshot.cnae)} />
                  </SectionCard>
                  <SectionCard title="Datos técnicos">
                    <FotoField label="Tarifa" value={txt(versionSel.snapshot.tarifa_codigo)} />
                    <FotoField label="Modo control potencia" value={txt(versionSel.snapshot.modo_control_potencia)} />
                    <FotoField label="Tensión (V)" value={txt(versionSel.snapshot.tension_v)} />
                    <FotoField label="Tensión normalizada" value={txt(versionSel.snapshot.tension_normalizada)} />
                    <FotoField label="Tipo punto de medida" value={txt(versionSel.snapshot.tipo_punto_medida)} />
                    <FotoField label="Autoconsumo" value={SI_NO(versionSel.snapshot.es_autoconsumo)} />
                    <FotoField label="Telegestión" value={SI_NO(versionSel.snapshot.telegestion)} />
                    <FotoField label="Potencias (kW)" value={fmtPotencias(versionSel.snapshot.potencias)} />
                  </SectionCard>
                  <SectionCard title="Datos administrativos">
                    <FotoField label="Bono social" value={SI_NO(versionSel.snapshot.bono_social)} />
                    <FotoField label="Esencial (no cortable)" value={SI_NO(versionSel.snapshot.no_cortable)} />
                    <FotoField label="Electrointensivo" value={SI_NO(versionSel.snapshot.electrointensivo)} />
                    <FotoField label="Exención IESE" value={SI_NO(versionSel.snapshot.exencion_iese)} />
                    <FotoField label="Vivienda habitual" value={SI_NO(versionSel.snapshot.vivienda_habitual)} />
                    <FotoField label="Peaje directo" value={SI_NO(versionSel.snapshot.peaje_directo)} />
                  </SectionCard>
                </>
              ) : (
                <div>
                  {(versionSel.cambios && versionSel.cambios.length > 0) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {versionSel.cambios.map((ch, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px" }}>
                          <span style={{ minWidth: 160, color: "rgba(241,239,232,0.6)" }}>{ch.etiqueta}</span>
                          <span style={{ color: "#F0999B", textDecoration: "line-through" }}>{fmtVal(ch.antes)}</span>
                          <span style={{ color: "rgba(241,239,232,0.4)" }}>→</span>
                          <span style={{ color: "#7BE0A3" }}>{fmtVal(ch.despues)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13 }}>Sin cambios registrados (alta del contrato).</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {confirmCambios && (
          <div onClick={() => setConfirmCambios(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: "#16181D", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 12, width: "min(620px, 100%)", maxHeight: "86vh", overflow: "auto", padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Confirmar cambios</h2>
              <p style={{ fontSize: 12, color: "rgba(241,239,232,0.55)", margin: "0 0 14px" }}>
                Se guardará una nueva versión (M1) con estos cambios:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {confirmCambios.map((ch, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ minWidth: 160, color: "rgba(241,239,232,0.6)" }}>{ch.etiqueta}</span>
                    <span style={{ color: "#F0999B", textDecoration: "line-through" }}>{ch.antes}</span>
                    <span style={{ color: "rgba(241,239,232,0.4)" }}>→</span>
                    <span style={{ color: "#7BE0A3" }}>{ch.despues}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button onClick={() => setConfirmCambios(null)} style={btnGhost}>Seguir editando</button>
                <button onClick={() => { setConfirmCambios(null); void guardarReal(); }}
                  style={{ ...btnPrimary, cursor: "pointer" }}>
                  Confirmar y guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // Vista LISTADO
  // ============================================================
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Contratos</h1>
      <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", marginBottom: 18 }}>
        Contratos de acceso/suministro por CUPS.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nº de contrato o código interno…"
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <button onClick={abrirNuevo}
          style={{ background: "#F1EFE8", color: "#0E1014", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Nuevo contrato
        </button>
      </div>

      {empresaId == null ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Selecciona una empresa en el selector de arriba.</div>
      ) : loading ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
          {search.trim() ? "Sin resultados." : "No hay contratos todavía."}
        </div>
      ) : (
        <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
                <th style={thStyle}>Nº contrato</th>
                <th style={thStyle}>Titular</th>
                <th style={thStyle}>CUPS</th>
                <th style={thStyle}>Tarifa</th>
                <th style={{ ...thStyle, width: 90 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} onClick={() => abrirFicha(c)}
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer", opacity: c.activo ? 1 : 0.55 }}>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>{c.numero_contrato}</td>
                  <td style={tdStyle}>{c.titular_nombre ?? "—"}</td>
                  <td style={{ ...tdStyle, fontFamily: monoFont, fontSize: 12 }}>{c.cups ?? "—"}</td>
                  <td style={tdStyle}>{c.tarifa_codigo ?? "—"}</td>
                  <td style={tdStyle}>
                    <span style={estadoBadge(c.estado)}>{c.estado}</span>
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