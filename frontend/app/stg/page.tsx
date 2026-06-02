// app/stg/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Página raíz del módulo STG. Solo redirige al dashboard.
 */
export default function StgRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/stg/dashboard");
  }, [router]);

  return (
    <div style={{ padding: 24, color: "var(--ds-text-secondary, #888780)" }}>
      Cargando STG…
    </div>
  );
}
