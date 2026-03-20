// app/components/SistemaSection.tsx
"use client";

import React, { useState } from "react";
import MedidasPsSection from "../medidas/MedidasPsSection";
import MedidasGeneralSection from "../medidas/MedidasGeneralSection";

type Props = {
  token: string | null;
};

// ---------- UI: Desplegable ----------
function SistemaAccordion({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="ui-card ui-card--border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-6 rounded-2xl px-6 py-5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="ui-card-title">{title}</div>
          {subtitle ? <div className="ui-card-subtitle">{subtitle}</div> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] ui-muted">{open ? "Ocultar" : "Mostrar"}</span>
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

      {/* mantener montado (solo ocultar) */}
      <div className={open ? "px-4 pb-4" : "px-4 pb-4 hidden"}>{children}</div>
    </div>
  );
}

export default function SistemaSection({ token }: Props) {
  return (
    <div className="space-y-6">
      <SistemaAccordion
        title="Medidas (PS) · Sistema"
        subtitle="Vista global para todos los clientes. Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasPsSection token={token} scope="all" />
      </SistemaAccordion>

      <SistemaAccordion
        title="Medidas (General) · Sistema"
        subtitle="Vista global para todos los clientes. Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasGeneralSection token={token} scope="all" />
      </SistemaAccordion>
    </div>
  );
}