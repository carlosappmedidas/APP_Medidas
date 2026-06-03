// app/stg/cups/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface CupsItem {
  id: number;
  cups: string;
  numero_contador: string | null;
  fabricante_contador: string | null;
  tarifa: string | null;
  concentrador_codigo_ct: string | null;
  ultimo_contacto: string | null;
  estado_comunicacion: string;
}

interface CupsListResponse {
  total: number;
  page: number;
  page_size: number;
  items: CupsItem[];
}

interface ContadorItem {
  id: number;
  empresa_id: number;
  concentrador_id: number | null;
  cups_id: number | null;
  meter_id: string;
  fabricante: string | null;
  ultimo_contacto: string | null;
  estado_comunicacion: string;
  activo: boolean;
  concentrador_codigo_ct: string | null;
  created_at: string;
  updated_at: string;
}

interface ContadoresListResponse {
  total: number;
  items: ContadorItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function estadoBadge(estado: string): React.ReactNode {
  const colores: Record<string, { bg: string; color: string }> = {
    ok:           { bg: "rgba(29,158,117,0.18)", color: "#1D9E75" },
    online:       { bg: "rgba(29,158,117,0.18)", color: "#1D9E75" },
    warning:      { bg: "rgba(239,159,39,0.18)", color: "#EF9F27" },
    alerta:       { bg: "rgba(239,159,39,0.18)", color: "#EF9F27" },
    error:        { bg: "rgba(226,75,74,0.18)", color: "#E24B4A" },
    offline:      { bg: "rgba(226,75,74,0.18)", color: "#E24B4A" },
    desconocido:  { bg: "rgba(255,255,255,0.06)", color: "rgba(241,239,232,0.5)" },
  };
  const c = colores[estado] || colores.desconocido;
  return (
    <span style={{ background: c.bg, color: c.color, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500 }}>
      {estado}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES");
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function StgCupsPage() {
  const empresaId = useStgEmpresaId();

  // CUPS oficiales (existente)
  const [cupsData, setCupsData] = useState<CupsListResponse | null>(null);
  const [loadingCups, setLoadingCups] = useState(true);
  const [errorCups, setErrorCups] = useState<string | null>(null);

  // Contadores detectados (Paquete 6)
  const [contadoresData, setContadoresData] = useState<ContadoresListResponse | null>(null);
  const [loadingContadores, setLoadingContadores] = useState(true);
  const [errorContadores, setErrorContadores] = useState<string | null>(null);

  // Filtros para contadores
  const [filtroContador, setFiltroContador] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");

  // Cargar CUPS oficiales
  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoadingCups(true);
    setErrorCups(null);

    const params = new URLSearchParams({
      empresa_id: String(empresaId),
      page: "1",
      page_size: "50",
    });

    fetch(`${API_BASE_URL}/stg/cups?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setCupsData)
      .catch((e) => setErrorCups(String(e)))
      .finally(() => setLoadingCups(false));
  }, [empresaId]);

  // Cargar contadores detectados
  const cargarContadores = () => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoadingContadores(true);
    setErrorContadores(null);
    fetch(`${API_BASE_URL}/stg/contadores-detectados?empresa_id=${empresaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setContadoresData)
      .catch((e) => setErrorContadores(String(e)))
      .finally(() => setLoadingContadores(false));
  };

  useEffect(() => {
    cargarContadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Aplicar filtros a contadores
  const contadoresFiltrados = useMemo(() => {
    if (!contadoresData) return [];
    const q = filtroContador.toLowerCase().trim();
    return contadoresData.items.filter((c) => {
      if (q && !c.meter_id.toLowerCase().includes(q) && !(c.concentrador_codigo_ct || "").toLowerCase().includes(q)) {
        return false;
      }
      if (filtroEstado && c.estado_comunicacion !== filtroEstado) {
        return false;
      }
      return true;
    });
  }, [contadoresData, filtroContador, filtroEstado]);

  // Stats agregados
  const stats = useMemo(() => {
    if (!contadoresData) return null;
    const items = contadoresData.items;
    return {
      total: items.length,
      ok: items.filter((c) => c.estado_comunicacion === "ok").length,
      warning: items.filter((c) => c.estado_comunicacion === "warning").length,
      error: items.filter((c) => c.estado_comunicacion === "error").length,
      activos: items.filter((c) => c.activo).length,
      fabricantes: Array.from(new Set(items.map((c) => c.fabricante).filter(Boolean))).sort(),
    };
  }, [contadoresData]);

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ------------------ Sección 1: CUPS oficiales ------------------ */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ds-text-primary, #F1EFE8)", margin: 0 }}>
            CUPS oficiales
          </h2>
          <span style={{ fontSize: 11, color: "rgba(241,239,232,0.4)" }}>
            (Códigos universales de punto de suministro registrados manualmente o via integración)
          </span>
        </div>

        {loadingCups && <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13 }}>Cargando…</div>}
        {errorCups && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, fontSize: 12 }}>
            {errorCups}
          </div>
        )}
        {!loadingCups && !errorCups && cupsData && cupsData.total === 0 && (
          <div style={{ padding: 14, color: "rgba(241,239,232,0.5)", fontSize: 12, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
            No hay CUPS oficiales registrados todavía. Esta sección se rellenará cuando se integre con la fuente de CUPS (ERP, distribuidora, manual).
          </div>
        )}
        {!loadingCups && !errorCups && cupsData && cupsData.total > 0 && (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <th style={thStyle}>CUPS</th>
                  <th style={thStyle}>Nº contador</th>
                  <th style={thStyle}>Fabricante</th>
                  <th style={thStyle}>Tarifa</th>
                  <th style={thStyle}>CT</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Último contacto</th>
                </tr>
              </thead>
              <tbody>
                {cupsData.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <td style={tdStyle}><span style={{ fontFamily: "monospace" }}>{c.cups}</span></td>
                    <td style={tdStyle}>{c.numero_contador || "—"}</td>
                    <td style={tdStyle}>{c.fabricante_contador || "—"}</td>
                    <td style={tdStyle}>{c.tarifa || "—"}</td>
                    <td style={tdStyle}>{c.concentrador_codigo_ct || "—"}</td>
                    <td style={tdStyle}>{estadoBadge(c.estado_comunicacion)}</td>
                    <td style={tdStyle}>{formatDate(c.ultimo_contacto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------ Sección 2: Contadores detectados ------------------ */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ds-text-primary, #F1EFE8)", margin: 0 }}>
            Contadores detectados
          </h2>
          <span style={{ fontSize: 11, color: "rgba(241,239,232,0.4)" }}>
            (Contadores físicos identificados en los informes S24 — sin código CUPS oficial todavía)
          </span>
          <button
            type="button"
            onClick={cargarContadores}
            disabled={loadingContadores}
            style={{ marginLeft: "auto", background: "rgba(83,74,183,0.2)", color: "#AFA9EC", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: loadingContadores ? "wait" : "pointer", opacity: loadingContadores ? 0.6 : 1 }}
          >
            {loadingContadores ? "Cargando…" : "Refrescar"}
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 6, fontSize: 12 }}>
            <span><strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{stats.total}</strong> total</span>
            <span style={{ color: "rgba(241,239,232,0.4)" }}>·</span>
            <span><strong style={{ color: "#1D9E75" }}>{stats.ok}</strong> ok</span>
            <span><strong style={{ color: "#EF9F27" }}>{stats.warning}</strong> warning</span>
            <span><strong style={{ color: "#E24B4A" }}>{stats.error}</strong> error</span>
            <span style={{ color: "rgba(241,239,232,0.4)" }}>·</span>
            <span><strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{stats.activos}</strong> activos</span>
            {stats.fabricantes.length > 0 && (
              <>
                <span style={{ color: "rgba(241,239,232,0.4)" }}>·</span>
                <span style={{ color: "rgba(241,239,232,0.6)" }}>Fabricantes: {stats.fabricantes.join(", ")}</span>
              </>
            )}
          </div>
        )}

        {/* Filtros */}
        {contadoresData && contadoresData.total > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Filtrar por meter_id o CT…"
              value={filtroContador}
              onChange={(e) => setFiltroContador(e.target.value)}
              style={{ flex: "1 1 240px", minWidth: 200, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 12, outline: "none" }}
            />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 12, outline: "none" }}
            >
              <option value="">Cualquier estado</option>
              <option value="ok">ok</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
              <option value="desconocido">desconocido</option>
            </select>
          </div>
        )}

