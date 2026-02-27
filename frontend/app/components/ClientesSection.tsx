// app/components/ClientesSection.tsx
"use client";

import React from "react";
import type { User } from "../types";
import AdminUsersSection from "./AdminUsersSection";
import AdminEmpresasSection from "./AdminEmpresasSection";
import AdminTenantsSection from "./AdminTenantsSection";

type ClientesSectionProps = {
  token: string | null;
  currentUser: User | null;
};

const ClientesSection: React.FC<ClientesSectionProps> = ({
  token,
  currentUser,
}) => {
  return (
    <div className="space-y-8">
      {/* TARJETA 1: Usuarios de todos los tenants */}
      <AdminUsersSection token={token} currentUser={currentUser} />

      {/* TARJETA 2: Empresas */}
      <AdminEmpresasSection token={token} currentUser={currentUser} />

      {/* TARJETA 3: Clientes (tenants) */}
      <AdminTenantsSection token={token} currentUser={currentUser} />
    </div>
  );
};

export default ClientesSection;