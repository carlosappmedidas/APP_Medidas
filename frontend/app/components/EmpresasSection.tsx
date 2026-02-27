// app/components/EmpresasSection.tsx
"use client";

import { useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { Empresa } from "../types";

type EmpresasProps = {
  token: string | null;
};

export default function EmpresasSection({ token }: EmpresasProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadEmpresas = async () => {
    if (!token) {
      setError("Haz login para poder cargar empresas.");
      setEmpresas([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const json = await res.json();
      setEmpresas(json);
    } catch (err: any) {
      console.error("Error cargando empresas:", err);
      setError("Error cargando empresas. Revisa la API y el token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ui-card text-sm">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="ui-card-title">Empresas</h2>
          <p className="ui-card-subtitle">
            Lista de empresas del tenant actual.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadEmpresas}
          disabled={loading || !token}
          className="ui-btn ui-btn-primary"
        >
          {loading ? "Cargando..." : "Cargar empresas"}
        </button>
      </header>

      {error && (
        <div
          className="mb-4 rounded-xl border px-4 py-3"
          style={{
            borderColor: "var(--danger-border)",
            background: "var(--danger-bg)",
          }}
        >
          <p
            className="text-[11px]"
            style={{ color: "var(--danger-text)" }}
          >
            {error}
          </p>
        </div>
      )}

      <div className="ui-panel overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead
            className="text-[10px] uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            <tr
              style={{
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Nombre</th>
              <th className="px-4 py-2 text-left">Código REE</th>
              <th className="px-4 py-2 text-left">Código CNMC</th>
              <th className="px-4 py-2 text-left">Activo</th>
            </tr>
          </thead>

          <tbody>
            {empresas.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-4 text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  No hay empresas cargadas todavía.
                </td>
              </tr>
            ) : (
              empresas.map((e) => (
                <tr
                  key={e.id}
                  className="border-t"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <td className="px-4 py-2">{e.id}</td>
                  <td className="px-4 py-2">{e.nombre}</td>
                  <td className="px-4 py-2">{e.codigo_ree ?? "-"}</td>
                  <td className="px-4 py-2">{e.codigo_cnmc ?? "-"}</td>
                  <td className="px-4 py-2">{e.activo ? "Sí" : "No"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p
          className="mt-3 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Tip: si no tienes sesión, el botón queda deshabilitado y no se
          consultará la API.
        </p>
      </div>
    </section>
  );
}