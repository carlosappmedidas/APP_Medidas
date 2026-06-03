// app/stg/cups/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
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

interface ContadoresStats {
  total: number;
  ok: number;
  warning: number;
  error: number;
  desconocido: number;
  activos: number;
  fabricantes: string[];
}

interface ContadoresListResponse {
  total: number;
  offset: number;
  limit: number;
  items: ContadorItem[];
  stats: ContadoresStats;
}

interface ConcentradorItem {
  id: number;
  codigo_ct: string | null;
}

interface ConcentradoresListResponse {
  items: ConcentradorItem[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function estadoBadge(estado: string): React.ReactNode {
  const colores: Record<string, { bg: string; color: string }> = {
    ok:           { bg: "rgba(29,158,117,0.18)", color: "#1D9E75" },
    warning:      { bg: "rgba(239,159,39,0.18)", color: "#EF9F27" },
    error:        { bg: "rgba(226,75,74,0.18)",  color: "#E24B4A" },
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
export default function StgEquiposMedidaPage() {
  const empresaId = useStgEmpresaId();

  // Datos de la tabla
  const [data, setData] = useState<ContadoresListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Concentradores para el combo
  const [concentradores, setConcentradores] = useState<ConcentradorItem[]>([]);

  // Paginación
  const [page, setPage] = useState(1);

  // Filtros server-side
  const [filtroConcentrador, setFiltroConcentrador] = useState<string>("");  // id como string
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [filtroFabricante, setFiltroFabricante] = useState<string>("");

  // Search con debounce: el input se mantiene en searchInput, pero
  // searchDebounced es el que dispara la llamada al backend.
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchDebounced, setSearchDebounced] = useState<string>("");

  const debounceRef = useRef<number | null>(null);

  // Marca para invalidar requests "en vuelo" cuando llega una nueva
  const requestIdRef = useRef(0);

  // ----- Cargar concentradores (una vez por empresa) -----
  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    fetch(`${API_BASE_URL}/stg/concentradores?empresa_id=${empresaId}&page_size=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ConcentradoresListResponse) => setConcentradores(d.items || []))
      .catch(() => setConcentradores([]));  // si falla, combo queda vacío
  }, [empresaId]);

  // ----- Debounce del search -----
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearchDebounced(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // ----- Reset a página 1 cuando cambian filtros -----
  useEffect(() => {
    setPage(1);
  }, [empresaId, filtroConcentrador, filtroEstado, filtroFabricante, searchDebounced]);

  // ----- Cargar contadores con filtros + paginación -----
  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      empresa_id: String(empresaId),
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (filtroConcentrador) params.set("concentrador_id", filtroConcentrador);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroFabricante) params.set("fabricante", filtroFabricante);
    if (searchDebounced.trim()) params.set("search", searchDebounced.trim());

    fetch(`${API_BASE_URL}/stg/contadores-detectados?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ContadoresListResponse) => {
        // Ignorar respuesta si ya hay una request más nueva en vuelo
        if (myRequestId !== requestIdRef.current) return;
        setData(d);
      })
      .catch((e) => {
        if (myRequestId !== requestIdRef.current) return;
        setError(String(e));
      })
      .finally(() => {
        if (myRequestId !== requestIdRef.current) return;
        setLoading(false);
      });
  }, [empresaId, page, filtroConcentrador, filtroEstado, filtroFabricante, searchDebounced]);

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const stats = data?.stats;

  // ¿Hay filtros activos? (para mostrar botón limpiar y/o badge)
  const hayFiltros = Boolean(
    filtroConcentrador || filtroEstado || filtroFabricante || searchInput.trim(),
  );

