// app/stg/wsprime/components/WsPrimeTypes.ts
// Tipos compartidos del módulo WS-PRIME (Paq 11-6 frontend).

export type Fabricante = "mock" | "circutor" | "ziv" | "sagemcom" | "landis";

export const FABRICANTES_OPTIONS: { value: Fabricante; label: string; disponible: boolean }[] = [
  { value: "mock",     label: "Mock (pruebas)",     disponible: true  },
  { value: "circutor", label: "Circutor",           disponible: false }, // 11-5 lunes 16-jun
  { value: "ziv",      label: "ZIV",                disponible: false }, // iteración futura
  { value: "sagemcom", label: "Sagemcom",           disponible: false },
  { value: "landis",   label: "Landis+Gyr",         disponible: false },
];

// ---- Concentrador (extracto del listado /stg/concentradores) ----
export interface ConcentradorBasico {
  id: number;
  codigo_ct: string;
  nombre: string | null;
  fabricante: string | null;
  modelo: string | null;
  estado_comunicacion: string;
}

// ---- WS-PRIME Config (respuesta del backend) ----
export interface WsPrimeConfigOut {
  id: number;
  concentrador_id: number;
  fabricante: Fabricante;
  url: string;
  usuario: string;
  timeout_segundos: number;
  verify_ssl: boolean;
  activo: boolean;
  ultima_conexion_at: string | null;
  ultima_conexion_ok: boolean | null;
  ultima_conexion_error: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Payload para crear config ----
export interface WsPrimeConfigCreatePayload {
  concentrador_id: number;
  fabricante: Fabricante;
  url: string;
  usuario: string;
  password: string;
  timeout_segundos: number;
  verify_ssl: boolean;
  activo: boolean;
}

// ---- Payload para PATCH config (todos opcionales) ----
export interface WsPrimeConfigUpdatePayload {
  fabricante?: Fabricante;
  url?: string;
  usuario?: string;
  password?: string;
  timeout_segundos?: number;
  verify_ssl?: boolean;
  activo?: boolean;
}

// ---- Resultado de test/info ----
export interface WsPrimeTestResult {
  ok: boolean;
  mensaje: string;
  info: Record<string, unknown> | null;
}

export interface WsPrimeInfoGeneral {
  ok: boolean;
  mensaje: string;
  info: Record<string, unknown> | null;
}

// ---- Combinado: concentrador + su config (si existe) ----
export interface ConcentradorConWsPrime {
  concentrador: ConcentradorBasico;
  wsprime_config: WsPrimeConfigOut | null;
}