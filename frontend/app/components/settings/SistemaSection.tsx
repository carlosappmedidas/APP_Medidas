// app/components/SistemaSection.tsx
"use client";

import React from "react";
import MedidasPsSection      from "../medidas/MedidasPsSection";
import MedidasGeneralSection from "../medidas/MedidasGeneralSection";
// ← CAMBIO: eliminar SistemaAccordion propio — usar AccordionCard estándar
import AccordionCard from "../ui/AccordionCard";

type Props = { token: string | null };

export default function SistemaSection({ token }: Props) {
  return (
    <div className="space-y-6">
      <AccordionCard
        title="Medidas (PS) · Sistema"
        subtitle="Vista global para todos los clientes. Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasPsSection token={token} scope="all" />
      </AccordionCard>

      <AccordionCard
        title="Medidas (General) · Sistema"
        subtitle="Vista global para todos los clientes. Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasGeneralSection token={token} scope="all" />
      </AccordionCard>
    </div>
  );
}
