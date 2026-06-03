// app/stg/cups/page.tsx
"use client";

import React, { useEffect, useState } from "react";
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

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50;

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

  const [data, setData] = useState<ContadoresListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Paginación (page 1-indexed para humanos; offset se calcula)
  const [page, setPage] = useState(1);

  const cargar = (targetPage: number) => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);

    const offset = (targetPage - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      empresa_id: String(empresaId),
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });

    fetch(`${API_BASE_URL}/stg/contadores-detectados?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  // Cargar al montar y al cambiar de empresa/página
  useEffect(() => {
    setPage(1);
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    cargar(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const stats = data?.stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: "var(--ds-text-primary, #F1EFE8)" }}>
          Equipos de medida
        </h1>
        <span style={{ fontSize: 11, color: "rgba(241,239,232,0.4)" }}>
          (Contadores físicos detectados en los informes S24)
        </span>
        <button
          type="button"
          onClick={() => cargar(page)}
          disabled={loading}
          style={{
            marginLeft: "auto",
            background: "rgba(83,74,183,0.2)",
            color: "#AFA9EC",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Cargando…" : "Refrescar"}
        </button>
      </div>

      {/* Stats globales (no paginadas) */}
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

      {/* Errores y estados de carga */}
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

      {/* Sin datos */}
      {!loading && !error && data && data.total === 0 && (
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

          {/* Paginación */}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data.total}
            offset={data.offset}
            pageSize={PAGE_SIZE}
            onChange={setPage}
            disabled={loading}
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
}: {
  page: number;
  totalPages: number;
  total: number;
  offset: number;
  pageSize: number;
  onChange: (p: number) => void;
  disabled: boolean;
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
      </span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => canPrev && onChange(page - 1)}
          disabled={!canPrev}
          style={canPrev ? btnStyle : btnDisabledStyle}
        >
          ← Anterior
        </button>
        <span style={{ minWidth: 90, textAlign: "center" }}>
          Página <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{page}</strong> de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => canNext && onChange(page + 1)}
          disabled={!canNext}
          style={canNext ? btnStyle : btnDisabledStyle}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos de tabla
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
