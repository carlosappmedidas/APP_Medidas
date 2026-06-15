// app/erp/components/ErpEmpresaSelector.tsx
"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

interface Empresa {
  id: number;
  nombre: string;
  codigo_ree?: string | null;
}

/**
 * Selector de empresa del módulo ERP.
 *
 * - Lista las empresas a las que el usuario tiene acceso (filtradas por permisos).
 * - Persiste la selección en localStorage (clave "erp_empresa_id"); las páginas
 *   del ERP la leen vía useErpEmpresaId() y filtran sus datos.
 * - Si el usuario solo tiene 1 empresa, aparece deshabilitado mostrándola.
 */
export default function ErpEmpresaSelector() {
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
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        const lista: Empresa[] = Array.isArray(data) ? (data as Empresa[]) : [];
        setEmpresas(lista);
        const saved = localStorage.getItem("erp_empresa_id");
        const savedId = saved ? Number(saved) : null;
        if (savedId && lista.some((e) => e.id === savedId)) {
          setSelectedId(savedId);
        } else if (lista.length > 0) {
          setSelectedId(lista[0].id);
          localStorage.setItem("erp_empresa_id", String(lista[0].id));
          window.dispatchEvent(
            new CustomEvent("erp-empresa-changed", { detail: { id: lista[0].id } })
          );
        }
      })
      .catch(() => {
        /* si falla, no rompemos la UI */
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedId(id);
    localStorage.setItem("erp_empresa_id", String(id));
    window.dispatchEvent(new CustomEvent("erp-empresa-changed", { detail: { id } }));
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
 * Hook para que las páginas del ERP sepan qué empresa está activa.
 */
export function useErpEmpresaId(): number | null {
  const [empresaId, setEmpresaId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("erp_empresa_id");
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ id: number }>;
      setEmpresaId(ev.detail.id);
    };
    window.addEventListener("erp-empresa-changed", handler);
    return () => window.removeEventListener("erp-empresa-changed", handler);
  }, []);

  return empresaId;
}