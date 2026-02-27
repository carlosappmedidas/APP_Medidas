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

export default function LoginSection({
  token,
  setToken,
  currentUser,
}: LoginProps) {
  const [email, setEmail] = useState("carlos@example.com");
  const [password, setPassword] = useState("changeme123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = new URLSearchParams();
      body.append("username", email);
      body.append("password", password);

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        throw new Error(`Login failed: ${res.status}`);
      }

      const json = await res.json();
      const accessToken = json.access_token as string;

      // Guardamos el token arriba (page.tsx se encargará de llamar a /auth/me)
      setToken(accessToken);
    } catch (err: any) {
      console.error("Error login:", err);
      setError("Login fallido. Revisa el usuario/contraseña o la API.");
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // Logout local (tu backend es stateless con JWT; no hay sesión que “cerrar”)
    setError(null);
    setToken(null);
  };

  return (
    <section className="ui-card text-sm">
      {/* Header: título + desplegable arriba derecha */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="ui-card-title">Login</h3>
          <p className="ui-card-subtitle">
            Inicia sesión para acceder a las secciones y gestionar datos.
          </p>
        </div>

        {/* Desplegable (sin librerías, robusto y simple) */}
        <details className="relative">
          <summary className="ui-btn ui-btn-outline cursor-pointer list-none select-none">
            Acciones <span className="ml-1 opacity-70">▾</span>
          </summary>

          <div className="ui-popover">
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="ui-btn ui-btn-secondary w-full justify-start rounded-lg"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={!token}
              className="ui-btn ui-btn-outline mt-2 w-full justify-start rounded-lg"
              title={!token ? "No hay sesión activa" : "Cerrar sesión"}
            >
              Cerrar sesión
            </button>

            <div className="mt-2 ui-divider pt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {token ? "Sesión activa" : "Sin sesión"}
            </div>
          </div>
        </details>
      </div>

      {/* Inputs (ya sin el botón Entrar aquí) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="ui-label">Email / usuario</label>
          <input
            className="ui-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
          />
        </div>

        <div>
          <label className="ui-label">Password</label>
          <input
            type="password"
            className="ui-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      <div className="mt-4 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
        <div>
          API:{" "}
          <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
            {API_BASE_URL}
          </span>
        </div>

        {/* Token oculto */}
        <div>
          Token:{" "}
          {token ? (
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--field-border-focus)" }}
            >
              OK
            </span>
          ) : (
            <span style={{ color: "var(--danger-text)" }}>no hay token</span>
          )}
        </div>

        {/* Info del usuario actual (viene de props) */}
        <div className="mt-2 ui-divider pt-2">
          <div className="mb-1 text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
            Usuario actual
          </div>

          {currentUser ? (
            <div className="space-y-0.5 text-[11px]" style={{ color: "var(--text)" }}>
              <div>
                Email:{" "}
                <span className="font-mono text-[11px]">{currentUser.email}</span>
              </div>
              <div>
                Tenant ID:{" "}
                <span className="font-mono text-[11px]">{currentUser.tenant_id}</span>
              </div>
              <div>
                Rol:{" "}
                <span className="font-mono text-[11px]">{currentUser.rol}</span>
              </div>
              <div>
                Activo:{" "}
                <span className="font-mono text-[11px]">
                  {currentUser.is_active ? "Sí" : "No"}
                </span>
              </div>
              <div>
                Superusuario:{" "}
                <span
                  className="font-mono text-[11px]"
                  style={{
                    color: currentUser.is_superuser
                      ? "var(--field-border-focus)"
                      : "var(--text-muted)",
                  }}
                >
                  {currentUser.is_superuser ? "Sí ✅" : "No"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Aún no se han cargado los datos de usuario.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}