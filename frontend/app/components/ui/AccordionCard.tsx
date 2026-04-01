// app/components/ui/AccordionCard.tsx
"use client";

import React, { useId, useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

// ← CAMBIO Paso 5b: patrón antiguo (ui-card + flecha ▾) → ui-collapsible-card estándar.
// AdminTenantsSection, AdminEmpresasSection y AdminUsersSection se actualizan solos
// sin tocar ninguno de esos ficheros.
export default function AccordionCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const contentId = useId();

  return (
    <section className="ui-collapsible-card">
      <button
        type="button"
        className="ui-collapsible-card__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <div className="min-w-0">
          <div className="ui-collapsible-card__title">{title}</div>
          {subtitle ? (
            <p className="ui-collapsible-card__subtitle">{subtitle}</p>
          ) : null}
        </div>
        <span className="ui-btn ui-btn-ghost ui-btn-xs flex-shrink-0">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>

      {open && (
        <div id={contentId} className="ui-collapsible-card__body">
          {children}
        </div>
      )}
    </section>
  );
}
