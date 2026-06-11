// app/login/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginSection from "../components/auth/Login-section";
import type { User } from "../types";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY); } catch { return null; }
  });
  const [currentUser] = useState<User | null>(null);

  // Si el token está/queda seteado (tras login exitoso) → redirigir al selector
  useEffect(() => {
    if (token) {
      router.replace("/");
    }
  }, [token, router]);

  return (
    <div className="ui-login-shell">
      <div className="ui-login-panel">
        <div className="ui-login-brand mb-4 text-center">
          <h1 className="text-xl font-semibold">APP Medidas</h1>
          <p className="mt-1 text-xs ui-muted">
            Plataforma de gestión y análisis de medidas
          </p>
        </div>
        <LoginSection token={token} setToken={setToken} currentUser={currentUser} />
        <p className="mt-4 text-center text-[11px] ui-muted">
          Acceso restringido · Introduce tus credenciales para continuar.
        </p>
      </div>
    </div>
  );
}