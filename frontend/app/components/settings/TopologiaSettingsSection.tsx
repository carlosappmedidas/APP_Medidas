"use client";

import type { TooltipLineasConfig, TooltipTramosConfig, TooltipCtsConfig, TooltipCupsConfig } from "../topologia/MapaLeaflet";

interface Props {
  tooltipLineas:  TooltipLineasConfig;
  tooltipTramos:  TooltipTramosConfig;
  tooltipCts:     TooltipCtsConfig;
  tooltipCups:    TooltipCupsConfig;
  onChangeLineas: (config: TooltipLineasConfig) => void;
  onChangeTramos: (config: TooltipTramosConfig) => void;
  onChangeCts:    (config: TooltipCtsConfig)    => void;
  onChangeCups:   (config: TooltipCupsConfig)   => void;
}

// ── Campos B1 — Líneas ────────────────────────────────────────────────────────

const CAMPOS_LINEAS: { key: keyof TooltipLineasConfig; label: string; desc: string }[] = [
  { key: "mostrar_tension",              label: "Tensión explotación (kV)",    desc: "TENSION_EXPLOTACION" },
  { key: "mostrar_tension_construccion", label: "Tensión construcción (kV)",   desc: "TENSION_CONSTRUCCION" },
  { key: "mostrar_longitud",             label: "Longitud total línea (km)",   desc: "LONGITUD — longitud total de la línea según B1" },
  { key: "mostrar_intensidad",           label: "Intensidad máx. (A)",         desc: "INTENSIDAD" },
  { key: "mostrar_resistencia",          label: "Resistencia (Ω)",             desc: "RESISTENCIA" },
  { key: "mostrar_reactancia",           label: "Reactancia (Ω)",              desc: "REACTANCIA" },
  { key: "mostrar_propiedad",            label: "Propiedad",                   desc: "0=terceros, 1=propia" },
  { key: "mostrar_estado",               label: "Estado",                      desc: "0=sin cambios, 1=modificado, 2=alta" },
  { key: "mostrar_operacion",            label: "Operación",                   desc: "0=abierto, 1=activo" },
  { key: "mostrar_punto_frontera",       label: "Punto frontera",              desc: "0=no, 1=sí" },
  { key: "mostrar_modelo",               label: "Modelo",                      desc: "I/M/D/E" },
  { key: "mostrar_fecha_aps",            label: "Fecha APS",                   desc: "FECHA_APS" },
  { key: "mostrar_causa_baja",           label: "Causa baja",                  desc: "0=activo, 1/2/3=baja" },
  { key: "mostrar_fecha_baja",           label: "Fecha baja",                  desc: "FECHA_BAJA" },
  { key: "mostrar_fecha_ip",             label: "Fecha inv. parcial",          desc: "FECHA_IP" },
  { key: "mostrar_cini",                 label: "CINI",                        desc: "CINI" },
  { key: "mostrar_codigo_ccuu",          label: "Código CCUU",                 desc: "CODIGO_CCUU" },
  { key: "mostrar_nudo_inicio",          label: "Nudo inicial",                desc: "NUDO_INICIAL" },
  { key: "mostrar_nudo_fin",             label: "Nudo final",                  desc: "NUDO_FINAL" },
  { key: "mostrar_ccaa",                 label: "CCAA",                        desc: "CCAA_1" },
  { key: "mostrar_tipo_inversion",       label: "Tipo inversión",              desc: "TIPO_INVERSION" },
  { key: "mostrar_motivacion",           label: "Motivación",                  desc: "MOTIVACION" },
  { key: "mostrar_im_tramites",          label: "IM Trámites (€)",             desc: "IM_TRAMITES" },
  { key: "mostrar_im_construccion",      label: "IM Construcción (€)",         desc: "IM_CONSTRUCCION" },
  { key: "mostrar_im_trabajos",          label: "IM Trabajos (€)",             desc: "IM_TRABAJOS" },
  { key: "mostrar_valor_auditado",       label: "Valor auditado (€)",          desc: "VALOR_AUDITADO" },
  { key: "mostrar_financiado",           label: "Financiado (%)",              desc: "FINANCIADO" },
  { key: "mostrar_subv_europeas",        label: "Subv. europeas (€)",          desc: "SUBVENCIONES_EUROPEAS" },
  { key: "mostrar_subv_nacionales",      label: "Subv. nacionales (€)",        desc: "SUBVENCIONES_NACIONALES" },
  { key: "mostrar_subv_prtr",            label: "Subv. PRTR (€)",              desc: "SUBVENCIONES_PRTR" },
  { key: "mostrar_cuenta",               label: "Cuenta contable",             desc: "CUENTA" },
  { key: "mostrar_avifauna",             label: "Avifauna",                    desc: "0=no, 1=sí" },
  { key: "mostrar_identificador_baja",   label: "Identificador baja",          desc: "IDENTIFICADOR_BAJA" },
];

