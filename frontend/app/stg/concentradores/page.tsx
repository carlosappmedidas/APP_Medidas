// app/stg/concentradores/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

interface ConcentradorItem {
  id: number;
  codigo_ct: string;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  fabricante: string | null;
  modelo: string | null;
  protocolo_pmi: string | null;
  numero_cups_asociados: number | null;
  ultimo_contacto: string | null;
  estado_comunicacion: string;
}

interface ListResponse {
  total: number;
  items: ConcentradorItem[];
}

export default function StgConcentradoresPage() {
  const empresaId = useStgEmpresaId();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/stg/concentradores?empresa_id=${empresaId}&page_size=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [empresaId]);

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 16px" }}>
        Concentradores (DCU)
      </h1>

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
              No hay concentradores registrados todavía.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <Th>Código CT</Th>
                  <Th>Nombre / Dirección</Th>
                  <Th>Fabricante</Th>
                  <Th>Protocolo</Th>
                  <Th>CUPS</Th>
                  <Th>Último contacto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <Td><span style={{ fontFamily: "monospace" }}>{c.codigo_ct}</span></Td>
                    <Td>
                      <div>{c.nombre || "—"}</div>
                      {c.direccion && (
                        <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)" }}>
                          {c.direccion}
                          {c.municipio ? `, ${c.municipio}` : ""}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {c.fabricante || "—"}
                      {c.modelo && <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)" }}>{c.modelo}</div>}
                    </Td>
                    <Td>{c.protocolo_pmi || "—"}</Td>
                    <Td>{c.numero_cups_asociados ?? "—"}</Td>
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
            {data.items.length} de {data.total} concentradores
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 500, fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 14px", color: "var(--ds-text-primary, #F1EFE8)" }}>{children}</td>;
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
    <span style={{ display: "inline-block", background: s.bg, color: s.color, fontSize: 10, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {s.label}
    </span>
  );
}
