"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { User } from "../types";

type Props = {
  token: string | null;
  currentUser?: User | null;
};

type AlertSeverity = "info" | "warning" | "critical";
type AlertStatus = "triggered" | "no_reference";

type AlertRow = {
  id: string;
  empresaId: number;
  empresa: string;
  anio: number;
  mes: number;
  alertCode: string;
  alerta: string;
  status: AlertStatus;
  severity: AlertSeverity;
  currentValue: number | null;
  previousValue: number | null;
  diffValue: number | null;
  diffUnit: "%" | "pp";
  thresholdValue: number;
  message: string;
  createdAt: string;
};

type BackendAlertRow = {
  id: number;
  tenant_id: number;
  empresa_id: number;
  empresa_nombre?: string | null;
  alert_code: string;
  alerta: string;
  anio: number;
  mes: number;
  status: string;
  severity: string;
  current_value?: number | null;
  previous_value?: number | null;
  diff_value?: number | null;
  diff_unit: "%" | "pp";
  threshold_value: number;
  message?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type EmpresaItem = {
  id: number;
  nombre: string;
};

type CompanyAlertConfigRow = {
  alert_code: string;
  nombre: string;
  descripcion?: string | null;
  is_enabled: boolean;
  threshold_value: number;
  severity: string;
  diff_unit: "%" | "pp";
  default_threshold: number;
  default_severity: string;
};

function severityBadgeClass(severity: AlertSeverity): string {
  if (severity === "critical") return "ui-badge ui-badge--err";
  if (severity === "warning") return "ui-badge ui-badge--warn";
  return "ui-badge ui-badge--neutral";
}

function severityLabel(severity: AlertSeverity): string {
  if (severity === "critical") return "Crítica";
  if (severity === "warning") return "Warning";
  return "Info";
}

function statusBadgeClass(status: AlertStatus): string {
  if (status === "triggered") return "ui-badge ui-badge--err";
  return "ui-badge ui-badge--neutral";
}

function statusLabel(status: AlertStatus): string {
  if (status === "triggered") return "Activa";
  return "Sin referencia previa";
}

function formatValue(value: number | null, unit?: string): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-ES");
}

function normalizeSeverity(value: string): AlertSeverity {
  if (value === "critical") return "critical";
  if (value === "warning") return "warning";
  return "info";
}

function normalizeStatus(value: string): AlertStatus {
  if (value === "triggered") return "triggered";
  return "no_reference";
}

function mapBackendRow(row: BackendAlertRow): AlertRow {
  return {
    id: String(row.id),
    empresaId: row.empresa_id,
    empresa: row.empresa_nombre || `Empresa ${row.empresa_id}`,
    anio: row.anio,
    mes: row.mes,
    alertCode: row.alert_code,
    alerta: row.alerta,
    status: normalizeStatus(row.status),
    severity: normalizeSeverity(row.severity),
    currentValue: row.current_value ?? null,
    previousValue: row.previous_value ?? null,
    diffValue: row.diff_value ?? null,
    diffUnit: row.diff_unit,
    thresholdValue: row.threshold_value,
    message: row.message ?? "",
    createdAt: formatDateTime(row.created_at),
  };
}

