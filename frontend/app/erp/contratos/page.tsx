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
interface OptCom { id: number; nombre: string; }
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
  comercializadora_id: number | null;
  suministro_id: number;
  tarifa_id: number;
  es_autoconsumo: boolean;
  autoconsumo_colectivo: boolean;
  bono_social: boolean;
  suministro_minimo_vital: boolean;
  electrointensivo: boolean;
  no_cortable: boolean;
  peaje_directo: boolean;
  telegestion: boolean;
  tension_normalizada: string | null;
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
  comercializadora_id: number | "";
  es_autoconsumo: boolean;
  autoconsumo_colectivo: boolean;
  bono_social: boolean;
  suministro_minimo_vital: boolean;
  electrointensivo: boolean;
  no_cortable: boolean;
  peaje_directo: boolean;
  telegestion: boolean;
  tension_normalizada: string;
  modo_control_potencia: string;
  cnae: string;
  notas: string;
  activo: boolean;
  potencias: Record<string, string>;
}

const EMPTY: Form = {
  numero_contrato: "", codigo_interno: "", tipo_contrato_atr: "", estado: "activo",
  fecha_alta: "", fecha_baja: "",
  titular_id: "", suministro_id: "", tarifa_id: "", comercializadora_id: "",
  es_autoconsumo: false, autoconsumo_colectivo: false, bono_social: false,
  suministro_minimo_vital: false, electrointensivo: false, no_cortable: false,
  peaje_directo: false, telegestion: false,
  tension_normalizada: "", modo_control_potencia: "",
  cnae: "",
  notas: "", activo: true, potencias: {},
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
// Si la label termina en " *", pinta asterisco rojo. `span` ocupa toda la fila.
function TextField(props: {
  label: string; value: string; onChange: (v: string) => void;
  span?: boolean; type?: string; monospace?: boolean;
}) {
  const { label, value, onChange, span, type = "text", monospace } = props;
  const req = label.endsWith(" *");
  const base = req ? label.slice(0, -2) : label;
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{base}{req ? reqMark : null}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={monospace ? { ...inputStyle, fontFamily: monoFont } : inputStyle} />
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
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        fetch(`${API_BASE_URL}/erp/comercializadoras?solo_activas=true`, { headers: authHeaders() }),
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

  const abrirNuevo = () => { setForm({ ...EMPTY }); setErrorMsg(null); setPanelOpen(true); };
  const abrirEditar = (c: Contrato) => {
    const pot: Record<string, string> = {};
    c.potencias.forEach((p) => { pot[p.periodo] = String(p.potencia_kw); });
    setForm({
      id: c.id, numero_contrato: c.numero_contrato, codigo_interno: c.codigo_interno ?? "",
      tipo_contrato_atr: c.tipo_contrato_atr, estado: c.estado,
      fecha_alta: c.fecha_alta ?? "", fecha_baja: c.fecha_baja ?? "",
      titular_id: c.titular_id, suministro_id: c.suministro_id, tarifa_id: c.tarifa_id,
      comercializadora_id: c.comercializadora_id ?? "",
      es_autoconsumo: c.es_autoconsumo, autoconsumo_colectivo: c.autoconsumo_colectivo,
      bono_social: c.bono_social, suministro_minimo_vital: c.suministro_minimo_vital,
      electrointensivo: c.electrointensivo, no_cortable: c.no_cortable,
      peaje_directo: c.peaje_directo, telegestion: c.telegestion,
      tension_normalizada: c.tension_normalizada ?? "", modo_control_potencia: c.modo_control_potencia ?? "",
      cnae: c.cnae ?? "",
      notas: c.notas ?? "", activo: c.activo, potencias: pot,
    });
      setErrorMsg(null); setPanelOpen(true);
  };
  const cerrar = () => { if (!saving) setPanelOpen(false); };

  const puedeGuardar = !!(form.numero_contrato.trim() && form.tipo_contrato_atr.trim()
    && form.titular_id !== "" && form.suministro_id !== "" && form.tarifa_id !== "");

  const guardar = async () => {
    if (!puedeGuardar || empresaId == null) return;
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
        comercializadora_id: form.comercializadora_id === "" ? null : Number(form.comercializadora_id),
        es_autoconsumo: form.es_autoconsumo, autoconsumo_colectivo: form.autoconsumo_colectivo,
        bono_social: form.bono_social, suministro_minimo_vital: form.suministro_minimo_vital,
        electrointensivo: form.electrointensivo, no_cortable: form.no_cortable,
        peaje_directo: form.peaje_directo, telegestion: form.telegestion,
        tension_normalizada: form.tension_normalizada || null,
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
  // Vista FICHA (estándar A3)
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
              onClick={() => setForm({ ...form, activo: !form.activo })}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(241,239,232,0.75)", fontSize: 13, padding: 0 }}>
              {form.activo ? "Activo" : "Baja"}
              <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: form.activo ? "#7BE0A3" : "rgba(255,255,255,0.15)", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: form.activo ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left .15s" }} />
              </span>
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {form.id != null ? (
                <button onClick={desactivar} disabled={saving} style={btnDanger}>Dar de baja</button>
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
          <TextField label="Nº contrato *" monospace value={form.numero_contrato} onChange={(v) => setForm({ ...form, numero_contrato: v })} />
          <TextField label="Código interno" value={form.codigo_interno} onChange={(v) => setForm({ ...form, codigo_interno: v })} />
          <div>
            <label style={labelStyle}>Tipo contrato ATR{reqMark}</label>
            <select style={inputStyle} value={form.tipo_contrato_atr} onChange={(e) => setForm({ ...form, tipo_contrato_atr: e.target.value })}>
              <option value="" style={optDark}>— seleccionar —</option>
              <option value="anual" style={optDark}>Anual (prórroga tácita)</option>
              <option value="eventual" style={optDark}>Eventual (hasta 12 meses)</option>
              <option value="temporada" style={optDark}>Temporada</option>
              <option value="obras" style={optDark}>Suministro de obras</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Estado</label>
            <select style={inputStyle} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              <option value="borrador" style={optDark}>borrador</option>
              <option value="activo" style={optDark}>activo</option>
              <option value="baja" style={optDark}>baja</option>
            </select>
          </div>
          <TextField label="Fecha alta" type="date" value={form.fecha_alta} onChange={(v) => setForm({ ...form, fecha_alta: v })} />
          <TextField label="Fecha baja" type="date" value={form.fecha_baja} onChange={(v) => setForm({ ...form, fecha_baja: v })} />
        </SectionCard>

        <SectionCard title="Partes y suministro">
          <div>
            <label style={labelStyle}>Titular{reqMark}</label>
            <select style={inputStyle} value={form.titular_id} onChange={(e) => setForm({ ...form, titular_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— seleccionar —</option>
              {titulares.map((t) => <option key={t.id} value={t.id} style={optDark}>{t.nombre || `#${t.id}`}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Suministro (CUPS){reqMark}</label>
            <select style={inputStyle} value={form.suministro_id} onChange={(e) => setForm({ ...form, suministro_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— seleccionar —</option>
              {suministros.map((s) => <option key={s.id} value={s.id} style={optDark}>{s.cups}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tarifa{reqMark}</label>
            <select style={inputStyle} value={form.tarifa_id} onChange={(e) => setForm({ ...form, tarifa_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— seleccionar —</option>
              {tarifas.map((t) => <option key={t.id} value={t.id} style={optDark}>{t.codigo}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Comercializadora</label>
            <select style={inputStyle} value={form.comercializadora_id} onChange={(e) => setForm({ ...form, comercializadora_id: e.target.value === "" ? "" : Number(e.target.value) })}>
              <option value="" style={optDark}>— ninguna —</option>
              {coms.map((c) => <option key={c.id} value={c.id} style={optDark}>{c.nombre}</option>)}
            </select>
          </div>
        </SectionCard>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Potencias contratadas (kW)</div>
          {form.tarifa_id === "" ? (
            <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: 0 }}>Elige una tarifa para ver sus periodos de potencia.</p>
          ) : periodosPotencia.length === 0 ? (
            <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: 0 }}>La tarifa seleccionada no tiene periodos de potencia cargados.</p>
          ) : (
            <div style={gridStyle}>
              {periodosPotencia.map((p) => (
                <div key={p.periodo}>
                  <label style={labelStyle}>{p.periodo}</label>
                  <input type="number" value={form.potencias[p.periodo] ?? ""}
                    onChange={(e) => setForm({ ...form, potencias: { ...form.potencias, [p.periodo]: e.target.value } })}
                    style={inputStyle} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Datos técnicos / Otros</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px 16px", alignItems: "center", marginBottom: 16 }}>
            <Check label="Autoconsumo" checked={form.es_autoconsumo} onChange={(v) => setForm({ ...form, es_autoconsumo: v })} />
            <Check label="Autoconsumo colectivo" checked={form.autoconsumo_colectivo} onChange={(v) => setForm({ ...form, autoconsumo_colectivo: v })} />
            <Check label="Bono social" checked={form.bono_social} onChange={(v) => setForm({ ...form, bono_social: v })} />
            <Check label="Suministro mínimo vital" checked={form.suministro_minimo_vital} onChange={(v) => setForm({ ...form, suministro_minimo_vital: v })} />
            <Check label="Electrointensivo" checked={form.electrointensivo} onChange={(v) => setForm({ ...form, electrointensivo: v })} />
            <Check label="No cortable (esencial)" checked={form.no_cortable} onChange={(v) => setForm({ ...form, no_cortable: v })} />
            <Check label="Peaje directo" checked={form.peaje_directo} onChange={(v) => setForm({ ...form, peaje_directo: v })} />
            <Check label="Telegestión" checked={form.telegestion} onChange={(v) => setForm({ ...form, telegestion: v })} />
          </div>

          <div style={gridStyle}>
            <TextField label="Tensión normalizada" value={form.tension_normalizada} onChange={(v) => setForm({ ...form, tension_normalizada: v })} />
            <div>
              <label style={labelStyle}>Modo control potencia</label>
              <select style={inputStyle} value={form.modo_control_potencia} onChange={(e) => setForm({ ...form, modo_control_potencia: e.target.value })}>
                <option value="" style={optDark}>— sin especificar —</option>
                <option value="icp" style={optDark}>ICP</option>
                <option value="maximetro" style={optDark}>Maxímetro</option>
              </select>
            </div>
            <TextField label="CNAE (actividad económica)" value={form.cnae} onChange={(v) => setForm({ ...form, cnae: v })} />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Notas</label>
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} />
          </div>
        </div>
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
                <tr key={c.id} onClick={() => abrirEditar(c)}
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