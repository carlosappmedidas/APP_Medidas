// frontend/app/apiConfig.ts

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function getAuthHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// Interceptor global: si la API devuelve 401, limpia el token y recarga
// para que page.tsx detecte que no hay sesión y muestre el login.
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    try {
      localStorage.removeItem("auth_token");
    } catch {
      // ignore
    }
    window.location.reload();
  }
  return res;
}