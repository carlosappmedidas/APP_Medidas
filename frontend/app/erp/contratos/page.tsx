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

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#9aa4b2", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", background: "#0f1623", border: "1px solid #2a3441", borderRadius: 6, color: "#e5e7eb", fontSize: 14, boxSizing: "border-box" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#9aa4b2", fontWeight: 500, padding: "10px 12px", borderBottom: "1px solid #1f2733" };
const tdStyle: React.CSSProperties = { padding: "12px", fontSize: 14, borderBottom: "1px solid #161c26" };
const sectionLabel: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", margin: "18px 0 8px" };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

function estadoBadge(estado: string) {
  const map: Record<string, [string, string, string]> = {
    activo: ["#0e2a1a", "#34d399", "#1f5138"],
    borrador: ["#2a2410", "#d9b441", "#5b4d1f"],
    baja: ["#23262d", "#9aa4b2", "#2a3441"],
  };
  const [bg, color, bd] = map[estado] || map.baja;
  return <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: bg, color, border: `1px solid ${bd}` }}>{estado}</span>;
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>{props.label}</label>
      <input type={props.type || "text"} value={props.value} onChange={(e) => props.onChange(e.target.value)}
        style={props.mono ? { ...inputStyle, ...mono } : inputStyle} />
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e5e7eb" }}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

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
  const [showRegimen, setShowRegimen] = useState(false);

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

  const abrirNuevo = () => { setForm({ ...EMPTY }); setErrorMsg(null); setShowRegimen(false); setPanelOpen(true); };
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
    setErrorMsg(null); setShowRegimen(false); setPanelOpen(true);
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

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Contratos</h1>
      <p style={{ color: "#9aa4b2", marginTop: 4, marginBottom: 18 }}>Contratos de acceso/suministro por CUPS.</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nº de contrato o código interno…" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={abrirNuevo}
          style={{ padding: "9px 14px", background: "#1f2733", color: "#e5e7eb", border: "1px solid #2a3441", borderRadius: 8, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Nuevo contrato
        </button>
      </div>

      {empresaId == null ? (
        <p style={{ color: "#6b7280" }}>Selecciona una empresa en el selector de arriba.</p>
      ) : loading ? (
        <p style={{ color: "#6b7280" }}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "#6b7280" }}>{search.trim() ? "Sin resultados." : "No hay contratos todavía."}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Nº contrato</th>
              <th style={thStyle}>Titular</th>
              <th style={thStyle}>CUPS</th>
              <th style={thStyle}>Tarifa</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => abrirEditar(c)} style={{ cursor: "pointer", opacity: c.activo ? 1 : 0.55 }}>
                <td style={{ ...tdStyle, ...mono }}>{c.numero_contrato}</td>
                <td style={tdStyle}>{c.titular_nombre ?? "—"}</td>
                <td style={{ ...tdStyle, ...mono, fontSize: 12 }}>{c.cups ?? "—"}</td>
                <td style={tdStyle}>{c.tarifa_codigo ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{estadoBadge(c.estado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {panelOpen && (
        <>
          <div onClick={cerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, maxWidth: "94vw", background: "#0b0f17", borderLeft: "1px solid #1f2733", zIndex: 50, padding: 24, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{form.id != null ? (form.numero_contrato || "Contrato") : "Nuevo contrato"}</div>
                <div style={{ fontSize: 13, color: "#9aa4b2" }}>{form.id != null ? "Editar contrato" : "Alta de contrato"}</div>
              </div>
              <button onClick={cerrar} style={{ background: "none", border: "none", color: "#9aa4b2", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            {errorMsg && <div style={{ background: "#2a1416", border: "1px solid #5b2330", color: "#f7a3ad", padding: "8px 10px", borderRadius: 6, fontSize: 13, margin: "8px 0" }}>{errorMsg}</div>}

            <div style={sectionLabel}>Identificación</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Nº contrato *" value={form.numero_contrato} onChange={(v) => setForm({ ...form, numero_contrato: v })} mono />
              <TextField label="Código interno" value={form.codigo_interno} onChange={(v) => setForm({ ...form, codigo_interno: v })} />
              <div>
                <label style={labelStyle}>Tipo contrato ATR *</label>
                <select style={inputStyle} value={form.tipo_contrato_atr} onChange={(e) => setForm({ ...form, tipo_contrato_atr: e.target.value })}>
                  <option value="">— seleccionar —</option>
                  <option value="anual">Anual (prórroga tácita)</option>
                  <option value="eventual">Eventual (hasta 12 meses)</option>
                  <option value="temporada">Temporada</option>
                  <option value="obras">Suministro de obras</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Estado</label>
                <select style={inputStyle} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                  <option value="borrador">borrador</option>
                  <option value="activo">activo</option>
                  <option value="baja">baja</option>
                </select>
              </div>
              <TextField label="Fecha alta" type="date" value={form.fecha_alta} onChange={(v) => setForm({ ...form, fecha_alta: v })} />
              <TextField label="Fecha baja" type="date" value={form.fecha_baja} onChange={(v) => setForm({ ...form, fecha_baja: v })} />
            </div>

            <div style={sectionLabel}>Partes y suministro</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Titular *</label>
                <select style={inputStyle} value={form.titular_id} onChange={(e) => setForm({ ...form, titular_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="">— seleccionar —</option>
                  {titulares.map((t) => <option key={t.id} value={t.id}>{t.nombre || `#${t.id}`}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Suministro (CUPS) *</label>
                <select style={inputStyle} value={form.suministro_id} onChange={(e) => setForm({ ...form, suministro_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="">— seleccionar —</option>
                  {suministros.map((s) => <option key={s.id} value={s.id}>{s.cups}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tarifa *</label>
                <select style={inputStyle} value={form.tarifa_id} onChange={(e) => setForm({ ...form, tarifa_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="">— seleccionar —</option>
                  {tarifas.map((t) => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Comercializadora</label>
                <select style={inputStyle} value={form.comercializadora_id} onChange={(e) => setForm({ ...form, comercializadora_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="">— ninguna —</option>
                  {coms.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={sectionLabel}>Potencias contratadas (kW)</div>
            {form.tarifa_id === "" ? (
              <p style={{ color: "#6b7280", fontSize: 13 }}>Elige una tarifa para ver sus periodos de potencia.</p>
            ) : periodosPotencia.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: 13 }}>La tarifa seleccionada no tiene periodos de potencia cargados.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
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

            <div style={{ ...sectionLabel, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setShowRegimen((s) => !s)}>
              <span>{showRegimen ? "▾" : "▸"}</span> Régimen regulado
            </div>
            {showRegimen && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Check label="Autoconsumo" checked={form.es_autoconsumo} onChange={(v) => setForm({ ...form, es_autoconsumo: v })} />
                  <Check label="Autoconsumo colectivo" checked={form.autoconsumo_colectivo} onChange={(v) => setForm({ ...form, autoconsumo_colectivo: v })} />
                  <Check label="Bono social" checked={form.bono_social} onChange={(v) => setForm({ ...form, bono_social: v })} />
                  <Check label="Suministro mínimo vital" checked={form.suministro_minimo_vital} onChange={(v) => setForm({ ...form, suministro_minimo_vital: v })} />
                  <Check label="Electrointensivo" checked={form.electrointensivo} onChange={(v) => setForm({ ...form, electrointensivo: v })} />
                  <Check label="No cortable (esencial)" checked={form.no_cortable} onChange={(v) => setForm({ ...form, no_cortable: v })} />
                  <Check label="Peaje directo" checked={form.peaje_directo} onChange={(v) => setForm({ ...form, peaje_directo: v })} />
                  <Check label="Telegestión" checked={form.telegestion} onChange={(v) => setForm({ ...form, telegestion: v })} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <TextField label="Tensión normalizada" value={form.tension_normalizada} onChange={(v) => setForm({ ...form, tension_normalizada: v })} />
                  <div>
                    <label style={labelStyle}>Modo control potencia</label>
                    <select style={inputStyle} value={form.modo_control_potencia} onChange={(e) => setForm({ ...form, modo_control_potencia: e.target.value })}>
                      <option value="">— sin especificar —</option>
                      <option value="icp">ICP</option>
                      <option value="maximetro">Maxímetro</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div style={sectionLabel}>Otros</div>
            <div style={{ marginBottom: 12 }}>
              <TextField label="CNAE (actividad económica)" value={form.cnae} onChange={(v) => setForm({ ...form, cnae: v })} />
            </div>
            <div>
              <label style={labelStyle}>Notas</label>
              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Check label="Activo" checked={form.activo} onChange={(v) => setForm({ ...form, activo: v })} />
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
                    Dar de baja
                  </button>
                )}
              </div>
              <button onClick={cerrar} style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer", background: "none", color: "#9aa4b2", border: "1px solid #2a3441" }}>Cancelar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
