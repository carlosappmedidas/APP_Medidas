// Tipos compartidos del módulo Objeciones.
// Movido desde ObjecionesSection.tsx (Fase 0 · Paso 0.1).
// NOTA: ObjecionesSectionProps se queda en ObjecionesSection.tsx por ser
// prop del propio componente.

export type ObjecionTipo = "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL";

export interface ReobGenerado {
  id: number;
  tipo: string;
  nombre_fichero_aob: string;
  nombre_fichero_reob: string;
  empresa_id: number;
  comercializadora: string | null;
  aaaamm: string | null;
  num_registros: number | null;
  generado_at: string | null;
  enviado_sftp_at: string | null;
}

export interface FicheroStats {
  nombre_fichero: string;
  created_at: string | null;
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
  enviado_sftp_at: string | null;
}

export interface DashTipo {
  tipo: string;
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
}

export interface DashPeriodo {
  periodo: string;          // YYYYMM, ej "202507"
  periodo_label: string;    // "Jul 2025" — formato legible
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
}

export interface DashEmpresa {
  empresa_id: number;
  empresa_nombre: string;
  empresa_codigo_ree: string | null;
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
}

export interface DashData {
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
  enviadas_sftp: number;
  por_tipo: DashTipo[];       // usado por GestionPanel (contadores de pestañas)
  por_periodo: DashPeriodo[];
  por_empresa: DashEmpresa[];
}

export interface TabConfig {
  id: ObjecionTipo;
  label: string;
  importLabel: string;
  columns: { id: string; label: string; align: "left" | "right" }[];
  camposLectura: { id: string; label: string }[];
}

export type EmpresaOption = { id: number; nombre: string; codigo_ree: string | null };

// ── Descarga en Objeciones (FASE 5) ───────────────────────────────────────────

export type DescargaEstado = "nuevo" | "importado" | "actualizable" | "obsoleta";

export interface BusquedaResult {
  empresa_id:         number;
  empresa_nombre:     string;
  config_id:          number;
  ruta_sftp:          string;
  nombre:             string;
  clave_base:         string;
  tipo:               ObjecionTipo;
  periodo:            string;   // YYYYMM
  version:            number;
  tamanio:            number;
  fecha_sftp:         string | null;
  estado:             DescargaEstado;
  version_importada:  number | null;
}

export interface EjecutarDetalleItem {
  nombre:    string;
  resultado: "ok" | "reemplazado" | "error";
  mensaje:   string;
}

export interface EjecutarResponse {
  importados:    number;
  reemplazados:  number;
  errores:       number;
  detalle:       EjecutarDetalleItem[];
}