  const limpiarFiltros = () => {
    setFiltroConcentrador("");
    setFiltroEstado("");
    setFiltroFabricante("");
    setSearchInput("");
    setSearchDebounced("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: "var(--ds-text-primary, #F1EFE8)" }}>
          Equipos de medida
        </h1>
        <span style={{ fontSize: 11, color: "rgba(241,239,232,0.4)" }}>
          (Contadores físicos detectados en los informes S24)
        </span>
      </div>

      {/* Stats globales (siempre del total empresa, no filtran) */}
      {stats && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            padding: 10,
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <span><strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{stats.total.toLocaleString("es-ES")}</strong> total</span>
          <span style={{ color: "rgba(241,239,232,0.4)" }}>·</span>
          <span><strong style={{ color: "#1D9E75" }}>{stats.ok.toLocaleString("es-ES")}</strong> ok</span>
          <span><strong style={{ color: "#EF9F27" }}>{stats.warning.toLocaleString("es-ES")}</strong> warning</span>
          <span><strong style={{ color: "#E24B4A" }}>{stats.error.toLocaleString("es-ES")}</strong> error</span>
          <span style={{ color: "rgba(241,239,232,0.4)" }}>·</span>
          <span><strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{stats.activos.toLocaleString("es-ES")}</strong> activos</span>
          {stats.fabricantes.length > 0 && (
            <>
              <span style={{ color: "rgba(241,239,232,0.4)" }}>·</span>
              <span style={{ color: "rgba(241,239,232,0.6)" }}>Fabricantes: {stats.fabricantes.join(", ")}</span>
            </>
          )}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por meter_id o CT…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "6px 10px",
            color: "var(--ds-text-primary, #F1EFE8)",
            fontSize: 12,
            outline: "none",
          }}
        />

        <select
          value={filtroConcentrador}
          onChange={(e) => setFiltroConcentrador(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todos los CT ({concentradores.length})</option>
          {concentradores.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.codigo_ct || `CT #${c.id}`}
            </option>
          ))}
        </select>

        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={selectStyle}>
          <option value="">Todos los estados</option>
          <option value="ok">ok</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
          <option value="desconocido">desconocido</option>
        </select>

        <select value={filtroFabricante} onChange={(e) => setFiltroFabricante(e.target.value)} style={selectStyle}>
          <option value="">Todos los fabricantes</option>
          {stats?.fabricantes.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        {hayFiltros && (
          <button
            type="button"
            onClick={limpiarFiltros}
            style={{
              background: "rgba(226,75,74,0.15)",
              border: "0.5px solid rgba(226,75,74,0.3)",
              borderRadius: 6,
              padding: "6px 12px",
              color: "#E24B4A",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Errores */}
      {error && (
        <div
          style={{
            background: "rgba(226,75,74,0.1)",
            border: "0.5px solid rgba(226,75,74,0.4)",
            color: "#E24B4A",
            padding: 10,
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Sin datos absoluto */}
      {!loading && !error && data && data.total === 0 && !hayFiltros && (
        <div
          style={{
            padding: 14,
            color: "rgba(241,239,232,0.5)",
            fontSize: 12,
            textAlign: "center",
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
          }}
        >
          No hay equipos detectados todavía. Descarga y parsea ficheros S24 desde{" "}
          <code style={{ background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4 }}>
            /stg/configuracion
          </code>{" "}
          para que aparezcan aquí.
        </div>
      )}

      {/* Sin resultados POR EL FILTRO */}
      {!loading && !error && data && data.total === 0 && hayFiltros && (
        <div
          style={{
            padding: 14,
            color: "rgba(241,239,232,0.5)",
            fontSize: 12,
            textAlign: "center",
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
          }}
        >
          Ningún equipo coincide con los filtros actuales.{" "}
          <button
            type="button"
            onClick={limpiarFiltros}
            style={{
              background: "transparent",
              border: "none",
              color: "#AFA9EC",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: 12,
            }}
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Tabla */}
      {data && data.total > 0 && (
        <>
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
                {data.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <td style={tdStyle}><span style={{ fontFamily: "monospace" }}>{c.meter_id}</span></td>
                    <td style={tdStyle}>{c.fabricante || "—"}</td>
                    <td style={tdStyle}>
                      {c.concentrador_codigo_ct
                        ? <span style={{ fontFamily: "monospace" }}>{c.concentrador_codigo_ct}</span>
                        : "—"}
                    </td>
                    <td style={tdStyle}>{estadoBadge(c.estado_comunicacion)}</td>
                    <td style={tdStyle}>{c.activo ? "✅" : "❌"}</td>
                    <td style={tdStyle}>{formatDate(c.ultimo_contacto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={data.total}
            offset={data.offset}
            pageSize={PAGE_SIZE}
            onChange={setPage}
            disabled={loading}
            hayFiltros={hayFiltros}
            totalEmpresa={stats?.total ?? 0}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controles de paginación
// ---------------------------------------------------------------------------
function Pagination({
  page,
  totalPages,
  total,
  offset,
  pageSize,
  onChange,
  disabled,
  hayFiltros,
  totalEmpresa,
}: {
  page: number;
  totalPages: number;
  total: number;
  offset: number;
  pageSize: number;
  onChange: (p: number) => void;
  disabled: boolean;
  hayFiltros: boolean;
  totalEmpresa: number;
}) {
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + pageSize, total);

  const btnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    padding: "5px 12px",
    color: "var(--ds-text-primary, #F1EFE8)",
    fontSize: 12,
    cursor: "pointer",
  };
  const btnDisabledStyle: React.CSSProperties = {
    ...btnStyle,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  const canPrev = page > 1 && !disabled;
  const canNext = page < totalPages && !disabled;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 4px",
        fontSize: 12,
        color: "rgba(241,239,232,0.6)",
      }}
    >
      <span>
        Mostrando <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>
          {desde.toLocaleString("es-ES")}–{hasta.toLocaleString("es-ES")}
        </strong> de <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>
          {total.toLocaleString("es-ES")}
        </strong>
        {hayFiltros && totalEmpresa > total && (
          <span style={{ color: "rgba(241,239,232,0.4)" }}>
            {" "}(filtrados de {totalEmpresa.toLocaleString("es-ES")})
          </span>
        )}
      </span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => canPrev && onChange(page - 1)} disabled={!canPrev} style={canPrev ? btnStyle : btnDisabledStyle}>
          ← Anterior
        </button>
        <span style={{ minWidth: 90, textAlign: "center" }}>
          Página <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{page}</strong> de {totalPages}
        </span>
        <button type="button" onClick={() => canNext && onChange(page + 1)} disabled={!canNext} style={canNext ? btnStyle : btnDisabledStyle}>
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const selectStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  padding: "6px 10px",
  color: "var(--ds-text-primary, #F1EFE8)",
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
};

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