// ── Campos B11 — Tramos ───────────────────────────────────────────────────────

const CAMPOS_TRAMOS: { key: keyof TooltipTramosConfig; label: string; desc: string }[] = [
  { key: "mostrar_id_tramo",          label: "ID Segmento",             desc: "SEGMENTO — identificador único del segmento" },
  { key: "mostrar_id_linea",          label: "ID Línea",                desc: "IDENTIFICADOR_TRAMO — línea a la que pertenece" },
  { key: "mostrar_orden",             label: "Posición en la línea",    desc: "ORDEN_SEGMENTO / N_SEGMENTOS" },
  { key: "mostrar_num_tramo",         label: "Total segmentos",         desc: "N_SEGMENTOS — total de segmentos de la línea" },
  { key: "mostrar_longitud_segmento", label: "Longitud segmento (m/km)", desc: "Calculada por Haversine a partir de las coordenadas WGS84 del segmento" },
];

// ── Campos B2 — CTs ───────────────────────────────────────────────────────────

const CAMPOS_CTS: { key: keyof TooltipCtsConfig; label: string; desc: string }[] = [
  { key: "mostrar_potencia",             label: "Potencia (kVA)",              desc: "POTENCIA" },
  { key: "mostrar_tension",              label: "Tensión explotación (kV)",    desc: "TENSION_EXPLOTACION" },
  { key: "mostrar_tension_construccion", label: "Tensión construcción (kV)",   desc: "TENSION_CONSTRUCCION" },
  { key: "mostrar_codigo_ccuu",          label: "Código CCUU",                 desc: "CODIGO_CCUU" },
  { key: "mostrar_nudo_alta",            label: "Nudo alta",                   desc: "NUDO_ALTA" },
  { key: "mostrar_nudo_baja",            label: "Nudo baja",                   desc: "NUDO_BAJA" },
  { key: "mostrar_municipio",            label: "Municipio",                   desc: "MUNICIPIO (INE)" },
  { key: "mostrar_provincia",            label: "Provincia",                   desc: "PROVINCIA (INE)" },
  { key: "mostrar_ccaa",                 label: "CCAA",                        desc: "CCAA (INE)" },
  { key: "mostrar_zona",                 label: "Zona calidad",                desc: "U / SU / RC / RD" },
  { key: "mostrar_estado",               label: "Estado",                      desc: "0=sin cambios, 1=modificado, 2=alta" },
  { key: "mostrar_modelo",               label: "Modelo",                      desc: "I/M/D/E" },
  { key: "mostrar_punto_frontera",       label: "Punto frontera",              desc: "0=no, 1=sí" },
  { key: "mostrar_fecha_aps",            label: "Fecha APS",                   desc: "FECHA_APS" },
  { key: "mostrar_causa_baja",           label: "Causa baja",                  desc: "0=activo, 1/2/3=baja" },
  { key: "mostrar_fecha_baja",           label: "Fecha baja",                  desc: "FECHA_BAJA" },
  { key: "mostrar_fecha_ip",             label: "Fecha inv. parcial",          desc: "FECHA_IP" },
  { key: "mostrar_cini",                 label: "CINI",                        desc: "CINI" },
  { key: "mostrar_tipo_inversion",       label: "Tipo inversión",              desc: "TIPO_INVERSION" },
  { key: "mostrar_financiado",           label: "Financiado (%)",              desc: "FINANCIADO" },
  { key: "mostrar_im_tramites",          label: "IM Trámites (€)",             desc: "IM_TRAMITES" },
  { key: "mostrar_im_construccion",      label: "IM Construcción (€)",         desc: "IM_CONSTRUCCION" },
  { key: "mostrar_im_trabajos",          label: "IM Trabajos (€)",             desc: "IM_TRABAJOS" },
  { key: "mostrar_subv_europeas",        label: "Subv. europeas (€)",          desc: "SUBVENCIONES_EUROPEAS" },
  { key: "mostrar_subv_nacionales",      label: "Subv. nacionales (€)",        desc: "SUBVENCIONES_NACIONALES" },
  { key: "mostrar_subv_prtr",            label: "Subv. PRTR (€)",              desc: "SUBVENCIONES_PRTR" },
  { key: "mostrar_valor_auditado",       label: "Valor auditado (€)",          desc: "VALOR_AUDITADO" },
  { key: "mostrar_cuenta",               label: "Cuenta contable",             desc: "CUENTA" },
  { key: "mostrar_motivacion",           label: "Motivación",                  desc: "MOTIVACION" },
  { key: "mostrar_avifauna",             label: "Avifauna",                    desc: "0=no, 1=sí" },
  { key: "mostrar_identificador_baja",   label: "Identificador baja",          desc: "IDENTIFICADOR_BAJA" },
];

