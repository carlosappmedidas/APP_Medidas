// app/components/AdminTenantsSection.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { User, Empresa } from "../types";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";

type AdminTenantsSectionProps = {
  token: string | null;
  currentUser: User | null;
};

const AdminTenantsSection: React.FC<AdminTenantsSectionProps> = ({
  token,
  currentUser,
}) => {
  const isSuperuser = !!currentUser?.is_superuser;

  // CLIENTES (tenants)
  const [clientes, setClientes] = useState<any[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);

  // creación de cliente
  const [newTenantNombre, setNewTenantNombre] = useState("");
  const [newTenantEmpresaIds, setNewTenantEmpresaIds] = useState("");

  // edición de cliente
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [editTenantNombre, setEditTenantNombre] = useState("");
  const [editTenantEmpresaIds, setEditTenantEmpresaIds] = useState("");

  // EMPRESAS para los selects de asignación
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);

  // desplegable (tarjeta abierta/cerrada)
  const [isOpen, setIsOpen] = useState(false);

  // ----------------------------------------------------
  // FUNCIONES AUXILIARES
  // ----------------------------------------------------

  // parsea "1, 2,3" => [1,2,3]
  const parseIdsFromText = (text: string): number[] => {
    return text
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "")
      .map((t) => Number(t))
      .filter((n) => !Number.isNaN(n) && n > 0);
  };

  const stringifyEmpresaIds = (empresasArr: any[]): string => {
    if (!Array.isArray(empresasArr) || empresasArr.length === 0) return "";
    const ids = empresasArr
      .map((e) => e.id)
      .filter((id) => typeof id === "number" && id > 0);
    return ids.join(", ");
  };

  // ----------------------------------------------------
  // LOAD EMPRESAS PARA SELECTS
  // ----------------------------------------------------
  const loadEmpresasForTenants = async () => {
    if (!token || !isSuperuser) return;

    setLoadingEmpresas(true);
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          "Error cargando empresas para Tenants:",
          res.status,
          text
        );
        return;
      }

      const json = (await res.json()) as Empresa[];
      setEmpresas(json);
    } catch (err) {
      console.error("Error cargando empresas para Tenants:", err);
    } finally {
      setLoadingEmpresas(false);
    }
  };

  // ----------------------------------------------------
  // CLIENTES (TENANTS)
  // ----------------------------------------------------

  const loadClientes = async () => {
    if (!token || !isSuperuser) return;

    setLoadingClientes(true);
    setErrorClientes(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error cargando clientes:", res.status, text);
        throw new Error(`Error ${res.status}`);
      }

      const json = await res.json();
      setClientes(json);
    } catch (err) {
      console.error("Error cargando clientes:", err);
      setErrorClientes(
        "No se pudieron cargar los clientes. Revisa el endpoint o los permisos."
      );
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!token || !isSuperuser) return;

    const nombre = newTenantNombre.trim();
    if (!nombre) {
      setErrorClientes("El nombre del cliente es obligatorio.");
      return;
    }

    const empresaIds = parseIdsFromText(newTenantEmpresaIds);

    setLoadingClientes(true);
    setErrorClientes(null);

    try {
      const body: any = { nombre }; // plan = "starter" por defecto en backend
      if (empresaIds.length > 0) {
        body.empresa_ids = empresaIds;
      }

      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend create tenant:", text);
        throw new Error(`Error creando cliente: ${res.status}`);
      }

      setNewTenantNombre("");
      setNewTenantEmpresaIds("");
      await loadClientes();
    } catch (err) {
      console.error("Error creando cliente:", err);
      setErrorClientes(
        "No se pudo crear el cliente. Revisa permisos y datos enviados."
      );
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleStartEditTenant = (c: any) => {
    setEditingTenantId(c.id);
    setEditTenantNombre(c.nombre ?? c.name ?? "");
    setEditTenantEmpresaIds(stringifyEmpresaIds(c.empresas || []));
  };

  const handleCancelEditTenant = () => {
    setEditingTenantId(null);
    setEditTenantNombre("");
    setEditTenantEmpresaIds("");
  };

  const handleSaveEditTenant = async () => {
    if (!token || !isSuperuser || editingTenantId === null) return;

    const nombre = editTenantNombre.trim();
    if (!nombre) {
      setErrorClientes("El nombre del cliente no puede estar vacío.");
      return;
    }

    const empresaIds = parseIdsFromText(editTenantEmpresaIds);

    setLoadingClientes(true);
    setErrorClientes(null);

    try {
      const body: any = { nombre };
      body.empresa_ids = empresaIds;

      const res = await fetch(
        `${API_BASE_URL}/auth/admin/tenants/${editingTenantId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(token),
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend update tenant:", text);
        throw new Error(`Error actualizando cliente: ${res.status}`);
      }

      setEditingTenantId(null);
      setEditTenantNombre("");
      setEditTenantEmpresaIds("");
      await loadClientes();
    } catch (err) {
      console.error("Error actualizando cliente:", err);
      setErrorClientes(
        "No se pudo actualizar el cliente. Revisa permisos y datos enviados."
      );
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleDeleteTenant = async (tenantId: number) => {
    if (!token || !isSuperuser) return;

    const ok = window.confirm(
      "⚠️ Esta acción borrará el cliente de forma permanente. ¿Continuar?"
    );
    if (!ok) return;

    setLoadingClientes(true);
    setErrorClientes(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/admin/tenants/${tenantId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(token),
        }
      );

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("Respuesta backend delete tenant:", text);
        throw new Error(`Error ${res.status}`);
      }

      if (editingTenantId === tenantId) {
        setEditingTenantId(null);
        setEditTenantNombre("");
        setEditTenantEmpresaIds("");
      }

      await loadClientes();
    } catch (err) {
      console.error("Error eliminando cliente:", err);
      setErrorClientes("No se pudo eliminar el cliente.");
    } finally {
      setLoadingClientes(false);
    }
  };

  // ----------------------------------------------------
  // EFFECTS
  // ----------------------------------------------------

  // limpiar cuando perdemos token o superuser
  useEffect(() => {
    if (!token || !isSuperuser) {
      setClientes([]);
      setErrorClientes(null);
      setLoadingClientes(false);
      setNewTenantNombre("");
      setNewTenantEmpresaIds("");
      setEditingTenantId(null);
      setEditTenantNombre("");
      setEditTenantEmpresaIds("");

      setEmpresas([]);
      setLoadingEmpresas(false);
    }
  }, [token, isSuperuser]);

  // cargar clientes y empresas automáticamente cuando haya token + superuser
  useEffect(() => {
    if (token && isSuperuser) {
      loadClientes();
      loadEmpresasForTenants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperuser]);

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------

  const canUse = !!token && isSuperuser;

  return (
    <section className="ui-card text-sm">
      {/* HEADER DESPLEGABLE */}
      <header
        className="mb-3 flex cursor-pointer flex-col gap-2 md:flex-row md:items-center md:justify-between"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div>
          <h4 className="ui-card-title">Clientes general</h4>
          <p className="ui-card-subtitle">
            Gestión global de clientes (tenants). Requiere superusuario.
          </p>
        </div>

        <span className="text-[11px] opacity-70">
          {isOpen ? "Ocultar ▲" : "Mostrar ▼"}
        </span>
      </header>

      {errorClientes && (
        <p
          className="mb-3 text-[11px]"
          style={{ color: "var(--danger-text)" }}
        >
          {errorClientes}
        </p>
      )}

      {isOpen && (
        <>
          {!canUse && (
            <p className="mb-4 text-xs opacity-85">
              Necesitas iniciar sesión como superusuario para gestionar clientes.
            </p>
          )}

          {/* Formulario creación cliente */}
          <div className="ui-panel mb-4 text-[11px]">
            <h5 className="mb-2 text-xs font-semibold">Crear cliente</h5>

            <div className="grid gap-3 md:grid-cols-[2fr,2fr,auto]">
              <div>
                <label className="ui-label">Nombre del cliente</label>
                <input
                  type="text"
                  value={newTenantNombre}
                  onChange={(e) => setNewTenantNombre(e.target.value)}
                  disabled={!canUse}
                  className="ui-input"
                  placeholder="Nombre del cliente"
                />
                <p className="ui-help">
                  El plan se creará como{" "}
                  <span className="font-mono">starter</span> por defecto.
                </p>
              </div>

              {/* Empresas del cliente: select múltiple */}
              <div>
                <label className="ui-label">Empresas del cliente</label>
                <select
                  multiple
                  value={parseIdsFromText(newTenantEmpresaIds).map(String)}
                  onChange={(e) => {
                    const selected = Array.from(
                      e.target.selectedOptions
                    ).map((opt) => opt.value);
                    setNewTenantEmpresaIds(selected.join(", "));
                  }}
                  disabled={!canUse || loadingEmpresas}
                  className="ui-select h-24"
                >
                  {empresas.length === 0 ? (
                    <option value="" disabled>
                      {loadingEmpresas
                        ? "Cargando empresas..."
                        : "No hay empresas cargadas"}
                    </option>
                  ) : (
                    empresas
                      .filter((emp) => emp.activo) // solo activas para asignar
                      .map((emp) => (
                        <option key={emp.id} value={String(emp.id)}>
                          {emp.nombre} (ID {emp.id})
                        </option>
                      ))
                  )}
                </select>

                <p className="ui-help">
                  Selecciona una o varias empresas. IDs:{" "}
                  <span className="font-mono">{newTenantEmpresaIds || "—"}</span>
                </p>
              </div>

              <div className="flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCreateTenant}
                  disabled={loadingClientes || !canUse}
                  className="ui-btn ui-btn-primary"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={loadClientes}
                  disabled={loadingClientes || !canUse}
                  className="ui-btn ui-btn-secondary"
                >
                  Recargar
                </button>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div
            className="overflow-x-auto rounded-xl border bg-black/20"
            style={{ borderColor: "var(--card-border)" }}
          >
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wide opacity-70">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Nombre</th>
                  <th className="px-4 py-2 text-left">Código</th>
                  <th className="px-4 py-2 text-left">Empresas</th>
                  <th className="px-4 py-2 text-left">Creado</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center opacity-70">
                      No hay clientes o aún no has cargado el listado.
                    </td>
                  </tr>
                ) : (
                  clientes.map((c: any, idx: number) => {
                    const isEditing = editingTenantId === c.id;

                    const empresasTexto =
                      Array.isArray(c.empresas) && c.empresas.length > 0
                        ? c.empresas
                            .map(
                              (e: any) =>
                                e.nombre ??
                                e.name ??
                                (e.codigo ? e.codigo : e.id?.toString() ?? "-")
                            )
                            .join(", ")
                        : "—";

                    return (
                      <tr
                        key={c.id ?? idx}
                        className="border-t"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <td className="px-4 py-2">{c.id ?? "-"}</td>

                        <td className="px-4 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editTenantNombre}
                              onChange={(e) => setEditTenantNombre(e.target.value)}
                              disabled={!canUse}
                              className="ui-input"
                            />
                          ) : (
                            c.nombre ?? c.name ?? "-"
                          )}
                        </td>

                        <td className="px-4 py-2">{c.codigo ?? c.code ?? "-"}</td>

                        <td className="px-4 py-2">
                          {isEditing ? (
                            <div className="space-y-1">
                              <select
                                multiple
                                value={parseIdsFromText(editTenantEmpresaIds).map(
                                  String
                                )}
                                onChange={(e) => {
                                  const selected = Array.from(
                                    e.target.selectedOptions
                                  ).map((opt) => opt.value);
                                  setEditTenantEmpresaIds(selected.join(", "));
                                }}
                                disabled={!canUse || loadingEmpresas}
                                className="ui-select h-20"
                              >
                                {empresas.length === 0 ? (
                                  <option value="" disabled>
                                    {loadingEmpresas
                                      ? "Cargando empresas..."
                                      : "No hay empresas cargadas"}
                                  </option>
                                ) : (
                                  empresas
                                    .filter((emp) => emp.activo)
                                    .map((emp) => (
                                      <option key={emp.id} value={String(emp.id)}>
                                        {emp.nombre} (ID {emp.id})
                                      </option>
                                    ))
                                )}
                              </select>

                              <p className="text-[9px] opacity-70">
                                Actual: {empresasTexto}
                              </p>
                            </div>
                          ) : (
                            empresasTexto
                          )}
                        </td>

                        <td className="px-4 py-2">
                          {c.created_at
                            ? new Date(c.created_at).toLocaleDateString("es-ES")
                            : "-"}
                        </td>

                        <td className="px-4 py-2 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleSaveEditTenant}
                                disabled={loadingClientes || !canUse}
                                className="ui-btn ui-btn-primary ui-btn-xs"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditTenant}
                                disabled={loadingClientes}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditTenant(c)}
                                disabled={loadingClientes || !canUse}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTenant(c.id)}
                                disabled={loadingClientes || !canUse}
                                className="ui-btn ui-btn-danger ui-btn-xs"
                              >
                                Borrar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

export default AdminTenantsSection;