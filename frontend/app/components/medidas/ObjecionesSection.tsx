"use client";

import React from "react";
import type { User } from "../../types";

type Props = {
  token: string | null;
  currentUser: User | null;
};

export default function ObjecionesSection({ token, currentUser }: Props) {
  return (
    <section className="ui-card text-sm">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="ui-card-title text-base md:text-lg">OBJECIONES</h3>
          <p className="ui-card-subtitle mt-1">
            Espacio preparado para la gestión y seguimiento de objeciones.
          </p>
        </div>

        <div className="ui-panel p-4">
          <div className="text-sm font-medium">Pestaña creada correctamente</div>
          <p className="mt-2 text-xs ui-muted">
            Esta sección está visible para todos los usuarios autenticados dentro de Medidas.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--card-border)" }}>
              <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
                Usuario actual
              </div>
              <div className="mt-2 text-sm">{currentUser?.email ?? "—"}</div>
              <div className="mt-1 text-xs ui-muted">Rol: {currentUser?.rol ?? "—"}</div>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: "var(--card-border)" }}>
              <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
                Estado
              </div>
              <div className="mt-2 text-sm">{token ? "Sesión activa" : "Sin sesión"}</div>
              <div className="mt-1 text-xs ui-muted">
                Lista para añadir tablas, filtros y acciones de objeciones.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}