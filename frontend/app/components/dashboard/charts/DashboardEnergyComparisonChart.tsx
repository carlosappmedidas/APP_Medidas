"use client";

import React from "react";
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
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
  energia_neta_facturada_kwh: number;
  energia_publicada_m2_kwh: number;
  energia_publicada_m7_kwh: number;
  energia_publicada_m11_kwh: number;
  energia_publicada_art15_kwh: number;
  energia_pf_final_kwh: number;
};

type DashboardEnergyComparisonChartProps = {
  loading: boolean;
  error: string | null;
  points: DashboardEnergyComparisonPoint[];
};

const LEGEND_ITEMS: DashboardLegendItem[] = [
  {
    key: "energia_neta_facturada_kwh",
    label: "E NETA FACTURADA",
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
    label: "E PF FINAL",
    color: "#d8a2da",
    type: "line",
  },
];

const TOOLTIP_LABEL_MAP: Record<string, string> = {
  energia_neta_facturada_kwh: "Facturada",
  energia_publicada_m2_kwh: "M2",
  energia_publicada_m7_kwh: "M7",
  energia_publicada_m11_kwh: "M11",
  energia_publicada_art15_kwh: "ART15",
  energia_pf_final_kwh: "PF Final",
};

const TOOLTIP_ORDER: Record<string, number> = {
  energia_neta_facturada_kwh: 1,
  energia_publicada_m2_kwh: 2,
  energia_publicada_m7_kwh: 3,
  energia_publicada_m11_kwh: 4,
  energia_publicada_art15_kwh: 5,
  energia_pf_final_kwh: 6,
};

function tooltipFormatter(value: unknown, name: unknown): [string, string] {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  const safeName = typeof name === "string" ? name : "";

  return [
    `${formatNumberEs(Number.isNaN(numericValue) ? null : numericValue, 2)} kWh`,
    TOOLTIP_LABEL_MAP[safeName] ?? safeName,
  ];
}

export default function DashboardEnergyComparisonChart({
  loading,
  error,
  points,
}: DashboardEnergyComparisonChartProps) {
  const hasData = points.length > 0;

  return (
    <DashboardChartState loading={loading} error={error} hasData={hasData}>
      <div className="mt-4 p-0">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              barCategoryGap="28%"
              barGap={2}
            >
              <Tooltip
                formatter={tooltipFormatter}
                itemSorter={(item) => {
                  const dataKey =
                    typeof item.dataKey === "string"
                      ? item.dataKey
                      : String(item.dataKey ?? "");

                  return TOOLTIP_ORDER[dataKey] ?? 999;
                }}
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 12,
                  color: "var(--text)",
                  fontSize: 11,
                }}
                labelStyle={{ color: "var(--text)", fontWeight: 600 }}
              />

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
                dataKey="energia_neta_facturada_kwh"
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
          </ResponsiveContainer>
        </div>

        <DashboardChartLegend items={LEGEND_ITEMS} centered />
      </div>
    </DashboardChartState>
  );
}