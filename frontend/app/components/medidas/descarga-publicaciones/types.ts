// Tipos del módulo Descarga de Publicaciones REE.
// Espejo del backend en app/measures/descarga/services.py + routes.py.

export type DescargaEstado = "nuevo" | "importado" | "actualizable" | "obsoleta";

export type EmpresaOption = { id: number; nombre: string; codigo_ree: string | null };

export interface BusquedaResult {
  empresa_id:         number;
  empresa_nombre:     string;
  config_id:          number;
  ruta_sftp:          string;
  nombre:             string;
  clave_base:         string;
  tipo:               string;     // "BALD" por ahora
  periodo:            string;     // YYYYMM
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