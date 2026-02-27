// app/components/UsersSection.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { Empresa, User } from "../types";

type UsersSectionProps = {
  token: string | null;
};

export default function UsersSection({ token }: UsersSectionProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // formulario nuevo usuario (tenant actual)
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRol, setNewRol] = useState("user");
  const [newActive, setNewActive] = useState(true);
  const [newEmpresaIds, setNewEmpresaIds] = useState<number[]>([]); // [] => todas (sin filtro extra)

  // EDICIÓN DE USUARIO EXISTENTE
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editRol, setEditRol] = useState("user");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editEmpresaIds, setEditEmpresaIds] = useState<number[]>([]); // [] => todas

  const canCallApi = !!token;

  // desplegable (cerrado por defecto)
  const [isOpen, setIsOpen] = useState(false);

  // --------- HELPERS ---------

  const toggleId = (arr: number[], id: number) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const empresasById = useMemo(() => {
    const m = new Map<number, Empresa>();
    for (const e of empresas) m.set(e.id, e);
    return m;
  }, [empresas]);

  const renderEmpresasLabel = (ids: number[]) => {
    if (!ids || ids.length === 0) return "Todas (sin filtro)";
    const names = ids
      .map((id) => empresasById.get(id)?.nombre)
      .filter(Boolean) as string[];
    if (names.length === 0) return `${ids.length} seleccionada(s)`;
    return names.join(", ");
  };

  // --------- CARGA ---------

  const loadUsers = async () => {
    if (!canCallApi) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setUsers(json);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
      setError("No se pudieron cargar los usuarios del tenant.");
    } finally {
      setLoading(false);
    }
  };

  const loadEmpresas = async () => {
    if (!canCallApi) return;
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=true`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setEmpresas(json);
    } catch (err) {
      console.error("Error cargando empresas:", err);
      // no bloquea toda la pantalla, pero avisamos
      setError((prev) => prev ?? "No se pudieron cargar las empresas del tenant.");
    }
  };

  useEffect(() => {
    if (token) {
      loadEmpresas();
      loadUsers();
    } else {
      setUsers([]);
      setEmpresas([]);
      setEditingUserId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --------- ACCIONES TENANT ACTUAL ---------

  const handleCreateUser = async () => {
    if (!canCallApi) return;
    if (!newEmail || !newPassword) {
      setError("Email y contraseña son obligatorios.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body = {
        email: newEmail,
        password: newPassword,
        rol: newRol,
        is_active: newActive,
        empresa_ids_permitidas: newEmpresaIds, // [] => todas (sin filtro extra)
      };

      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend:", text);
        throw new Error(`Error creando usuario: ${res.status}`);
      }

      setNewEmail("");
      setNewPassword("");
      setNewRol("user");
      setNewActive(true);
      setNewEmpresaIds([]);

      await loadUsers();
    } catch (err) {
      console.error("Error creando usuario:", err);
      setError(
        "No se pudo crear el usuario. Revisa que el email no exista y que el token sea válido."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (userId: number) => {
    if (!canCallApi) return;
    if (!window.confirm("¿Desactivar este usuario?")) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });

      if (!res.ok && res.status !== 204) throw new Error(`Error ${res.status}`);
      await loadUsers();
    } catch (err) {
      console.error("Error desactivando usuario:", err);
      setError("No se pudo desactivar el usuario.");
    } finally {
      setLoading(false);
    }
  };

  // --------- EDICIÓN & BORRADO ---------

  const handleStartEdit = (u: User) => {
    setEditingUserId(u.id);
    setEditRol(u.rol || "user");
    setEditActive(u.is_active);
    setEditPassword("");
    setEditEmpresaIds(u.empresa_ids_permitidas ?? []);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditPassword("");
  };

  const handleSaveEdit = async () => {
    if (!canCallApi || editingUserId === null) return;

    setLoading(true);
    setError(null);
    try {
      const body: any = {
        rol: editRol,
        is_active: editActive,
        empresa_ids_permitidas: editEmpresaIds, // [] => todas (sin filtro extra)
      };

      if (editPassword.trim() !== "") {
        body.password = editPassword;
      }

      const res = await fetch(`${API_BASE_URL}/auth/users/${editingUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend PATCH:", text);
        throw new Error(`Error actualizando usuario: ${res.status}`);
      }

      setEditingUserId(null);
      setEditPassword("");
      await loadUsers();
    } catch (err) {
      console.error("Error actualizando usuario:", err);
      setError("No se pudo actualizar el usuario. Revisa permisos y datos enviados.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!canCallApi) return;

    const ok = window.confirm(
      "⚠️ Esta acción borrará el usuario de forma permanente. ¿Continuar?"
    );
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}/hard-delete`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("Respuesta backend hard-delete:", text);
        throw new Error(`Error ${res.status}`);
      }

      if (editingUserId === userId) {
        setEditingUserId(null);
        setEditPassword("");
      }

      await loadUsers();
    } catch (err) {
      console.error("Error eliminando usuario:", err);
      setError("No se pudo eliminar el usuario.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ui-card text-sm">
      {/* HEADER DESPLEGABLE */}
      <header
        className="mb-3 flex cursor-pointer flex-col gap-2 md:flex-row md:items-center md:justify-between"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div>
          <h4 className="ui-card-title">Usuarios cliente</h4>
          <p className="ui-card-subtitle">
            Controla qué empresas ve cada usuario (si no seleccionas ninguna → ve todas).
          </p>
        </div>

        <span className="text-[11px] ui-muted">{isOpen ? "Ocultar ▲" : "Mostrar ▼"}</span>
      </header>

      {/* ERRORES */}
      {error && isOpen && <p className="mb-3 text-[11px] text-red-400">{error}</p>}

      {/* CONTENIDO DESPLEGABLE */}
      {isOpen && (
        <>
          {!token && (
            <p className="mb-4 text-xs text-yellow-400">
              Haz login para poder ver y gestionar usuarios.
            </p>
          )}

          {/* FORMULARIO NUEVO USUARIO */}
          <div className="mb-6 ui-panel text-[11px]">
            <h5 className="mb-2 text-xs font-semibold">Crear nuevo usuario</h5>

            <div className="grid gap-3 md:grid-cols-[2fr,2fr,1fr,auto,auto]">
              <div>
                <label className="ui-label">Email</label>
                <input
                  type="email"
                  className="ui-input"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="usuario@cliente.com"
                  disabled={!canCallApi}
                />
              </div>

              <div>
                <label className="ui-label">Contraseña</label>
                <input
                  type="password"
                  className="ui-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={!canCallApi}
                />
              </div>

              <div>
                <label className="ui-label">Rol</label>
                <select
                  className="ui-select"
                  value={newRol}
                  onChange={(e) => setNewRol(e.target.value)}
                  disabled={!canCallApi}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              {/* Activo */}
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-[10px] ui-muted">
                  <input
                    type="checkbox"
                    checked={newActive}
                    onChange={(e) => setNewActive(e.target.checked)}
                    className="ui-checkbox"
                    disabled={!canCallApi}
                  />
                  Activo
                </label>
              </div>

              {/* Botones */}
              <div className="flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={loading || !canCallApi}
                  className="ui-btn ui-btn-primary"
                >
                  Crear
                </button>

                <button
                  type="button"
                  onClick={() => {
                    loadEmpresas();
                    loadUsers();
                  }}
                  disabled={loading || !canCallApi}
                  className="ui-btn ui-btn-secondary"
                >
                  {loading ? "Actualizando..." : "Recargar"}
                </button>
              </div>
            </div>

            {/* Selector empresas (nuevo usuario) */}
            <div className="mt-4 rounded-xl border border-[var(--field-border)] bg-[var(--field-bg-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold" style={{ color: "var(--text)" }}>
                  Empresas visibles para este usuario
                </div>

                <button
                  type="button"
                  className="ui-btn ui-btn-outline ui-btn-xs"
                  onClick={() => setNewEmpresaIds([])}
                  disabled={!canCallApi}
                  title="Dejar sin filtro extra (ver todas)"
                >
                  Ver todas
                </button>
              </div>

              <div className="mt-1 text-[10px] ui-muted">
                Seleccionadas:{" "}
                <span style={{ color: "var(--text)" }}>{renderEmpresasLabel(newEmpresaIds)}</span>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {empresas.length === 0 ? (
                  <div className="text-[10px] ui-muted">No hay empresas (o no se pudieron cargar).</div>
                ) : (
                  empresas.map((e) => (
                    <label
                      key={e.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 py-1.5 text-[10px] hover:bg-white/5"
                      style={{ color: "var(--text)" }}
                    >
                      <input
                        type="checkbox"
                        checked={newEmpresaIds.includes(e.id)}
                        onChange={() => setNewEmpresaIds((prev) => toggleId(prev, e.id))}
                        className="ui-checkbox"
                        disabled={!canCallApi}
                      />
                      <span className="truncate">{e.nombre}</span>
                      {!e.activo && <span className="text-[10px] text-yellow-300">(inactiva)</span>}
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* TABLA USUARIOS TENANT */}
          <div className="ui-table-wrap">
            <table className="ui-table text-[11px]">
              <thead className="ui-thead">
                <tr>
                  <th className="ui-th">Email</th>
                  <th className="ui-th">Rol</th>
                  <th className="ui-th">Activo</th>
                  <th className="ui-th">Empresas</th>
                  <th className="ui-th">Creado</th>
                  <th className="ui-th ui-th-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {users.length === 0 ? (
                  <tr className="ui-tr">
                    <td colSpan={6} className="ui-td text-center ui-muted">
                      No hay usuarios en este tenant.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isEditing = editingUserId === u.id;

                    return (
                      <tr key={u.id} className="ui-tr align-top">
                        <td className="ui-td">{u.email}</td>

                        {/* Rol */}
                        <td className="ui-td">
                          {isEditing ? (
                            <select
                              value={editRol}
                              onChange={(e) => setEditRol(e.target.value)}
                              className="ui-select px-2 py-1 text-[11px]"
                              disabled={!canCallApi}
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </select>
                          ) : (
                            u.rol
                          )}
                        </td>

                        {/* Activo */}
                        <td className="ui-td">
                          {isEditing ? (
                            <label className="inline-flex items-center gap-2 text-[11px]">
                              <input
                                type="checkbox"
                                checked={editActive}
                                onChange={(e) => setEditActive(e.target.checked)}
                                className="ui-checkbox"
                                disabled={!canCallApi}
                              />
                              <span>{editActive ? "Sí" : "No"}</span>
                            </label>
                          ) : u.is_active ? (
                            "Sí"
                          ) : (
                            "No"
                          )}
                        </td>

                        {/* Empresas */}
                        <td className="ui-td">
                          {isEditing ? (
                            <div className="w-[360px] max-w-[360px]">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] ui-muted">
                                  {renderEmpresasLabel(editEmpresaIds)}
                                </div>
                                <button
                                  type="button"
                                  className="ui-btn ui-btn-outline ui-btn-xs"
                                  onClick={() => setEditEmpresaIds([])}
                                  title="Ver todas (sin filtro extra)"
                                  disabled={!canCallApi}
                                >
                                  Ver todas
                                </button>
                              </div>

                              <div className="mt-2 grid gap-2 md:grid-cols-2">
                                {empresas.map((e) => (
                                  <label
                                    key={e.id}
                                    className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 py-1 text-[10px] hover:bg-white/5"
                                    style={{ color: "var(--text)" }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editEmpresaIds.includes(e.id)}
                                      onChange={() =>
                                        setEditEmpresaIds((prev) => toggleId(prev, e.id))
                                      }
                                      className="ui-checkbox"
                                      disabled={!canCallApi}
                                    />
                                    <span className="truncate">{e.nombre}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px]" style={{ color: "var(--text)" }}>
                              {renderEmpresasLabel(u.empresa_ids_permitidas ?? [])}
                            </span>
                          )}
                        </td>

                        {/* Creado */}
                        <td className="ui-td">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString("es-ES") : "-"}
                        </td>

                        {/* Acciones */}
                        <td className="ui-td ui-td-right">
                          {isEditing ? (
                            <div className="flex flex-col items-end gap-2">
                              <input
                                type="password"
                                placeholder="Nueva contraseña (opcional)"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                className="ui-input w-48 px-2 py-1 text-[10px]"
                                disabled={!canCallApi}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveEdit}
                                  disabled={loading || !canCallApi}
                                  className="ui-btn ui-btn-primary ui-btn-xs"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={loading}
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
                                onClick={() => handleStartEdit(u)}
                                disabled={loading || !canCallApi}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeactivate(u.id)}
                                disabled={loading || !canCallApi || !u.is_active}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                              >
                                Desactivar
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={loading || !canCallApi}
                                className="ui-btn ui-btn-danger ui-btn-xs"
                              >
                                Eliminar
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
}