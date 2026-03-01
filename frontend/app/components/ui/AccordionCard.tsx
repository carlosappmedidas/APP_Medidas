// app/components/ui/AccordionCard.tsx
"use client";

import React, { useId, useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export default function AccordionCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const contentId = useId();

  return (
    <section className="ui-card text-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mb-3 flex w-full cursor-pointer flex-col gap-2 text-left md:flex-row md:items-center md:justify-between"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <div className="min-w-0">
          <h4 className="ui-card-title">{title}</h4>
          {subtitle ? <p className="ui-card-subtitle">{subtitle}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] ui-muted">{open ? "Ocultar" : "Mostrar"}</span>

          {/* Flecha unificada (misma que en Ajustes / Sistema) */}
          <span
            className={[
              "inline-flex items-center justify-center text-[13px] ui-muted transition-transform",
              open ? "rotate-180" : "rotate-0",
            ].join(" ")}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
      </button>

      {open && <div id={contentId}>{children}</div>}
    </section>
  );
}