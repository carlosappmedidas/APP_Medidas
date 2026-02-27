// app/components/AdminUsersSection.tsx
"use client";

import React, { useState, useEffect } from "react";
import type { User } from "../types";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";

type AdminUsersSectionProps = {
  token: string | null;
  currentUser: User | null;
};

const AdminUsersSection: React.FC<AdminUsersSectionProps> = ({
  token,
  currentUser,
}) => {
  const isSuperuser = !!currentUser?.is_superuser;

  // USUARIOS GLOBALES (solo superusuario)
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [errorAdmin, setErrorAdmin] = useState<string | null>(null);

  // ✅ TENANTS (para el desplegable de Tenant ID)
  const [clientes, setClientes] = useState<any[]>([]);

  // estado de edición para usuarios globales
  const [editingAdminUserId, setEditingAdminUserId] = useState<number | null>(
    null
  );
  const [editAdminRol, setEditAdminRol] = useState("user");
  const [editAdminActive, setEditAdminActive] = useState(true);
  const [editAdminPassword, setEditAdminPassword] = useState("");

  // estado de creación de usuario global
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRol, setNewAdminRol] = useState("user");
  const [newAdminActive, setNewAdminActive] = useState(true);
  const [newAdminIsSuperuser, setNewAdminIsSuperuser] = useState(false);
  const [newAdminTenantId, setNewAdminTenantId] = useState<string>("");

  // desplegable (tarjeta abierta/cerrada)
  const [isOpen, setIsOpen] = useState(false);

  const canUse = !!token && isSuperuser;

  // ----------------------------------------------------
  // USUARIOS GLOBALES
  // ----------------------------------------------------

  const loadAdminUsers = async () => {
    if (!token || !isSuperuser) return;

    setLoadingAdmin(true);
    setErrorAdmin(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/users`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const json = (await res.json()) as User[];
      setAdminUsers(json);
    } catch (err) {
      console.error("Error cargando usuarios admin:", err);
      setErrorAdmin(
        "No se pudieron cargar los usuarios globales (solo superusuario)."
      );
    } finally {
      setLoadingAdmin(false);
    }
  };

  // ✅ cargar tenants para el select (mismo endpoint/patrón que Empresas general)
  const loadTenantsForUsers = async () => {
    if (!token || !isSuperuser) return;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error cargando clientes para Usuarios:", res.status, text);
        return;
      }

      const json = await res.json();
      setClientes(json);
    } catch (err) {
      console.error("Error cargando clientes para Usuarios:", err);
    }
  };

  const handleCreateAdminUser = async () => {
    if (!token || !isSuperuser) return;
    if (!newAdminEmail || !newAdminPassword) {
      setErrorAdmin("Email y contraseña son obligatorios.");
      return;
    }

    setLoadingAdmin(true);
    setErrorAdmin(null);
    try {
      const body: any = {
        email: newAdminEmail,
        password: newAdminPassword,
        rol: newAdminRol,
        is_active: newAdminActive,
        is_superuser: newAdminIsSuperuser,
      };

      const tenantIdNum = Number(newAdminTenantId);
      if (!Number.isNaN(tenantIdNum) && tenantIdNum > 0) {
        body.tenant_id = tenantIdNum;
      }

      const res = await fetch(`${API_BASE_URL}/auth/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend create global user:", text);
        throw new Error(`Error creando usuario global: ${res.status}`);
      }

      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminRol("user");
      setNewAdminActive(true);
      setNewAdminIsSuperuser(false);
      setNewAdminTenantId("");

      await loadAdminUsers();
    } catch (err) {
      console.error("Error creando usuario global:", err);
      setErrorAdmin(
        "No se pudo crear el usuario global. Revisa que el email no exista y que el token tenga permisos."
      );
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleStartEditAdminUser = (u: User) => {
    setEditingAdminUserId(u.id);
    setEditAdminRol(u.rol || "user");
    setEditAdminActive(u.is_active);
    setEditAdminPassword("");
  };

  const handleCancelEditAdminUser = () => {
    setEditingAdminUserId(null);
    setEditAdminPassword("");
  };

  const handleSaveEditAdminUser = async () => {
    if (!token || !isSuperuser || editingAdminUserId === null) return;

    try {
      const body: any = {
        rol: editAdminRol,
        is_active: editAdminActive,
      };

      if (editAdminPassword.trim() !== "") {
        body.password = editAdminPassword;
      }

      const res = await fetch(
        `${API_BASE_URL}/auth/users/${editingAdminUserId}`,
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
        console.error("Respuesta backend PATCH global:", text);
        throw new Error(`Error actualizando usuario global: ${res.status}`);
      }

      setEditingAdminUserId(null);
      setEditAdminPassword("");
      await loadAdminUsers();
    } catch (err) {
      console.error("Error actualizando usuario global:", err);
      setErrorAdmin(
        "No se pudo actualizar el usuario global. Revisa permisos y datos enviados."
      );
    }
  };

  const handleDeleteAdminUser = async (userId: number) => {
    if (!token || !isSuperuser) return;

    const ok = window.confirm(
      "⚠️ Esta acción borrará el usuario de forma permanente (global). ¿Continuar?"
    );
    if (!ok) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/users/${userId}/hard-delete`,
        {
          method: "DELETE",
          headers: getAuthHeaders(token),
        }
      );

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("Respuesta backend hard-delete global:", text);
        throw new Error(`Error ${res.status}`);
      }

      if (editingAdminUserId === userId) {
        setEditingAdminUserId(null);
        setEditAdminPassword("");
      }

      await loadAdminUsers();
    } catch (err) {
      console.error("Error eliminando usuario global:", err);
      setErrorAdmin("No se pudo eliminar el usuario global.");
    }
  };

  // limpiar cuando perdemos token o superuser
  useEffect(() => {
    if (!token || !isSuperuser) {
      setAdminUsers([]);
      setErrorAdmin(null);
      setLoadingAdmin(false);
      setEditingAdminUserId(null);
      setEditAdminPassword("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminRol("user");
      setNewAdminActive(true);
      setNewAdminIsSuperuser(false);
      setNewAdminTenantId("");
      setClientes([]); // ✅
    }
  }, [token, isSuperuser]);

  // ✅ cargar tenants al tener token + superuser (igual que Empresas general)
  useEffect(() => {
    if (token && isSuperuser) {
      loadTenantsForUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperuser]);

  return (
    <section className="ui-card text-sm">
      {/* HEADER DESPLEGABLE */}
      <header
        className="mb-3 flex cursor-pointer flex-col gap-2 md:flex-row md:items-center md:justify-between"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div>
          <h4 className="ui-card-title">Usuarios general</h4>
          <p className="ui-card-subtitle"></p>
        </div>

        <span className="text-[11px] opacity-70">
          {isOpen ? "Ocultar ▲" : "Mostrar ▼"}
        </span>
      </header>

      {errorAdmin && (
        <p className="mb-3 text-[11px]" style={{ color: "var(--danger-text)" }}>
          {errorAdmin}
        </p>
      )}

      {/* CONTENIDO DESPLEGABLE */}
      {isOpen && (
        <>
          {(!token || !isSuperuser) && (
            <p className="mb-4 text-xs opacity-85">
              Necesitas iniciar sesión como superusuario para gestionar usuarios
              globales.
            </p>
          )}

          {/* Formulario creación usuario global */}
          <div className="ui-panel mb-4 text-[11px]">
            <h5 className="mb-2 text-xs font-semibold">Crear usuario global</h5>

            <div className="grid gap-3 md:grid-cols-[2fr,2fr,1fr,1fr,auto]">
              <div>
                <label className="ui-label">Email</label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="ui-input"
                  placeholder="usuario@cliente.com"
                  disabled={!canUse}
                />
              </div>

              <div>
                <label className="ui-label">Contraseña</label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="ui-input"
                  placeholder="••••••••"
                  disabled={!canUse}
                />
              </div>

              <div>
                <label className="ui-label">Rol</label>
                <select
                  value={newAdminRol}
                  onChange={(e) => setNewAdminRol(e.target.value)}
                  className="ui-select"
                  disabled={!canUse}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
              </div>

              <div>
                <label className="ui-label">Tenant ID</label>
                <select
                  value={newAdminTenantId}
                  onChange={(e) => setNewAdminTenantId(e.target.value)}
                  className="ui-select"
                  disabled={!canUse}
                >
                  <option value="">(opcional)</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.nombre ?? c.name ?? `Cliente ${c.id}`} (ID {c.id})
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex flex-col gap-1 text-[10px] opacity-90">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newAdminActive}
                      onChange={(e) => setNewAdminActive(e.target.checked)}
                      className="ui-checkbox"
                      disabled={!canUse}
                    />
                    <span>Activo</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newAdminIsSuperuser}
                      onChange={(e) => setNewAdminIsSuperuser(e.target.checked)}
                      className="ui-checkbox"
                      disabled={!canUse}
                    />
                    <span>Superuser</span>
                  </label>
                </div>
              </div>

              <div className="flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCreateAdminUser}
                  disabled={loadingAdmin || !token || !isSuperuser}
                  className="ui-btn ui-btn-primary"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={loadAdminUsers}
                  disabled={loadingAdmin || !token || !isSuperuser}
                  className="ui-btn ui-btn-secondary"
                >
                  Recargar
                </button>
              </div>
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-xl border bg-black/20"
            style={{ borderColor: "var(--card-border)" }}
          >
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wide opacity-70">
                <tr>
                  <th className="px-4 py-2 text-left">Tenant ID</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Rol</th>
                  <th className="px-4 py-2 text-left">Activo</th>
                  <th className="px-4 py-2 text-left">Superuser</th>
                  <th className="px-4 py-2 text-left">Creado</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {adminUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center opacity-70">
                      No hay usuarios o aún no has cargado la vista global.
                    </td>
                  </tr>
                ) : (
                  adminUsers.map((u) => {
                    const isEditing = editingAdminUserId === u.id;
                    return (
                      <tr
                        key={u.id}
                        className="border-t"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <td className="px-4 py-2">{u.tenant_id}</td>
                        <td className="px-4 py-2">{u.email}</td>

                        <td className="px-4 py-2">
                          {isEditing ? (
                            <select
                              value={editAdminRol}
                              onChange={(e) => setEditAdminRol(e.target.value)}
                              className="ui-select px-2 py-1 text-[11px]"
                              disabled={!canUse}
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                              <option value="owner">owner</option>
                            </select>
                          ) : (
                            u.rol
                          )}
                        </td>

                        <td className="px-4 py-2">
                          {isEditing ? (
                            <label className="inline-flex items-center gap-2 text-[11px]">
                              <input
                                type="checkbox"
                                checked={editAdminActive}
                                onChange={(e) =>
                                  setEditAdminActive(e.target.checked)
                                }
                                className="ui-checkbox"
                                disabled={!canUse}
                              />
                              <span>{editAdminActive ? "Sí" : "No"}</span>
                            </label>
                          ) : u.is_active ? (
                            "Sí"
                          ) : (
                            "No"
                          )}
                        </td>

                        <td className="px-4 py-2">
                          {u.is_superuser ? "Sí" : "No"}
                        </td>

                        <td className="px-4 py-2">
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString("es-ES")
                            : "-"}
                        </td>

                        <td className="px-4 py-2 text-right">
                          {isEditing ? (
                            <div className="flex flex-col items-end gap-1">
                              <input
                                type="password"
                                placeholder="Nueva contraseña (opcional)"
                                value={editAdminPassword}
                                onChange={(e) =>
                                  setEditAdminPassword(e.target.value)
                                }
                                className="ui-input w-48 px-2 py-1 text-[10px]"
                                disabled={!canUse}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveEditAdminUser}
                                  disabled={!canUse}
                                  className="ui-btn ui-btn-primary ui-btn-xs"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditAdminUser}
                                  className="ui-btn ui-btn-outline ui-btn-xs"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditAdminUser(u)}
                                disabled={!canUse}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAdminUser(u.id)}
                                disabled={!canUse}
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

export default AdminUsersSection;