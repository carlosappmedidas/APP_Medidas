"use client";

import React, { useState } from "react";
import type { LossesConsistencyResponse } from "../hooks/useDashboardLossesConsistency";

function getArrowColor(diff: number | null): string {
  if (diff === null) return "#888";
  if (diff < -3) return "#ef4444";
  if (diff < -1) return "#f59e0b";
  if (diff <= 5) return "#22c55e";
  if (diff <= 7) return "#f59e0b";
  return "#ef4444";
}

function formatPct(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return sign + v.toFixed(2) + " pp";
}

function formatKwh(v: number | null): string {
  if (v === null) return "—";
  return (
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v) + " kWh"
  );
}

function formatPctVal(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(4) + " %";
}

type RowData = {
  label: string;
  diff: number | null;

  fromLabel: string;
  fromKwh: number | null;
  fromLossesKwh: number | null;
  fromPct: number | null;
  fromPfKwh: number | null;
  fromPfLabel: string;

  toLabel: string;
  toKwh: number | null;
  toLossesKwh: number | null;
  toPct: number | null;
  toPfKwh: number | null;
  toPfLabel: string;
};

type Props = {
  data: LossesConsistencyResponse | null;
  loading: boolean;
  error: string | null;
};

function getLossesLabel(
  label: string,
  isFrom: boolean,
  rowLabel: string
): string {
  if (isFrom && rowLabel === "m-1 vs m-2") {
    return "Pérdidas E facturada";
  }

  if (label === "E NETA M2") return "Pérdidas M2";
  if (label === "E NETA M7") return "Pérdidas M7";
  if (label === "E NETA M11") return "Pérdidas M11";
  if (label === "E NETA ART15") return "Pérdidas ART15";

  return "Pérdidas";
}

