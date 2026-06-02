// app/stg/solicitudes/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

interface SolicitudItem {
  id: number;
  cups_codigo: string | null;
  concentrador_codigo_ct: string | null;
  tipo_fichero: string;
  fecha_desde: string;
  fecha_hasta: string;
  prioridad: string;
  estado: string;
  fecha_envio: string | null;
  fecha_recepcion: string | null;
  created_at: string;
}

interface ListResponse {
  total: number;
  items: SolicitudItem[];
}

export default function StgSolicitudesPage() {
  const empresaId = useStgEmpresaId();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ empresa_id: String(empresaId), page_size: "100" });
    if (estado) params.append("estado", estado);
    fetch(`${API_BASE_URL}/stg/solicitudes?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [empresaId, estado]);

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Solicitudes</h1>
        <Link
          href="/stg/solicitudes/nueva"
          style={{
            background: "rgba(83,74,183,0.22)",
            color: "#AFA9EC",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          + Nueva solicitud
        </Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["", "pendiente", "enviada", "en_proceso", "recibida", "error"].map((e) => (
          <button
            key={e}
            onClick={() => setEstado(e)}
            style={{
              background: estado === e ? "rgba(83,74,183,0.22)" : "rgba(255,255,255,0.04)",
              color: estado === e ? "#AFA9EC" : "rgba(241,239,232,0.7)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {e === "" ? "Todas" : e}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "rgba(241,239,232,0.5)" }}>Cargando…</div>}
      {error && <div style={{ color: "#E24B4A" }}>Error: {error}</div>}

      {data && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}>
          {data.items.length === 0 ? (
            <div style={{ padding: 24, color: "rgba(241,239,232,0.5)", textAlign: "center", fontSize: 13 }}>
              No hay solicitudes todavía. <Link href="/stg/solicitudes/nueva" style={{ color: "#AFA9EC" }}>Crea la primera</Link>.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <Th>Tipo</Th>
                  <Th>Ámbito</Th>
                  <Th>Periodo</Th>
                  <Th>Prioridad</Th>
                  <Th>Estado</Th>
                  <Th>Creada</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <Td><span style={{ fontFamily: "monospace", fontWeight: 500 }}>{s.tipo_fichero}</span></Td>
                    <Td>
                      {s.cups_codigo ? (
                        <span style={{ fontFamily: "monospace", fontSize: 11 }}>{s.cups_codigo}</span>
                      ) : s.concentrador_codigo_ct ? (
                        <span>CT {s.concentrador_codigo_ct}</span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {new Date(s.fecha_desde).toLocaleDateString("es-ES")} → {new Date(s.fecha_hasta).toLocaleDateString("es-ES")}
                    </Td>
                    <Td>{s.prioridad}</Td>
                    <Td><EstadoPill estado={s.estado} /></Td>
                    <Td>{new Date(s.created_at).toLocaleString("es-ES")}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 500, fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 14px", color: "var(--ds-text-primary, #F1EFE8)" }}>{children}</td>;
}

function EstadoPill({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pendiente:  { bg: "rgba(239,159,39,0.2)",   color: "#EF9F27" },
    enviada:    { bg: "rgba(55,138,221,0.2)",   color: "#378ADD" },
    en_proceso: { bg: "rgba(55,138,221,0.2)",   color: "#378ADD" },
    recibida:   { bg: "rgba(29,158,117,0.2)",   color: "#1D9E75" },
    error:      { bg: "rgba(226,75,74,0.2)",    color: "#E24B4A" },
  };
  const s = map[estado] || { bg: "rgba(255,255,255,0.08)", color: "rgba(241,239,232,0.6)" };
  return (
    <span style={{ display: "inline-block", background: s.bg, color: s.color, fontSize: 10, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {estado}
    </span>
  );
}
