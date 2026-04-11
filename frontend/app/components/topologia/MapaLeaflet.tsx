"use client";

import { useEffect, useRef } from "react";

// ─── Tipos de datos ───────────────────────────────────────────────────────────

export interface CtMapa {
  id_ct:        string;
  nombre:       string;
  cini:         string | null;
  codigo_ccuu:  string | null;
  potencia_kva: number | null;
  tension_kv:   number | null;
  tension_construccion_kv: number | null;
  lat:          number | null;
  lon:          number | null;
  municipio_ine: string | null;
  provincia:    string | null;
  ccaa:         string | null;
  zona:         string | null;
  propiedad:    string | null;
  estado:       number | null;
  modelo:       string | null;
  punto_frontera: number | null;
  fecha_aps:    string | null;
  causa_baja:   number | null;
  fecha_baja:   string | null;
  fecha_ip:     string | null;
  tipo_inversion: number | null;
  financiado:   number | null;
  im_tramites:  number | null;
  im_construccion: number | null;
  im_trabajos:  number | null;
  subvenciones_europeas:   number | null;
  subvenciones_nacionales: number | null;
  subvenciones_prtr:       number | null;
  valor_auditado: number | null;
  cuenta:       string | null;
  motivacion:   string | null;
  avifauna:     number | null;
  identificador_baja: string | null;
  nudo_alta:    string | null;
  nudo_baja:    string | null;
}

export interface CupsMapa {
  cups:                   string;
  id_ct:                  string | null;
  cnae:                   string | null;
  tarifa:                 string | null;
  lat:                    number | null;
  lon:                    number | null;
  municipio:              string | null;
  provincia:              string | null;
  zona:                   string | null;
  conexion:               string | null;
  tension_kv:             number | null;
  estado_contrato:        number | null;
  potencia_contratada_kw: number | null;
  potencia_adscrita_kw:   number | null;
  energia_activa_kwh:     number | null;
  energia_reactiva_kvarh: number | null;
  autoconsumo:            number | null;
  cini_contador:          string | null;
  fecha_alta:             string | null;
  lecturas:               number | null;
  baja_suministro:        number | null;
  cambio_titularidad:     number | null;
  facturas_estimadas:     number | null;
  facturas_total:         number | null;
  cau:                    string | null;
  cod_auto:               string | null;
  cod_generacion_auto:    number | null;
  conexion_autoconsumo:   number | null;
  energia_autoconsumida_kwh: number | null;
  energia_excedentaria_kwh:  number | null;
}

export interface TramoMapa {
  id_tramo:  string;
  id_linea:  string | null;
  orden:     number | null;
  num_tramo: number | null;
  lat_ini:   number | null;
  lon_ini:   number | null;
  lat_fin:   number | null;
  lon_fin:   number | null;
  // B1
  cini:                    string | null;
  codigo_ccuu:             string | null;
  nudo_inicio:             string | null;
  nudo_fin:                string | null;
  ccaa_1:                  string | null;
  tension_kv:              number | null;
  tension_construccion_kv: number | null;
  longitud_km:             number | null;
  resistencia_ohm:         number | null;
  reactancia_ohm:          number | null;
  intensidad_a:            number | null;
  propiedad:               number | null;
  estado:                  number | null;
  operacion:               number | null;
  punto_frontera:          number | null;
  modelo:                  string | null;
  causa_baja:              number | null;
  fecha_aps:               string | null;
  fecha_baja:              string | null;
  fecha_ip:                string | null;
  tipo_inversion:          number | null;
  motivacion:              string | null;
  im_tramites:             number | null;
  im_construccion:         number | null;
  im_trabajos:             number | null;
  valor_auditado:          number | null;
  financiado:              number | null;
  subvenciones_europeas:   number | null;
  subvenciones_nacionales: number | null;
  subvenciones_prtr:       number | null;
  cuenta:                  string | null;
  avifauna:                number | null;
  identificador_baja:      string | null;
  // CT asignado
  id_ct:                string | null;
  metodo_asignacion_ct: string | null;
}

// ─── Interfaces de configuración ──────────────────────────────────────────────

export interface TooltipLineasConfig {
  mostrar_tension:              boolean;
  mostrar_tension_construccion: boolean;
  mostrar_longitud:             boolean;
  mostrar_intensidad:           boolean;
  mostrar_resistencia:          boolean;
  mostrar_reactancia:           boolean;
  mostrar_propiedad:            boolean;
  mostrar_estado:               boolean;
  mostrar_operacion:            boolean;
  mostrar_punto_frontera:       boolean;
  mostrar_modelo:               boolean;
  mostrar_fecha_aps:            boolean;
  mostrar_causa_baja:           boolean;
  mostrar_fecha_baja:           boolean;
  mostrar_fecha_ip:             boolean;
  mostrar_cini:                 boolean;
  mostrar_codigo_ccuu:          boolean;
  mostrar_nudo_inicio:          boolean;
  mostrar_nudo_fin:             boolean;
  mostrar_ccaa:                 boolean;
  mostrar_tipo_inversion:       boolean;
  mostrar_motivacion:           boolean;
  mostrar_im_tramites:          boolean;
  mostrar_im_construccion:      boolean;
  mostrar_im_trabajos:          boolean;
  mostrar_valor_auditado:       boolean;
  mostrar_financiado:           boolean;
  mostrar_subv_europeas:        boolean;
  mostrar_subv_nacionales:      boolean;
  mostrar_subv_prtr:            boolean;
  mostrar_cuenta:               boolean;
  mostrar_avifauna:             boolean;
  mostrar_identificador_baja:   boolean;
}

