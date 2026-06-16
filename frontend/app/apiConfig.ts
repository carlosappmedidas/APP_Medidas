export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function getAuthHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Formateo de errores de la API (FastAPI / Pydantic) -> mensaje legible.
// 422 de Pydantic llega como detail: [{loc, msg, type}, ...]; los ValueError
// de negocio llegan como detail: "texto". Centralizado para todas las páginas:
// un solo sitio que cambiar si cambia el formato de error.
// ---------------------------------------------------------------------------
interface ApiErrorItem {
  loc?: (string | number)[];
  msg?: string;
}

export function formatApiError(
  detail: unknown,
  fallback = "No se pudo guardar.",
): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const partes = (detail as ApiErrorItem[])
      .map((e) => {
        const campo =
          Array.isArray(e.loc) && e.loc.length
            ? String(e.loc[e.loc.length - 1])
            : "";
        const msg = (e.msg || "").replace(/^Value error,\s*/i, "");
        return campo ? `${campo}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (partes.length) return partes.join("\n");
  }
  return fallback;
}

export async function readApiError(
  r: Response,
  fallback = "No se pudo guardar.",
): Promise<string> {
  try {
    const j = await r.json();
    return formatApiError(j?.detail, fallback);
  } catch {
    return fallback;
  }
}