        {loadingContadores && <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13 }}>Cargando…</div>}
        {errorContadores && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, fontSize: 12 }}>
            {errorContadores}
          </div>
        )}
        {!loadingContadores && !errorContadores && contadoresData && contadoresData.total === 0 && (
          <div style={{ padding: 14, color: "rgba(241,239,232,0.5)", fontSize: 12, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
            No hay contadores detectados todavía. Descarga y parsea ficheros S24 desde <code style={{ background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4 }}>/stg/configuracion</code> para que aparezcan aquí.
          </div>
        )}
        {!loadingContadores && !errorContadores && contadoresData && contadoresData.total > 0 && (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <th style={thStyle}>Meter ID</th>
                  <th style={thStyle}>Fabricante</th>
                  <th style={thStyle}>Concentrador (CT)</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Activo</th>
                  <th style={thStyle}>Último contacto</th>
                </tr>
              </thead>
              <tbody>
                {contadoresFiltrados.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <td style={tdStyle}><span style={{ fontFamily: "monospace" }}>{c.meter_id}</span></td>
                    <td style={tdStyle}>{c.fabricante || "—"}</td>
                    <td style={tdStyle}>{c.concentrador_codigo_ct ? <span style={{ fontFamily: "monospace" }}>{c.concentrador_codigo_ct}</span> : "—"}</td>
                    <td style={tdStyle}>{estadoBadge(c.estado_comunicacion)}</td>
                    <td style={tdStyle}>{c.activo ? "✅" : "❌"}</td>
                    <td style={tdStyle}>{formatDate(c.ultimo_contacto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contadoresFiltrados.length === 0 && (filtroContador || filtroEstado) && (
              <div style={{ padding: 14, color: "rgba(241,239,232,0.5)", fontSize: 12, textAlign: "center" }}>
                Ningún contador coincide con el filtro.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos table
// ---------------------------------------------------------------------------
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "rgba(241,239,232,0.5)",
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "var(--ds-text-primary, #F1EFE8)",
};