export interface TooltipTramosConfig {
  mostrar_id_tramo:          boolean;
  mostrar_id_linea:          boolean;
  mostrar_orden:             boolean;
  mostrar_num_tramo:         boolean;
  mostrar_longitud_segmento: boolean;
}

export interface TooltipCtsConfig {
  mostrar_potencia:             boolean;
  mostrar_tension:              boolean;
  mostrar_tension_construccion: boolean;
  mostrar_codigo_ccuu:          boolean;
  mostrar_nudo_alta:            boolean;
  mostrar_nudo_baja:            boolean;
  mostrar_municipio:            boolean;
  mostrar_provincia:            boolean;
  mostrar_ccaa:                 boolean;
  mostrar_zona:                 boolean;
  mostrar_estado:               boolean;
  mostrar_modelo:               boolean;
  mostrar_punto_frontera:       boolean;
  mostrar_fecha_aps:            boolean;
  mostrar_causa_baja:           boolean;
  mostrar_fecha_baja:           boolean;
  mostrar_fecha_ip:             boolean;
  mostrar_cini:                 boolean;
  mostrar_tipo_inversion:       boolean;
  mostrar_financiado:           boolean;
  mostrar_im_tramites:          boolean;
  mostrar_im_construccion:      boolean;
  mostrar_im_trabajos:          boolean;
  mostrar_subv_europeas:        boolean;
  mostrar_subv_nacionales:      boolean;
  mostrar_subv_prtr:            boolean;
  mostrar_valor_auditado:       boolean;
  mostrar_cuenta:               boolean;
  mostrar_motivacion:           boolean;
  mostrar_avifauna:             boolean;
  mostrar_identificador_baja:   boolean;
}

export interface TooltipCupsConfig {
  mostrar_tarifa:               boolean;
  mostrar_cnae:                 boolean;
  mostrar_tension:              boolean;
  mostrar_potencia:             boolean;
  mostrar_potencia_adscrita:    boolean;
  mostrar_energia_activa:       boolean;
  mostrar_energia_reactiva:     boolean;
  mostrar_autoconsumo:          boolean;
  mostrar_municipio:            boolean;
  mostrar_provincia:            boolean;
  mostrar_zona:                 boolean;
  mostrar_conexion:             boolean;
  mostrar_estado_contrato:      boolean;
  mostrar_fecha_alta:           boolean;
  mostrar_cini:                 boolean;
  mostrar_lecturas:             boolean;
  mostrar_baja_suministro:      boolean;
  mostrar_cambio_titularidad:   boolean;
  mostrar_facturas_estimadas:   boolean;
  mostrar_facturas_total:       boolean;
  mostrar_cau:                  boolean;
  mostrar_cod_auto:             boolean;
  mostrar_cod_generacion:       boolean;
  mostrar_conexion_autoconsumo: boolean;
  mostrar_energia_autoconsumida: boolean;
  mostrar_energia_excedentaria:  boolean;
}

// ─── Valores por defecto ──────────────────────────────────────────────────────

export const DEFAULT_TOOLTIP_LINEAS: TooltipLineasConfig = {
  mostrar_tension:              true,
  mostrar_tension_construccion: false,
  mostrar_longitud:             true,
  mostrar_intensidad:           false,
  mostrar_resistencia:          false,
  mostrar_reactancia:           false,
  mostrar_propiedad:            false,
  mostrar_estado:               false,
  mostrar_operacion:            true,
  mostrar_punto_frontera:       false,
  mostrar_modelo:               false,
  mostrar_fecha_aps:            true,
  mostrar_causa_baja:           false,
  mostrar_fecha_baja:           false,
  mostrar_fecha_ip:             false,
  mostrar_cini:                 false,
  mostrar_codigo_ccuu:          false,
  mostrar_nudo_inicio:          false,
  mostrar_nudo_fin:             false,
  mostrar_ccaa:                 false,
  mostrar_tipo_inversion:       false,
  mostrar_motivacion:           false,
  mostrar_im_tramites:          false,
  mostrar_im_construccion:      false,
  mostrar_im_trabajos:          false,
  mostrar_valor_auditado:       false,
  mostrar_financiado:           false,
  mostrar_subv_europeas:        false,
  mostrar_subv_nacionales:      false,
  mostrar_subv_prtr:            false,
  mostrar_cuenta:               false,
  mostrar_avifauna:             false,
  mostrar_identificador_baja:   false,
};

export const DEFAULT_TOOLTIP_TRAMOS: TooltipTramosConfig = {
  mostrar_id_tramo:          true,
  mostrar_id_linea:          true,
  mostrar_orden:             true,
  mostrar_num_tramo:         false,
  mostrar_longitud_segmento: true,
};

export const DEFAULT_TOOLTIP_CTS: TooltipCtsConfig = {
  mostrar_potencia:             true,
  mostrar_tension:              true,
  mostrar_tension_construccion: false,
  mostrar_codigo_ccuu:          false,
  mostrar_nudo_alta:            false,
  mostrar_nudo_baja:            false,
  mostrar_municipio:            true,
  mostrar_provincia:            false,
  mostrar_ccaa:                 false,
  mostrar_zona:                 false,
  mostrar_estado:               false,
  mostrar_modelo:               false,
  mostrar_punto_frontera:       false,
  mostrar_fecha_aps:            true,
  mostrar_causa_baja:           false,
  mostrar_fecha_baja:           false,
  mostrar_fecha_ip:             false,
  mostrar_cini:                 false,
  mostrar_tipo_inversion:       false,
  mostrar_financiado:           false,
  mostrar_im_tramites:          false,
  mostrar_im_construccion:      false,
  mostrar_im_trabajos:          false,
  mostrar_subv_europeas:        false,
  mostrar_subv_nacionales:      false,
  mostrar_subv_prtr:            false,
  mostrar_valor_auditado:       false,
  mostrar_cuenta:               false,
  mostrar_motivacion:           false,
  mostrar_avifauna:             false,
  mostrar_identificador_baja:   false,
};

