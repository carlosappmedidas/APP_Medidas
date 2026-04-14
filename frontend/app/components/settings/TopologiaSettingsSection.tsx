"use client";

import { useState } from "react";
import type {
  TooltipLineasConfig, TooltipTramosConfig, TooltipCtsConfig, TooltipCupsConfig,
} from "../topologia/MapaLeaflet";

// ── Tipos para checks de tabla ──────────────────────────────────────────────

export type TablaLineasConfig  = Record<string, boolean>;
export type TablaTramosConfig  = Record<string, boolean>;
export type TablaCtsConfig     = Record<string, boolean>;
export type TablaCupsConfig    = Record<string, boolean>;
export type TablaCeldasConfig  = Record<string, boolean>;
export type TablaTrafosConfig  = Record<string, boolean>;

// ── Definición de campo ─────────────────────────────────────────────────────

interface CampoDef {
  key: string;
  label: string;
  tooltipKey?: string;
  calculado?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// B1 — Líneas (35 campos CNMC + 2 calculados = 37)
// ═══════════════════════════════════════════════════════════════════════════════

const CAMPOS_LINEAS: CampoDef[] = [
  { key: "identificador_tramo",    label: "IDENTIFICADOR_TRAMO",         tooltipKey: "mostrar_identificador_tramo" },
  { key: "cini",                   label: "CINI",                        tooltipKey: "mostrar_cini" },
  { key: "codigo_ccuu",            label: "CODIGO_CCUU",                 tooltipKey: "mostrar_codigo_ccuu" },
  { key: "nudo_inicial",           label: "NUDO_INICIAL",                tooltipKey: "mostrar_nudo_inicio" },
  { key: "nudo_final",             label: "NUDO_FINAL",                  tooltipKey: "mostrar_nudo_fin" },
  { key: "ccaa_1",                 label: "CCAA_1",                      tooltipKey: "mostrar_ccaa" },
  { key: "ccaa_2",                 label: "CCAA_2",                      tooltipKey: "mostrar_ccaa_2" },
  { key: "propiedad",              label: "PROPIEDAD",                   tooltipKey: "mostrar_propiedad" },
  { key: "tension_explotacion",    label: "TENSION_EXPLOTACION",         tooltipKey: "mostrar_tension" },
  { key: "tension_construccion",   label: "TENSION_CONSTRUCCION",        tooltipKey: "mostrar_tension_construccion" },
  { key: "longitud",               label: "LONGITUD",                    tooltipKey: "mostrar_longitud" },
  { key: "resistencia",            label: "RESISTENCIA",                 tooltipKey: "mostrar_resistencia" },
  { key: "reactancia",             label: "REACTANCIA",                  tooltipKey: "mostrar_reactancia" },
  { key: "intensidad",             label: "INTENSIDAD",                  tooltipKey: "mostrar_intensidad" },
  { key: "estado",                 label: "ESTADO",                      tooltipKey: "mostrar_estado" },
  { key: "punto_frontera",         label: "PUNTO_FRONTERA",              tooltipKey: "mostrar_punto_frontera" },
  { key: "modelo",                 label: "MODELO",                      tooltipKey: "mostrar_modelo" },
  { key: "operacion",              label: "OPERACION",                   tooltipKey: "mostrar_operacion" },
  { key: "fecha_aps",              label: "FECHA_APS",                   tooltipKey: "mostrar_fecha_aps" },
  { key: "causa_baja",             label: "CAUSA_BAJA",                  tooltipKey: "mostrar_causa_baja" },
  { key: "fecha_baja",             label: "FECHA_BAJA",                  tooltipKey: "mostrar_fecha_baja" },
  { key: "fecha_ip",               label: "FECHA_IP",                    tooltipKey: "mostrar_fecha_ip" },
  { key: "tipo_inversion",         label: "TIPO_INVERSION",              tooltipKey: "mostrar_tipo_inversion" },
  { key: "motivacion",             label: "MOTIVACION",                  tooltipKey: "mostrar_motivacion" },
  { key: "im_tramites",            label: "IM_TRAMITES",                 tooltipKey: "mostrar_im_tramites" },
  { key: "im_construccion",        label: "IM_CONSTRUCCION",             tooltipKey: "mostrar_im_construccion" },
  { key: "im_trabajos",            label: "IM_TRABAJOS",                 tooltipKey: "mostrar_im_trabajos" },
  { key: "valor_auditado",         label: "VALOR_AUDITADO",              tooltipKey: "mostrar_valor_auditado" },
  { key: "financiado",             label: "FINANCIADO",                  tooltipKey: "mostrar_financiado" },
  { key: "subvenciones_europeas",  label: "SUBVENCIONES_EUROPEAS",       tooltipKey: "mostrar_subv_europeas" },
  { key: "subvenciones_nacionales",label: "SUBVENCIONES_NACIONALES",     tooltipKey: "mostrar_subv_nacionales" },
  { key: "subvenciones_prtr",      label: "SUBVENCIONES_PRTR",           tooltipKey: "mostrar_subv_prtr" },
  { key: "cuenta",                 label: "CUENTA",                      tooltipKey: "mostrar_cuenta" },
  { key: "avifauna",               label: "AVIFAUNA",                    tooltipKey: "mostrar_avifauna" },
  { key: "identificador_baja",     label: "IDENTIFICADOR_BAJA",          tooltipKey: "mostrar_identificador_baja" },
  { key: "ct_asignado",            label: "CT asignado",                 tooltipKey: "mostrar_ct_asignado",        calculado: true },
  { key: "metodo_asignacion",      label: "Método asignación",           tooltipKey: "mostrar_metodo_asignacion",  calculado: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// B11 — Tramos GIS (6 campos CNMC + 1 calculado = 7)
// ═══════════════════════════════════════════════════════════════════════════════

const CAMPOS_TRAMOS: CampoDef[] = [
  { key: "segmento",            label: "SEGMENTO",              tooltipKey: "mostrar_id_tramo" },
  { key: "identificador_tramo", label: "IDENTIFICADOR_TRAMO",   tooltipKey: "mostrar_id_linea" },
  { key: "orden_segmento",      label: "ORDEN_SEGMENTO",        tooltipKey: "mostrar_orden" },
  { key: "n_segmentos",         label: "N_SEGMENTOS",           tooltipKey: "mostrar_num_tramo" },
  { key: "coordenadas_1",       label: "COORDENADAS_1 (X,Y,Z)", tooltipKey: "mostrar_coordenadas_1" },
  { key: "coordenadas_2",       label: "COORDENADAS_2 (X,Y,Z)", tooltipKey: "mostrar_coordenadas_2" },
  { key: "longitud_segmento",   label: "Longitud segmento (m)", tooltipKey: "mostrar_longitud_segmento", calculado: true },
  { key: "cini",                label: "CINI",                  calculado: true },
  { key: "codigo_ccuu",         label: "CODIGO_CCUU",           calculado: true },
  { key: "nudo_inicial",        label: "NUDO_INICIAL",          calculado: true },
  { key: "nudo_final",          label: "NUDO_FINAL",            calculado: true },
  { key: "ccaa_1",              label: "CCAA_1",                calculado: true },
  { key: "ccaa_2",              label: "CCAA_2",                calculado: true },
  { key: "tension_explotacion", label: "TENSION_EXPLOTACION",   calculado: true },
  { key: "ct_asignado",         label: "CT asignado",           calculado: true },
  { key: "metodo_asignacion",   label: "Método asignación",     calculado: true },
];
// ═══════════════════════════════════════════════════════════════════════════════
// B2 — CTs (34 campos CNMC + 3 calculados = 37)
// ═══════════════════════════════════════════════════════════════════════════════

const CAMPOS_CTS: CampoDef[] = [
  { key: "identificador_ct",       label: "IDENTIFICADOR_CT",            tooltipKey: "mostrar_identificador_ct" },
  { key: "cini",                   label: "CINI",                        tooltipKey: "mostrar_cini" },
  { key: "denominacion",           label: "DENOMINACION",                tooltipKey: "mostrar_denominacion" },
  { key: "codigo_ccuu",            label: "CODIGO_CCUU",                 tooltipKey: "mostrar_codigo_ccuu" },
  { key: "nudo_alta",              label: "NUDO_ALTA",                   tooltipKey: "mostrar_nudo_alta" },
  { key: "nudo_baja",              label: "NUDO_BAJA",                   tooltipKey: "mostrar_nudo_baja" },
  { key: "tension_explotacion",    label: "TENSION_EXPLOTACION",         tooltipKey: "mostrar_tension" },
  { key: "tension_construccion",   label: "TENSION_CONSTRUCCION",        tooltipKey: "mostrar_tension_construccion" },
  { key: "potencia",               label: "POTENCIA",                    tooltipKey: "mostrar_potencia" },
  { key: "coordenadas",            label: "COORDENADAS (X,Y,Z)",        tooltipKey: "mostrar_coordenadas" },
  { key: "municipio",              label: "MUNICIPIO",                   tooltipKey: "mostrar_municipio" },
  { key: "provincia",              label: "PROVINCIA",                   tooltipKey: "mostrar_provincia" },
  { key: "ccaa",                   label: "CCAA",                        tooltipKey: "mostrar_ccaa" },
  { key: "zona",                   label: "ZONA",                        tooltipKey: "mostrar_zona" },
  { key: "estado",                 label: "ESTADO",                      tooltipKey: "mostrar_estado" },
  { key: "modelo",                 label: "MODELO",                      tooltipKey: "mostrar_modelo" },
  { key: "punto_frontera",         label: "PUNTO_FRONTERA",              tooltipKey: "mostrar_punto_frontera" },
  { key: "fecha_aps",              label: "FECHA_APS",                   tooltipKey: "mostrar_fecha_aps" },
  { key: "causa_baja",             label: "CAUSA_BAJA",                  tooltipKey: "mostrar_causa_baja" },
  { key: "fecha_baja",             label: "FECHA_BAJA",                  tooltipKey: "mostrar_fecha_baja" },
  { key: "fecha_ip",               label: "FECHA_IP",                    tooltipKey: "mostrar_fecha_ip" },
  { key: "tipo_inversion",         label: "TIPO_INVERSION",              tooltipKey: "mostrar_tipo_inversion" },
  { key: "im_tramites",            label: "IM_TRAMITES",                 tooltipKey: "mostrar_im_tramites" },
  { key: "im_construccion",        label: "IM_CONSTRUCCION",             tooltipKey: "mostrar_im_construccion" },
  { key: "im_trabajos",            label: "IM_TRABAJOS",                 tooltipKey: "mostrar_im_trabajos" },
  { key: "subvenciones_europeas",  label: "SUBVENCIONES_EUROPEAS",       tooltipKey: "mostrar_subv_europeas" },
  { key: "subvenciones_nacionales",label: "SUBVENCIONES_NACIONALES",     tooltipKey: "mostrar_subv_nacionales" },
  { key: "subvenciones_prtr",      label: "SUBVENCIONES_PRTR",           tooltipKey: "mostrar_subv_prtr" },
  { key: "valor_auditado",         label: "VALOR_AUDITADO",              tooltipKey: "mostrar_valor_auditado" },
  { key: "financiado",             label: "FINANCIADO",                  tooltipKey: "mostrar_financiado" },
  { key: "cuenta",                 label: "CUENTA",                      tooltipKey: "mostrar_cuenta" },
  { key: "motivacion",             label: "MOTIVACION",                  tooltipKey: "mostrar_motivacion" },
  { key: "avifauna",               label: "AVIFAUNA",                    tooltipKey: "mostrar_avifauna" },
  { key: "identificador_baja",     label: "IDENTIFICADOR_BAJA",          tooltipKey: "mostrar_identificador_baja" },
  { key: "propiedad",              label: "PROPIEDAD",                   tooltipKey: "mostrar_propiedad" },
  { key: "num_trafos",             label: "Nº Trafos",                   tooltipKey: "mostrar_num_trafos",         calculado: true },
  { key: "num_celdas",             label: "Nº Celdas",                   tooltipKey: "mostrar_num_celdas",         calculado: true },
  { key: "num_cups",               label: "Nº CUPS",                     tooltipKey: "mostrar_num_cups",           calculado: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// A1 — CUPS (29 campos CNMC + 3 calculados = 32)
// ═══════════════════════════════════════════════════════════════════════════════

const CAMPOS_CUPS: CampoDef[] = [
  { key: "nudo",                   label: "NUDO",                        tooltipKey: "mostrar_nudo" },
  { key: "coordenadas",            label: "COORDENADAS (X,Y,Z)",        tooltipKey: "mostrar_coordenadas" },
  { key: "cnae",                   label: "CNAE",                        tooltipKey: "mostrar_cnae" },
  { key: "cod_tfa",                label: "COD_TFA",                     tooltipKey: "mostrar_tarifa" },
  { key: "cups",                   label: "CUPS",                        tooltipKey: "mostrar_cups" },
  { key: "municipio",              label: "MUNICIPIO",                   tooltipKey: "mostrar_municipio" },
  { key: "provincia",              label: "PROVINCIA",                   tooltipKey: "mostrar_provincia" },
  { key: "zona",                   label: "ZONA",                        tooltipKey: "mostrar_zona" },
  { key: "conexion",               label: "CONEXION",                    tooltipKey: "mostrar_conexion" },
  { key: "tension",                label: "TENSION",                     tooltipKey: "mostrar_tension" },
  { key: "estado_contrato",        label: "ESTADO_CONTRATO",             tooltipKey: "mostrar_estado_contrato" },
  { key: "potencia_contratada",    label: "POTENCIA_CONTRATADA",         tooltipKey: "mostrar_potencia" },
  { key: "potencia_adscrita",      label: "POTENCIA_ADSCRITA",           tooltipKey: "mostrar_potencia_adscrita" },
  { key: "energia_activa_consumida",     label: "ENERGIA_ACTIVA_CONSUMIDA",     tooltipKey: "mostrar_energia_activa" },
  { key: "energia_reactiva_consumida",   label: "ENERGIA_REACTIVA_CONSUMIDA",   tooltipKey: "mostrar_energia_reactiva" },
  { key: "autoconsumo",            label: "AUTOCONSUMO",                 tooltipKey: "mostrar_autoconsumo" },
  { key: "cini_equipo_medida",     label: "CINI_EQUIPO_MEDIDA",          tooltipKey: "mostrar_cini" },
  { key: "fecha_instalacion",      label: "FECHA_INSTALACION",           tooltipKey: "mostrar_fecha_alta" },
  { key: "lecturas",               label: "LECTURAS",                    tooltipKey: "mostrar_lecturas" },
  { key: "baja_suministro",        label: "BAJA_SUMINISTRO",             tooltipKey: "mostrar_baja_suministro" },
  { key: "cambio_titularidad",     label: "CAMBIO_TITULARIDAD",          tooltipKey: "mostrar_cambio_titularidad" },
  { key: "facturas_estimadas",     label: "FACTURAS_ESTIMADAS",          tooltipKey: "mostrar_facturas_estimadas" },
  { key: "facturas_total",         label: "FACTURAS_TOTAL",              tooltipKey: "mostrar_facturas_total" },
  { key: "cau",                    label: "CAU",                         tooltipKey: "mostrar_cau" },
  { key: "cod_auto",               label: "COD_AUTO",                    tooltipKey: "mostrar_cod_auto" },
  { key: "cod_generacion_auto",    label: "COD_GENERACION_AUTO",         tooltipKey: "mostrar_cod_generacion" },
  { key: "conexion_autoconsumo",   label: "CONEXION_AUTOCONSUMO",        tooltipKey: "mostrar_conexion_autoconsumo" },
  { key: "energia_autoconsumida",  label: "ENERGIA_AUTOCONSUMIDA",       tooltipKey: "mostrar_energia_autoconsumida" },
  { key: "energia_excedentaria",   label: "ENERGIA_EXCEDENTARIA",        tooltipKey: "mostrar_energia_excedentaria" },
  { key: "ct_asignado",            label: "CT asignado",                 tooltipKey: "mostrar_ct_asignado_cups",        calculado: true },
  { key: "metodo_asignacion",      label: "Método asignación",           tooltipKey: "mostrar_metodo_asignacion_cups",  calculado: true },
  { key: "fase",                   label: "Fase",                        tooltipKey: "mostrar_fase",                    calculado: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// B22 — Celdas (7 campos CNMC + 5 calculados = 12) — sin tooltip de mapa
// ═══════════════════════════════════════════════════════════════════════════════

const CAMPOS_CELDAS: CampoDef[] = [
  { key: "identificador_ct",       label: "IDENTIFICADOR_CT"             },
  { key: "identificador_celda",    label: "IDENTIFICADOR_CELDA"          },
  { key: "identificador_maquina",  label: "IDENTIFICADOR_MAQUINA"        },
  { key: "cini",                   label: "CINI"                         },
  { key: "interruptor",            label: "INTERRUPTOR"                  },
  { key: "propiedad",              label: "PROPIEDAD"                    },
  { key: "anio_ps",                label: "AÑO_PS"                       },
  { key: "cini_p4_tension_rango",  label: "CINI: Tensión rango",         calculado: true },
  { key: "cini_p5_tipo_posicion",  label: "CINI: Tipo posición",         calculado: true },
  { key: "cini_p6_ubicacion",      label: "CINI: Ubicación",             calculado: true },
  { key: "cini_p7_funcion",        label: "CINI: Función",               calculado: true },
  { key: "cini_p8_tension_nom",    label: "CINI: Tensión nominal",       calculado: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// B21 — Trafos (6 campos CNMC) — sin tooltip de mapa
// ═══════════════════════════════════════════════════════════════════════════════

const CAMPOS_TRAFOS: CampoDef[] = [
  { key: "identificador_ct",       label: "IDENTIFICADOR_CT"             },
  { key: "identificador_maquina",  label: "IDENTIFICADOR_MAQUINA"        },
  { key: "cini",                   label: "CINI"                         },
  { key: "potencia",               label: "POTENCIA"                     },
  { key: "anio_ps",                label: "AÑO_PS"                       },
  { key: "operacion",              label: "OPERACION"                    },
];

// ── Pestañas ────────────────────────────────────────────────────────────────

type TabKey = "b1" | "b11" | "b2" | "a1" | "b22" | "b21";

const TABS: { key: TabKey; label: string; campos: CampoDef[] }[] = [
  { key: "b1",  label: "Líneas (B1)",  campos: CAMPOS_LINEAS },
  { key: "b11", label: "Tramos (B11)", campos: CAMPOS_TRAMOS },
  { key: "b2",  label: "CTs (B2)",     campos: CAMPOS_CTS },
  { key: "a1",  label: "CUPS (A1)",    campos: CAMPOS_CUPS },
  { key: "b22", label: "Celdas (B22)", campos: CAMPOS_CELDAS },
  { key: "b21", label: "Trafos (B21)", campos: CAMPOS_TRAFOS },
];

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  tooltipLineas:  TooltipLineasConfig;
  tooltipTramos:  TooltipTramosConfig;
  tooltipCts:     TooltipCtsConfig;
  tooltipCups:    TooltipCupsConfig;
  onChangeLineas: (config: TooltipLineasConfig) => void;
  onChangeTramos: (config: TooltipTramosConfig) => void;
  onChangeCts:    (config: TooltipCtsConfig)    => void;
  onChangeCups:   (config: TooltipCupsConfig)   => void;
  tablaLineas:    TablaLineasConfig;
  tablaTramos:    TablaTramosConfig;
  tablaCts:       TablaCtsConfig;
  tablaCups:      TablaCupsConfig;
  tablaCeldas:    TablaCeldasConfig;
  tablaTrafos:    TablaTrafosConfig;
  onChangeTablaLineas: (config: TablaLineasConfig) => void;
  onChangeTablaTramos: (config: TablaTramosConfig) => void;
  onChangeTablaCts:    (config: TablaCtsConfig)    => void;
  onChangeTablaCups:   (config: TablaCupsConfig)   => void;
  onChangeTablaCeldas: (config: TablaCeldasConfig) => void;
  onChangeTablaTrafos: (config: TablaTrafosConfig) => void;
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const tabBarStyle: React.CSSProperties = { display: "flex", gap: 0, borderBottom: "1px solid var(--card-border)", marginBottom: 14, flexWrap: "wrap" };
const tabStyle = (active: boolean): React.CSSProperties => ({ padding: "6px 14px", fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer", borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent", color: active ? "var(--primary)" : "var(--text-muted)" });
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 };
const itemStyle = (bothOff: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, background: "var(--field-bg-soft)", fontSize: 11, opacity: bothOff ? 0.4 : 1 });
const colHeaderStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 3, padding: "0 8px" };
const colHeaderCellStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0, paddingRight: 20 };
const headerLabelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 600, color: "var(--text-muted)", width: 30, textAlign: "center", letterSpacing: "0.03em" };
const separatorStyle: React.CSSProperties = { gridColumn: "1 / -1", padding: "6px 0 2px", borderTop: "1px solid var(--card-border)", marginTop: 4, fontSize: 9, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" };
const btnStyle: React.CSSProperties = { fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--card-border)", background: "transparent", cursor: "pointer", color: "var(--text-muted)" };

// ── Helpers ─────────────────────────────────────────────────────────────────

function getTooltipConfig(tab: TabKey, props: Props): Record<string, boolean> | null {
  switch (tab) {
    case "b1":  return props.tooltipLineas as unknown as Record<string, boolean>;
    case "b11": return props.tooltipTramos as unknown as Record<string, boolean>;
    case "b2":  return props.tooltipCts    as unknown as Record<string, boolean>;
    case "a1":  return props.tooltipCups   as unknown as Record<string, boolean>;
    default:    return null;
  }
}

function setTooltipValue(tab: TabKey, props: Props, tooltipKey: string, value: boolean) {
  switch (tab) {
    case "b1":  props.onChangeLineas({ ...props.tooltipLineas, [tooltipKey]: value }); break;
    case "b11": props.onChangeTramos({ ...props.tooltipTramos, [tooltipKey]: value }); break;
    case "b2":  props.onChangeCts({ ...props.tooltipCts, [tooltipKey]: value });       break;
    case "a1":  props.onChangeCups({ ...props.tooltipCups, [tooltipKey]: value });      break;
  }
}

function getTablaConfig(tab: TabKey, props: Props): Record<string, boolean> {
  switch (tab) {
    case "b1":  return props.tablaLineas;
    case "b11": return props.tablaTramos;
    case "b2":  return props.tablaCts;
    case "a1":  return props.tablaCups;
    case "b22": return props.tablaCeldas;
    case "b21": return props.tablaTrafos;
  }
}

function setTablaValue(tab: TabKey, props: Props, key: string, value: boolean) {
  const cfg = getTablaConfig(tab, props);
  const updated = { ...cfg, [key]: value };
  switch (tab) {
    case "b1":  props.onChangeTablaLineas(updated); break;
    case "b11": props.onChangeTablaTramos(updated); break;
    case "b2":  props.onChangeTablaCts(updated);    break;
    case "a1":  props.onChangeTablaCups(updated);   break;
    case "b22": props.onChangeTablaCeldas(updated); break;
    case "b21": props.onChangeTablaTrafos(updated); break;
  }
}

// ── Componente principal ────────────────────────────────────────────────────

export default function TopologiaSettingsSection(props: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("b1");
  const tabDef = TABS.find(t => t.key === activeTab)!;
  const campos = tabDef.campos;
  const tablaConfig = getTablaConfig(activeTab, props);
  const tooltipConfig = getTooltipConfig(activeTab, props);
  const camposNormales = campos.filter(c => !c.calculado);
  const camposCalc     = campos.filter(c => c.calculado);
  const countTabla = campos.filter(c => tablaConfig[c.key] !== false).length;
  const countMapa  = tooltipConfig ? campos.filter(c => c.tooltipKey && (tooltipConfig as Record<string, boolean>)[c.tooltipKey]).length : 0;
  const totalCampos = campos.length;

  const handleOcultarTodas = () => {
    const newTabla: Record<string, boolean> = {};
    campos.forEach(c => { newTabla[c.key] = false; });
    switch (activeTab) {
      case "b1":  props.onChangeTablaLineas(newTabla); break;
      case "b11": props.onChangeTablaTramos(newTabla); break;
      case "b2":  props.onChangeTablaCts(newTabla);    break;
      case "a1":  props.onChangeTablaCups(newTabla);   break;
      case "b22": props.onChangeTablaCeldas(newTabla); break;
      case "b21": props.onChangeTablaTrafos(newTabla); break;
    }
    if (tooltipConfig) {
      const newTooltip: Record<string, boolean> = {};
      Object.keys(tooltipConfig).forEach(k => { newTooltip[k] = false; });
      switch (activeTab) {
        case "b1":  props.onChangeLineas(newTooltip as unknown as TooltipLineasConfig); break;
        case "b11": props.onChangeTramos(newTooltip as unknown as TooltipTramosConfig); break;
        case "b2":  props.onChangeCts(newTooltip as unknown as TooltipCtsConfig);       break;
        case "a1":  props.onChangeCups(newTooltip as unknown as TooltipCupsConfig);     break;
      }
    }
  };

  const handleReset = () => {
    const newTabla: Record<string, boolean> = {};
    campos.forEach(c => { newTabla[c.key] = true; });
    switch (activeTab) {
      case "b1":  props.onChangeTablaLineas(newTabla); break;
      case "b11": props.onChangeTablaTramos(newTabla); break;
      case "b2":  props.onChangeTablaCts(newTabla);    break;
      case "a1":  props.onChangeTablaCups(newTabla);   break;
      case "b22": props.onChangeTablaCeldas(newTabla); break;
      case "b21": props.onChangeTablaTrafos(newTabla); break;
    }
    if (tooltipConfig) {
      const newTooltip: Record<string, boolean> = {};
      Object.keys(tooltipConfig).forEach(k => { newTooltip[k] = true; });
      switch (activeTab) {
        case "b1":  props.onChangeLineas(newTooltip as unknown as TooltipLineasConfig); break;
        case "b11": props.onChangeTramos(newTooltip as unknown as TooltipTramosConfig); break;
        case "b2":  props.onChangeCts(newTooltip as unknown as TooltipCtsConfig);       break;
        case "a1":  props.onChangeCups(newTooltip as unknown as TooltipCupsConfig);     break;
      }
    }
  };

  const renderCampo = (campo: CampoDef) => {
    const tablaChecked = tablaConfig[campo.key] !== false;
    const hasMapa      = !!campo.tooltipKey && !!tooltipConfig;
    const mapaChecked  = hasMapa ? !!(tooltipConfig as Record<string, boolean>)[campo.tooltipKey!] : false;
    const bothOff      = !tablaChecked && (!hasMapa || !mapaChecked);
    return (
      <div key={campo.key} style={itemStyle(bothOff)}>
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: bothOff ? "var(--text-muted)" : "var(--text)" }}>{campo.label}</span>
        <div style={{ display: "flex", gap: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30 }}>
            <input type="checkbox" checked={tablaChecked} onChange={() => setTablaValue(activeTab, props, campo.key, !tablaChecked)} style={{ margin: 0, width: 13, height: 13 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30 }}>
            {hasMapa ? (
              <input type="checkbox" checked={mapaChecked} onChange={() => setTooltipValue(activeTab, props, campo.tooltipKey!, !mapaChecked)} style={{ margin: 0, width: 13, height: 13 }} />
            ) : (
              <span style={{ width: 13, height: 13, display: "inline-block", opacity: 0.2, textAlign: "center", fontSize: 9, color: "var(--text-muted)" }}>—</span>
            )}
          </div>
        </div>
        <span style={{ color: "var(--text-muted)", cursor: "grab", fontSize: 10, marginLeft: 2 }}>⠿</span>
      </div>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>Controla qué campos se muestran en las tablas y tooltips del mapa. Arrastra para reordenar.</div>
      <div style={tabBarStyle}>{TABS.map(t => (<button key={t.key} type="button" style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>))}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tabDef.label} — {countTabla} de {totalCampos} en tabla{tooltipConfig ? ` · ${countMapa} de ${totalCampos} en mapa` : ""}</div>
        <div style={{ display: "flex", gap: 6 }}><button type="button" style={btnStyle} onClick={handleOcultarTodas}>Ocultar todas</button><button type="button" style={btnStyle} onClick={handleReset}>Reset</button></div>
      </div>
      <div style={colHeaderStyle}>{[0, 1, 2].map(i => (<div key={i} style={colHeaderCellStyle}><span style={headerLabelStyle}>Tabla</span><span style={headerLabelStyle}>Mapa</span><span style={{ width: 16 }} /></div>))}</div>
      <div style={gridStyle}>
        {camposNormales.map(renderCampo)}
        {camposCalc.length > 0 && (<><div style={separatorStyle}>CAMPOS CALCULADOS</div>{camposCalc.map(renderCampo)}</>)}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, padding: "8px 12px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderRadius: 8, lineHeight: 1.5 }}>
        <strong>Tabla</strong> — controla las columnas visibles en la pestaña del Panel 3.
        {tooltipConfig ? <><br /><strong>Mapa</strong> — controla los campos visibles en el tooltip al hacer clic en el mapa.</> : <><br />Este fichero no tiene tooltip de mapa (las celdas y trafos no se pintan en el mapa).</>}
      </div>
    </div>
  );
}

// ── Defaults ────────────────────────────────────────────────────────────────

function buildDefaults(campos: CampoDef[]): Record<string, boolean> {
  const d: Record<string, boolean> = {};
  campos.forEach(c => { d[c.key] = true; });
  return d;
}

export const DEFAULT_TABLA_LINEAS:  TablaLineasConfig  = buildDefaults(CAMPOS_LINEAS);
export const DEFAULT_TABLA_TRAMOS:  TablaTramosConfig  = buildDefaults(CAMPOS_TRAMOS);
export const DEFAULT_TABLA_CTS:     TablaCtsConfig     = buildDefaults(CAMPOS_CTS);
export const DEFAULT_TABLA_CUPS:    TablaCupsConfig    = buildDefaults(CAMPOS_CUPS);
export const DEFAULT_TABLA_CELDAS:  TablaCeldasConfig  = buildDefaults(CAMPOS_CELDAS);
export const DEFAULT_TABLA_TRAFOS:  TablaTrafosConfig  = buildDefaults(CAMPOS_TRAFOS);
