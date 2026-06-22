// app/erp/catalogos/page.tsx
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

async function descargarPlantilla(entidad: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/erp/migraciones/plantilla/${entidad}`, { headers: authHeaders() });
  if (!r.ok) { alert("No se pudo descargar la plantilla."); return; }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plantilla_${entidad}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
interface TablaCatalogoValor {
  codigo: string;
  descripcion: string | null;
}
interface TablaCatalogo {
  clave: string;
  nombre: string;
  modulo: string;
  seccion: string;
  usado_por: string[];
  origen: string;
  normativa: string | null;
  tipo_fuente: string;
  num_valores: number;
  valores: TablaCatalogoValor[];
}

const EMPTY_COM: Comercializadora = {
  nombre: "", cif: "", codigo_ree: "",
  codigo_cnmc: null, codigo_liquidacion_cnmc: null, fecha_alta_cnmc: null, fecha_baja_cnmc: null,
  es_cur: false, activo: true, notas: "",
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

function badge(activo: boolean): React.CSSProperties {
  return activo
    ? { background: "rgba(74,222,128,0.15)", color: "#7BE0A3", fontSize: 12, padding: "2px 9px", borderRadius: 6 }
    : { background: "rgba(255,255,255,0.06)", color: "rgba(241,239,232,0.5)", fontSize: 12, padding: "2px 9px", borderRadius: 6 };
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "8px 2px",
    color: active ? "var(--ds-text-primary, #F1EFE8)" : "rgba(241,239,232,0.5)",
    borderBottom: active ? "2px solid #F1EFE8" : "2px solid transparent",
  };
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
export default function CatalogosPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<"tarifas" | "comercializadoras" | "tablas" | "migraciones">("tarifas");

  // Migraciones (E-12d): empresa global + resultados de importación
  const empresaIdMig = useErpEmpresaId();
  const [empresaNombreMig, setEmpresaNombreMig] = useState<string>("");
  const [migResultados, setMigResultados] = useState<Record<string, unknown>[]>([]);
  const [migConfirmar, setMigConfirmar] = useState<{ entidad: string; label: string; file: File } | null>(null);
  const [migSubiendo, setMigSubiendo] = useState<string | null>(null);
  // Tarifas
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loadingTar, setLoadingTar] = useState(false);

  // Comercializadoras
  const [coms, setComs] = useState<Comercializadora[]>([]);
  const [loadingCom, setLoadingCom] = useState(false);

  // Tablas (catálogo de tablas auxiliares del ERP)
  const [tablas, setTablas] = useState<TablaCatalogo[]>([]);
  const [loadingTablas, setLoadingTablas] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);
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

  const cargarTablas = useCallback(async () => {
    setLoadingTablas(true);
    try {
      const r = await fetch(`${API_BASE_URL}/erp/tablas`, { headers: authHeaders() });
      const data: unknown = r.ok ? await r.json() : [];
      setTablas(Array.isArray(data) ? (data as TablaCatalogo[]) : []);
    } catch { setTablas([]); }
    finally { setLoadingTablas(false); }
  }, []);

  useEffect(() => {
    if (!authChecked || tab !== "tablas") return;
    cargarTablas();
  }, [authChecked, tab, cargarTablas]);

  useEffect(() => {
    if (!authChecked || empresaIdMig == null) { setEmpresaNombreMig(""); return; }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, { headers: authHeaders() });
        const data: unknown = r.ok ? await r.json() : [];
        const lista = Array.isArray(data) ? (data as { id: number; nombre: string }[]) : [];
        const e = lista.find((x) => x.id === empresaIdMig);
        if (vivo) setEmpresaNombreMig(e ? e.nombre : `empresa ${empresaIdMig}`);
      } catch { if (vivo) setEmpresaNombreMig(`empresa ${empresaIdMig}`); }
    })();
    return () => { vivo = false; };
  }, [authChecked, empresaIdMig]);

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

  const puedeGuardar = !!(form.nombre.trim() && form.cif.trim() && form.codigo_ree.trim()
    && (form.codigo_cnmc ?? "").trim() && (form.codigo_liquidacion_cnmc ?? "").trim());
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
        codigo_cnmc: form.codigo_cnmc,
        codigo_liquidacion_cnmc: form.codigo_liquidacion_cnmc,
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
        if (r.status === 409) setErrorMsg(await readApiError(r, "Ya existe una comercializadora con ese código (REE, CNMC o liquidación)."));
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

  // --- Migraciones (E-12d): subida + informe ---
  const subirMigracion = async (entidad: string, file: File) => {
    if (empresaIdMig == null) return;
    setMigSubiendo(entidad);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_BASE_URL}/erp/migraciones/importar/${entidad}?empresa_id=${empresaIdMig}`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      if (!r.ok) {
        alert(await readApiError(r, "No se pudo importar el fichero."));
        return;
      }
      const data = (await r.json()) as Record<string, unknown>;
      // reemplaza el resultado previo de esa misma entidad (si lo hubiera) y añade el nuevo
      setMigResultados((prev) => [...prev.filter((x) => x.entidad !== entidad), data]);
    } catch {
      alert("Error de conexión al importar.");
    } finally {
      setMigSubiendo(null);
    }
  };

  const descargarInforme = async () => {
    if (migResultados.length === 0) return;
    try {
      const r = await fetch(`${API_BASE_URL}/erp/migraciones/informe`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(migResultados),
      });
      if (!r.ok) { alert("No se pudo generar el informe."); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "informe_migracion.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Error de conexión al generar el informe.");
    }
  };

  if (!authChecked) return null;

  const periodosTxt = (t: Tarifa, tipo: string) =>
    t.periodos.filter((p) => p.tipo === tipo).sort((a, b) => a.orden - b.orden).map((p) => p.periodo).join(" ") || "—";

  // ============================================================
  // Vista FICHA comercializadora (estándar A3)
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
              {form.id != null ? (form.nombre || "Comercializadora") : "Nueva comercializadora"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button type="button" role="switch" aria-checked={form.activo} aria-label="Activa"
              onClick={() => setForm({ ...form, activo: !form.activo })}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(241,239,232,0.75)", fontSize: 13, padding: 0 }}>
              {form.activo ? "Activa" : "Baja"}
              <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: form.activo ? "#7BE0A3" : "rgba(255,255,255,0.15)", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: form.activo ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left .15s" }} />
              </span>
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {form.id != null ? (
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
          <TextField label="Nombre *" span value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
          <TextField label="CIF *" monospace value={form.cif} onChange={(v) => setForm({ ...form, cif: v })} />
          <TextField label="Código REE *" monospace value={form.codigo_ree} onChange={(v) => setForm({ ...form, codigo_ree: v })} />
          <TextField label="Código CNMC (R2-XXX) *" monospace value={form.codigo_cnmc ?? ""} onChange={(v) => setForm({ ...form, codigo_cnmc: v })} />
          <TextField label="Código liquidación CNMC *" value={form.codigo_liquidacion_cnmc ?? ""} onChange={(v) => setForm({ ...form, codigo_liquidacion_cnmc: v })} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Check label="Comercializadora de referencia (CUR/COR)" checked={form.es_cur} onChange={(v) => setForm({ ...form, es_cur: v })} />
          </div>
        </SectionCard>

        <SectionCard title="Registro CNMC">
          <TextField label="Fecha alta CNMC" type="date" value={form.fecha_alta_cnmc ?? ""} onChange={(v) => setForm({ ...form, fecha_alta_cnmc: v })} />
          <TextField label="Fecha baja CNMC" type="date" value={form.fecha_baja_cnmc ?? ""} onChange={(v) => setForm({ ...form, fecha_baja_cnmc: v })} />
        </SectionCard>

        <SectionCard title="Otros">
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notas</label>
            <textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={3} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
          </div>
        </SectionCard>
      </div>
    );
  }

  // ============================================================
  // Vista LISTADO (con pestañas Tarifas / Comercializadoras)
  // ============================================================
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Catálogos</h1>
      <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", marginBottom: 18 }}>
        Tablas reguladas, comunes a todas las empresas.
      </p>

      <div style={{ display: "flex", gap: 18, borderBottom: "0.5px solid rgba(255,255,255,0.08)", marginBottom: 18 }}>
        <button style={tabBtn(tab === "tarifas")} onClick={() => setTab("tarifas")}>Tarifas</button>
        <button style={tabBtn(tab === "comercializadoras")} onClick={() => setTab("comercializadoras")}>Comercializadoras</button>
        <button style={tabBtn(tab === "tablas")} onClick={() => setTab("tablas")}>Tablas</button>
        <button style={tabBtn(tab === "migraciones")} onClick={() => setTab("migraciones")}>Migraciones</button>
      </div>

      {tab === "migraciones" ? (
        <div style={{ maxWidth: 760 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Migración de una empresa</h3>
          <p style={{ color: "rgba(241,239,232,0.6)", fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>
            Para dar de alta una distribuidora nueva, carga su maestro completo con estas plantillas Excel.
            Cada plantilla incluye una hoja <b>Instrucciones</b> que explica cómo rellenarla.
          </p>

          <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Pasos</div>
            <ol style={{ color: "rgba(241,239,232,0.7)", fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              <li>Descarga las cuatro plantillas y rellénalas (la fila 2 es un ejemplo: bórrala o sobreescríbela).</li>
              <li>Respeta el <b>orden de carga</b>: 1) Titulares y Comercializadoras de empresa · 2) Suministros · 3) Contratos.</li>
              <li>Las columnas en <b>azul</b> son enlaces por clave natural (NIF/CIF, CUPS, código REE…): deben existir ya cuando cargues. Las <b>amarillas</b> son automáticas, no las rellenes.</li>
              <li>Sube cada fichero (próximamente en esta misma pestaña). La migración cargará lo correcto y te devolverá un Excel con el resumen y el detalle de cualquier fila que falle.</li>
            </ol>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Descargar plantillas</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {[
              ["titulares", "Titulares"],
              ["comercializadoras_empresa", "Comercializadoras de empresa"],
              ["suministros", "Suministros"],
              ["contratos", "Contratos"],
            ].map(([ent, label]) => (
              <button key={ent} onClick={() => descargarPlantilla(ent)} style={tabBtn(false)}>
                ⬇ {label}
              </button>
            ))}
          </div>

          {/* --- Subida (E-12d) --- */}
          <div style={{ fontSize: 13, fontWeight: 600, margin: "26px 0 10px" }}>Subir ficheros rellenados</div>

          {empresaIdMig == null ? (
            <div style={{ background: "rgba(240,153,155,0.1)", border: "0.5px solid rgba(240,153,155,0.4)", color: "#F0999B", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
              Selecciona una empresa en el selector de arriba antes de migrar.
            </div>
          ) : (
            <>
              <div style={{ background: "rgba(55,138,221,0.1)", border: "0.5px solid rgba(55,138,221,0.4)", color: "#85B7EB", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                Vas a migrar a la empresa: <b>{empresaNombreMig || `empresa ${empresaIdMig}`}</b>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  ["titulares", "1 · Titulares"],
                  ["comercializadoras_empresa", "1 · Comercializadoras de empresa"],
                  ["suministros", "2 · Suministros"],
                  ["contratos", "3 · Contratos"],
                ].map(([ent, label]) => (
                  <div key={ent} style={{ display: "flex", alignItems: "center", gap: 12, border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 14px" }}>
                    <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
                    {migSubiendo === ent ? (
                      <span style={{ fontSize: 12, color: "rgba(241,239,232,0.5)" }}>Subiendo…</span>
                    ) : (
                      <label style={{ ...btnGhost, cursor: "pointer", display: "inline-block" }}>
                        Elegir fichero…
                        <input type="file" accept=".xlsx" style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) setMigConfirmar({ entidad: ent, label, file: f });
                          }} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Panel de resultados */}
          {migResultados.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Resultado</div>
                <button onClick={descargarInforme} style={{ ...btnGhost, marginLeft: "auto" }}>⬇ Descargar informe</button>
              </div>
              {migResultados.map((res) => {
                const r = res as { entidad: string; total: number; creadas: number; omitidas: number; fallidas: number; errores: { fila: number; columna: string | null; valor: unknown; motivo: string }[] };
                return (
                  <div key={r.entidad} style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.entidad}</span>
                      <span style={{ fontSize: 12, color: "rgba(241,239,232,0.6)" }}>Total: {r.total}</span>
                      <span style={{ fontSize: 12, color: "#7BE0A3" }}>Creadas: {r.creadas}</span>
                      <span style={{ fontSize: 12, color: "#E0C97B" }}>Omitidas: {r.omitidas}</span>
                      <span style={{ fontSize: 12, color: "#F0999B" }}>Fallidas: {r.fallidas}</span>
                    </div>
                    {r.errores && r.errores.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 10 }}>
                        <thead>
                          <tr style={{ color: "rgba(241,239,232,0.5)", textAlign: "left" }}>
                            <th style={{ padding: "4px 8px" }}>Fila</th>
                            <th style={{ padding: "4px 8px" }}>Columna</th>
                            <th style={{ padding: "4px 8px" }}>Valor</th>
                            <th style={{ padding: "4px 8px" }}>Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.errores.map((e, i) => (
                            <tr key={i} style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
                              <td style={{ padding: "4px 8px" }}>{e.fila}</td>
                              <td style={{ padding: "4px 8px", fontFamily: monoFont }}>{e.columna ?? "—"}</td>
                              <td style={{ padding: "4px 8px", fontFamily: monoFont }}>{e.valor == null ? "—" : String(e.valor)}</td>
                              <td style={{ padding: "4px 8px" }}>{e.motivo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal de doble confirmación */}
          {migConfirmar && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
              onClick={() => setMigConfirmar(null)}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: "#1A1C20", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 22, maxWidth: 420 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Confirmar migración</div>
                <p style={{ fontSize: 13, color: "rgba(241,239,232,0.7)", lineHeight: 1.6, margin: "0 0 18px" }}>
                  Vas a importar <b>{migConfirmar.label}</b> a la empresa <b>{empresaNombreMig || `empresa ${empresaIdMig}`}</b>.<br />
                  Fichero: <span style={{ fontFamily: monoFont }}>{migConfirmar.file.name}</span>
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setMigConfirmar(null)} style={btnGhost}>Cancelar</button>
                  <button onClick={() => { const c = migConfirmar; setMigConfirmar(null); subirMigracion(c.entidad, c.file); }}
                    style={{ ...btnPrimary, cursor: "pointer" }}>Confirmar e importar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : tab === "tablas" ? (        loadingTablas ? (
          <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando…</div>
        ) : tablas.length === 0 ? (
          <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>No hay tablas registradas.</div>
        ) : (
          <div>
            {Array.from(new Set(tablas.map((t) => t.modulo))).map((modulo) => (
              <div key={modulo} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{modulo}</div>
                {Array.from(new Set(tablas.filter((t) => t.modulo === modulo).map((t) => t.seccion))).map((seccion) => (
                  <div key={seccion} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(241,239,232,0.4)", margin: "0 0 6px 2px" }}>{seccion}</div>
                    {tablas.filter((t) => t.modulo === modulo && t.seccion === seccion).map((t) => {
                      const abierta = expandida === t.clave;
                      return (
                        <div key={t.clave} style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
                          <div onClick={() => setExpandida(abierta ? null : t.clave)}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                            <span style={{ fontSize: 12, opacity: 0.6 }}>{abierta ? "▾" : "▸"}</span>
                            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: monoFont }}>{t.clave}</span>
                            <span style={{ fontSize: 12, color: "rgba(241,239,232,0.6)" }}>{t.nombre}</span>
                            <span style={t.origen === "normativa"
                              ? { fontSize: 11, padding: "2px 9px", borderRadius: 6, background: "rgba(55,138,221,0.15)", color: "#85B7EB" }
                              : { fontSize: 11, padding: "2px 9px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "rgba(241,239,232,0.6)" }}>
                              {t.origen === "normativa" ? (t.normativa ?? "Normativa") : "Propia"}
                            </span>
                            {t.usado_por && t.usado_por.length > 0 && (
                              <span style={{ fontSize: 11, color: "rgba(241,239,232,0.45)" }}>
                                Usada en: {t.usado_por.join(", ")}
                              </span>
                            )}
                            <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(241,239,232,0.4)" }}>
                              {t.tipo_fuente === "tabla" ? `${t.num_valores} filas` : `${t.num_valores} valores`}
                            </span>
                          </div>
                          {abierta && (
                            <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                  <tr style={{ background: "rgba(255,255,255,0.02)", color: "rgba(241,239,232,0.5)" }}>
                                    <th style={{ ...thStyle, width: 140 }}>Código</th>
                                    <th style={thStyle}>Descripción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {t.valores.map((v) => (
                                    <tr key={v.codigo} style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
                                      <td style={{ ...tdStyle, fontFamily: monoFont, fontWeight: 600 }}>{v.codigo}</td>
                                      <td style={tdStyle}>{v.descripcion ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : tab === "tarifas" ? (
        loadingTar ? (
          <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando…</div>
        ) : tarifas.length === 0 ? (
          <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>No hay tarifas. Ejecuta el seed (scripts/seed_erp_tarifas.py).</div>
        ) : (
          <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
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
                  <tr key={t.id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ ...tdStyle, fontFamily: monoFont, fontWeight: 600 }}>{t.codigo}</td>
                    <td style={tdStyle}>{t.descripcion}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont }}>{t.codigo_ree ?? "—"}</td>
                    <td style={tdStyle}>{t.nivel_tension}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont, fontSize: 12 }}>{periodosTxt(t, "energia")}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont, fontSize: 12 }}>{periodosTxt(t, "potencia")}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {t.vigencia_desde ?? "—"}{t.vigencia_hasta ? ` → ${t.vigencia_hasta}` : ""}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "rgba(241,239,232,0.5)" }}>{t.referencia_normativa ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
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

          {loadingCom ? (
            <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>Cargando…</div>
          ) : coms.length === 0 ? (
            <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, padding: "24px 0" }}>
              {search.trim() ? "Sin resultados." : "No hay comercializadoras todavía."}
            </div>
          ) : (
            <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", color: "rgba(241,239,232,0.55)" }}>
                    <th style={thStyle}>Nombre</th>
                    <th style={thStyle}>CIF</th>
                    <th style={thStyle}>Código REE</th>
                    <th style={thStyle}>CUR</th>
                    <th style={{ ...thStyle, width: 90 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {coms.map((c) => (
                    <tr key={c.id} onClick={() => abrirEditar(c)}
                      style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer", opacity: c.activo ? 1 : 0.55 }}>
                      <td style={tdStyle}>{c.nombre}</td>
                      <td style={{ ...tdStyle, fontFamily: monoFont }}>{c.cif}</td>
                      <td style={{ ...tdStyle, fontFamily: monoFont }}>{c.codigo_ree}</td>
                      <td style={tdStyle}>{c.es_cur ? "Sí" : "—"}</td>
                      <td style={tdStyle}>
                        <span style={badge(c.activo)}>{c.activo ? "activa" : "baja"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}