export const DEFAULT_TOOLTIP_CUPS: TooltipCupsConfig = {
  mostrar_tarifa:               true,
  mostrar_cnae:                 false,
  mostrar_tension:              true,
  mostrar_potencia:             true,
  mostrar_potencia_adscrita:    false,
  mostrar_energia_activa:       false,
  mostrar_energia_reactiva:     false,
  mostrar_autoconsumo:          true,
  mostrar_municipio:            false,
  mostrar_provincia:            false,
  mostrar_zona:                 false,
  mostrar_conexion:             false,
  mostrar_estado_contrato:      false,
  mostrar_fecha_alta:           false,
  mostrar_cini:                 false,
  mostrar_lecturas:             false,
  mostrar_baja_suministro:      false,
  mostrar_cambio_titularidad:   false,
  mostrar_facturas_estimadas:   false,
  mostrar_facturas_total:       false,
  mostrar_cau:                  false,
  mostrar_cod_auto:             false,
  mostrar_cod_generacion:       false,
  mostrar_conexion_autoconsumo: false,
  mostrar_energia_autoconsumida: false,
  mostrar_energia_excedentaria:  false,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  cts:               CtMapa[];   // CTs a pintar en el mapa (puede estar filtrado por ctSeleccionado)
  ctsTodos:          CtMapa[];   // TODOS los CTs — para el selector del popup de línea
  cups:              CupsMapa[];
  tramos:            TramoMapa[];
  mostrarCts:        boolean;
  mostrarCups:       boolean;
  mostrarLineas:     boolean;
  lineaSeleccionada: string | null;
  tooltipLineas:     TooltipLineasConfig;
  tooltipTramos:     TooltipTramosConfig;
  tooltipCts:        TooltipCtsConfig;
  tooltipCups:       TooltipCupsConfig;
  onLineaClick:      (id_linea: string | null) => void;
  onReasignarCt:     (id_tramo: string, id_ct: string | null) => void;
}

// ─── Color y nivel ────────────────────────────────────────────────────────────

function colorLinea(id: string | null, tension_kv?: number | null): string {
  if (tension_kv !== null && tension_kv !== undefined)
    return tension_kv <= 1 ? "#F59E0B" : "#A855F7";
  if (!id) return "#F59E0B";
  if (id.includes("BTV") || id.includes("LBT")) return "#F59E0B";
  return "#A855F7";
}

function nivelLinea(id: string | null, tension_kv?: number | null): string {
  if (tension_kv !== null && tension_kv !== undefined)
    return tension_kv <= 1 ? "BT" : "MT";
  if (!id) return "BT";
  if (id.includes("BTV") || id.includes("LBT")) return "BT";
  return "MT";
}

// ─── Detección aéreo/subterráneo — Anexo I Orden IET/2660/2015 ───────────────
function esLineaSubterranea(codigo_ccuu: string | null): boolean {
  if (!codigo_ccuu) return false;
  const m = codigo_ccuu.match(/^TI-(\d+)/);
  if (!m) return false;
  const n = parseInt(m[1]);
  return n >= 14 && n <= 21;
}

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatearLongitud(m: number): string {
  return `${(m / 1000).toFixed(3)} km`;
}

// ─── Helpers tooltip ──────────────────────────────────────────────────────────

function fila(label: string, valor: string | number): string {
  return `<div style="margin-bottom:1px"><span style="color:#999">${label}:</span> <strong>${valor}</strong></div>`;
}

const DIVISOR = `<div style="margin:6px 0;border-top:1px solid #e5e7eb;"></div>`;

// ─── Selector CT en popup ─────────────────────────────────────────────────────
//
// Leaflet usa HTML estático — la interacción se gestiona via window.__reasignarCt
// que se registra al montar el mapa y apunta al callback React onReasignarCt.
// ctsTodos contiene TODOS los CTs de la empresa (no filtrado por ctSeleccionado).
//
function buildSelectorCt(idTramo: string, idCtActual: string | null, ctsTodos: CtMapa[]): string {
  const ctActualNombre = ctsTodos.find(c => c.id_ct === idCtActual)?.nombre ?? idCtActual ?? "Sin CT";

  const opciones = ctsTodos.map(ct =>
    `<option value="${ct.id_ct}" ${ct.id_ct === idCtActual ? "selected" : ""}>${ct.nombre}</option>`
  ).join("");

  return `
    ${DIVISOR}
    <div style="font-size:9px;font-weight:600;text-transform:uppercase;color:#aaa;margin-bottom:6px;letter-spacing:0.06em">Asignar CT</div>
    <div style="font-size:10px;color:#999;margin-bottom:4px">Actual: <strong style="color:#555">${ctActualNombre}</strong></div>
    <div style="display:flex;gap:4px;align-items:center">
      <select id="ct-select-${idTramo}" style="flex:1;font-size:10px;padding:2px 4px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;height:24px">
        <option value="">— Sin CT —</option>
        ${opciones}
      </select>
      <button
        onclick="window.__reasignarCt('${idTramo}', document.getElementById('ct-select-${idTramo}').value || null)"
        style="font-size:10px;padding:2px 8px;background:#1D9E75;color:#fff;border:none;border-radius:4px;cursor:pointer;height:24px;white-space:nowrap">
        ✓ Guardar
      </button>
    </div>
  `;
}

// ─── Tooltip línea (B11 + B1 + selector CT) ───────────────────────────────────

