"use client";

import React from "react";

export type DashboardChartStateProps = {
  loading: boolean;
  error: string | null;
  hasData: boolean;
  loadingText?: string;
  emptyText?: string;
  children: React.ReactNode;
};

export default function DashboardChartState({
  loading,
  error,
  hasData,
  loadingText = "Cargando gráfica...",
  emptyText = "Sin datos para la gráfica",
  children,
}: DashboardChartStateProps) {
  if (loading) {
    return (
      <div
        className="mt-4 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed text-[11px] ui-muted"
        style={{
          borderColor: "var(--card-border)",
          background: "var(--main-bg)",
        }}
      >
        {loadingText}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mt-4 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-[11px]"
        style={{
          borderColor: "var(--card-border)",
          background: "var(--main-bg)",
          color: "var(--danger, #ef4444)",
        }}
      >
        {error}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div
        className="mt-4 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed text-[11px] ui-muted"
        style={{
          borderColor: "var(--card-border)",
          background: "var(--main-bg)",
        }}
      >
        {emptyText}
      </div>
    );
  }

  return <>{children}</>;
}
