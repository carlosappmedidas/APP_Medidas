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
  estado_ree: "ok" | "bad" | null;
  comentario_interno: string | null;
}

export interface FicheroStats {
  nombre_fichero: string;
  aaaamm: string | null;        // periodo extraído del nombre (YYYYMM, p.ej. "202507"). Null si no se pudo parsear.
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

export interface DashTipoEnPeriodo {
  /** "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL" */
  tipo: string;
  obj_total: number;           // nº objeciones del tipo en este periodo
  obj_pendientes: number;      // objeciones sin responder
  reob_total: number;          // nº REOBs enviados para este tipo+periodo
  // Contadores REE propagados a objeciones (usando num_registros del REOB)
  ree_ok: number;
  ree_bad: number;
  ree_sin_resp: number;
  ree_na: number;              // siempre 0 excepto para OBJEINCL
}

export interface DashPeriodo {
  periodo: string;          // YYYYMM, ej "202507"
  periodo_label: string;    // "Jul 2025" — formato legible
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
  enviadas_sftp: number;       // nº de objeciones enviadas al SFTP en este periodo
  // ── Respuestas REE agregadas por aaaamm ──
  // Contadores en UNIDAD DE OBJECIONES (propagadas desde los REOBs que las cubren).
  // INCL NO cuenta aquí — sus objeciones van a ree_na porque REE no responde INCL.
  ree_ok: number;
  ree_bad: number;
  ree_sin_resp: number;
  ree_na: number;              // objeciones de tipo INCL
  // Desglose por tipo dentro del periodo (para el acordeón del dashboard)
  por_tipo: DashTipoEnPeriodo[];
}

export interface DashEmpresaPeriodo {
  periodo: string;          // YYYYMM, ej "202507"
  periodo_label: string;    // "Jul 2025"
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
  enviadas_sftp: number;
}

export interface DashEmpresa {
  empresa_id: number;
  empresa_nombre: string;
  empresa_codigo_ree: string | null;
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
  // Desglose por periodo dentro de esta empresa (ordenado reciente→antiguo).
  // La UI usa el primer elemento para mostrar "el último periodo" de cada empresa.
  por_periodo: DashEmpresaPeriodo[];
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

