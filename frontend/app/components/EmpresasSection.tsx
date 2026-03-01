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
      setError("Debes iniciar sesión para consultar las empresas.");
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
      setError("No se pudieron cargar las empresas. Verifica la API o el token.");
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
            Listado de empresas del cliente actual.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadEmpresas}
          disabled={loading || !token}
          className="ui-btn ui-btn-primary"
        >
          {loading ? "Cargando..." : "Recargar"}
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
          <p className="text-[11px]" style={{ color: "var(--danger-text)" }}>
            {error}
          </p>
        </div>
      )}

      <div
        className="overflow-x-auto rounded-xl border bg-black/20"
        style={{ borderColor: "var(--card-border)" }}
      >
        <table className="min-w-full border-collapse text-[11px]">
          <thead className="bg-white/5 text-[10px] uppercase tracking-wide opacity-70">
            <tr>
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
                <td colSpan={5} className="px-4 py-4 text-center opacity-70">
                  No hay empresas para mostrar.
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
      </div>

      {!token && (
        <p
          className="mt-3 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Inicia sesión para consultar el listado de empresas.
        </p>
      )}
    </section>
  );
}