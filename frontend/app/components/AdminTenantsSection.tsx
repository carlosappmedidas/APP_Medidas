"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { User, Empresa } from "../types";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import AccordionCard from "./ui/AccordionCard";

type AdminTenantsSectionProps = {
  token: string | null;
  currentUser: User | null;
};

type TenantEmpresaRef = {
  id?: number;
  nombre?: string | null;
  name?: string | null;
  codigo?: string | null;
  code?: string | null;
};

type Tenant = {
  id?: number;
  nombre?: string | null;
  name?: string | null;
  codigo?: string | null;
  code?: string | null;
  empresas?: TenantEmpresaRef[] | null;
  created_at?: string | null;
};

const AdminTenantsSection: React.FC<AdminTenantsSectionProps> = ({
  token,
  currentUser,
}) => {
  const isSuperuser = !!currentUser?.is_superuser;
  const canUse = !!token && isSuperuser;

  // CLIENTES (tenants)
  const [clientes, setClientes] = useState<Tenant[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);

  // creación de cliente
  const [newTenantNombre, setNewTenantNombre] = useState("");
  const [newTenantEmpresaIds, setNewTenantEmpresaIds] = useState(""); // string csv solo para mostrar

  // edición de cliente
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [editTenantNombre, setEditTenantNombre] = useState("");
  const [editTenantEmpresaIds, setEditTenantEmpresaIds] = useState(""); // string csv solo para mostrar

  // EMPRESAS para selects
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);

  // -----------------------------
  // Helpers
  // -----------------------------
  const parseIdsFromText = (text: string): number[] =>
    text
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "")
      .map((t) => Number(t))
      .filter((n) => !Number.isNaN(n) && n > 0);

  const stringifyEmpresaIds = (empresasArr: TenantEmpresaRef[] | null | undefined): string => {
    if (!Array.isArray(empresasArr) || empresasArr.length === 0) return "";
    const ids = empresasArr
      .map((e) => e?.id)
      .filter((id): id is number => typeof id === "number" && id > 0);
    return ids.join(", ");
  };

  const empresasActivas = useMemo(() => empresas.filter((e) => e.activo), [empresas]);

  // -----------------------------
  // Loads
  // -----------------------------
  const loadEmpresasForTenants = async () => {
    if (!token || !isSuperuser) return;

    setLoadingEmpresas(true);
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error cargando empresas para Tenants:", res.status, text);
        return;
      }

      const json = (await res.json()) as Empresa[];
      setEmpresas(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Error cargando empresas para Tenants:", err);
    } finally {
      setLoadingEmpresas(false);
    }
  };

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

      const json = (await res.json()) as Tenant[];
      setClientes(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Error cargando clientes:", err);
      setErrorClientes("No se pudieron cargar los clientes. Revisa permisos o endpoint.");
      setClientes([]);
    } finally {
      setLoadingClientes(false);
    }
  };

  // -----------------------------
  // CRUD
  // -----------------------------
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
      const body: any = { nombre }; // plan="starter" por defecto
      if (empresaIds.length > 0) body.empresa_ids = empresaIds;

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
      setErrorClientes("No se pudo crear el cliente. Revisa permisos y datos enviados.");
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleStartEditTenant = (c: Tenant) => {
    const id = typeof c.id === "number" ? c.id : null;
    setEditingTenantId(id);
    setEditTenantNombre(c.nombre ?? c.name ?? "");
    setEditTenantEmpresaIds(stringifyEmpresaIds(c.empresas ?? []));
    setErrorClientes(null);
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
      const body: any = { nombre, empresa_ids: empresaIds };

      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants/${editingTenantId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

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
      setErrorClientes("No se pudo actualizar el cliente. Revisa permisos y datos enviados.");
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleDeleteTenant = async (tenantId: number) => {
    if (!token || !isSuperuser) return;

    const ok = window.confirm("⚠️ Esta acción borrará el cliente de forma permanente. ¿Continuar?");
    if (!ok) return;

    setLoadingClientes(true);
    setErrorClientes(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants/${tenantId}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("Respuesta backend delete tenant:", text);
        throw new Error(`Error ${res.status}`);
      }

      if (editingTenantId === tenantId) handleCancelEditTenant();
      await loadClientes();
    } catch (err) {
      console.error("Error eliminando cliente:", err);
      setErrorClientes("No se pudo eliminar el cliente.");
    } finally {
      setLoadingClientes(false);
    }
  };

  // -----------------------------
  // Effects
  // -----------------------------
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

  useEffect(() => {
    if (token && isSuperuser) {
      loadClientes();
      loadEmpresasForTenants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperuser]);

  // -----------------------------
  // Render helpers
  // -----------------------------
  const tenantDisplayName = (t: Tenant) => t.nombre ?? t.name ?? "-";
  const tenantDisplayCode = (t: Tenant) => t.codigo ?? t.code ?? "-";

  const tenantEmpresasText = (t: Tenant) => {
    if (!Array.isArray(t.empresas) || t.empresas.length === 0) return "—";
    return t.empresas
      .map((e) => e.nombre ?? e.name ?? e.codigo ?? e.code ?? (e.id?.toString() ?? "-"))
      .join(", ");
  };

  return (
    <AccordionCard
      title="Clientes"
      subtitle="Gestión de tenants y sus empresas asociadas. Requiere superusuario."
      defaultOpen={false}
    >
      {errorClientes && <div className="ui-alert ui-alert--danger mb-4">{errorClientes}</div>}

      {!canUse && (
        <p className="mb-4 text-xs ui-muted">
          Necesitas iniciar sesión como superusuario para gestionar clientes.
        </p>
      )}

      {canUse && loadingClientes && (
        <p className="mb-3 text-[11px] ui-muted">Cargando…</p>
      )}

      {/* Crear */}
      <div className="ui-panel mb-4 text-[11px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h5 className="text-xs font-semibold">Crear cliente</h5>
          <span className="text-[10px] ui-muted">{loadingEmpresas ? "Cargando empresas…" : ""}</span>
        </div>

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
              El plan se crea como <span className="font-mono">starter</span> por defecto.
            </p>
          </div>

          <div>
            <label className="ui-label">Empresas del cliente</label>
            <select
              multiple
              value={parseIdsFromText(newTenantEmpresaIds).map(String)}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setNewTenantEmpresaIds(selected.join(", "));
              }}
              disabled={!canUse || loadingEmpresas}
              className="ui-select h-24"
            >
              {empresasActivas.length === 0 ? (
                <option value="" disabled>
                  {loadingEmpresas ? "Cargando empresas..." : "No hay empresas activas"}
                </option>
              ) : (
                empresasActivas.map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.nombre} (ID {emp.id})
                  </option>
                ))
              )}
            </select>

            <p className="ui-help">
              Seleccionadas: <span className="font-mono">{newTenantEmpresaIds || "—"}</span>
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
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              <th className="ui-th">ID</th>
              <th className="ui-th">Nombre</th>
              <th className="ui-th">Código</th>
              <th className="ui-th">Empresas</th>
              <th className="ui-th">Creado</th>
              <th className="ui-th ui-th-right">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {clientes.length === 0 ? (
              <tr className="ui-tr">
                <td colSpan={6} className="ui-td text-center ui-muted">
                  {loadingClientes ? "Cargando clientes..." : "No hay clientes para mostrar."}
                </td>
              </tr>
            ) : (
              clientes.map((c, idx) => {
                const tenantId = typeof c.id === "number" ? c.id : undefined;
                const isEditing = editingTenantId !== null && tenantId === editingTenantId;

                return (
                  <tr key={tenantId ?? idx} className="ui-tr align-top">
                    <td className="ui-td">{tenantId ?? "-"}</td>

                    <td className="ui-td">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTenantNombre}
                          onChange={(e) => setEditTenantNombre(e.target.value)}
                          disabled={!canUse}
                          className="ui-input"
                        />
                      ) : (
                        tenantDisplayName(c)
                      )}
                    </td>

                    <td className="ui-td">{tenantDisplayCode(c)}</td>

                    <td className="ui-td">
                      {isEditing ? (
                        <div className="space-y-2">
                          <select
                            multiple
                            value={parseIdsFromText(editTenantEmpresaIds).map(String)}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions).map(
                                (opt) => opt.value
                              );
                              setEditTenantEmpresaIds(selected.join(", "));
                            }}
                            disabled={!canUse || loadingEmpresas}
                            className="ui-select h-20"
                          >
                            {empresasActivas.length === 0 ? (
                              <option value="" disabled>
                                {loadingEmpresas ? "Cargando empresas..." : "No hay empresas activas"}
                              </option>
                            ) : (
                              empresasActivas.map((emp) => (
                                <option key={emp.id} value={String(emp.id)}>
                                  {emp.nombre} (ID {emp.id})
                                </option>
                              ))
                            )}
                          </select>

                          <p className="text-[10px] ui-muted">
                            Actual: {tenantEmpresasText(c)}
                          </p>
                        </div>
                      ) : (
                        tenantEmpresasText(c)
                      )}
                    </td>

                    <td className="ui-td">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("es-ES") : "-"}
                    </td>

                    <td className="ui-td ui-td-right">
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
                            onClick={() => handleDeleteTenant(tenantId ?? 0)}
                            disabled={loadingClientes || !canUse || typeof tenantId !== "number"}
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

export default AdminTenantsSection;