function buildTooltipLinea(
  t: TramoMapa,
  cfgL: TooltipLineasConfig,
  cfgT: TooltipTramosConfig,
  color: string,
  nivel: string,
  ctsTodos: CtMapa[],
): string {
  const longSegM =
    t.lat_ini !== null && t.lon_ini !== null && t.lat_fin !== null && t.lon_fin !== null
      ? haversineM(t.lat_ini, t.lon_ini, t.lat_fin, t.lon_fin)
      : null;

  const b11: string[] = [];
  if (cfgT.mostrar_id_tramo         && t.id_tramo)         b11.push(fila("ID segmento",    t.id_tramo));
  if (cfgT.mostrar_id_linea         && t.id_linea)         b11.push(fila("Línea",          t.id_linea));
  if (cfgT.mostrar_orden            && t.orden !== null)   b11.push(fila("Segmento",       `${t.orden} de ${t.num_tramo ?? "?"}`));
  if (cfgT.mostrar_num_tramo        && t.num_tramo !== null && !cfgT.mostrar_orden) b11.push(fila("Total seg.", t.num_tramo));
  if (cfgT.mostrar_longitud_segmento && longSegM !== null)  b11.push(fila("Long. segmento", formatearLongitud(longSegM)));

  const b1: string[] = [];
  if (cfgL.mostrar_tension              && t.tension_kv              !== null) b1.push(fila("Tensión",         `${t.tension_kv} kV`));
  if (cfgL.mostrar_tension_construccion && t.tension_construccion_kv !== null) b1.push(fila("T. construcción", `${t.tension_construccion_kv} kV`));
  if (cfgL.mostrar_longitud             && t.longitud_km             !== null) b1.push(fila("Long. línea",     `${t.longitud_km.toFixed(3)} km`));
  if (cfgL.mostrar_intensidad           && t.intensidad_a            !== null) b1.push(fila("Intensidad",      `${t.intensidad_a} A`));
  if (cfgL.mostrar_resistencia          && t.resistencia_ohm         !== null) b1.push(fila("Resistencia",     `${t.resistencia_ohm} Ω`));
  if (cfgL.mostrar_reactancia           && t.reactancia_ohm          !== null) b1.push(fila("Reactancia",      `${t.reactancia_ohm} Ω`));
  if (cfgL.mostrar_propiedad            && t.propiedad               !== null) b1.push(fila("Propiedad",       t.propiedad === 1 ? "Propia" : "Terceros"));
  if (cfgL.mostrar_estado               && t.estado                  !== null) b1.push(fila("Estado",          ["Sin cambios","Modificado","Alta"][t.estado] ?? t.estado));
  if (cfgL.mostrar_operacion            && t.operacion               !== null) b1.push(fila("Operación",       t.operacion === 1 ? "✅ Activo" : "⚠️ Abierto"));
  if (cfgL.mostrar_punto_frontera       && t.punto_frontera          !== null) b1.push(fila("Pto. frontera",   t.punto_frontera === 1 ? "Sí" : "No"));
  if (cfgL.mostrar_modelo               && t.modelo)                           b1.push(fila("Modelo",          t.modelo));
  if (cfgL.mostrar_fecha_aps            && t.fecha_aps)                        b1.push(fila("APS",             t.fecha_aps));
  if (cfgL.mostrar_causa_baja           && t.causa_baja              !== null) b1.push(fila("Causa baja",      t.causa_baja));
  if (cfgL.mostrar_fecha_baja           && t.fecha_baja)                       b1.push(fila("Fecha baja",      t.fecha_baja));
  if (cfgL.mostrar_fecha_ip             && t.fecha_ip)                         b1.push(fila("Fecha inv.parc.", t.fecha_ip));
  if (cfgL.mostrar_cini                 && t.cini)                             b1.push(fila("CINI",            t.cini));
  if (cfgL.mostrar_codigo_ccuu          && t.codigo_ccuu)                      b1.push(fila("Cód. CCUU",       t.codigo_ccuu));
  if (cfgL.mostrar_nudo_inicio          && t.nudo_inicio)                      b1.push(fila("Nudo inicio",     t.nudo_inicio));
  if (cfgL.mostrar_nudo_fin             && t.nudo_fin)                         b1.push(fila("Nudo fin",        t.nudo_fin));
  if (cfgL.mostrar_ccaa                 && t.ccaa_1)                           b1.push(fila("CCAA",            t.ccaa_1));
  if (cfgL.mostrar_tipo_inversion       && t.tipo_inversion          !== null) b1.push(fila("Tipo inv.",       t.tipo_inversion));
  if (cfgL.mostrar_motivacion           && t.motivacion)                       b1.push(fila("Motivación",      t.motivacion));
  if (cfgL.mostrar_im_tramites          && t.im_tramites             !== null) b1.push(fila("IM trámites",     `${t.im_tramites.toLocaleString()} €`));
  if (cfgL.mostrar_im_construccion      && t.im_construccion         !== null) b1.push(fila("IM construcción", `${t.im_construccion.toLocaleString()} €`));
  if (cfgL.mostrar_im_trabajos          && t.im_trabajos             !== null) b1.push(fila("IM trabajos",     `${t.im_trabajos.toLocaleString()} €`));
  if (cfgL.mostrar_valor_auditado       && t.valor_auditado          !== null) b1.push(fila("Valor auditado",  `${t.valor_auditado.toLocaleString()} €`));
  if (cfgL.mostrar_financiado           && t.financiado              !== null) b1.push(fila("Financiado",      `${t.financiado} %`));
  if (cfgL.mostrar_subv_europeas        && t.subvenciones_europeas   !== null) b1.push(fila("Subv. europeas",  `${t.subvenciones_europeas.toLocaleString()} €`));
  if (cfgL.mostrar_subv_nacionales      && t.subvenciones_nacionales !== null) b1.push(fila("Subv. nac.",      `${t.subvenciones_nacionales.toLocaleString()} €`));
  if (cfgL.mostrar_subv_prtr            && t.subvenciones_prtr       !== null) b1.push(fila("Subv. PRTR",      `${t.subvenciones_prtr.toLocaleString()} €`));
  if (cfgL.mostrar_cuenta               && t.cuenta)                           b1.push(fila("Cuenta",          t.cuenta));
  if (cfgL.mostrar_avifauna             && t.avifauna                !== null) b1.push(fila("Avifauna",        t.avifauna === 1 ? "Sí" : "No"));
  if (cfgL.mostrar_identificador_baja   && t.identificador_baja)               b1.push(fila("Id. baja",        t.identificador_baja));

  const cabecera = `
    <div style="font-weight:700;font-size:12px;color:${color};margin-bottom:1px">${nivel}</div>
    <div style="color:#888;font-size:10px;font-family:monospace;margin-bottom:4px">${t.id_linea ?? "—"}</div>`;
  const secB11 = b11.length > 0
    ? `<div style="font-size:9px;font-weight:600;text-transform:uppercase;color:#aaa;margin-bottom:3px;letter-spacing:0.06em">Segmento (B11)</div>${b11.join("")}`
    : "";
  const sep   = b11.length > 0 && b1.length > 0 ? DIVISOR : "";
  const secB1 = b1.length > 0
    ? `<div style="font-size:9px;font-weight:600;text-transform:uppercase;color:#aaa;margin-bottom:3px;letter-spacing:0.06em">Línea (B1)</div>${b1.join("")}`
    : "";

  const selectorCt = buildSelectorCt(t.id_tramo, t.id_ct ?? null, ctsTodos);

  return `<div style="font-size:11px;line-height:1.7;min-width:220px;max-width:300px">
    ${cabecera}${secB11}${sep}${secB1}${selectorCt}
  </div>`;
}