// ── Campos A1 — CUPS ──────────────────────────────────────────────────────────

const CAMPOS_CUPS: { key: keyof TooltipCupsConfig; label: string; desc: string }[] = [
  { key: "mostrar_tarifa",               label: "Tarifa",                      desc: "COD_TFA" },
  { key: "mostrar_cnae",                 label: "CNAE",                        desc: "CNAE-2009" },
  { key: "mostrar_tension",              label: "Tensión (kV)",                desc: "TENSION" },
  { key: "mostrar_potencia",             label: "Potencia contratada (kW)",    desc: "POTENCIA_CONTRATADA" },
  { key: "mostrar_potencia_adscrita",    label: "Potencia adscrita (kW)",      desc: "POTENCIA_ADSCRITA" },
  { key: "mostrar_energia_activa",       label: "Energía activa (kWh)",        desc: "ENERGIA_ACTIVA_CONSUMIDA" },
  { key: "mostrar_energia_reactiva",     label: "Energía reactiva (kVArh)",    desc: "ENERGIA_REACTIVA_CONSUMIDA" },
  { key: "mostrar_autoconsumo",          label: "Autoconsumo",                 desc: "0=no, 1=sí" },
  { key: "mostrar_municipio",            label: "Municipio",                   desc: "MUNICIPIO (INE)" },
  { key: "mostrar_provincia",            label: "Provincia",                   desc: "PROVINCIA (INE)" },
  { key: "mostrar_zona",                 label: "Zona calidad",                desc: "U / SU / RC / RD" },
  { key: "mostrar_conexion",             label: "Conexión",                    desc: "A=aérea, S=subterránea" },
  { key: "mostrar_estado_contrato",      label: "Estado contrato",             desc: "0=vigente, 1=sin contrato" },
  { key: "mostrar_fecha_alta",           label: "Fecha instalación",           desc: "FECHA_INSTALACION" },
  { key: "mostrar_cini",                 label: "CINI contador",               desc: "CINI_EQUIPO_MEDIDA" },
  { key: "mostrar_lecturas",             label: "Lecturas",                    desc: "Nº lecturas año n-2" },
  { key: "mostrar_baja_suministro",      label: "Baja suministro",             desc: "0=no, 1=sí" },
  { key: "mostrar_cambio_titularidad",   label: "Cambio titularidad",          desc: "0=no, 1=sí" },
  { key: "mostrar_facturas_estimadas",   label: "Facturas estimadas",          desc: "FACTURAS_ESTIMADAS" },
  { key: "mostrar_facturas_total",       label: "Facturas total",              desc: "FACTURAS_TOTAL" },
  { key: "mostrar_cau",                  label: "CAU",                         desc: "Código de autoconsumo" },
  { key: "mostrar_cod_auto",             label: "Código autoconsumo",          desc: "COD_AUTO (Tabla 15)" },
  { key: "mostrar_cod_generacion",       label: "Tecnología generación",       desc: "COD_GENERACION_AUTO" },
  { key: "mostrar_conexion_autoconsumo", label: "Conexión autoconsumo",        desc: "0=red interior, 1=red dist., 2=mixta" },
  { key: "mostrar_energia_autoconsumida", label: "E. autoconsumida (kWh)",    desc: "ENERGIA_AUTOCONSUMIDA" },
  { key: "mostrar_energia_excedentaria", label: "E. excedentaria (kWh)",       desc: "ENERGIA_EXCEDENTARIA" },
];