export default function LossesConsistencyCard({
  data,
  loading,
  error,
}: Props) {
  const [tooltip, setTooltip] = useState<{ row: RowData; y: number } | null>(
    null
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-white/70">
        Cargando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-[#111827] p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-white/70">
        Sin datos
      </div>
    );
  }

  const { ventanas, comparaciones } = data;

  const rows: RowData[] = [
    {
      label: "m-1 vs m-2",
      diff: comparaciones.m1_vs_m2,

      fromLabel: "E NETA FACTURADA",
      fromKwh: ventanas.m1.kwh,
      fromLossesKwh: ventanas.m1.perdidas_kwh,
      fromPct: ventanas.m1.perdidas_pct,
      fromPfKwh: ventanas.m1.pf_kwh,
      fromPfLabel: "E PF FINAL",

      toLabel: "E NETA M2",
      toKwh: ventanas.m2.kwh,
      toLossesKwh: ventanas.m2.perdidas_kwh,
      toPct: ventanas.m2.perdidas_pct,
      toPfKwh: ventanas.m2.pf_kwh,
      toPfLabel: "E PF M2",
    },
    {
      label: "m-2 vs m-7",
      diff: comparaciones.m2_vs_m7,

      fromLabel: "E NETA M2",
      fromKwh: ventanas.m2.kwh,
      fromLossesKwh: ventanas.m2.perdidas_kwh,
      fromPct: ventanas.m2.perdidas_pct,
      fromPfKwh: ventanas.m2.pf_kwh,
      fromPfLabel: "E PF M2",

      toLabel: "E NETA M7",
      toKwh: ventanas.m7.kwh,
      toLossesKwh: ventanas.m7.perdidas_kwh,
      toPct: ventanas.m7.perdidas_pct,
      toPfKwh: ventanas.m7.pf_kwh,
      toPfLabel: "E PF M7",
    },
    {
      label: "m-7 vs m-11",
      diff: comparaciones.m7_vs_m11,

      fromLabel: "E NETA M7",
      fromKwh: ventanas.m7.kwh,
      fromLossesKwh: ventanas.m7.perdidas_kwh,
      fromPct: ventanas.m7.perdidas_pct,
      fromPfKwh: ventanas.m7.pf_kwh,
      fromPfLabel: "E PF M7",

      toLabel: "E NETA M11",
      toKwh: ventanas.m11.kwh,
      toLossesKwh: ventanas.m11.perdidas_kwh,
      toPct: ventanas.m11.perdidas_pct,
      toPfKwh: ventanas.m11.pf_kwh,
      toPfLabel: "E PF M11",
    },
    {
      label: "m-11 vs Art15",
      diff: comparaciones.m11_vs_art15,

      fromLabel: "E NETA M11",
      fromKwh: ventanas.m11.kwh,
      fromLossesKwh: ventanas.m11.perdidas_kwh,
      fromPct: ventanas.m11.perdidas_pct,
      fromPfKwh: ventanas.m11.pf_kwh,
      fromPfLabel: "E PF M11",

      toLabel: "E NETA ART15",
      toKwh: ventanas.art15.kwh,
      toLossesKwh: ventanas.art15.perdidas_kwh,
      toPct: ventanas.art15.perdidas_pct,
      toPfKwh: ventanas.art15.pf_kwh,
      toPfLabel: "E PF ART15",
    },
  ];

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-[#111827] p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-white">
            Consistencia de pérdidas
          </h3>
          <p className="text-xs text-white/50">
            Comparativa secuencial entre publicaciones
          </p>
        </div>

        <div className="space-y-2">
          {rows.map((row) => {
            const color = getArrowColor(row.diff);
            const arrow = row.diff === null ? null : row.diff >= 0 ? "▲" : "▼";

            return (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.05]"
                onMouseEnter={(e) => {
                  const rect = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  setTooltip({ row, y: rect.bottom });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <span className="text-sm font-medium text-white/80">
                  {row.label}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color }}>
                    {formatPct(row.diff)}
                  </span>

                  {arrow ? (
                    <span className="text-sm" style={{ color }}>
                      {arrow}
                    </span>
                  ) : (
                    <span className="text-sm text-white/40">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed left-1/2 z-[9999] w-[380px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0B1220] p-4 text-sm text-white shadow-2xl"
          style={{ top: tooltip.y + 8 }}
          onMouseEnter={() => setTooltip(tooltip)}
          onMouseLeave={() => setTooltip(null)}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">
              {tooltip.row.label}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between gap-4">
              <span>{tooltip.row.fromLabel}</span>
              <span>{formatKwh(tooltip.row.fromKwh)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span>{tooltip.row.fromPfLabel}</span>
              <span>{formatKwh(tooltip.row.fromPfKwh)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span>
                {getLossesLabel(
                  tooltip.row.fromLabel,
                  true,
                  tooltip.row.label
                )}{" "}
                (kWh)
              </span>
              <span>{formatKwh(tooltip.row.fromLossesKwh)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span>
                {getLossesLabel(
                  tooltip.row.fromLabel,
                  true,
                  tooltip.row.label
                )}{" "}
                (%)
              </span>
              <span>{formatPctVal(tooltip.row.fromPct)}</span>
            </div>

            <hr className="my-3 border-white/10" />

            <div className="flex justify-between gap-4">
              <span>{tooltip.row.toLabel}</span>
              <span>{formatKwh(tooltip.row.toKwh)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span>{tooltip.row.toPfLabel}</span>
              <span>{formatKwh(tooltip.row.toPfKwh)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span>
                {getLossesLabel(
                  tooltip.row.toLabel,
                  false,
                  tooltip.row.label
                )}{" "}
                (kWh)
              </span>
              <span>{formatKwh(tooltip.row.toLossesKwh)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span>
                {getLossesLabel(
                  tooltip.row.toLabel,
                  false,
                  tooltip.row.label
                )}{" "}
                (%)
              </span>
              <span>{formatPctVal(tooltip.row.toPct)}</span>
            </div>

            <hr className="my-3 border-white/10" />

            <div className="flex justify-between gap-4 font-semibold">
              <span>Diferencia</span>
              <span>{formatPct(tooltip.row.diff)}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-1 text-center text-[10px] text-white/45">
            <span>&lt;-3pp</span>
            <span>-3 a -1pp</span>
            <span>-1 a +5pp</span>
            <span>+5 a +7pp</span>
            <span>&gt;+7pp</span>
          </div>
        </div>
      )}
    </>
  );
}