"use client";

import React from "react";

export type DashboardLegendItem = {
  key: string;
  label: string;
  color: string;
  type?: "bar" | "line";
};

type LegendItemProps = {
  color: string;
  label: string;
  isLine?: boolean;
};

function LegendItem({
  color,
  label,
  isLine = false,
}: LegendItemProps) {
  return (
    <div className="flex items-center gap-2 text-[10px] ui-muted">
      {isLine ? (
        <span className="relative inline-block h-[10px] w-[14px] shrink-0">
          <span
            className="absolute left-0 top-1/2 block h-[2px] w-full -translate-y-1/2 rounded-full"
            style={{ background: color }}
          />
          <span
            className="absolute left-1/2 top-1/2 block h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: color }}
          />
        </span>
      ) : (
        <span
          className="inline-block h-[10px] w-[10px] shrink-0 rounded-[2px]"
          style={{ background: color }}
        />
      )}

      <span>{label}</span>
    </div>
  );
}

export type DashboardChartLegendProps = {
  items: DashboardLegendItem[];
  centered?: boolean;
};

export default function DashboardChartLegend({
  items,
  centered = true,
}: DashboardChartLegendProps) {
  return (
    <div
      className={[
        "mt-3 flex flex-wrap items-center gap-x-4 gap-y-2",
        centered ? "justify-center" : "justify-start",
      ].join(" ")}
    >
      {items.map((item) => (
        <LegendItem
          key={item.key}
          color={item.color}
          label={item.label}
          isLine={item.type === "line"}
        />
      ))}
    </div>
  );
}