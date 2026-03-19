"use client";

import React from "react";
import {
  Area,
  AreaChart,
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

export type DashboardLossesTrendPoint = {
  mes: number;
  mes_label: string;
  perdidas_e_facturada_pct: number;
};

type DashboardLossesTrendChartProps = {
  loading: boolean;
  error: string | null;
  points: DashboardLossesTrendPoint[];
};

const LEGEND_ITEMS: DashboardLegendItem[] = [
  {
    key: "perdidas_e_facturada_pct",
    label: "PÉRDIDAS E FACTURADA (%)",
    color: "#f5b341",
    type: "line",
  },
];

function tooltipFormatter(value: unknown): [string, string] {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return [
    `${formatNumberEs(Number.isNaN(numericValue) ? null : numericValue, 2)} %`,
    "Pérdidas e facturada (%)",
  ];
}

export default function DashboardLossesTrendChart({
  loading,
  error,
  points,
}: DashboardLossesTrendChartProps) {
  const hasData = points.length > 0;

  return (
    <DashboardChartState loading={loading} error={error} hasData={hasData}>
      <div className="mt-2 p-0">
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <Tooltip
                formatter={tooltipFormatter}
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
                dataKey="mes"
                type="number"
                domain={[1, 12]}
                allowDecimals={false}
                tickCount={12}
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

              <Area
                type="monotone"
                dataKey="perdidas_e_facturada_pct"
                stroke="#f5b341"
                fill="#f5b341"
                fillOpacity={0.18}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <DashboardChartLegend items={LEGEND_ITEMS} centered />
      </div>
    </DashboardChartState>
  );
}