// app/components/Login-section.tsx
"use client";

import { useState } from "react";
import { API_BASE_URL } from "../apiConfig";
import type { User } from "../types";

type LoginProps = {
  token: string | null;
  setToken: (t: string | null) => void;
  // usuario actual solo para mostrar info (lo gestiona page.tsx)
  currentUser: User | null;
};

function friendlyLoginError(status?: number) {
  if (!status) return "No se pudo conectar con la API. Revisa red/URL.";
  if (status === 401) return "Credenciales incorrectas (usuario o contraseña).";
  if (status === 403) return "Acceso denegado.";
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo en unos segundos.";
  return `Acceso fallido (HTTP ${status}).`;
}

export default function LoginSection({ token, setToken, currentUser }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogged = !!token;

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const body = new URLSearchParams();
      body.append("username", email);
      body.append("password", password);

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        let detail: string | null = null;
        try {
          const maybeJson = await res.json();
          if (maybeJson && typeof maybeJson === "object") {
            const d = (maybeJson as any).detail;
            if (typeof d === "string") detail = d;
          }
        } catch {}

        setError(
          detail
            ? `${friendlyLoginError(res.status)} (${detail})`
            : friendlyLoginError(res.status)
        );
        setToken(null);
        return;
      }

      const json = await res.json();
      const accessToken = json.access_token as string;

      setToken(accessToken);
      setError(null);
    } catch (err: any) {
      console.error("Error login:", err);
      setError("No se pudo conectar con la API. Revisa la URL o que el backend esté levantado.");
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setError(null);
    setToken(null);
    // opcional: limpiar campos
    setPassword("");
  };

  return (
    <section className="ui-card text-sm">
      {/* HEADER (NO desplegable) */}
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="ui-card-title">Acceso</h3>
          <p className="ui-card-subtitle">
            Inicia sesión para acceder al panel y gestionar la información.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={["ui-btn ui-btn-xs", isLogged ? "ui-btn-outline" : "ui-btn-danger"].join(" ")}>
            {isLogged ? "Con sesión" : "Sin sesión"}
          </span>

          {isLogged ? (
            <button
              type="button"
              onClick={handleLogout}
              className="ui-btn ui-btn-outline rounded-lg"
              title="Cerrar sesión"
            >
              Cerrar sesión
            </button>
          ) : null}
        </div>
      </header>

      {/* Error */}
      {error && <div className="ui-alert ui-alert--danger mb-4">{error}</div>}

      {/* Form */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="ui-label">Usuario (email)</label>
          <input
            className="ui-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@empresa.com"
            autoComplete="username"
            disabled={isLogged}
          />
          {isLogged && <p className="ui-help">Ya hay una sesión activa.</p>}
        </div>

        <div>
          <label className="ui-label">Contraseña</label>
          <input
            type="password"
            className="ui-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Introduce tu contraseña"
            autoComplete="current-password"
            disabled={isLogged}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLogged && !loading) {
                e.preventDefault();
                handleLogin();
              }
            }}
          />
        </div>
      </div>

      {!isLogged && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="ui-btn ui-btn-secondary w-full justify-center rounded-lg"
          >
            {loading ? "Accediendo..." : "Entrar"}
          </button>
        </div>
      )}

      {/* Info técnica + perfil */}
      <div className="mt-4 space-y-1 text-xs ui-muted">
        <div>
          Servidor API:{" "}
          <span className="font-mono text-[11px] ui-muted">{API_BASE_URL}</span>
        </div>

        <div>
          Estado de sesión:{" "}
          {isLogged ? (
            <span className="font-mono text-[11px]" style={{ color: "var(--field-border-focus)" }}>
              OK
            </span>
          ) : (
            <span style={{ color: "var(--danger-text)" }}>no iniciada</span>
          )}
        </div>

        <div className="mt-2 ui-divider pt-2">
          <div className="mb-1 text-[11px] font-semibold ui-muted">Perfil actual</div>

          {currentUser ? (
            <div className="space-y-0.5 text-[11px]" style={{ color: "var(--text)" }}>
              <div>
                Email: <span className="font-mono text-[11px]">{currentUser.email}</span>
              </div>
              <div>
                Tenant ID: <span className="font-mono text-[11px]">{currentUser.tenant_id}</span>
              </div>
              <div>
                Rol: <span className="font-mono text-[11px]">{currentUser.rol}</span>
              </div>
              <div>
                Activo:{" "}
                <span className="font-mono text-[11px]">{currentUser.is_active ? "Sí" : "No"}</span>
              </div>
              <div>
                Superusuario:{" "}
                <span
                  className="font-mono text-[11px]"
                  style={{
                    color: currentUser.is_superuser ? "var(--field-border-focus)" : "var(--text-muted)",
                  }}
                >
                  {currentUser.is_superuser ? "Sí ✅" : "No"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] ui-muted">Aún no se han cargado los datos del usuario.</div>
          )}
        </div>
      </div>
    </section>
  );
}