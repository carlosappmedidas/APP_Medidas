// app/stg/cups/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

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

export default function StgCupsPage() {
  const empresaId = useStgEmpresaId();
  const [data, setData] = useState<CupsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("");

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      empresa_id: String(empresaId),
      page: "1",
      page_size: "50",
    });
    if (estado) params.append("estado", estado);
    if (search) params.append("search", search);

    fetch(`${API_BASE_URL}/stg/cups?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [empresaId, estado, search]);

  if (!empresaId) {
    return (
      <div style={{ color: "rgba(241,239,232,0.5)" }}>
        Selecciona una empresa en el desplegable.
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 16px" }}>
        CUPS telegestionados
      </h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar CUPS, contador o dirección…"
          style={{
            flex: 1,
            minWidth: 200,
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "8px 12px",
            color: "var(--ds-text-primary, #F1EFE8)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <FilterChip label="Todos" active={!estado} onClick={() => setEstado("")} />
        <FilterChip label="Online" active={estado === "online"} onClick={() => setEstado("online")} />
        <FilterChip label="Offline" active={estado === "offline"} onClick={() => setEstado("offline")} />
      </div>

      {loading && <div style={{ color: "rgba(241,239,232,0.5)" }}>Cargando…</div>}
      {error && <div style={{ color: "#E24B4A" }}>Error: {error}</div>}

      {data && (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {data.items.length === 0 ? (
            <div style={{ padding: 24, color: "rgba(241,239,232,0.5)", textAlign: "center", fontSize: 13 }}>
              No hay CUPS registrados todavía. Cuando configures la conexión STG, aparecerán aquí.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <Th>CUPS</Th>
                  <Th>Contador</Th>
                  <Th>CT</Th>
                  <Th>Tarifa</Th>
                  <Th>Último contacto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <Td><span style={{ fontFamily: "monospace" }}>{c.cups}</span></Td>
                    <Td>{c.numero_contador || "—"}</Td>
                    <Td>{c.concentrador_codigo_ct || "—"}</Td>
                    <Td>{c.tarifa || "—"}</Td>
                    <Td>{c.ultimo_contacto ? new Date(c.ultimo_contacto).toLocaleString("es-ES") : "—"}</Td>
                    <Td><EstadoPill estado={c.estado_comunicacion} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div
            style={{
              padding: "10px 14px",
              fontSize: 11,
              color: "rgba(241,239,232,0.5)",
              borderTop: "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            {data.items.length} de {data.total} CUPS
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(83,74,183,0.22)" : "rgba(255,255,255,0.04)",
        color: active ? "#AFA9EC" : "rgba(241,239,232,0.7)",
        border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 14px",
        fontWeight: 500,
        fontSize: 11,
        color: "rgba(241,239,232,0.5)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "10px 14px", color: "var(--ds-text-primary, #F1EFE8)" }}>
      {children}
    </td>
  );
}

function EstadoPill({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    online:      { bg: "rgba(29,158,117,0.2)",  color: "#1D9E75", label: "online" },
    offline:     { bg: "rgba(226,75,74,0.2)",   color: "#E24B4A", label: "offline" },
    alerta:      { bg: "rgba(239,159,39,0.2)",  color: "#EF9F27", label: "alerta" },
    desconocido: { bg: "rgba(255,255,255,0.08)", color: "rgba(241,239,232,0.6)", label: "desconocido" },
  };
  const s = map[estado] || map.desconocido;
  return (
    <span
      style={{
        display: "inline-block",
        background: s.bg,
        color: s.color,
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 6,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {s.label}
    </span>
  );
}
