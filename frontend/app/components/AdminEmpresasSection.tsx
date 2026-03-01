// app/components/AdminEmpresasSection.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { User, Empresa } from "../types";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import AccordionCard from "./ui/AccordionCard";

type AdminEmpresasSectionProps = {
  token: string | null;
  currentUser: User | null;
};

const AdminEmpresasSection: React.FC<AdminEmpresasSectionProps> = ({
  token,
  currentUser,
}) => {
  const isSuperuser = !!currentUser?.is_superuser;

  // EMPRESAS
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [errorEmpresas, setErrorEmpresas] = useState<string | null>(null);

  // creación de empresa
  const [newEmpresaNombre, setNewEmpresaNombre] = useState("");
  const [newEmpresaCodigoRee, setNewEmpresaCodigoRee] = useState("");
  const [newEmpresaCodigoCnmc, setNewEmpresaCodigoCnmc] = useState("");
  const [newEmpresaActivo, setNewEmpresaActivo] = useState(true);

  // tenants para filtrar / asignar empresa
  const [clientes, setClientes] = useState<any[]>([]);
  const [selectedEmpresaTenantId, setSelectedEmpresaTenantId] = useState<string>("");

  // edición de empresa
  const [editingEmpresaId, setEditingEmpresaId] = useState<number | null>(null);
  const [editEmpresaNombre, setEditEmpresaNombre] = useState("");
  const [editEmpresaCodigoRee, setEditEmpresaCodigoRee] = useState("");
  const [editEmpresaCodigoCnmc, setEditEmpresaCodigoCnmc] = useState("");
  const [editEmpresaActivo, setEditEmpresaActivo] = useState(true);

  const canUse = !!token && isSuperuser;

  // ----------------------------------------------------
  // LOAD TENANTS PARA SELECT / FILTRO
  // ----------------------------------------------------
  const loadTenantsForEmpresas = async () => {
    if (!token || !isSuperuser) return;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/tenants`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error cargando clientes para Empresas:", res.status, text);
        return;
      }

      const json = await res.json();
      setClientes(json);
    } catch (err) {
      console.error("Error cargando clientes para Empresas:", err);
    }
  };

  // ----------------------------------------------------
  // EMPRESAS
  // ----------------------------------------------------

  const loadEmpresas = async (tenantOverride?: number) => {
    if (!token || !isSuperuser) return;

    setLoadingEmpresas(true);
    setErrorEmpresas(null);

    try {
      let url = `${API_BASE_URL}/empresas/?solo_activas=false`;

      const tenantFromState = Number(selectedEmpresaTenantId);
      const tenantToUse =
        typeof tenantOverride === "number"
          ? tenantOverride
          : !Number.isNaN(tenantFromState) && tenantFromState > 0
          ? tenantFromState
          : null;

      if (tenantToUse) {
        url += `&tenant_id=${tenantToUse}`;
      }

      const res = await fetch(url, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error cargando empresas:", res.status, text);
        throw new Error(`Error ${res.status}`);
      }

      const json = (await res.json()) as Empresa[];
      setEmpresas(json);
    } catch (err) {
      console.error("Error cargando empresas:", err);
      setErrorEmpresas("No se pudieron cargar las empresas.");
    } finally {
      setLoadingEmpresas(false);
    }
  };

  const handleCreateEmpresa = async () => {
    if (!token || !isSuperuser) return;

    const nombre = newEmpresaNombre.trim();
    if (!nombre) {
      setErrorEmpresas("El nombre de la empresa es obligatorio.");
      return;
    }

    setLoadingEmpresas(true);
    setErrorEmpresas(null);

    try {
      const body: any = {
        nombre,
        codigo_ree: newEmpresaCodigoRee.trim() || null,
        codigo_cnmc: newEmpresaCodigoCnmc.trim() || null,
        activo: newEmpresaActivo,
      };

      const tenantIdNum = Number(selectedEmpresaTenantId);
      if (!Number.isNaN(tenantIdNum) && tenantIdNum > 0) {
        body.tenant_id = tenantIdNum;
      }

      const res = await fetch(`${API_BASE_URL}/empresas/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend create empresa:", text);
        throw new Error(`Error creando empresa: ${res.status}`);
      }

      setNewEmpresaNombre("");
      setNewEmpresaCodigoRee("");
      setNewEmpresaCodigoCnmc("");
      setNewEmpresaActivo(true);

      await loadEmpresas();
    } catch (err) {
      console.error("Error creando empresa:", err);
      setErrorEmpresas(
        "No se pudo crear la empresa. Revisa permisos y datos enviados."
      );
    } finally {
      setLoadingEmpresas(false);
    }
  };

  const handleStartEditEmpresa = (e: Empresa) => {
    setEditingEmpresaId(e.id);
    setEditEmpresaNombre(e.nombre ?? "");
    setEditEmpresaCodigoRee(e.codigo_ree ?? "");
    setEditEmpresaCodigoCnmc(e.codigo_cnmc ?? "");
    setEditEmpresaActivo(!!e.activo);
  };

  const handleCancelEditEmpresa = () => {
    setEditingEmpresaId(null);
    setEditEmpresaNombre("");
    setEditEmpresaCodigoRee("");
    setEditEmpresaCodigoCnmc("");
    setEditEmpresaActivo(true);
  };

  const handleSaveEditEmpresa = async () => {
    if (!token || !isSuperuser || editingEmpresaId === null) return;

    const nombre = editEmpresaNombre.trim();
    if (!nombre) {
      setErrorEmpresas("El nombre de la empresa no puede estar vacío.");
      return;
    }

    setLoadingEmpresas(true);
    setErrorEmpresas(null);

    try {
      const body: any = {
        nombre,
        codigo_ree: editEmpresaCodigoRee.trim() || null,
        codigo_cnmc: editEmpresaCodigoCnmc.trim() || null,
        activo: editEmpresaActivo,
      };

      const res = await fetch(`${API_BASE_URL}/empresas/${editingEmpresaId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend update empresa:", text);
        throw new Error(`Error actualizando empresa: ${res.status}`);
      }

      setEditingEmpresaId(null);
      await loadEmpresas();
    } catch (err) {
      console.error("Error actualizando empresa:", err);
      setErrorEmpresas(
        "No se pudo actualizar la empresa. Revisa permisos y datos enviados."
      );
    } finally {
      setLoadingEmpresas(false);
    }
  };

  const handleDeleteEmpresa = async (empresaId: number) => {
    if (!token || !isSuperuser) return;

    const ok = window.confirm(
      "⚠️ Esta acción dará de baja la empresa (baja lógica). ¿Continuar?"
    );
    if (!ok) return;

    setLoadingEmpresas(true);
    setErrorEmpresas(null);

    try {
      const res = await fetch(`${API_BASE_URL}/empresas/${empresaId}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta backend delete empresa:", text);
        throw new Error(`Error ${res.status}`);
      }

      if (editingEmpresaId === empresaId) {
        handleCancelEditEmpresa();
      }

      await loadEmpresas();
    } catch (err) {
      console.error("Error eliminando empresa:", err);
      setErrorEmpresas("No se pudo dar de baja la empresa.");
    } finally {
      setLoadingEmpresas(false);
    }
  };

  // ----------------------------------------------------
  // EFFECTS
  // ----------------------------------------------------

  useEffect(() => {
    if (!token || !isSuperuser) {
      setEmpresas([]);
      setErrorEmpresas(null);
      setLoadingEmpresas(false);
      setEditingEmpresaId(null);
      setNewEmpresaNombre("");
      setNewEmpresaCodigoRee("");
      setNewEmpresaCodigoCnmc("");
      setNewEmpresaActivo(true);
      setEditEmpresaNombre("");
      setEditEmpresaCodigoRee("");
      setEditEmpresaCodigoCnmc("");
      setEditEmpresaActivo(true);
      setSelectedEmpresaTenantId("");
      setClientes([]);
    }
  }, [token, isSuperuser]);

  useEffect(() => {
    if (token && isSuperuser) {
      loadEmpresas();
      loadTenantsForEmpresas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperuser]);

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------

  return (
    <AccordionCard
      title="Empresas"
      subtitle="Gestión global de empresas. Requiere superusuario."
      defaultOpen={false} // ✅ cerrado por defecto (consistente)
    >
      {errorEmpresas && (
        <div className="ui-alert ui-alert--danger mb-4">{errorEmpresas}</div>
      )}

      {!canUse && (
        <p className="mb-4 text-xs ui-muted">
          Necesitas iniciar sesión como superusuario para gestionar empresas.
        </p>
      )}

      {/* Filtro por cliente */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="ui-muted">Cliente:</span>

        <select
          value={selectedEmpresaTenantId}
          onChange={(e) => {
            const value = e.target.value;
            setSelectedEmpresaTenantId(value);
            const tenantNum = Number(value);
            if (!Number.isNaN(tenantNum) && tenantNum > 0) {
              loadEmpresas(tenantNum);
            } else {
              loadEmpresas();
            }
          }}
          disabled={!canUse}
          className="ui-select min-w-[180px]"
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre ?? c.name ?? `Cliente ${c.id}`} (ID {c.id})
            </option>
          ))}
        </select>

        <span className="text-[10px] ui-muted">
          Este cliente se usa como valor por defecto al crear nuevas empresas.
        </span>
      </div>

      {/* Formulario creación empresa */}
      <div className="ui-panel mb-4 text-[11px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h5 className="text-xs font-semibold">Crear empresa</h5>
          <span className="text-[10px] ui-muted">
            {loadingEmpresas ? "Cargando..." : ""}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr,1fr,auto]">
          <div>
            <label className="ui-label">Nombre</label>
            <input
              type="text"
              value={newEmpresaNombre}
              onChange={(e) => setNewEmpresaNombre(e.target.value)}
              disabled={!canUse}
              className="ui-input"
              placeholder="Nombre de la empresa"
            />
          </div>

          <div>
            <label className="ui-label">Código REE</label>
            <input
              type="text"
              value={newEmpresaCodigoRee}
              onChange={(e) => setNewEmpresaCodigoRee(e.target.value)}
              disabled={!canUse}
              className="ui-input"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="ui-label">Código CNMC</label>
            <input
              type="text"
              value={newEmpresaCodigoCnmc}
              onChange={(e) => setNewEmpresaCodigoCnmc(e.target.value)}
              disabled={!canUse}
              className="ui-input"
              placeholder="Opcional"
            />

            <label className="mt-2 inline-flex items-center gap-2 text-[10px] ui-muted">
              <input
                type="checkbox"
                checked={newEmpresaActivo}
                onChange={(e) => setNewEmpresaActivo(e.target.checked)}
                disabled={!canUse}
                className="ui-checkbox"
              />
              <span>Activa</span>
            </label>
          </div>

          <div>
            <label className="ui-label">Cliente</label>
            <select
              value={selectedEmpresaTenantId}
              onChange={(e) => setSelectedEmpresaTenantId(e.target.value)}
              disabled={!canUse}
              className="ui-select"
            >
              <option value="">Usar cliente por defecto</option>
              {clientes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombre ?? c.name ?? `Cliente ${c.id}`} (ID {c.id})
                </option>
              ))}
            </select>

            <p className="ui-help">
              Solo se aplica al crear empresas (no cambia las existentes).
            </p>
          </div>

          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={handleCreateEmpresa}
              disabled={loadingEmpresas || !canUse}
              className="ui-btn ui-btn-primary"
            >
              Crear
            </button>

            <button
              type="button"
              onClick={() => loadEmpresas()}
              disabled={loadingEmpresas || !canUse}
              className="ui-btn ui-btn-secondary"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla empresas */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              <th className="ui-th">ID</th>
              <th className="ui-th">Nombre</th>
              <th className="ui-th">Código REE</th>
              <th className="ui-th">Código CNMC</th>
              <th className="ui-th">Activo</th>
              <th className="ui-th ui-th-right">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {empresas.length === 0 ? (
              <tr className="ui-tr">
                <td colSpan={6} className="ui-td text-center ui-muted">
                  {loadingEmpresas ? "Cargando empresas..." : "No hay empresas para mostrar."}
                </td>
              </tr>
            ) : (
              empresas.map((e) => {
                const isEditing = editingEmpresaId === e.id;

                return (
                  <tr key={e.id} className="ui-tr">
                    <td className="ui-td">{e.id}</td>

                    <td className="ui-td">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editEmpresaNombre}
                          onChange={(ev) => setEditEmpresaNombre(ev.target.value)}
                          disabled={!canUse}
                          className="ui-input"
                        />
                      ) : (
                        e.nombre
                      )}
                    </td>

                    <td className="ui-td">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editEmpresaCodigoRee}
                          onChange={(ev) => setEditEmpresaCodigoRee(ev.target.value)}
                          disabled={!canUse}
                          className="ui-input"
                        />
                      ) : (
                        e.codigo_ree ?? "-"
                      )}
                    </td>

                    <td className="ui-td">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editEmpresaCodigoCnmc}
                          onChange={(ev) => setEditEmpresaCodigoCnmc(ev.target.value)}
                          disabled={!canUse}
                          className="ui-input"
                        />
                      ) : (
                        e.codigo_cnmc ?? "-"
                      )}
                    </td>

                    <td className="ui-td">
                      {isEditing ? (
                        <label className="inline-flex items-center gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            checked={editEmpresaActivo}
                            onChange={(ev) => setEditEmpresaActivo(ev.target.checked)}
                            disabled={!canUse}
                            className="ui-checkbox"
                          />
                          <span>{editEmpresaActivo ? "Sí" : "No"}</span>
                        </label>
                      ) : e.activo ? (
                        "Sí"
                      ) : (
                        "No"
                      )}
                    </td>

                    <td className="ui-td ui-td-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleSaveEditEmpresa}
                            disabled={loadingEmpresas || !canUse}
                            className="ui-btn ui-btn-primary ui-btn-xs"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditEmpresa}
                            disabled={loadingEmpresas}
                            className="ui-btn ui-btn-outline ui-btn-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartEditEmpresa(e)}
                            disabled={loadingEmpresas || !canUse}
                            className="ui-btn ui-btn-outline ui-btn-xs"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmpresa(e.id)}
                            disabled={loadingEmpresas || !canUse}
                            className="ui-btn ui-btn-danger ui-btn-xs"
                          >
                            Dar de baja
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

export default AdminEmpresasSection;