"use client";

import React, { useEffect, useMemo, useState } from "react";
import EmpresasSection from "./EmpresasSection";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { useDashboardFilters } from "./hooks/useDashboardFilters";
import { useDashboardEnergyComparisonChart } from "./hooks/useDashboardEnergyComparisonChart";
import { useDashboardEnergyTrendChart } from "./hooks/useDashboardEnergyTrendChart";
import { useDashboardLossesTrendChart } from "./hooks/useDashboardLossesTrendChart";
import DashboardMiniCard from "./dashboard/ui/DashboardMiniCard";
import DashboardPlaceholderBox from "./dashboard/ui/DashboardPlaceholderBox";
import DashboardEnergyComparisonChart from "./dashboard/charts/DashboardEnergyComparisonChart";
import DashboardEnergyTrendChart from "./dashboard/charts/DashboardEnergyTrendChart";
import DashboardLossesTrendChart from "./dashboard/charts/DashboardLossesTrendChart";
import {
  formatKwhEur,
  formatKwhOnly,
  formatMonthYear,
  formatSignedNumberEs,
} from "./dashboard/formatters";

type Props = {
  token: string | null;
};

export default function DashboardSection({ token }: Props) {
  const isLogged = !!token;
  const [showEmpresas, setShowEmpresas] = useState(false);

  const [empresa, setEmpresa] = useState("");
  const [anio, setAnio] = useState("");
  const [mes, setMes] = useState("");

  const empresaId = empresa ? Number(empresa) : null;
  const anioValue = anio ? Number(anio) : null;
  const mesValue = anio && mes ? Number(mes) : null;

  const {
    data: filtersData,
    loading: filtersLoading,
    error: filtersError,
  } = useDashboardFilters({
    token,
    empresaId,
    anio: anioValue,
  });

  const { data, loading, error } = useDashboardSummary({
    token,
    empresaId,
    anio: anioValue,
    mes: mesValue,
  });

  const {
    data: chartData,
    loading: chartLoading,
    error: chartError,
  } = useDashboardEnergyComparisonChart({
    token,
    empresaId,
    anio: anioValue,
    mes: mesValue,
  });

  const {
    data: energyTrendChartData,
    loading: energyTrendChartLoading,
    error: energyTrendChartError,
  } = useDashboardEnergyTrendChart({
    token,
    empresaId,
    anio: anioValue,
    mes: mesValue,
  });

  const {
    data: lossesTrendChartData,
    loading: lossesTrendChartLoading,
    error: lossesTrendChartError,
  } = useDashboardLossesTrendChart({
    token,
    empresaId,
    anio: anioValue,
    mes: mesValue,
  });

  useEffect(() => {
    setAnio("");
    setMes("");
  }, [empresa]);

  useEffect(() => {
    setMes("");
  }, [anio]);

  const empresaOptions = useMemo(() => {
    const base = [{ value: "", label: "Todas" }];

    if (!filtersData?.empresas?.length) return base;

    return [
      ...base,
      ...filtersData.empresas.map((empresaItem) => ({
        value: String(empresaItem.id),
        label: empresaItem.nombre ?? empresaItem.codigo ?? `Empresa ${empresaItem.id}`,
      })),
    ];
  }, [filtersData]);

  const anioOptions = useMemo(() => {
    const base = [{ value: "", label: "Último disponible" }];

    if (!filtersData?.anios?.length) return base;

    return [
      ...base,
      ...filtersData.anios.map((anioItem) => ({
        value: String(anioItem),
        label: String(anioItem),
      })),
    ];
  }, [filtersData]);

  const mesesDisponibles = useMemo(() => {
    if (!anio) return [];
    if (!filtersData?.meses?.length) return [];
    return [...filtersData.meses].sort((a, b) => a - b);
  }, [filtersData, anio]);

  const mesOptions = useMemo(() => {
    const base = [{ value: "", label: "Último disponible" }];

    if (!mesesDisponibles.length) return base;

    return [
      ...base,
      ...mesesDisponibles.map((mesItem) => ({
        value: String(mesItem),
        label: String(mesItem).padStart(2, "0"),
      })),
    ];
  }, [mesesDisponibles]);

  useEffect(() => {
    if (!mes) return;

    const mesNumero = Number(mes);
    if (!mesesDisponibles.includes(mesNumero)) {
      setMes("");
    }
  }, [mes, mesesDisponibles]);

  const aggregationMode = data?.aggregation_mode ?? "month";

  const periodoComunLabel = useMemo(() => {
    return formatMonthYear(data?.common_period?.anio, data?.common_period?.mes);
  }, [data]);

  const previousPeriodoLabel = useMemo(() => {
    return formatMonthYear(
      data?.previous_common_period?.anio,
      data?.previous_common_period?.mes
    );
  }, [data]);

  const resumenSubtitle = useMemo(() => {
    if (!isLogged) {
      return "Resumen inicial del dashboard.";
    }

    if (aggregationMode === "ytd") {
      return "Resumen acumulado del año hasta el último mes común disponible entre Medidas General y PS.";
    }

    return "Resumen inicial del último mes común disponible entre Medidas General y PS.";
  }, [isLogged, aggregationMode]);

  const periodoInfoLabel = useMemo(() => {
    if (aggregationMode === "ytd") {
      return `Acumulado hasta: ${periodoComunLabel}`;
    }
    return `Periodo común actual: ${periodoComunLabel}`;
  }, [aggregationMode, periodoComunLabel]);

  const variationTooltipTitle = useMemo(() => {
    if (aggregationMode === "ytd") {
      return "Variación vs mismo acumulado año anterior";
    }
    return "Variación vs mes anterior";
  }, [aggregationMode]);

  const energiaCardTitle = useMemo(() => {
    if (aggregationMode === "ytd") {
      return "ENERGÍA FACTURADA ACUMULADA DEL AÑO";
    }
    return "ENERGÍA FACTURADA EN EL ÚLTIMO MES";
  }, [aggregationMode]);

  const perdidasCardTitle = useMemo(() => {
    if (aggregationMode === "ytd") {
      return "PÉRDIDAS ACUMULADAS DEL AÑO";
    }
    return "PÉRDIDAS EN EL ÚLTIMO MES";
  }, [aggregationMode]);

  const energiaFacturadaTotal = useMemo(() => {
    if (!isLogged) return "—";
    if (loading) return "Cargando...";
    if (!data?.common_period) return "Sin datos";

    return formatKwhEur(
      data.energia_facturada.energia_neta_facturada_kwh_total,
      data.energia_facturada.importe_total_eur_total
    );
  }, [isLogged, loading, data]);

  const energiaFacturadaVariationKwh = useMemo(() => {
    if (!isLogged || loading || !data?.previous_common_period) return "—";

    return formatSignedNumberEs(
      data.energia_facturada.variation_vs_previous.energia_neta_facturada_kwh_delta
    );
  }, [isLogged, loading, data]);

  const energiaFacturadaVariationEur = useMemo(() => {
    if (!isLogged || loading || !data?.previous_common_period) return "—";

    return formatSignedNumberEs(
      data.energia_facturada.variation_vs_previous.importe_total_eur_delta
    );
  }, [isLogged, loading, data]);

  const perdidasTotal = useMemo(() => {
    if (!isLogged) return "—";
    if (loading) return "Cargando...";
    if (!data?.common_period) return "Sin datos";

    return formatKwhOnly(data.perdidas.perdidas_e_facturada_kwh_total);
  }, [isLogged, loading, data]);

  const perdidasVariation = useMemo(() => {
    if (!isLogged) return "—";
    if (loading) return "Cargando...";
    if (!data?.previous_common_period) return "—";

    const currentLosses = data.perdidas.perdidas_e_facturada_kwh_total;
    const rawDelta = data.perdidas.variation_vs_previous.perdidas_e_facturada_kwh_delta;

    if (rawDelta == null || Number.isNaN(rawDelta)) {
      return "—";
    }

    const previousLosses = currentLosses - rawDelta;
    const displayDelta = Math.abs(currentLosses) - Math.abs(previousLosses);

    return formatSignedNumberEs(displayDelta);
  }, [isLogged, loading, data]);

  const dashboardErrorText = useMemo(() => {
    if (!isLogged) return null;
    return error;
  }, [isLogged, error]);

  const filtersErrorText = useMemo(() => {
    if (!isLogged) return null;
    return filtersError;
  }, [isLogged, filtersError]);

  const comparisonHelpText = useMemo(() => {
    if (!data?.previous_common_period) return null;

    if (aggregationMode === "ytd") {
      return `Comparando hasta ${periodoComunLabel} contra el acumulado hasta ${previousPeriodoLabel}.`;
    }

    return `Comparando ${periodoComunLabel} contra ${previousPeriodoLabel}.`;
  }, [aggregationMode, data, periodoComunLabel, previousPeriodoLabel]);

  return (
    <section className="ui-card text-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="ui-card-title text-base md:text-lg">DASHBOARD MEDIDAS</h3>
            <p className="ui-card-subtitle mt-1">{resumenSubtitle}</p>

            {isLogged && (
              <div className="mt-1 text-[11px] ui-muted">
                {periodoInfoLabel.split(":")[0]}:
                <span className="font-semibold"> {periodoComunLabel}</span>
              </div>
            )}

            {isLogged && comparisonHelpText ? (
              <div className="mt-1 text-[11px] ui-muted">{comparisonHelpText}</div>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[560px]">
            <div>
              <label className="ui-label">Empresa</label>
              <select
                className="ui-select text-[11px]"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={!isLogged || filtersLoading}
              >
                {empresaOptions.map((option) => (
                  <option key={`empresa-${option.value || "all"}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Año</label>
              <select
                className="ui-select text-[11px]"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                disabled={!isLogged || filtersLoading}
              >
                {anioOptions.map((option) => (
                  <option key={`anio-${option.value || "all"}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Mes</label>
              <select
                className="ui-select text-[11px]"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                disabled={!isLogged || filtersLoading || !anio}
              >
                {mesOptions.map((option) => (
                  <option key={`mes-${option.value || "all"}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={["ui-btn ui-btn-xs", isLogged ? "ui-btn-outline" : "ui-btn-danger"].join(" ")}
            title={isLogged ? "Sesión iniciada" : "No hay sesión activa"}
          >
            {isLogged ? "Con sesión" : "Sin sesión"}
          </span>

          <button
            type="button"
            onClick={() => setShowEmpresas((prev) => !prev)}
            className="ui-btn ui-btn-outline ui-btn-xs"
            disabled={!isLogged}
            title={
              isLogged
                ? "Ver información de empresas asociadas"
                : "Inicia sesión para ver empresas"
            }
          >
            {showEmpresas ? "Ocultar empresas" : "Empresas (info)"}
          </button>

          {(empresa || anio || mes) && (
            <button
              type="button"
              className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={() => {
                setEmpresa("");
                setAnio("");
                setMes("");
              }}
              disabled={!isLogged}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {showEmpresas && (
          <div className="ui-panel">
            <div className="mb-3">
              <div className="text-xs font-semibold">Empresas</div>
              <div className="mt-0.5 text-[11px] ui-muted">
                Información de empresas asociadas al cliente.
              </div>
            </div>

            <EmpresasSection token={token} />
          </div>
        )}

        {filtersErrorText && (
          <div className="ui-alert ui-alert--danger">
            Error cargando filtros del dashboard: {filtersErrorText}
          </div>
        )}

        {dashboardErrorText && (
          <div className="ui-alert ui-alert--danger">
            Error cargando el resumen del dashboard: {dashboardErrorText}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <DashboardMiniCard
                title={energiaCardTitle}
                centered
                rows={[{ label: "", value: energiaFacturadaTotal }]}
                tooltipTitle={variationTooltipTitle}
                tooltipRows={[
                  { label: "kWh", value: energiaFacturadaVariationKwh },
                  { label: "€", value: energiaFacturadaVariationEur },
                ]}
                minHeightClassName="min-h-[150px]"
              />

              <DashboardMiniCard
                title={perdidasCardTitle}
                centered
                rows={[{ label: "", value: perdidasTotal }]}
                tooltipTitle={variationTooltipTitle}
                tooltipRows={[{ label: "kWh", value: perdidasVariation }]}
                minHeightClassName="min-h-[150px]"
              />

              <DashboardMiniCard
                title="EVOLUCIÓN DE ENERGÍA FACTURADA"
                minHeightClassName="min-h-[180px]"
              >
                <DashboardEnergyTrendChart
                  loading={energyTrendChartLoading}
                  error={energyTrendChartError}
                  points={energyTrendChartData?.series ?? []}
                />
              </DashboardMiniCard>

              <DashboardMiniCard
                title="EVOLUCIÓN DE PÉRDIDAS"
                minHeightClassName="min-h-[180px]"
              >
                <DashboardLossesTrendChart
                  loading={lossesTrendChartLoading}
                  error={lossesTrendChartError}
                  points={lossesTrendChartData?.series ?? []}
                />
              </DashboardMiniCard>
            </div>
          </div>

          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <DashboardMiniCard
                title="OBJECIONES"
                rows={[
                  { label: "Total activas", value: "—" },
                  { label: "Total respondidas en plazo", value: "—" },
                  { label: "Total respondidas fuera plazo", value: "—" },
                ]}
                helpText="Al pasar el ratón por encima se abre ventana flotante con la info por empresa."
                minHeightClassName="min-h-[150px]"
              />

              <DashboardMiniCard
                title="CALENDARIO REE CON HITOS"
                rows={[
                  { label: "Fecha publicación m-2", value: "—" },
                  { label: "Fecha publicación m-7", value: "—" },
                  { label: "Fecha límite respuesta de objeciones", value: "—" },
                  { label: "Fecha publicación m-11", value: "—" },
                  { label: "Fecha publicación art.15", value: "—" },
                ]}
                minHeightClassName="min-h-[150px]"
              />

              <DashboardMiniCard title="ALERTAS" minHeightClassName="min-h-[180px]">
                <DashboardPlaceholderBox heightClassName="min-h-[120px]" />
              </DashboardMiniCard>

              <DashboardMiniCard title="PÉRDIDAS" minHeightClassName="min-h-[180px]">
                <DashboardPlaceholderBox heightClassName="min-h-[120px]" />
              </DashboardMiniCard>
            </div>
          </div>
        </div>

        <div className="ui-panel overflow-hidden p-0">
          <div
            className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{
              background: "var(--btn-secondary-bg)",
              color: "#ffffff",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            ENERGÍA FACTURADA VS. REE VS. PF
          </div>

          <div className="min-h-[320px] px-4 py-4">
            <DashboardEnergyComparisonChart
              loading={chartLoading}
              error={chartError}
              points={chartData?.series ?? []}
            />
          </div>
        </div>

        {!isLogged && (
          <div className="ui-alert ui-alert--danger">
            Inicia sesión para ver datos reales en el dashboard.
          </div>
        )}
      </div>
    </section>
  );
}