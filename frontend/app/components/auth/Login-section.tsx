// app/components/Login-section.tsx
"use client";

import { useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import type { User } from "../../types";

type LoginProps = {
  token: string | null;
  setToken: (t: string | null) => void;
  currentUser: User | null; // no lo usamos pero lo mantenemos por compatibilidad
};

const AUTH_TOKEN_STORAGE_KEY = "auth_token";

function friendlyLoginError(status?: number) {
  if (!status) return "No se pudo conectar con la API. Revisa red/URL.";
  if (status === 401) return "Credenciales incorrectas (usuario o contraseña).";
  if (status === 403) return "Acceso denegado.";
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo en unos segundos.";
  return `Acceso fallido (HTTP ${status}).`;
}

export default function LoginSection({ token, setToken }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogged = !!token;

  const handleLogin = async () => {
    if (isLogged) return;

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
        } catch {
          // ignore
        }

        setError(
          detail
            ? `${friendlyLoginError(res.status)} (${detail})`
            : friendlyLoginError(res.status)
        );

        try {
          localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }

        setToken(null);
        return;
      }

      const json = await res.json();
      const accessToken = json.access_token as string;

      try {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken);
      } catch {
        // ignore
      }

      setToken(accessToken);
      setError(null);
    } catch (err) {
      console.error("Error login:", err);
      setError(
        "No se pudo conectar con la API. Revisa la URL o que el backend esté levantado."
      );

      try {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      } catch {
        // ignore
      }

      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setError(null);

    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }

    setToken(null);
    setPassword("");
  };

  return (
    <section
      className="
        ui-card text-sm
        max-w-md
        mx-auto
      "
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="ui-card-title">Acceso</h3>
          <p className="ui-card-subtitle mt-1">
            Introduce tus credenciales para entrar.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={[
              "ui-btn ui-btn-xs",
              isLogged ? "ui-btn-outline" : "ui-btn-danger",
            ].join(" ")}
          >
            {isLogged ? "Con sesión" : "Sin sesión"}
          </span>

          {isLogged && (
            <button
              type="button"
              onClick={handleLogout}
              className="ui-btn ui-btn-outline ui-btn-xs rounded-lg"
              title="Cerrar sesión"
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </header>

      {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}

      <div className="space-y-3">
        <div>
          <label className="ui-label">Usuario (email)</label>
          <input
            className="ui-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@empresa.com"
            autoComplete="username"
            disabled={isLogged || loading}
          />
        </div>

        <div>
          <label className="ui-label">Contraseña</label>
          <div className="flex items-center gap-2">
            <input
              type={showPassword ? "text" : "password"}
              className="ui-input flex-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Introduce tu contraseña"
              autoComplete="current-password"
              disabled={isLogged || loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLogged && !loading) {
                  e.preventDefault();
                  handleLogin();
                }
              }}
            />
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-xs"
              onClick={() => setShowPassword((v) => !v)}
              disabled={isLogged || !password}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        {!isLogged && (
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="ui-btn ui-btn-secondary w-full justify-center rounded-lg mt-2"
          >
            {loading ? "Accediendo..." : "Entrar"}
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-[10px] ui-muted">
        Acceso restringido · Introduce tus credenciales para continuar.
      </p>
    </section>
  );
}