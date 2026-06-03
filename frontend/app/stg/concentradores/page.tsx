// app/stg/concentradores/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface ConcentradorItem {
  id: number;
  codigo_ct: string;
  nombre: string | null;
  numero_serie: string | null;
  direccion: string | null;
  municipio: string | null;
  provincia: string | null;
  codigo_postal: string | null;
  ip: string | null;
  fabricante: string | null;
  modelo: string | null;
  firmware: string | null;
  protocolo_pmi: string | null;
  // Campos administrativos añadidos en Paquete 8c
  cups: string | null;
  id_ct: string | null;
  nombre_ct: string | null;
  // Existentes
  numero_cups_asociados: number | null;
  ultimo_contacto: string | null;
  estado_comunicacion: string;
}

interface ListResponse {
  total: number;
  items: ConcentradorItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fabricanteDesdeCodigoCt(codigo: string | null): string | null {
  // Backend ya deriva fabricante del prefijo, esto es un fallback defensivo.
  if (!codigo) return null;
  const prefijo = codigo.slice(0, 3).toUpperCase();
  const conocidos: Record<string, string> = {
    CIR: "CIR", LGZ: "LGZ", SAG: "SAG", ZIV: "ZIV", ITE: "ITE",
  };
  return conocidos[prefijo] || null;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function StgConcentradoresPage() {
  const empresaId = useStgEmpresaId();
  const router = useRouter();

  // Paquete 8d — filtro global client-side (busca en todas las columnas)
  const [searchGlobal, setSearchGlobal] = useState<string>("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/stg/concentradores?empresa_id=${empresaId}&page_size=200`, {
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

  const irAContadores = (concentradorId: number) => {
    router.push(`/stg/cups?concentrador_id=${concentradorId}`);
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 12px" }}>
        Concentradores (DCU)
      </h1>

      {/* Paquete 8d — filtro global */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Buscar en cualquier columna (codigo, nombre, dirección, fabricante, estado…)"
          value={searchGlobal}
          onChange={(e) => setSearchGlobal(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 520,
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "7px 12px",
            color: "var(--ds-text-primary, #F1EFE8)",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>

      {loading && <div style={{ color: "rgba(241,239,232,0.5)" }}>Cargando…</div>}
      {error && <div style={{ color: "#E24B4A" }}>Error: {error}</div>}

      {data && (() => {
        // Paquete 8d — filtro global por todas las columnas (case-insensitive)
        const q = searchGlobal.trim().toLowerCase();
        const filteredItems = !q ? data.items : data.items.filter((c) => {
          const fabricante = c.fabricante || fabricanteDesdeCodigoCt(c.codigo_ct);
          const haystack = [
            c.codigo_ct, c.nombre, c.direccion, c.municipio, c.provincia,
            c.id_ct, c.nombre_ct, fabricante, c.modelo, c.firmware,
            c.protocolo_pmi, c.cups, c.estado_comunicacion,
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(q);
        });
        return (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            overflow: "auto",  // permitir scroll horizontal si la tabla se hace ancha
          }}
        >
          {data.items.length === 0 ? (
            <div style={{ padding: 24, color: "rgba(241,239,232,0.5)", textAlign: "center", fontSize: 13 }}>
              No hay concentradores registrados todavía.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <Th>ID concentrador</Th>
                  <Th>Nombre</Th>
                  <Th>Dirección</Th>
                  <Th>ID CT</Th>
                  <Th>Nombre CT</Th>
                  <Th>Fabricante</Th>
                  <Th>Protocolo</Th>
                  <Th>CUPS</Th>
                  <Th>Último contacto</Th>
                  <Th>Estado</Th>
                  <Th>{""}</Th>{/* columna acciones */}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((c) => {
                  const fabricante = c.fabricante || fabricanteDesdeCodigoCt(c.codigo_ct);
                  return (
                    <tr key={c.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                      <Td><span style={{ fontFamily: "monospace" }}>{c.codigo_ct}</span></Td>
                      <Td>{c.nombre || "—"}</Td>
                      <Td>
                        {c.direccion ? (
                          <span>
                            {c.direccion}
                            {c.municipio ? `, ${c.municipio}` : ""}
                          </span>
                        ) : "—"}
                      </Td>
                      <Td>{c.id_ct ? <span style={{ fontFamily: "monospace" }}>{c.id_ct}</span> : "—"}</Td>
                      <Td>{c.nombre_ct || "—"}</Td>
                      <Td>
                        {fabricante || "—"}
                        {c.modelo && (
                          <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)" }}>{c.modelo}</div>
                        )}
                      </Td>
                      <Td>{c.protocolo_pmi || "—"}</Td>
                      <Td>{c.cups ? <span style={{ fontFamily: "monospace", fontSize: 11 }}>{c.cups}</span> : "—"}</Td>
                      <Td>{c.ultimo_contacto ? new Date(c.ultimo_contacto).toLocaleString("es-ES") : "—"}</Td>
                      <Td><EstadoPill estado={c.estado_comunicacion} /></Td>
                      <Td>
                        <AccionesMenu
                          onIrAContadores={() => irAContadores(c.id)}
                        />
                      </Td>
                    </tr>
                  );
                })}
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
            {filteredItems.length} de {data.total} concentradores
            {q && <span style={{ marginLeft: 6, color: "rgba(241,239,232,0.4)" }}>(filtrados de {data.items.length})</span>}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 500, fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 14px", color: "var(--ds-text-primary, #F1EFE8)", whiteSpace: "nowrap" }}>{children}</td>;
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

// ---------------------------------------------------------------------------
// Menú "tres puntos" — Paquete 8c primera versión
// ---------------------------------------------------------------------------
function AccionesMenu({
  onIrAContadores,
}: {
  onIrAContadores: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click fuera cierra el menú
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Tecla Escape cierra el menú
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Acciones"
        style={{
          background: open ? "rgba(255,255,255,0.08)" : "transparent",
          border: "none",
          borderRadius: 4,
          padding: "4px 8px",
          color: "var(--ds-text-primary, #F1EFE8)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ⋮
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            background: "rgba(30,30,32,0.98)",
            border: "0.5px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            minWidth: 220,
            padding: 4,
            zIndex: 50,
            boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          }}
        >
          <MenuItem
            onClick={() => { setOpen(false); onIrAContadores(); }}
            label="Ir a contadores de este CT"
          />
          <MenuItem
            disabled
            tooltip="Disponible cuando integremos el adapter STG en producción."
            label="Probar conexión"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
  tooltip,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        padding: "8px 12px",
        fontSize: 12,
        color: disabled ? "rgba(241,239,232,0.35)" : "var(--ds-text-primary, #F1EFE8)",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}
