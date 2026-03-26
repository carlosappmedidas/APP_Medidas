"use client";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardChartLegend, {
  type DashboardLegendItem,
} from "./DashboardChartLegend";
import DashboardChartState from "./DashboardChartState";
import { formatNumberEs } from "../formatters";

export type DashboardEnergyTrendPoint = {
  mes: number;
  mes_label: string;
  energia_neta_facturada_kwh: number;
};

type DashboardEnergyTrendChartProps = {
  loading: boolean;
  error: string | null;
  points: DashboardEnergyTrendPoint[];
};

const LEGEND_ITEMS: DashboardLegendItem[] = [
  {
    key: "energia_neta_facturada_kwh",
    label: "E NETA FACTURADA",
    color: "#93c5fd",
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
    `${formatNumberEs(Number.isNaN(numericValue) ? null : numericValue, 2)} kWh`,
    "E neta facturada",
  ];
}

export default function DashboardEnergyTrendChart({
  loading,
  error,
  points,
}: DashboardEnergyTrendChartProps) {
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
          <div className="h-[180px] w-full" />
        </div>
      </DashboardChartState>
    );
  }

  return (
    <DashboardChartState loading={loading} error={error} hasData={hasData}>
      <div className="mt-4 p-0">
        <div className="h-[180px] w-full">
          <AreaChart
            responsive
            style={{ width: "100%", height: "100%" }}
            data={points}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
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
              height={30}
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
              dataKey="energia_neta_facturada_kwh"
              stroke="#93c5fd"
              fill="#93c5fd"
              fillOpacity={0.22}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </div>

        <DashboardChartLegend items={LEGEND_ITEMS} centered />
      </div>
    </DashboardChartState>
  );
}