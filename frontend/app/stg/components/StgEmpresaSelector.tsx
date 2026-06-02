// app/stg/components/StgEmpresaSelector.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

interface Empresa {
  id: number;
  nombre: string;
  codigo_ree?: string | null;
}

/**
 * Selector de empresa para el módulo STG.
 *
 * - Lista las empresas a las que el usuario tiene acceso (filtrado por permisos).
 * - Persiste la selección en localStorage (clave "stg_empresa_id") para que
 *   las páginas del STG lean de ahí y filtren sus datos.
 * - Si el usuario solo tiene 1 empresa, aparece deshabilitado mostrándola.
 */
export default function StgEmpresaSelector() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: Empresa[]) => {
        setEmpresas(data);
        // Recupera selección previa, si la hay
        const saved = localStorage.getItem("stg_empresa_id");
        const savedId = saved ? Number(saved) : null;
        if (savedId && data.some((e) => e.id === savedId)) {
          setSelectedId(savedId);
        } else if (data.length > 0) {
          setSelectedId(data[0].id);
          localStorage.setItem("stg_empresa_id", String(data[0].id));
        }
      })
      .catch(() => {
        // si falla, no rompemos la UI
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedId(id);
    localStorage.setItem("stg_empresa_id", String(id));
    // Notificar al resto de páginas del STG mediante un custom event
    window.dispatchEvent(new CustomEvent("stg-empresa-changed", { detail: { id } }));
  };

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: "rgba(241,239,232,0.5)" }}>Cargando empresas…</div>
    );
  }

  if (empresas.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "rgba(241,239,232,0.5)" }}>
        Sin acceso a empresas
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 6,
        padding: "6px 10px",
      }}
    >
      <span style={{ fontSize: 14, color: "rgba(241,239,232,0.5)" }}>🏢</span>
      <select
        value={selectedId ?? ""}
        onChange={handleChange}
        disabled={empresas.length === 1}
        style={{
          background: "transparent",
          color: "var(--ds-text-primary, #F1EFE8)",
          border: "none",
          fontSize: 13,
          outline: "none",
          cursor: empresas.length === 1 ? "default" : "pointer",
          appearance: "none",
          paddingRight: 16,
        }}
      >
        {empresas.map((e) => (
          <option key={e.id} value={e.id} style={{ background: "#16181D", color: "#F1EFE8" }}>
            {e.nombre}
            {e.codigo_ree ? ` (${e.codigo_ree})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Hook helper para que las páginas del STG sepan qué empresa está activa.
 * Devuelve el id de empresa actualmente seleccionada en el selector.
 */
export function useStgEmpresaId(): number | null {
  const [empresaId, setEmpresaId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("stg_empresa_id");
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ id: number }>;
      setEmpresaId(ev.detail.id);
    };
    window.addEventListener("stg-empresa-changed", handler);
    return () => window.removeEventListener("stg-empresa-changed", handler);
  }, []);

  return empresaId;
}
