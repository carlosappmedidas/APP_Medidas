// app/components/ClientesSection.tsx
"use client";

import React, { useState } from "react";
import type { User } from "../../types";
import AdminTenantsSection from "./AdminTenantsSection";
import AdminEmpresasSection from "./AdminEmpresasSection";
import AdminUsersSection from "./AdminUsersSection";

type ClientesSectionProps = {
  token: string | null;
  currentUser: User | null;
};

const ClientesSection: React.FC<ClientesSectionProps> = ({ token, currentUser }) => {
  const isSuperuser = !!currentUser?.is_superuser;
  const [open, setOpen] = useState<boolean>(true);
  const canSee = !!token && isSuperuser;

  return (
    // ← CAMBIO Paso 5: patrón propio (ui-card + flecha ▾) → ui-collapsible-card estándar
    <section className="ui-collapsible-card">
      <button
        type="button"
        className="ui-collapsible-card__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="clientes-content"
      >
        <div className="min-w-0">
          <div className="ui-collapsible-card__title">ADMINISTRACIÓN · CLIENTES</div>
          <p className="ui-collapsible-card__subtitle">
            Gestión de tenants, empresas y usuarios multi-cliente.
          </p>
        </div>
        <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>

      {open && (
        <div id="clientes-content" className="ui-collapsible-card__body">
          {!canSee ? (
            <div className="ui-alert ui-alert--danger">
              No tienes permisos para ver esta sección.
            </div>
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
