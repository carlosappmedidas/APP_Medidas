"use client";

import React, { useEffect, useMemo, useState } from "react";
import EmpresasSection from "./EmpresasSection";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { useDashboardFilters } from "./hooks/useDashboardFilters";

type Props = {
  token: string | null;
};

type MiniCardRow = {
  label: string;
  value: string;
};

type MiniCardProps = {
  title: string;
  rows: MiniCardRow[];
  helpText?: string;
  centered?: boolean;
  tooltipTitle?: string;
  tooltipRows?: MiniCardRow[];
};

function DashboardMiniCard({
  title,
  rows,
  helpText,
  centered = false,
  tooltipTitle,
  tooltipRows = [],
}: MiniCardProps) {
  const hasTooltip = Boolean(tooltipTitle && tooltipRows.length > 0);

  return (
    <div className="group relative ui-panel h-full overflow-visible p-0">
      <div
        className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.04em]"
        style={{
          background: "var(--btn-secondary-bg)",
          color: "#ffffff",
          borderBottom: "1px solid var(--card-border)",
        }}
      >
        {title}
      </div>

      <div
        className={[
          "px-4 py-5",
          centered ? "flex min-h-[146px] flex-col items-center justify-center text-center" : "",
        ].join(" ")}
      >
        <div className={centered ? "w-full space-y-3" : "space-y-2"}>
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className={
                centered
                  ? "flex flex-col items-center justify-center gap-2"
                  : "flex items-start justify-between gap-3 text-[11px]"
              }
            >
              {row.label ? (
                <span className={centered ? "text-[11px] ui-muted" : "ui-muted"}>
                  {row.label}
                </span>
              ) : null}

              <span
                className={
                  centered
                    ? "max-w-full text-center text-[18px] font-semibold leading-snug md:text-[20px]"
                    : "text-right font-semibold"
                }
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {helpText ? (
          <div className="mt-3 text-[10px] leading-relaxed ui-muted">{helpText}</div>
        ) : null}
      </div>

      {hasTooltip ? (
        <div
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-[320px] max-w-[92vw] -translate-x-1/2 rounded-xl border px-4 py-3 shadow-lg group-hover:block"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
            color: "var(--text)",
          }}
        >
          <div className="mb-3 text-[11px] font-semibold">{tooltipTitle}</div>

          <div className="space-y-2">
            {tooltipRows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                className="flex items-start justify-between gap-4 text-[11px]"
              >
                <span className="ui-muted">{row.label}</span>
                <span className="max-w-[190px] text-right font-semibold leading-snug">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatNumberEs(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";

  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatSignedNumberEs(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumberEs(value, decimals)}`;
}

function formatKwhEur(
  kwh: number | null | undefined,
  eur: number | null | undefined
): string {
  return `${formatNumberEs(kwh, 2)} kWh / ${formatNumberEs(eur, 2)} €`;
}

function formatKwhOnly(value: number | null | undefined): string {
  return `${formatNumberEs(value, 2)} kWh`;
}

function formatMonthYear(
  anio: number | null | undefined,
  mes: number | null | undefined
): string {
  if (!anio || !mes) return "—";
  return `${String(mes).padStart(2, "0")}/${anio}`;
}

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
            className={[
              "ui-btn ui-btn-xs",
              isLogged ? "ui-btn-outline" : "ui-btn-danger",
            ].join(" ")}
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

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <DashboardMiniCard
            title={energiaCardTitle}
            centered
            rows={[{ label: "", value: energiaFacturadaTotal }]}
            tooltipTitle={variationTooltipTitle}
            tooltipRows={[
              { label: "kWh", value: energiaFacturadaVariationKwh },
              { label: "€", value: energiaFacturadaVariationEur },
            ]}
          />

          <DashboardMiniCard
            title={perdidasCardTitle}
            centered
            rows={[{ label: "", value: perdidasTotal }]}
            tooltipTitle={variationTooltipTitle}
            tooltipRows={[{ label: "kWh", value: perdidasVariation }]}
          />

          <DashboardMiniCard
            title="OBJECIONES"
            rows={[
              { label: "Total activas", value: "—" },
              { label: "Total respondidas en plazo", value: "—" },
              { label: "Total respondidas fuera plazo", value: "—" },
            ]}
            helpText="Al pasar el ratón por encima se abre ventana flotante con la info por empresa."
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
          />
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

          <div className="min-h-[260px] px-4 py-4">
            <div className="text-[11px] font-semibold">(Gráfica de comparativas en totales)</div>
            <div className="mt-1 text-[11px] ui-muted">
              Abre en otra ventana con las gráficas por empresa.
            </div>

            <div
              className="mt-4 flex min-h-[180px] items-center justify-center rounded-lg border border-dashed text-[11px] ui-muted"
              style={{
                borderColor: "var(--card-border)",
                background: "var(--main-bg)",
              }}
            >
              Placeholder de gráfica
            </div>
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