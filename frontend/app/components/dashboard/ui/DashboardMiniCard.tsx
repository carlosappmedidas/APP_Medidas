"use client";

import React from "react";

export type MiniCardRow = {
  label: string;
  value: string;
};

type DashboardMiniCardProps = {
  title: string;
  rows?: MiniCardRow[];
  helpText?: string;
  centered?: boolean;
  tooltipTitle?: string;
  tooltipRows?: MiniCardRow[];
  minHeightClassName?: string;
  children?: React.ReactNode;
};

export default function DashboardMiniCard({
  title,
  rows = [],
  helpText,
  centered = false,
  tooltipTitle,
  tooltipRows = [],
  minHeightClassName = "min-h-[150px]",
  children,
}: DashboardMiniCardProps) {
  const hasTooltip = Boolean(tooltipTitle && tooltipRows.length > 0);

  return (
    <div className="group relative ui-panel h-full overflow-visible p-0">
      <div
        className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.04em]"
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
          "px-4 py-4",
          minHeightClassName,
          centered ? "flex flex-col items-center justify-center text-center" : "",
        ].join(" ")}
      >
        {children ? (
          children
        ) : (
          <>
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
          </>
        )}
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