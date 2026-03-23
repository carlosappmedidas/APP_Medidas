"use client";

import React, { useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export default function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div>
          <div className="ui-card-title text-base md:text-lg">{title}</div>
          {subtitle ? <p className="ui-card-subtitle mt-1">{subtitle}</p> : null}
        </div>

        <span className="ui-btn ui-btn-ghost ui-btn-xs">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>

      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}