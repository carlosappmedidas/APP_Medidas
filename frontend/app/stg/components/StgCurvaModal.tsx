// app/stg/components/StgCurvaModal.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

interface CurvaFila {
  timestamp: string | null;
  ai: number | null;
  ae: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  status: number | string | null;
  season: string | null;
  bc: number | null;
}

interface CurvaResponse {
  meter_id: string;
  tipo_fichero: string;
  total: number;
  offset: number;
  limite: number;
  filas: CurvaFila[];
}

interface Props {
  empresaId: number;
  meterId: string;
  onClose: () => void;
}

const PAGE_SIZE = 200;

function fmtWh(valor: number | null): string {
  if (valor === null || valor === undefined) return "—";
  const wh = valor * 1000;
  return wh.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return dd + "/" + mm + "/" + yyyy + " " + hh + ":" + mi + ":" + ss;
  } catch {
    return iso;
  }
}

export default function StgCurvaModal({ empresaId, meterId, onClose }: Props) {
  const [data, setData] = useState<CurvaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setError("No hay token de sesión.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      empresa_id: String(empresaId),
      offset: String(offset),
      limite: String(PAGE_SIZE),
    });

    fetch(API_BASE_URL + "/stg/curva/" + encodeURIComponent(meterId) + "?" + params.toString(), {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((d: CurvaResponse) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [empresaId, meterId, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const onBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      onClick={onBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        padding: 32,
      }}
    >
      <div
        style={{
          flex: 1,
          background: "var(--ds-bg, #1A1916)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "0.5px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: "var(--ds-text-primary, #F1EFE8)" }}>
              Curva de carga
            </span>
            <span style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", fontFamily: "monospace" }}>
              {meterId}
              {data ? "  ·  " + data.tipo_fichero + "  ·  " + data.total.toLocaleString("es-ES") + " registros" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "6px 12px",
              color: "var(--ds-text-primary, #F1EFE8)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ✕ Cerrar
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
          {loading && (
            <div style={{ color: "rgba(241,239,232,0.5)", fontSize: 13 }}>Cargando curva…</div>
          )}

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
              Este contador no tiene curva (S02) registrada todavía.
            </div>
          )}

          {!loading && !error && data && data.total > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                    <th style={thStyle}>Fecha / hora</th>
                    <th style={thNumStyle}>AI (Wh)</th>
                    <th style={thNumStyle}>AE (Wh)</th>
                    <th style={thNumStyle}>R1 (Wh)</th>
                    <th style={thNumStyle}>R2 (Wh)</th>
                    <th style={thNumStyle}>R3 (Wh)</th>
                    <th style={thNumStyle}>R4 (Wh)</th>
                    <th style={thNumStyle}>BC</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Season</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((f, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ ...tdStyle, fontFamily: "monospace" }}>{fmtFecha(f.timestamp)}</td>
                      <td style={tdNumStyle}>{fmtWh(f.ai)}</td>
                      <td style={tdNumStyle}>{fmtWh(f.ae)}</td>
                      <td style={tdNumStyle}>{fmtWh(f.r1)}</td>
                      <td style={tdNumStyle}>{fmtWh(f.r2)}</td>
                      <td style={tdNumStyle}>{fmtWh(f.r3)}</td>
                      <td style={tdNumStyle}>{fmtWh(f.r4)}</td>
                      <td style={tdNumStyle}>
                        {f.bc === null || f.bc === undefined ? "—" : String(f.bc)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: "monospace", color: "rgba(241,239,232,0.6)" }}>
                          {f.status === null || f.status === undefined ? "—" : String(f.status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{f.season || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && data && data.total > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 18px",
              borderTop: "0.5px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              color: "rgba(241,239,232,0.6)",
            }}
          >
            <span>
              Mostrando{" "}
              <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>
                {(data.offset + 1).toLocaleString("es-ES")}–
                {Math.min(data.offset + PAGE_SIZE, data.total).toLocaleString("es-ES")}
              </strong>{" "}
              de{" "}
              <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>
                {data.total.toLocaleString("es-ES")}
              </strong>
            </span>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => page > 1 && setPage(page - 1)}
                disabled={page <= 1}
                style={page <= 1 ? btnDisabledStyle : btnStyle}
              >
                ← Anterior
              </button>
              <span style={{ minWidth: 90, textAlign: "center" }}>
                Página <strong style={{ color: "var(--ds-text-primary, #F1EFE8)" }}>{page}</strong> de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => page < totalPages && setPage(page + 1)}
                disabled={page >= totalPages}
                style={page >= totalPages ? btnDisabledStyle : btnStyle}
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "rgba(241,239,232,0.5)",
  fontWeight: 500,
  position: "sticky",
  top: 0,
  background: "#1F1E1A",
};

const thNumStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 12px",
  color: "var(--ds-text-primary, #F1EFE8)",
};

const tdNumStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontFamily: "monospace",
};

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
