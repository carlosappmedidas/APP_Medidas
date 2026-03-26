"use client";

import React, { useEffect, useState } from "react";
import {
  Bar,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardChartLegend, {
  type DashboardLegendItem,
} from "./DashboardChartLegend";
import DashboardChartState from "./DashboardChartState";
import { formatNumberEs } from "../formatters";

export type DashboardEnergyComparisonPoint = {
  mes: number;
  mes_label: string;
  energia_bruta_facturada: number;
  energia_publicada_m2_kwh: number;
  energia_publicada_m7_kwh: number;
  energia_publicada_m11_kwh: number;
  energia_publicada_art15_kwh: number;
  energia_pf_final_kwh: number;
  pf_source: string;
  pf_label: string;
};

type DashboardEnergyComparisonChartProps = {
  loading: boolean;
  error: string | null;
  points: DashboardEnergyComparisonPoint[];
};

type CustomTooltipEntry = {
  dataKey?: unknown;
  value?: unknown;
  payload?: DashboardEnergyComparisonPoint;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: CustomTooltipEntry[];
  label?: string | number;
};

const LEGEND_ITEMS: DashboardLegendItem[] = [
  {
    key: "energia_bruta_facturada",
    label: "E BRUTA FACTURADA",
    color: "#9fd3ff",
    type: "bar",
  },
  {
    key: "energia_publicada_m2_kwh",
    label: "E PUBL M2",
    color: "#6fb6f1",
    type: "bar",
  },
  {
    key: "energia_publicada_m7_kwh",
    label: "E PUBL M7",
    color: "#4d94d6",
    type: "bar",
  },
  {
    key: "energia_publicada_m11_kwh",
    label: "E PUBL M11",
    color: "#3f6fae",
    type: "bar",
  },
  {
    key: "energia_publicada_art15_kwh",
    label: "E PUBL ART15",
    color: "#2f4f85",
    type: "bar",
  },
  {
    key: "energia_pf_final_kwh",
    label: "E PF JERARQUÍA",
    color: "#d8a2da",
    type: "line",
  },
];

const TOOLTIP_LABEL_MAP: Record<string, string> = {
  energia_bruta_facturada: "Facturada",
  energia_publicada_m2_kwh: "M2",
  energia_publicada_m7_kwh: "M7",
  energia_publicada_m11_kwh: "M11",
  energia_publicada_art15_kwh: "ART15",
};

const TOOLTIP_ORDER: Record<string, number> = {
  energia_bruta_facturada: 1,
  energia_publicada_m2_kwh: 2,
  energia_publicada_m7_kwh: 3,
  energia_publicada_m11_kwh: 4,
  energia_publicada_art15_kwh: 5,
  energia_pf_final_kwh: 6,
};

function getTooltipDataKey(dataKey: unknown): string {
  if (typeof dataKey === "string") return dataKey;
  if (typeof dataKey === "number") return String(dataKey);
  return "";
}

function getTooltipNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const sortedPayload = [...payload].sort((a, b) => {
    const keyA = getTooltipDataKey(a.dataKey);
    const keyB = getTooltipDataKey(b.dataKey);
    return (TOOLTIP_ORDER[keyA] ?? 999) - (TOOLTIP_ORDER[keyB] ?? 999);
  });

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: 12,
        color: "var(--text)",
        fontSize: 11,
        padding: "10px 12px",
      }}
    >
      <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 6 }}>
        {label ?? ""}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sortedPayload.map((entry, index) => {
          const dataKey = getTooltipDataKey(entry.dataKey);
          const point = entry.payload;
          const numericValue = getTooltipNumericValue(entry.value);

          const resolvedLabel =
            dataKey === "energia_pf_final_kwh"
              ? (point?.pf_label ?? "PF FINAL")
              : (TOOLTIP_LABEL_MAP[dataKey] ?? dataKey);

          return (
            <div
              key={`${dataKey}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>{resolvedLabel}</span>
              <span>
                {formatNumberEs(numericValue, 2)}
                {" kWh"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardEnergyComparisonChart({
  loading,
  error,
  points,
}: DashboardEnergyComparisonChartProps) {
  const hasData = points.length > 0;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) {
    return (
      <DashboardChartState loading={loading} error={error} hasData={hasData}>
        <div className="mt-4 p-0">
          <div className="h-[280px] w-full" />
        </div>
      </DashboardChartState>
    );
  }

  return (
    <DashboardChartState loading={loading} error={error} hasData={hasData}>
      <div className="mt-4 p-0">
        <div className="h-[280px] w-full">
          <ComposedChart
            responsive
            style={{ width: "100%", height: "100%" }}
            data={points}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            barCategoryGap="28%"
            barGap={2}
          >
            <Tooltip content={<CustomTooltip />} />

            <XAxis
              dataKey="mes_label"
              tick={{ fontSize: 11, fill: "var(--text)" }}
              axisLine={{ stroke: "var(--card-border)" }}
              tickLine={false}
            />

            <YAxis
              tick={false}
              axisLine={false}
              tickLine={false}
              width={0}
            />

            <Bar
              dataKey="energia_bruta_facturada"
              fill="#9fd3ff"
              barSize={8}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="energia_publicada_m2_kwh"
              fill="#6fb6f1"
              barSize={8}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="energia_publicada_m7_kwh"
              fill="#4d94d6"
              barSize={8}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="energia_publicada_m11_kwh"
              fill="#3f6fae"
              barSize={8}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="energia_publicada_art15_kwh"
              fill="#2f4f85"
              barSize={8}
              radius={[2, 2, 0, 0]}
            />

            <Line
              type="monotone"
              dataKey="energia_pf_final_kwh"
              stroke="#d8a2da"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </div>

        <DashboardChartLegend items={LEGEND_ITEMS} centered />
      </div>
    </DashboardChartState>
  );
}