// app/components/ClientesSection.tsx
"use client";

import React, { useState } from "react";
import type { User } from "../types";
import AdminTenantsSection from "./AdminTenantsSection";
import AdminEmpresasSection from "./AdminEmpresasSection";
import AdminUsersSection from "./AdminUsersSection";

type ClientesSectionProps = {
  token: string | null;
  currentUser: User | null;
};

const ClientesSection: React.FC<ClientesSectionProps> = ({ token, currentUser }) => {
  const isSuperuser = !!currentUser?.is_superuser;

  // ✅ UI-only: desplegable para unificar flecha/estética con el resto
  const [open, setOpen] = useState<boolean>(true);

  const canSee = !!token && isSuperuser;

  return (
    <section className="ui-card text-sm">
      {/* HEADER (misma flecha ▾ + rotación) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-4 flex w-full items-center justify-between gap-6 rounded-2xl px-1 py-1 text-left"
        aria-expanded={open}
        aria-controls="clientes-content"
      >
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Administración · Clientes</h3>
          <p className="mt-1 text-xs ui-muted">
            Gestión de tenants, empresas y usuarios multi-cliente.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] ui-muted">{open ? "Ocultar" : "Mostrar"}</span>
          <span
            className={[
              "inline-flex items-center justify-center text-[13px] ui-muted transition-transform",
              open ? "rotate-180" : "rotate-0",
            ].join(" ")}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
      </button>

      {/* CONTENIDO */}
      {open && (
        <div id="clientes-content">
          {!canSee ? (
            <div className="ui-alert ui-alert--danger">No tienes permisos para ver esta sección.</div>
          ) : (
            <div className="space-y-8">
              {/* Clientes (tenants) */}
              <AdminTenantsSection token={token} currentUser={currentUser} />

              {/* Empresas */}
              <AdminEmpresasSection token={token} currentUser={currentUser} />

              {/* Usuarios (multi-cliente) */}
              <AdminUsersSection token={token} currentUser={currentUser} />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ClientesSection;