// ── Estilos ───────────────────────────────────────────────────────────────────

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10,
};
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
  background: "var(--field-bg-soft)", border: "1px solid var(--card-border)",
  borderRadius: 8, padding: "10px 12px",
};

// ── Grupos ────────────────────────────────────────────────────────────────────

function GrupoLineas({ config, onChange }: { config: TooltipLineasConfig; onChange: (c: TooltipLineasConfig) => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={sectionTitleStyle}>Tooltip — Líneas eléctricas (B1) · {CAMPOS_LINEAS.length} campos</div>
      <div style={gridStyle}>
        {CAMPOS_LINEAS.map(({ key, label, desc }) => (
          <label key={key} style={cardStyle}>
            <input type="checkbox" checked={config[key]} onChange={() => onChange({ ...config, [key]: !config[key] })} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function GrupoTramos({ config, onChange }: { config: TooltipTramosConfig; onChange: (c: TooltipTramosConfig) => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={sectionTitleStyle}>Tooltip — Identificación de tramos (B11) · {CAMPOS_TRAMOS.length} campos</div>
      <div style={gridStyle}>
        {CAMPOS_TRAMOS.map(({ key, label, desc }) => (
          <label key={key} style={cardStyle}>
            <input type="checkbox" checked={config[key]} onChange={() => onChange({ ...config, [key]: !config[key] })} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function GrupoCts({ config, onChange }: { config: TooltipCtsConfig; onChange: (c: TooltipCtsConfig) => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={sectionTitleStyle}>Tooltip — Centros de transformación (B2) · {CAMPOS_CTS.length} campos</div>
      <div style={gridStyle}>
        {CAMPOS_CTS.map(({ key, label, desc }) => (
          <label key={key} style={cardStyle}>
            <input type="checkbox" checked={config[key]} onChange={() => onChange({ ...config, [key]: !config[key] })} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function GrupoCups({ config, onChange }: { config: TooltipCupsConfig; onChange: (c: TooltipCupsConfig) => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={sectionTitleStyle}>Tooltip — Puntos de suministro CUPS (A1) · {CAMPOS_CUPS.length} campos</div>
      <div style={gridStyle}>
        {CAMPOS_CUPS.map(({ key, label, desc }) => (
          <label key={key} style={cardStyle}>
            <input type="checkbox" checked={config[key]} onChange={() => onChange({ ...config, [key]: !config[key] })} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TopologiaSettingsSection({
  tooltipLineas, tooltipTramos, tooltipCts, tooltipCups,
  onChangeLineas, onChangeTramos, onChangeCts, onChangeCups,
}: Props) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
        Selecciona los campos que se mostrarán al hacer clic en cada elemento del mapa.
        Los cambios se aplican de inmediato y se guardan automáticamente.
      </div>
      <GrupoLineas config={tooltipLineas} onChange={onChangeLineas} />
      <GrupoTramos config={tooltipTramos} onChange={onChangeTramos} />
      <GrupoCts    config={tooltipCts}    onChange={onChangeCts} />
      <GrupoCups   config={tooltipCups}   onChange={onChangeCups} />
    </div>
  );
}
