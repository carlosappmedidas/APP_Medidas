// frontend/app/apiConfig.ts

// Si existe NEXT_PUBLIC_API_BASE_URL (servidor), úsala.
// Si no, cae a localhost (desarrollo local).
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function getAuthHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}