export default function AlertsSection({ token, currentUser }: Props) {
  const [empresaFilter, setEmpresaFilter] = useState<string>("all");
  const [anioFilter, setAnioFilter] = useState<string>("all");
  const [mesFilter, setMesFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);

  const [companyConfig, setCompanyConfig] = useState<CompanyAlertConfigRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const canManageConfig =
    !!currentUser &&
    (currentUser.is_superuser ||
      currentUser.rol === "admin" ||
      currentUser.rol === "owner");

  const selectedEmpresaId =
    empresaFilter !== "all" ? Number(empresaFilter) : null;

  const loadEmpresas = async () => {
    if (!token) {
      setEmpresas([]);
      return;
    }

    setLoadingEmpresas(true);
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        setEmpresas([]);
        return;
      }

      const json = await res.json();
      const empresasNorm: EmpresaItem[] = Array.isArray(json)
        ? json.map((e: any) => ({
            id: Number(e.id),
            nombre: String(e.nombre ?? `Empresa ${e.id}`),
          }))
        : [];

      setEmpresas(empresasNorm.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch {
      setEmpresas([]);
    } finally {
      setLoadingEmpresas(false);
    }
  };

  const loadAlerts = async () => {
    if (!token) {
      setAlerts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (empresaFilter !== "all") params.set("empresa_id", empresaFilter);
      if (anioFilter !== "all") params.set("anio", anioFilter);
      if (mesFilter !== "all") params.set("mes", mesFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter !== "all") params.set("status_value", statusFilter);

      const url = `${API_BASE_URL}/alerts/results${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      const res = await fetch(url, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }

      const json = (await res.json()) as BackendAlertRow[];
      setAlerts(Array.isArray(json) ? json.map(mapBackendRow) : []);
    } catch (err) {
      console.error("Error cargando alertas:", err);
      setAlerts([]);
      setError("No se pudieron cargar las alertas.");
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyConfig = async (empresaId: number) => {
    if (!token) {
      setCompanyConfig([]);
      return;
    }

    setLoadingConfig(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/alerts/company-config/${empresaId}`,
        {
          headers: getAuthHeaders(token),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }

      const json = await res.json();
      setCompanyConfig(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Error cargando configuración de alertas:", err);
      setCompanyConfig([]);
      setError("No se pudo cargar la configuración de alertas de la empresa.");
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setAlerts([]);
      setEmpresas([]);
      setCompanyConfig([]);
      setError(null);
      return;
    }

    loadEmpresas();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, empresaFilter, anioFilter, mesFilter, severityFilter, statusFilter]);

  useEffect(() => {
    if (!token || !selectedEmpresaId) {
      setCompanyConfig([]);
      return;
    }

    loadCompanyConfig(selectedEmpresaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedEmpresaId]);

  const tipos = useMemo(
    () =>
      Array.from(new Set(alerts.map((a) => a.alerta))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [alerts]
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter((row) => {
      if (tipoFilter !== "all" && row.alerta !== tipoFilter) return false;
      return true;
    });
  }, [alerts, tipoFilter]);

  const anios = useMemo(
    () => Array.from(new Set(alerts.map((a) => a.anio))).sort((a, b) => b - a),
    [alerts]
  );

  const meses = useMemo(
    () => Array.from(new Set(alerts.map((a) => a.mes))).sort((a, b) => a - b),
    [alerts]
  );

  const stats = useMemo(() => {
    const activeAlerts = filteredAlerts.filter((a) => a.status === "triggered").length;
    const noReference = filteredAlerts.filter((a) => a.status === "no_reference").length;
    const empresasConAlertas = new Set(filteredAlerts.map((a) => a.empresaId)).size;
    const criticalAlerts = filteredAlerts.filter((a) => a.severity === "critical").length;

    return {
      activeAlerts,
      noReference,
      empresasConAlertas,
      criticalAlerts,
    };
  }, [filteredAlerts]);

  const handleClearFilters = () => {
    setEmpresaFilter("all");
    setAnioFilter("all");
    setMesFilter("all");
    setTipoFilter("all");
    setSeverityFilter("all");
    setStatusFilter("all");
    setInfoMessage(null);
    setSelectedAlert(null);
  };

  const handleRecalculate = async () => {
    if (!token) return;

    if (empresaFilter === "all" || anioFilter === "all" || mesFilter === "all") {
      setError("Para recalcular, selecciona empresa, año y mes.");
      return;
    }

    setRecalculating(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/alerts/recalculate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(token),
        },
        body: JSON.stringify({
          empresa_id: Number(empresaFilter),
          anio: Number(anioFilter),
          mes: Number(mesFilter),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }

      const json = await res.json();
      setInfoMessage(
        `Recalculadas ${json.results_created ?? 0} alertas para el periodo seleccionado.`
      );

      await loadAlerts();
      if (selectedEmpresaId) {
        await loadCompanyConfig(selectedEmpresaId);
      }
    } catch (err) {
      console.error("Error recalculando alertas:", err);
      setError("No se pudieron recalcular las alertas.");
    } finally {
      setRecalculating(false);
    }
  };

  const handleConfigEnabledChange = (alertCode: string, checked: boolean) => {
    setCompanyConfig((prev) =>
      prev.map((row) =>
        row.alert_code === alertCode ? { ...row, is_enabled: checked } : row
      )
    );
  };

  const handleConfigThresholdChange = (alertCode: string, value: string) => {
    setCompanyConfig((prev) =>
      prev.map((row) =>
        row.alert_code === alertCode
          ? {
              ...row,
              threshold_value: value === "" ? 0 : Number(value),
            }
          : row
      )
    );
  };

  const handleConfigSeverityChange = (alertCode: string, value: string) => {
    setCompanyConfig((prev) =>
      prev.map((row) =>
        row.alert_code === alertCode
          ? { ...row, severity: value }
          : row
      )
    );
  };

  const handleResetOneConfig = (alertCode: string) => {
    setCompanyConfig((prev) =>
      prev.map((row) =>
        row.alert_code === alertCode
          ? {
              ...row,
              is_enabled: true,
              threshold_value: row.default_threshold,
              severity: row.default_severity,
            }
          : row
      )
    );
  };

  const handleSaveConfig = async () => {
    if (!token || !selectedEmpresaId) {
      setError("Selecciona una empresa para guardar la configuración.");
      return;
    }

    setSavingConfig(true);
    setError(null);
    setInfoMessage(null);

    try {
      const payload = {
        items: companyConfig.map((row) => ({
          alert_code: row.alert_code,
          is_enabled: row.is_enabled,
          threshold_value: Number(row.threshold_value),
          severity: row.severity,
        })),
      };

      const res = await fetch(
        `${API_BASE_URL}/alerts/company-config/${selectedEmpresaId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(token),
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }

      const json = await res.json();
      setCompanyConfig(Array.isArray(json) ? json : []);
      setInfoMessage("Configuración de alertas guardada correctamente.");
    } catch (err) {
      console.error("Error guardando configuración de alertas:", err);
      setError("No se pudo guardar la configuración de alertas.");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <section className="alerts-page">
      <header className="alerts-header ui-card ui-card--border">
        <div>
          <h3 className="ui-page-title">Alertas</h3>
          <p className="ui-card-subtitle">
            Seguimiento de desviaciones detectadas en energía y pérdidas por empresa y mes.
          </p>
        </div>

        <div className="alerts-header-actions">
          <span className="ui-badge ui-badge--neutral">
            {token ? "Conectado a backend real" : "Sin sesión"}
          </span>

          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={handleRecalculate}
            disabled={!token || recalculating}
            title="Selecciona empresa, año y mes para recalcular"
          >
            {recalculating ? "Recalculando..." : "Recalcular alertas"}
          </button>
        </div>
      </header>

      {error && <div className="ui-alert ui-alert--danger">{error}</div>}
      {infoMessage && <div className="ui-panel text-[11px]">{infoMessage}</div>}

      <section className="ui-card ui-card--border">
        <div className="alerts-filters-header">
          <div>
            <div className="ui-card-title">Filtros</div>
            <p className="ui-card-subtitle">
              Acota resultados por empresa, fecha, tipo y severidad.
            </p>
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={handleClearFilters}
          >
            Limpiar filtros
          </button>
        </div>

        <div className="alerts-filters-grid">
          <div>
            <label className="ui-label">Empresa</label>
            <select
              className="ui-select"
              value={empresaFilter}
              onChange={(e) => setEmpresaFilter(e.target.value)}
              disabled={!token || loadingEmpresas}
            >
              <option value="all">Todas</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={String(empresa.id)}>
                  {empresa.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">Año</label>
            <select
              className="ui-select"
              value={anioFilter}
              onChange={(e) => setAnioFilter(e.target.value)}
              disabled={!token}
            >
              <option value="all">Todos</option>
              {anios.map((anio) => (
                <option key={anio} value={String(anio)}>
                  {anio}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">Mes</label>
            <select
              className="ui-select"
              value={mesFilter}
              onChange={(e) => setMesFilter(e.target.value)}
              disabled={!token}
            >
              <option value="all">Todos</option>
              {meses.map((mes) => (
                <option key={mes} value={String(mes)}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">Tipo de alerta</label>
            <select
              className="ui-select"
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              disabled={!token}
            >
              <option value="all">Todas</option>
              {tipos.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">Severidad</label>
            <select
              className="ui-select"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              disabled={!token}
            >
              <option value="all">Todas</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Crítica</option>
            </select>
          </div>

          <div>
            <label className="ui-label">Estado</label>
            <select
              className="ui-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={!token}
            >
              <option value="all">Todos</option>
              <option value="triggered">Activa</option>
              <option value="no_reference">Sin referencia previa</option>
            </select>
          </div>
        </div>
      </section>

      {selectedEmpresaId && (
        <section className="ui-card ui-card--border">
          <div className="alerts-filters-header">
            <div>
              <div className="ui-card-title">Configuración de alertas por empresa</div>
              <p className="ui-card-subtitle">
                Activa, desactiva y ajusta umbrales para la empresa seleccionada.
              </p>
            </div>

            <button
              type="button"
              className="ui-btn ui-btn-secondary ui-btn-xs"
              onClick={handleSaveConfig}
              disabled={!canManageConfig || savingConfig || loadingConfig}
            >
              {savingConfig ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>

          {!canManageConfig && (
            <div className="mb-3 text-[11px] ui-muted">
              Tu usuario solo puede consultar la configuración, no modificarla.
            </div>
          )}

          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead className="ui-thead">
                <tr>
                  <th className="ui-th">Alerta</th>
                  <th className="ui-th">Activa</th>
                  <th className="ui-th">Umbral</th>
                  <th className="ui-th">Unidad</th>
                  <th className="ui-th">Severidad</th>
                  <th className="ui-th">Por defecto</th>
                  <th className="ui-th ui-th-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {loadingConfig ? (
                  <tr className="ui-tr">
                    <td className="ui-td" colSpan={7}>
                      <div className="py-4 text-center text-sm ui-muted">
                        Cargando configuración...
                      </div>
                    </td>
                  </tr>
                ) : companyConfig.length === 0 ? (
                  <tr className="ui-tr">
                    <td className="ui-td" colSpan={7}>
                      <div className="py-4 text-center text-sm ui-muted">
                        No hay configuración disponible para esta empresa.
                      </div>
                    </td>
                  </tr>
                ) : (
                  companyConfig.map((row) => (
                    <tr key={row.alert_code} className="ui-tr">
                      <td className="ui-td">
                        <div className="font-medium">{row.nombre}</div>
                        <div className="mt-1 text-[10px] ui-muted">
                          {row.descripcion || row.alert_code}
                        </div>
                      </td>

                      <td className="ui-td">
                        <label className="inline-flex items-center gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            className="ui-checkbox"
                            checked={row.is_enabled}
                            disabled={!canManageConfig}
                            onChange={(e) =>
                              handleConfigEnabledChange(row.alert_code, e.target.checked)
                            }
                          />
                          <span>{row.is_enabled ? "Sí" : "No"}</span>
                        </label>
                      </td>

                      <td className="ui-td">
                        <input
                          type="number"
                          step="0.1"
                          className="ui-input"
                          value={row.threshold_value}
                          disabled={!canManageConfig}
                          onChange={(e) =>
                            handleConfigThresholdChange(row.alert_code, e.target.value)
                          }
                        />
                      </td>

                      <td className="ui-td">{row.diff_unit}</td>

                      <td className="ui-td">
                        <select
                          className="ui-select"
                          value={row.severity}
                          disabled={!canManageConfig}
                          onChange={(e) =>
                            handleConfigSeverityChange(row.alert_code, e.target.value)
                          }
                        >
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Crítica</option>
                        </select>
                      </td>

                      <td className="ui-td">
                        <div className="text-[11px]">
                          {row.default_threshold} {row.diff_unit}
                        </div>
                        <div className="mt-1 text-[10px] ui-muted">
                          {row.default_severity}
                        </div>
                      </td>

                      <td className="ui-td ui-td-right">
                        <button
                          type="button"
                          className="ui-btn ui-btn-outline ui-btn-xs"
                          disabled={!canManageConfig}
                          onClick={() => handleResetOneConfig(row.alert_code)}
                        >
                          Restaurar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="alerts-stats-grid">
        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Alertas activas</div>
          <div className="mt-1 text-lg font-semibold">{stats.activeAlerts}</div>
          <div className="mt-1 text-[11px] ui-muted">
            Resultados con incidencia detectada.
          </div>
        </div>

        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Sin referencia previa</div>
          <div className="mt-1 text-lg font-semibold">{stats.noReference}</div>
          <div className="mt-1 text-[11px] ui-muted">
            Registros sin histórico mensual anterior.
          </div>
        </div>

        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Empresas con alertas</div>
          <div className="mt-1 text-lg font-semibold">{stats.empresasConAlertas}</div>
          <div className="mt-1 text-[11px] ui-muted">
            Empresas afectadas por los filtros actuales.
          </div>
        </div>

        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Alertas críticas</div>
          <div className="mt-1 text-lg font-semibold">{stats.criticalAlerts}</div>
          <div className="mt-1 text-[11px] ui-muted">
            Casos marcados con mayor severidad.
          </div>
        </div>
      </div>

      <section className="ui-card ui-card--border">
        <div className="alerts-table-header">
          <div>
            <div className="ui-card-title">Tabla general de alertas</div>
            <p className="ui-card-subtitle">
              {loading
                ? "Cargando resultados..."
                : `Mostrando ${filteredAlerts.length} resultado${
                    filteredAlerts.length === 1 ? "" : "s"
                  }.`}
            </p>
          </div>
        </div>

        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead className="ui-thead">
              <tr>
                <th className="ui-th">Empresa</th>
                <th className="ui-th">Año</th>
                <th className="ui-th">Mes</th>
                <th className="ui-th">Alerta</th>
                <th className="ui-th">Estado</th>
                <th className="ui-th">Severidad</th>
                <th className="ui-th ui-th-right">Valor actual</th>
                <th className="ui-th ui-th-right">Valor anterior</th>
                <th className="ui-th ui-th-right">Diferencia</th>
                <th className="ui-th ui-th-right">Umbral</th>
                <th className="ui-th">Fecha detección</th>
                <th className="ui-th">Acción</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr className="ui-tr">
                  <td className="ui-td" colSpan={12}>
                    <div className="py-4 text-center text-sm ui-muted">
                      Cargando alertas...
                    </div>
                  </td>
                </tr>
              ) : filteredAlerts.length === 0 ? (
                <tr className="ui-tr">
                  <td className="ui-td" colSpan={12}>
                    <div className="py-4 text-center text-sm ui-muted">
                      No hay resultados con los filtros seleccionados.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((row) => (
                  <tr key={row.id} className="ui-tr">
                    <td className="ui-td">{row.empresa}</td>
                    <td className="ui-td">{row.anio}</td>
                    <td className="ui-td">{row.mes}</td>
                    <td className="ui-td">
                      <div className="max-w-[260px]">
                        <div className="font-medium">{row.alerta}</div>
                        <div className="mt-1 text-[10px] ui-muted">{row.alertCode}</div>
                      </div>
                    </td>
                    <td className="ui-td">
                      <span className={statusBadgeClass(row.status)}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="ui-td">
                      <span className={severityBadgeClass(row.severity)}>
                        {severityLabel(row.severity)}
                      </span>
                    </td>
                    <td className="ui-td ui-td-right">{formatValue(row.currentValue)}</td>
                    <td className="ui-td ui-td-right">{formatValue(row.previousValue)}</td>
                    <td className="ui-td ui-td-right">
                      {formatValue(row.diffValue, row.diffUnit)}
                    </td>
                    <td className="ui-td ui-td-right">
                      {formatValue(row.thresholdValue, row.diffUnit)}
                    </td>
                    <td className="ui-td">{row.createdAt}</td>
                    <td className="ui-td">
                      <button
                        type="button"
                        className="ui-btn ui-btn-outline ui-btn-xs"
                        onClick={() => setSelectedAlert(row)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAlert && (
        <section className="ui-card ui-card--border">
          <div className="alerts-detail-header">
            <div>
              <div className="ui-card-title">Detalle de alerta</div>
              <p className="ui-card-subtitle">
                Información ampliada del resultado seleccionado.
              </p>
            </div>

            <button
              type="button"
              className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={() => setSelectedAlert(null)}
            >
              Cerrar
            </button>
          </div>

          <div className="alerts-detail-grid">
            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Empresa</div>
              <div className="mt-1 text-sm font-semibold">{selectedAlert.empresa}</div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Periodo</div>
              <div className="mt-1 text-sm font-semibold">
                {selectedAlert.mes}/{selectedAlert.anio}
              </div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Estado</div>
              <div className="mt-1">
                <span className={statusBadgeClass(selectedAlert.status)}>
                  {statusLabel(selectedAlert.status)}
                </span>
              </div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Severidad</div>
              <div className="mt-1">
                <span className={severityBadgeClass(selectedAlert.severity)}>
                  {severityLabel(selectedAlert.severity)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Alerta</div>
              <div className="mt-1 text-sm font-semibold">{selectedAlert.alerta}</div>
              <div className="mt-1 text-[11px] ui-muted font-mono">
                {selectedAlert.alertCode}
              </div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Fecha detección</div>
              <div className="mt-1 text-sm font-semibold">{selectedAlert.createdAt}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Valor actual</div>
              <div className="mt-1 text-sm font-semibold">
                {formatValue(selectedAlert.currentValue)}
              </div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Valor anterior</div>
              <div className="mt-1 text-sm font-semibold">
                {formatValue(selectedAlert.previousValue)}
              </div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Diferencia</div>
              <div className="mt-1 text-sm font-semibold">
                {formatValue(selectedAlert.diffValue, selectedAlert.diffUnit)}
              </div>
            </div>

            <div className="ui-panel">
              <div className="text-[10px] ui-muted">Umbral</div>
              <div className="mt-1 text-sm font-semibold">
                {formatValue(selectedAlert.thresholdValue, selectedAlert.diffUnit)}
              </div>
            </div>
          </div>

          <div className="mt-4 ui-panel">
            <div className="text-[10px] ui-muted">Mensaje</div>
            <div className="mt-1 text-[12px]">{selectedAlert.message || "—"}</div>
          </div>
        </section>
      )}
    </section>
  );
}