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
  fromPct: number | null;
  fromPfKwh: number | null;  // ✅ NUEVO
  toLabel: string;
  toKwh: number | null;
  toPct: number | null;
  toPfKwh: number | null;    // ✅ NUEVO
  toPfLabel: string;         // ✅ NUEVO — etiqueta del PF de la ventana destino
};

type Props = {
  data: LossesConsistencyResponse | null;
  loading: boolean;
  error: string | null;
};

export default function LossesConsistencyCard({ data, loading, error }: Props) {
  const [tooltip, setTooltip] = useState<{ row: RowData; y: number } | null>(null);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] ui-muted">
        Cargando...
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-[11px]" style={{ color: "#ef4444" }}>
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-[11px] ui-muted">Sin datos</div>;
  }

  const { ventanas, comparaciones } = data;

  const rows: RowData[] = [
    {
      label: "m-1 vs m-2",
      diff: comparaciones.m1_vs_m2,
      fromLabel: "E NETA FACTURADA",
      fromKwh: ventanas.m1.kwh,
      fromPct: ventanas.m1.perdidas_pct,
      fromPfKwh: ventanas.m1.pf_kwh,
      toLabel: "E PUBL M2",
      toKwh: ventanas.m2.kwh,
      toPct: ventanas.m2.perdidas_pct,
      toPfKwh: ventanas.m2.pf_kwh,
      toPfLabel: "E PF M2",
    },
    {
      label: "m-2 vs m-7",
      diff: comparaciones.m2_vs_m7,
      fromLabel: "E PUBL M2",
      fromKwh: ventanas.m2.kwh,
      fromPct: ventanas.m2.perdidas_pct,
      fromPfKwh: ventanas.m2.pf_kwh,
      toLabel: "E PUBL M7",
      toKwh: ventanas.m7.kwh,
      toPct: ventanas.m7.perdidas_pct,
      toPfKwh: ventanas.m7.pf_kwh,
      toPfLabel: "E PF M7",
    },
    {
      label: "m-7 vs m-11",
      diff: comparaciones.m7_vs_m11,
      fromLabel: "E PUBL M7",
      fromKwh: ventanas.m7.kwh,
      fromPct: ventanas.m7.perdidas_pct,
      fromPfKwh: ventanas.m7.pf_kwh,
      toLabel: "E PUBL M11",
      toKwh: ventanas.m11.kwh,
      toPct: ventanas.m11.perdidas_pct,
      toPfKwh: ventanas.m11.pf_kwh,
      toPfLabel: "E PF M11",
    },
    {
      label: "m-11 vs Art15",
      diff: comparaciones.m11_vs_art15,
      fromLabel: "E PUBL M11",
      fromKwh: ventanas.m11.kwh,
      fromPct: ventanas.m11.perdidas_pct,
      fromPfKwh: ventanas.m11.pf_kwh,
      toLabel: "E PUBL ART15",
      toKwh: ventanas.art15.kwh,
      toPct: ventanas.art15.perdidas_pct,
      toPfKwh: ventanas.art15.pf_kwh,
      toPfLabel: "E PF ART15",
    },
  ];

  return (
    <div className="w-full space-y-1">
      {rows.map((row) => {
        const color = getArrowColor(row.diff);
        const arrow = row.diff === null ? null : row.diff >= 0 ? "▲" : "▼";
        return (
          <div
            key={row.label}
            className="flex cursor-default items-center justify-between gap-2 rounded-lg px-3 py-2 text-[11px]"
            style={{
              background: "var(--panel-bg, rgba(255,255,255,0.04))",
              border: "1px solid var(--card-border)",
            }}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTooltip({ row, y: rect.bottom });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="ui-muted min-w-[90px]">{row.label}</span>
            <span className="font-semibold tabular-nums" style={{ color }}>
              {formatPct(row.diff)}
            </span>
            {arrow ? (
              <span style={{ color, fontWeight: 700, fontSize: "0.85rem" }}>
                {arrow}
              </span>
            ) : (
              <span className="ui-muted text-[11px]">—</span>
            )}
          </div>
        );
      })}

      {/* Tooltip único fixed */}
      {tooltip && (
        <div
          className="fixed z-50 w-[280px] rounded-xl border px-4 py-3 shadow-xl text-[11px]"
          style={{
            top: tooltip.y + 6,
            right: 16,
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
            color: "var(--text)",
          }}
          onMouseEnter={() => setTooltip(null)}
        >
          <div className="mb-2 font-semibold">{tooltip.row.label}</div>
          <div className="space-y-1.5">

            {/* FROM */}
            <div className="flex justify-between gap-4">
              <span className="ui-muted">{tooltip.row.fromLabel} kWh</span>
              <span className="font-semibold">{formatKwh(tooltip.row.fromKwh)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="ui-muted">{tooltip.row.fromLabel} % pérd.</span>
              <span className="font-semibold">{formatPctVal(tooltip.row.fromPct)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="ui-muted">E PF FINAL kWh</span>
              <span className="font-semibold">{formatKwh(tooltip.row.fromPfKwh)}</span>
            </div>

            <div className="my-1 border-t" style={{ borderColor: "var(--card-border)" }} />

            {/* TO */}
            <div className="flex justify-between gap-4">
              <span className="ui-muted">{tooltip.row.toLabel} kWh</span>
              <span className="font-semibold">{formatKwh(tooltip.row.toKwh)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="ui-muted">{tooltip.row.toLabel} % pérd.</span>
              <span className="font-semibold">{formatPctVal(tooltip.row.toPct)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="ui-muted">{tooltip.row.toPfLabel} kWh</span>
              <span className="font-semibold">{formatKwh(tooltip.row.toPfKwh)}</span>
            </div>

            <div className="my-1 border-t" style={{ borderColor: "var(--card-border)" }} />

            {/* DIFERENCIA */}
            <div className="flex justify-between gap-4">
              <span className="ui-muted">Diferencia</span>
              <span
                className="font-semibold"
                style={{ color: getArrowColor(tooltip.row.diff) }}
              >
                {formatPct(tooltip.row.diff)}
              </span>
            </div>
          </div>

          <div className="mt-2 flex gap-3 text-[10px] ui-muted">
            <span style={{ color: "#ef4444" }}>&lt;-3pp</span>
            <span style={{ color: "#f59e0b" }}>-3 a -1pp</span>
            <span style={{ color: "#22c55e" }}>-1 a +5pp</span>
            <span style={{ color: "#f59e0b" }}>+5 a +7pp</span>
            <span style={{ color: "#ef4444" }}>&gt;+7pp</span>
          </div>
        </div>
      )}
    </div>
  );
}