function buildTooltipCt(ct: CtMapa, cfg: TooltipCtsConfig): string {
  const f: string[] = [];
  if (cfg.mostrar_potencia             && ct.potencia_kva              !== null) f.push(fila("Potencia",          `${ct.potencia_kva} kVA`));
  if (cfg.mostrar_tension              && ct.tension_kv                !== null) f.push(fila("Tensión",           `${ct.tension_kv} kV`));
  if (cfg.mostrar_tension_construccion && ct.tension_construccion_kv   !== null) f.push(fila("T. construcción",   `${ct.tension_construccion_kv} kV`));
  if (cfg.mostrar_codigo_ccuu          && ct.codigo_ccuu)                        f.push(fila("Cód. CCUU",         ct.codigo_ccuu));
  if (cfg.mostrar_nudo_alta            && ct.nudo_alta)                          f.push(fila("Nudo alta",         ct.nudo_alta));
  if (cfg.mostrar_nudo_baja            && ct.nudo_baja)                          f.push(fila("Nudo baja",         ct.nudo_baja));
  if (cfg.mostrar_municipio            && ct.municipio_ine)                      f.push(fila("Municipio",         ct.municipio_ine));
  if (cfg.mostrar_provincia            && ct.provincia)                          f.push(fila("Provincia",         ct.provincia));
  if (cfg.mostrar_ccaa                 && ct.ccaa)                               f.push(fila("CCAA",              ct.ccaa));
  if (cfg.mostrar_zona                 && ct.zona)                               f.push(fila("Zona",              ct.zona));
  if (cfg.mostrar_estado               && ct.estado                    !== null) f.push(fila("Estado",            ["Sin cambios","Modificado","Alta"][ct.estado] ?? ct.estado));
  if (cfg.mostrar_modelo               && ct.modelo)                             f.push(fila("Modelo",            ct.modelo));
  if (cfg.mostrar_punto_frontera       && ct.punto_frontera            !== null) f.push(fila("Pto. frontera",     ct.punto_frontera === 1 ? "Sí" : "No"));
  if (cfg.mostrar_fecha_aps            && ct.fecha_aps)                          f.push(fila("APS",               ct.fecha_aps));
  if (cfg.mostrar_causa_baja           && ct.causa_baja                !== null) f.push(fila("Causa baja",        ct.causa_baja));
  if (cfg.mostrar_fecha_baja           && ct.fecha_baja)                         f.push(fila("Fecha baja",        ct.fecha_baja));
  if (cfg.mostrar_fecha_ip             && ct.fecha_ip)                           f.push(fila("Fecha inv.parc.",   ct.fecha_ip));
  if (cfg.mostrar_cini                 && ct.cini)                               f.push(fila("CINI",              ct.cini));
  if (cfg.mostrar_tipo_inversion       && ct.tipo_inversion            !== null) f.push(fila("Tipo inv.",         ct.tipo_inversion));
  if (cfg.mostrar_financiado           && ct.financiado                !== null) f.push(fila("Financiado",        `${ct.financiado} %`));
  if (cfg.mostrar_im_tramites          && ct.im_tramites               !== null) f.push(fila("IM trámites",       `${ct.im_tramites.toLocaleString()} €`));
  if (cfg.mostrar_im_construccion      && ct.im_construccion           !== null) f.push(fila("IM construcción",   `${ct.im_construccion.toLocaleString()} €`));
  if (cfg.mostrar_im_trabajos          && ct.im_trabajos               !== null) f.push(fila("IM trabajos",       `${ct.im_trabajos.toLocaleString()} €`));
  if (cfg.mostrar_subv_europeas        && ct.subvenciones_europeas     !== null) f.push(fila("Subv. europeas",    `${ct.subvenciones_europeas.toLocaleString()} €`));
  if (cfg.mostrar_subv_nacionales      && ct.subvenciones_nacionales   !== null) f.push(fila("Subv. nac.",        `${ct.subvenciones_nacionales.toLocaleString()} €`));
  if (cfg.mostrar_subv_prtr            && ct.subvenciones_prtr         !== null) f.push(fila("Subv. PRTR",        `${ct.subvenciones_prtr.toLocaleString()} €`));
  if (cfg.mostrar_valor_auditado       && ct.valor_auditado            !== null) f.push(fila("Valor auditado",    `${ct.valor_auditado.toLocaleString()} €`));
  if (cfg.mostrar_cuenta               && ct.cuenta)                             f.push(fila("Cuenta",            ct.cuenta));
  if (cfg.mostrar_motivacion           && ct.motivacion)                         f.push(fila("Motivación",        ct.motivacion));
  if (cfg.mostrar_avifauna             && ct.avifauna                  !== null) f.push(fila("Avifauna",          ct.avifauna === 1 ? "Sí" : "No"));
  if (cfg.mostrar_identificador_baja   && ct.identificador_baja)                 f.push(fila("Id. baja",          ct.identificador_baja));
  return `<div style="font-size:11px;min-width:180px;max-width:260px;line-height:1.7">
    <div style="font-weight:700;font-size:12px;margin-bottom:1px">${ct.nombre}</div>
    <div style="color:#888;font-size:10px;font-family:monospace;margin-bottom:4px">${ct.id_ct}</div>
    ${f.join("")}
    ${ct.propiedad === "E" ? `<div style="margin-top:4px;color:#EF9F27;font-size:10px">⚠️ Cedido por tercero</div>` : ""}
  </div>`;
}

