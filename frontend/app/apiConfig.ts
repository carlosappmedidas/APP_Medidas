// app/apiConfig.ts

export const API_BASE_URL = "http://localhost:8000";

export function getAuthHeaders(token: string | null): HeadersInit {
  // Si no hay token, devolvemos un objeto vacío (compatible con HeadersInit)
  if (!token) {
    return {};
  }

  // Objeto simple compatible con HeadersInit
  return {
    Authorization: `Bearer ${token}`,
  };
}