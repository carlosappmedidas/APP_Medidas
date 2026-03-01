"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { User } from "../types";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import AccordionCard from "./ui/AccordionCard";

type AdminUsersSectionProps = {
  token: string | null;
  currentUser: User | null;
};

type TenantLite = {
  id?: number;
  nombre?: string | null;
  name?: string | null;
};

const AdminUsersSection: React.FC<AdminUsersSectionProps> = ({
  token,
  currentUser,
}) => {
  const isSuperuser = !!currentUser?.is_superuser;
  const canUse = !!token && isSuperuser;

  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [errorAdmin, setErrorAdmin] = useState<string | null>(null);

  const [clientes, setClientes] = useState<TenantLite[]>([]);

  const [editingAdminUserId, setEditingAdminUserId] = useState<number | null>(null);
  const [editAdminRol, setEditAdminRol] = useState<"user" | "admin" | "owner">("user");
  const [editAdminActive, setEditAdminActive] = useState(true);
  const [editAdminPassword, setEditAdminPassword] = useState("");

  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRol, setNewAdminRol] = useState<"user" | "admin" | "owner">("user");
  const [newAdminActive, setNewAdminActive] = useState(true);
  const [newAdminIsSuperuser, setNewAdminIsSuperuser] = useState(false);
  const [newAdminTenantId, setNewAdminTenantId] = useState<string>("");

  // ---------------- LOAD ----------------

  const loadAdminUsers = async () => {
    if (!token || !isSuperuser) return;

    setLoadingAdmin(true);
    setErrorAdmin(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/users`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error cargando usuarios:", res.status, text);
        throw new Error(`Error ${res.status}`);
      }

      const json = (await res.json()) as User[];
      setAdminUsers(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
      setErrorAdmin("No se pudieron cargar los usuarios globales.");
      setAdminUsers([]);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const loadTenantsForUsers = async () => {
    if (!token || !isSuperuser) return;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) return;

      const json = (await res.json()) as TenantLite[];
      setClientes(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Error cargando clientes:", err);
    }
  };

  // ---------------- CREATE ----------------

  const handleCreateAdminUser = async () => {
    if (!token || !isSuperuser) return;

    const email = newAdminEmail.trim();
    const password = newAdminPassword;

    if (!email || !password) {
      setErrorAdmin("Email y contraseña son obligatorios.");
      return;
    }

    setLoadingAdmin(true);
    setErrorAdmin(null);

    try {
      const body: any = {
        email,
        password,
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
        console.error("Error creando usuario:", res.status, text);
        throw new Error(`Error ${res.status}`);
      }

      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminRol("user");
      setNewAdminActive(true);
      setNewAdminIsSuperuser(false);
      setNewAdminTenantId("");

      await loadAdminUsers();
    } catch (err) {
      console.error("Error creando usuario:", err);
      setErrorAdmin("No se pudo crear el usuario.");
    } finally {
      setLoadingAdmin(false);
    }
  };

  // ---------------- EDIT ----------------

  const handleStartEditAdminUser = (u: User) => {
    setEditingAdminUserId(u.id);
    setEditAdminRol((u.rol as any) || "user");
    setEditAdminActive(!!u.is_active);
    setEditAdminPassword("");
    setErrorAdmin(null);
  };

  const handleCancelEditAdminUser = () => {
    setEditingAdminUserId(null);
    setEditAdminPassword("");
  };

  const handleSaveEditAdminUser = async () => {
    if (!token || !isSuperuser || editingAdminUserId === null) return;

    setLoadingAdmin(true);
    setErrorAdmin(null);

    try {
      const body: any = {
        rol: editAdminRol,
        is_active: editAdminActive,
      };

      if (editAdminPassword.trim() !== "") {
        body.password = editAdminPassword;
      }

      const res = await fetch(`${API_BASE_URL}/auth/users/${editingAdminUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error actualizando usuario:", res.status, text);
        throw new Error(`Error ${res.status}`);
      }

      setEditingAdminUserId(null);
      setEditAdminPassword("");
      await loadAdminUsers();
    } catch (err) {
      console.error("Error actualizando usuario:", err);
      setErrorAdmin("No se pudo actualizar el usuario.");
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleDeleteAdminUser = async (userId: number) => {
    if (!token || !isSuperuser) return;

    const ok = window.confirm(
      "⚠️ Esta acción eliminará el usuario de forma permanente. ¿Continuar?"
    );
    if (!ok) return;

    setLoadingAdmin(true);
    setErrorAdmin(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}/hard-delete`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("Error eliminando usuario:", res.status, text);
        throw new Error(`Error ${res.status}`);
      }

      if (editingAdminUserId === userId) handleCancelEditAdminUser();
      await loadAdminUsers();
    } catch (err) {
      console.error("Error eliminando usuario:", err);
      setErrorAdmin("No se pudo eliminar el usuario.");
    } finally {
      setLoadingAdmin(false);
    }
  };

  // ---------------- EFFECTS ----------------

  useEffect(() => {
    if (!token || !isSuperuser) {
      setAdminUsers([]);
      setClientes([]);
      setLoadingAdmin(false);
      setErrorAdmin(null);

      setEditingAdminUserId(null);
      setEditAdminPassword("");

      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminRol("user");
      setNewAdminActive(true);
      setNewAdminIsSuperuser(false);
      setNewAdminTenantId("");
    }
  }, [token, isSuperuser]);

  useEffect(() => {
    if (token && isSuperuser) {
      loadTenantsForUsers();
      loadAdminUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperuser]);

  // ---------------- UI helpers ----------------

  const tenantLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of clientes) {
      if (typeof c?.id !== "number") continue;
      const name = (c.nombre ?? c.name ?? `Cliente ${c.id}`).toString();
      map.set(c.id, `${name} (ID ${c.id})`);
    }
    return (tenantId?: number | null) => {
      if (typeof tenantId !== "number") return "—";
      return map.get(tenantId) ?? `Cliente (ID ${tenantId})`;
    };
  }, [clientes]);

  // ---------------- RENDER ----------------

  return (
    <AccordionCard
      title="Usuarios"
      subtitle="Gestión global de usuarios. Requiere superusuario."
      defaultOpen={false}
    >
      {errorAdmin && <div className="ui-alert ui-alert--danger mb-4">{errorAdmin}</div>}

      {!canUse && (
        <p className="mb-4 text-xs ui-muted">
          Necesitas iniciar sesión como superusuario para gestionar usuarios.
        </p>
      )}

      {/* Crear */}
      <div className="ui-panel mb-4 text-[11px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h5 className="text-xs font-semibold">Crear usuario</h5>
          <span className="text-[10px] ui-muted">{loadingAdmin ? "Cargando…" : ""}</span>
        </div>

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

            <label className="mt-2 inline-flex items-center gap-2 text-[10px] ui-muted">
              <input
                type="checkbox"
                checked={newAdminActive}
                onChange={(e) => setNewAdminActive(e.target.checked)}
                disabled={!canUse}
                className="ui-checkbox"
              />
              <span>Activo</span>
            </label>

            <label className="mt-2 inline-flex items-center gap-2 text-[10px] ui-muted">
              <input
                type="checkbox"
                checked={newAdminIsSuperuser}
                onChange={(e) => setNewAdminIsSuperuser(e.target.checked)}
                disabled={!canUse}
                className="ui-checkbox"
              />
              <span>Superusuario</span>
            </label>
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
            <p className="ui-help">Se guarda tal cual en backend (según tu endpoint).</p>
          </div>

          <div>
            <label className="ui-label">Rol</label>
            <select
              value={newAdminRol}
              onChange={(e) => setNewAdminRol(e.target.value as any)}
              className="ui-select"
              disabled={!canUse}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </div>

          <div>
            <label className="ui-label">Cliente</label>
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

            <p className="ui-help">Si lo dejas vacío, se crea sin tenant asignado.</p>
          </div>

          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={handleCreateAdminUser}
              disabled={loadingAdmin || !canUse}
              className="ui-btn ui-btn-primary"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={loadAdminUsers}
              disabled={loadingAdmin || !canUse}
              className="ui-btn ui-btn-secondary"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              <th className="ui-th">Cliente</th>
              <th className="ui-th">Email</th>
              <th className="ui-th">Rol</th>
              <th className="ui-th">Activo</th>
              <th className="ui-th">Superusuario</th>
              <th className="ui-th">Creado</th>
              <th className="ui-th ui-th-right">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {adminUsers.length === 0 ? (
              <tr className="ui-tr">
                <td colSpan={7} className="ui-td text-center ui-muted">
                  {loadingAdmin ? "Cargando usuarios..." : "No hay usuarios para mostrar."}
                </td>
              </tr>
            ) : (
              adminUsers.map((u) => {
                const isEditing = editingAdminUserId === u.id;

                return (
                  <tr key={u.id} className="ui-tr align-top">
                    <td className="ui-td">{tenantLabelById((u as any).tenant_id ?? u.tenant_id)}</td>

                    <td className="ui-td">{u.email}</td>

                    <td className="ui-td">
                      {isEditing ? (
                        <select
                          value={editAdminRol}
                          onChange={(e) => setEditAdminRol(e.target.value as any)}
                          className="ui-select"
                          disabled={!canUse}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </select>
                      ) : (
                        u.rol ?? "-"
                      )}
                    </td>

                    <td className="ui-td">
                      {isEditing ? (
                        <label className="inline-flex items-center gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            checked={editAdminActive}
                            onChange={(e) => setEditAdminActive(e.target.checked)}
                            disabled={!canUse}
                            className="ui-checkbox"
                          />
                          <span>{editAdminActive ? "Sí" : "No"}</span>
                        </label>
                      ) : u.is_active ? (
                        "Sí"
                      ) : (
                        "No"
                      )}
                    </td>

                    <td className="ui-td">{u.is_superuser ? "Sí" : "No"}</td>

                    <td className="ui-td">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("es-ES") : "-"}
                    </td>

                    <td className="ui-td ui-td-right">
                      {isEditing ? (
                        <div className="flex flex-col items-end gap-2">
                          <div className="w-[220px]">
                            <label className="ui-label">Nueva contraseña (opcional)</label>
                            <input
                              type="password"
                              value={editAdminPassword}
                              onChange={(e) => setEditAdminPassword(e.target.value)}
                              className="ui-input"
                              placeholder="••••••••"
                              disabled={!canUse}
                            />
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={handleSaveEditAdminUser}
                              disabled={loadingAdmin || !canUse}
                              className="ui-btn ui-btn-primary ui-btn-xs"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditAdminUser}
                              disabled={loadingAdmin}
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
                            disabled={loadingAdmin || !canUse}
                            className="ui-btn ui-btn-outline ui-btn-xs"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdminUser(u.id)}
                            disabled={loadingAdmin || !canUse}
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
    </AccordionCard>
  );
};

export default AdminUsersSection;