function buildTooltipCups(c: CupsMapa, cfg: TooltipCupsConfig): string {
  const f: string[] = [];
  if (cfg.mostrar_tarifa               && c.tarifa)                              f.push(fila("Tarifa",            c.tarifa));
  if (cfg.mostrar_cnae                 && c.cnae)                                f.push(fila("CNAE",              c.cnae));
  if (cfg.mostrar_tension              && c.tension_kv              !== null)    f.push(fila("Tensión",           `${c.tension_kv} kV`));
  if (cfg.mostrar_potencia             && c.potencia_contratada_kw  !== null)    f.push(fila("Potencia cont.",    `${c.potencia_contratada_kw} kW`));
  if (cfg.mostrar_potencia_adscrita    && c.potencia_adscrita_kw    !== null)    f.push(fila("Potencia adscrita", `${c.potencia_adscrita_kw} kW`));
  if (cfg.mostrar_energia_activa       && c.energia_activa_kwh      !== null)    f.push(fila("E. activa",         `${c.energia_activa_kwh?.toLocaleString()} kWh`));
  if (cfg.mostrar_energia_reactiva     && c.energia_reactiva_kvarh  !== null)    f.push(fila("E. reactiva",       `${c.energia_reactiva_kvarh?.toLocaleString()} kVArh`));
  if (cfg.mostrar_autoconsumo          && c.autoconsumo             !== null)    f.push(fila("Autoconsumo",       c.autoconsumo === 1 ? "Sí" : "No"));
  if (cfg.mostrar_municipio            && c.municipio)                           f.push(fila("Municipio",         c.municipio));
  if (cfg.mostrar_provincia            && c.provincia)                           f.push(fila("Provincia",         c.provincia));
  if (cfg.mostrar_zona                 && c.zona)                                f.push(fila("Zona",              c.zona));
  if (cfg.mostrar_conexion             && c.conexion)                            f.push(fila("Conexión",          c.conexion === "A" ? "Aérea" : "Subterránea"));
  if (cfg.mostrar_estado_contrato      && c.estado_contrato         !== null)    f.push(fila("Contrato",          c.estado_contrato === 0 ? "Vigente" : "Sin contrato"));
  if (cfg.mostrar_fecha_alta           && c.fecha_alta)                          f.push(fila("Fecha inst.",       c.fecha_alta));
  if (cfg.mostrar_cini                 && c.cini_contador)                       f.push(fila("CINI contador",     c.cini_contador));
  if (cfg.mostrar_lecturas             && c.lecturas                !== null)    f.push(fila("Lecturas",          c.lecturas));
  if (cfg.mostrar_baja_suministro      && c.baja_suministro         !== null)    f.push(fila("Baja suministro",   c.baja_suministro === 1 ? "Sí" : "No"));
  if (cfg.mostrar_cambio_titularidad   && c.cambio_titularidad      !== null)    f.push(fila("Cambio titular.",   c.cambio_titularidad === 1 ? "Sí" : "No"));
  if (cfg.mostrar_facturas_estimadas   && c.facturas_estimadas      !== null)    f.push(fila("Fact. estimadas",   c.facturas_estimadas));
  if (cfg.mostrar_facturas_total       && c.facturas_total          !== null)    f.push(fila("Fact. total",       c.facturas_total));
  if (cfg.mostrar_cau                  && c.cau)                                 f.push(fila("CAU",               c.cau));
  if (cfg.mostrar_cod_auto             && c.cod_auto)                            f.push(fila("Cód. autocons.",    c.cod_auto));
  if (cfg.mostrar_cod_generacion       && c.cod_generacion_auto     !== null)    f.push(fila("Tecnología gen.",   c.cod_generacion_auto));
  if (cfg.mostrar_conexion_autoconsumo && c.conexion_autoconsumo    !== null)    f.push(fila("Conex. autocons.",  ["Red interior","Red dist.","Mixta"][c.conexion_autoconsumo] ?? c.conexion_autoconsumo));
  if (cfg.mostrar_energia_autoconsumida && c.energia_autoconsumida_kwh !== null) f.push(fila("E. autoconsumida", `${c.energia_autoconsumida_kwh?.toLocaleString()} kWh`));
  if (cfg.mostrar_energia_excedentaria  && c.energia_excedentaria_kwh  !== null) f.push(fila("E. excedentaria",  `${c.energia_excedentaria_kwh?.toLocaleString()} kWh`));
  return `<div style="font-size:11px;min-width:200px;max-width:280px;line-height:1.7">
    <div style="font-weight:700;font-size:11px;font-family:monospace;margin-bottom:1px">${c.cups}</div>
    <div style="color:#888;font-size:10px;margin-bottom:4px">CT: ${c.id_ct ?? "No asignado"}</div>
    ${f.join("")}
  </div>`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function MapaLeaflet({
  cts, ctsTodos, cups, tramos,
  mostrarCts, mostrarCups, mostrarLineas,
  lineaSeleccionada,
  tooltipLineas, tooltipTramos, tooltipCts, tooltipCups,
  onLineaClick,
  onReasignarCt,
}: Props) {
  const mapRef             = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaInstancia      = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctLayerRef         = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cupsLayerRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineasLayerRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marcadoresLayerRef = useRef<any>(null);

  const onReasignarCtRef = useRef(onReasignarCt);
  useEffect(() => { onReasignarCtRef.current = onReasignarCt; }, [onReasignarCt]);

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mapaInstancia.current || !mapRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__reasignarCt = (idTramo: string, idCt: string | null) => {
      onReasignarCtRef.current(idTramo, idCt || null);
    };

    import("leaflet").then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L.Browser as any).touch   = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L.Browser as any).pointer = false;

      const map = L.map(mapRef.current!, {
        center: [40.0, -3.7], zoom: 7,
        dragging: true, scrollWheelZoom: true,
        doubleClickZoom: true, zoomControl: true, touchZoom: false,
      });

      const capaOSM = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }
      );
      const capaPNOA = L.tileLayer(
        "https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg",
        { attribution: '© <a href="https://www.ign.es">IGN</a> — PNOA máxima actualidad', maxZoom: 19 }
      );
      const capaIGNBase = L.tileLayer(
        "https://www.ign.es/wmts/ign-base?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=IGNBaseTodo&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg",
        { attribution: '© <a href="https://www.ign.es">IGN</a> — Base cartográfica', maxZoom: 17 }
      );
      const capaCatastro = L.tileLayer.wms(
        "https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { layers: "Catastro", format: "image/png", transparent: true, attribution: '© <a href="https://www.catastro.meh.es">Catastro</a> — DGCT', maxZoom: 19 } as any
      );

      capaOSM.addTo(map);
      L.control.layers(
        { "OpenStreetMap": capaOSM, "PNOA (Ortofoto IGN)": capaPNOA, "IGN Base": capaIGNBase, "Catastro": capaCatastro },
        {}, { position: "topright", collapsed: true }
      ).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapAny = map as any;
      if (mapAny.touchZoom) mapAny.touchZoom.disable();
      if (mapAny.tap)       mapAny.tap.disable();
      map.dragging.enable();

      lineasLayerRef.current     = L.layerGroup().addTo(map);
      marcadoresLayerRef.current = L.layerGroup().addTo(map);
      ctLayerRef.current         = L.layerGroup().addTo(map);
      cupsLayerRef.current       = L.layerGroup().addTo(map);
      mapaInstancia.current      = map;
      setTimeout(() => map.invalidateSize(), 200);

      const container = mapRef.current!;
      let dragging = false, lastX = 0, lastY = 0;
      const onMouseDown = (e: MouseEvent) => { if (e.button !== 0) return; dragging = true; lastX = e.clientX; lastY = e.clientY; };
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging || !mapaInstancia.current) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (dx !== 0 || dy !== 0) mapaInstancia.current.panBy([-dx, -dy], { animate: false });
        lastX = e.clientX; lastY = e.clientY;
      };
      const onMouseUp = () => { dragging = false; };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!mapaInstancia.current) return;
        const zoom = mapaInstancia.current.getZoom();
        mapaInstancia.current.setZoom(e.deltaY < 0 ? zoom + 1 : zoom - 1);
      };
      container.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mousemove",  onMouseMove);
      document.addEventListener("mouseup",    onMouseUp);
      container.addEventListener("wheel",     onWheel, { passive: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapaInstancia as any)._cleanup = () => {
        container.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mousemove",  onMouseMove);
        document.removeEventListener("mouseup",    onMouseUp);
        container.removeEventListener("wheel",     onWheel);
      };
    });
    return () => {
      if (mapaInstancia.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapaInstancia as any)._cleanup?.();
        mapaInstancia.current.remove();
        mapaInstancia.current      = null;
        ctLayerRef.current         = null;
        cupsLayerRef.current       = null;
        lineasLayerRef.current     = null;
        marcadoresLayerRef.current = null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__reasignarCt;
    };
  }, []);

  // ── Pintar líneas ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lineasLayerRef.current || !marcadoresLayerRef.current) return;
    import("leaflet").then(L => {
      lineasLayerRef.current.clearLayers();
      marcadoresLayerRef.current.clearLayers();
      if (!mostrarLineas) return;

      const porLinea = new Map<string, TramoMapa[]>();
      tramos.forEach(t => {
        const key = t.id_linea ?? "__sin_linea__";
        if (!porLinea.has(key)) porLinea.set(key, []);
        porLinea.get(key)!.push(t);
      });

      const puntosUnion: [number, number][] = [];

      const pintarTramo = (t: TramoMapa) => {
        if (t.lat_ini === null || t.lon_ini === null || t.lat_fin === null || t.lon_fin === null) return;
        const nivel          = nivelLinea(t.id_linea, t.tension_kv);
        const color          = colorLinea(t.id_linea, t.tension_kv);
        const esSeleccionada = lineaSeleccionada !== null && t.id_linea === lineaSeleccionada;
        const haySeleccion   = lineaSeleccionada !== null;

        const peso       = esSeleccionada ? (nivel === "MT" ? 5 : 4) : (nivel === "MT" ? 2.5 : 1.5);
        const opacity    = haySeleccion   ? (esSeleccionada ? 1 : 0.15) : 0.85;
        const colorFinal = esSeleccionada ? (nivel === "MT" ? "#7C3AED" : "#D97706") : color;
        const subterranea = esLineaSubterranea(t.codigo_ccuu);

        const poly = L.polyline(
          [[t.lat_ini, t.lon_ini], [t.lat_fin, t.lon_fin]],
          { color: colorFinal, weight: peso, opacity, dashArray: subterranea ? "8 5" : undefined }
        );
        poly.on("click", () => { onLineaClick(t.id_linea); });
        // ctsTodos = todos los CTs de la empresa, para que el selector tenga las 46 opciones
        poly.bindPopup(buildTooltipLinea(t, tooltipLineas, tooltipTramos, colorFinal, nivel, ctsTodos), {
          maxWidth: 320,
        });
        poly.addTo(lineasLayerRef.current);

        if (esSeleccionada) puntosUnion.push([t.lat_fin, t.lon_fin]);
      };

      tramos.filter(t => t.id_linea !== lineaSeleccionada).forEach(pintarTramo);
      tramos.filter(t => t.id_linea === lineaSeleccionada).forEach(pintarTramo);

      puntosUnion.forEach(([lat, lon]) => {
        L.circleMarker([lat, lon], {
          radius: 3, color: "#000000", weight: 1, fillColor: "#000000", fillOpacity: 1,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).addTo(marcadoresLayerRef.current);
      });

      if (lineaSeleccionada && marcadoresLayerRef.current) {
        const segmentos = (porLinea.get(lineaSeleccionada) ?? [])
          .filter(t => t.lat_ini !== null)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

        if (segmentos.length > 0) {
          const primero = segmentos[0];
          const ultimo  = segmentos[segmentos.length - 1];
          const color   = colorLinea(lineaSeleccionada);

          if (primero.lat_ini !== null && primero.lon_ini !== null) {
            L.marker([primero.lat_ini, primero.lon_ini], {
              icon: L.divIcon({
                className: "",
                html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:bold">▶</div>`,
                iconSize: [14, 14], iconAnchor: [7, 7],
              }),
            }).bindPopup(`<div style="font-size:11px"><strong>Inicio de línea</strong><br><span style="color:#888;font-size:10px;font-family:monospace">${lineaSeleccionada}</span><br>Segmento 1 de ${primero.num_tramo ?? "?"}</div>`)
              .addTo(marcadoresLayerRef.current);
          }

          if (ultimo.lat_fin !== null && ultimo.lon_fin !== null) {
            L.marker([ultimo.lat_fin, ultimo.lon_fin], {
              icon: L.divIcon({
                className: "",
                html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:bold">■</div>`,
                iconSize: [14, 14], iconAnchor: [7, 7],
              }),
            }).bindPopup(`<div style="font-size:11px"><strong>Fin de línea</strong><br><span style="color:#888;font-size:10px;font-family:monospace">${lineaSeleccionada}</span><br>Segmento ${ultimo.orden ?? "?"} de ${ultimo.num_tramo ?? "?"}</div>`)
              .addTo(marcadoresLayerRef.current);
          }
        }
      }
    });
  }, [tramos, mostrarLineas, tooltipLineas, tooltipTramos, lineaSeleccionada, onLineaClick, ctsTodos]);

  // ── Pintar CTs ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctLayerRef.current) return;
    import("leaflet").then(L => {
      ctLayerRef.current.clearLayers();
      if (!mostrarCts) return;
      const iconCt = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#E24B4A;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      cts.forEach(ct => {
        if (ct.lat === null || ct.lon === null) return;
        L.marker([ct.lat, ct.lon], { icon: iconCt })
          .bindPopup(buildTooltipCt(ct, tooltipCts))
          .addTo(ctLayerRef.current);
      });
    });
  }, [cts, mostrarCts, tooltipCts]);

  // ── Pintar CUPS ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cupsLayerRef.current) return;
    import("leaflet").then(L => {
      cupsLayerRef.current.clearLayers();
      if (!mostrarCups) return;
      const iconCups = L.divIcon({
        className: "",
        html: `<div style="width:7px;height:7px;border-radius:50%;background:#378ADD;border:1px solid rgba(255,255,255,0.9);box-shadow:0 1px 2px rgba(0,0,0,0.3)"></div>`,
        iconSize: [7, 7], iconAnchor: [3, 3],
      });
      cups.forEach(c => {
        if (c.lat === null || c.lon === null) return;
        L.marker([c.lat, c.lon], { icon: iconCups })
          .bindPopup(buildTooltipCups(c, tooltipCups))
          .addTo(cupsLayerRef.current);
      });
      const validos = cups.filter(c => c.lat !== null && c.lon !== null);
      if (validos.length > 0 && mapaInstancia.current) {
        const bounds = L.latLngBounds(validos.map(c => [c.lat!, c.lon!] as [number, number]));
        mapaInstancia.current.fitBounds(bounds, { padding: [40, 40] });
      }
    });
  }, [cups, mostrarCups, tooltipCups]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ width: "100%", height: "580px" }} />
    </>
  );
}
