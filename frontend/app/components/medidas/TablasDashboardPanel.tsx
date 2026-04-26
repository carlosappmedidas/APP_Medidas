"use client";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ═══════════════════════════════════════════════════════════════════════
// TIPOS — espejan los schemas del backend (dashboard_tablas/schemas.py)
// ═══════════════════════════════════════════════════════════════════════

type VentanaCode = "m1" | "m2" | "m7" | "m11" | "art15";

type EmpresaRef = {
  id: number;
  nombre: string;
  codigo_ree: string | null;
};

// ── Mensual · General ──
type MensualGeneralVentanaCard = {
  ventana: VentanaCode;
  anio: number | null;
  mes: number | null;
  energia_kwh: number;
  perdidas_pct: number | null;
  empresas_con_dato: number;
  empresas_total: number;
};

type MensualGeneralEmpresaVentanaCelda = {
  energia_kwh: number | null;
  perdidas_kwh: number | null;
  perdidas_pct: number | null;
  pendiente: boolean;
};

type MensualGeneralEmpresaDespliegueCelda = {
  energia_kwh: number | null;
  perdidas_pct: number | null;
  es_ultima_publicacion: boolean;
};

type MensualGeneralEmpresaDespliegueFila = {
  anio: number;
  mes: number;
  celdas: Record<VentanaCode, MensualGeneralEmpresaDespliegueCelda>;
};

type MensualGeneralEmpresaDetalle = {
  empresa: EmpresaRef;
  celdas: Record<VentanaCode, MensualGeneralEmpresaVentanaCelda>;
  despliegue_meses: MensualGeneralEmpresaDespliegueFila[];
};

type MensualGeneralBlock = {
  pipeline: MensualGeneralVentanaCard[];
  detalle_por_empresa: MensualGeneralEmpresaDetalle[];
};

// ── Mensual · PS ──
type MensualPSKpis = {
  cups_total: number;
  cups_delta_vs_mes_anterior: number | null;
  energia_kwh: number;
  energia_pct_vs_mes_anterior: number | null;
  importe_eur: number;
  importe_pct_vs_mes_anterior: number | null;
};

type MensualPSRepartoCard = {
  codigo: string;
  cups: number;
  energia_kwh: number;
  importe_eur: number;
};

type MensualPSEmpresaCelda = {
  cups: number | null;
  energia_kwh: number | null;
  importe_eur: number | null;
};

type MensualPSEmpresaDetalle = {
  empresa: EmpresaRef;
  por_tarifa: Record<string, MensualPSEmpresaCelda>;
  por_tipo: Record<string, MensualPSEmpresaCelda>;
};

type MensualPSBlock = {
  anio: number;
  mes: number;
  empresas_con_dato: number;
  empresas_total: number;
  kpis: MensualPSKpis;
  reparto: { por_tarifa: MensualPSRepartoCard[]; por_tipo: MensualPSRepartoCard[] };
  detalle_por_empresa: MensualPSEmpresaDetalle[];
};

// ── Mensual · Banda salud ──
type MensualBandaSalud = {
  ficheros_recibidos: number;
  ficheros_esperados: number;
  ventanas_completas: number;
  ventanas_total: number;
  ps_completas: number;
  ps_total: number;
  pendientes_resumen: string | null;
};

type MensualResponse = {
  carga_anio: number;
  carga_mes: number;
  banda_salud: MensualBandaSalud;
  general: MensualGeneralBlock;
  ps: MensualPSBlock;
};

// ── Histórico · General ──
type EstadoAnioGeneral = "en_curso" | "en_regularizacion" | "cerrado" | "solo_m1";

type HistoricoGeneralAnioTarjeta = {
  anio: number;
  estado: EstadoAnioGeneral;
  meses_con_dato: number;
  empresas: number;
  energia_kwh: number;
  perdidas_pct: number | null;
  art15_meses_cerrados: number;
  art15_meses_total: number;
};

type HistoricoGeneralMesCeldaVentana = {
  energia_kwh: number | null;
  perdidas_pct: number | null;
  es_ultima_publicacion: boolean;
};

type HistoricoGeneralMesEmpresaFila = {
  empresa: EmpresaRef;
  celdas: Record<VentanaCode, HistoricoGeneralMesCeldaVentana>;
};

type HistoricoGeneralMesFila = {
  anio: number;
  mes: number;
  celdas: Record<VentanaCode, HistoricoGeneralMesCeldaVentana>;
  desglose_por_empresa: HistoricoGeneralMesEmpresaFila[];
};

type HistoricoGeneralAnioDetalle = {
  anio: number;
  meses: HistoricoGeneralMesFila[];
  total: Record<VentanaCode, HistoricoGeneralMesCeldaVentana>;
};

type HistoricoGeneralEmpresaAnioTarjeta = {
  anio: number;
  meses_con_dato: number;
  energia_kwh: number;
  perdidas_pct: number | null;
  art15_meses_cerrados: number;
  art15_meses_total: number;
  sin_datos: boolean;
};

type HistoricoGeneralEmpresaDetalle = {
  empresa: EmpresaRef;
  anios: HistoricoGeneralEmpresaAnioTarjeta[];
  detalle_anios: HistoricoGeneralAnioDetalle[];
};

// ── Histórico · PS ──
type HistoricoPSAnioTarjeta = {
  anio: number;
  estado: "en_curso" | "cerrado";
  meses_con_dato: number;
  empresas: number;
  cups_final_anio: number;
  energia_kwh: number;
  importe_eur: number;
};

type HistoricoPSMesFila = {
  anio: number;
  mes: number;
  cups: number;
  por_tarifa: Record<string, MensualPSEmpresaCelda>;
  por_tipo: Record<string, MensualPSEmpresaCelda>;
};

type HistoricoPSAnioDetalle = {
  anio: number;
  meses: HistoricoPSMesFila[];
  total: MensualPSEmpresaCelda;
};

type HistoricoPSEmpresaAnioTarjeta = {
  anio: number;
  meses_con_dato: number;
  cups_final_anio: number;
  energia_kwh: number;
  importe_eur: number;
  sin_datos: boolean;
};

type HistoricoPSEmpresaDetalle = {
  empresa: EmpresaRef;
  anios: HistoricoPSEmpresaAnioTarjeta[];
  detalle_anios: HistoricoPSAnioDetalle[];
};

type HistoricoResponse = {
  anios_visibles: number[];
  general: {
    anios: HistoricoGeneralAnioTarjeta[];
    detalle_anios: HistoricoGeneralAnioDetalle[];
    por_empresa: HistoricoGeneralEmpresaDetalle[];
  };
  ps: {
    anios: HistoricoPSAnioTarjeta[];
    detalle_anios: HistoricoPSAnioDetalle[];
    por_empresa: HistoricoPSEmpresaDetalle[];
  };
};

// ═══════════════════════════════════════════════════════════════════════
// HELPERS DE FORMATO
// ═══════════════════════════════════════════════════════════════════════

const MESES_CORTOS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const formatMillones = (kwh: number | null | undefined): string => {
  if (kwh == null || Number.isNaN(kwh)) return "—";
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kwh / 1_000_000);
};

// Mismo cálculo numérico (kwh / 1.000.000) pero etiquetado físicamente correcto:
// 1.700.000 kWh = 1,70 GWh. Lo usamos donde antes poníamos "M kWh" por error.
const formatGWh = (kwh: number | null | undefined): string => {
  if (kwh == null || Number.isNaN(kwh)) return "—";
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kwh / 1_000_000);
};

// GWh con 3 decimales — para tablas mes×tarifa donde puede haber valores
// pequeños (ej: 3.0TDVE). 3.007 kWh → "0,003 GWh" en lugar de "0,00 GWh".
const formatGWh3 = (kwh: number | null | undefined): string => {
  if (kwh == null || Number.isNaN(kwh)) return "—";
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(kwh / 1_000_000);
};

// Importe en € con miles separados, sin convertir a "k €". Para celdas
// pequeñas donde 899 € no debe redondearse a 1k €.
// useGrouping: "always" fuerza separador en español también para 4 dígitos
// (sin ello, 8641 saldría "8641" en lugar de "8.641").
const formatEur = (eur: number | null | undefined): string => {
  if (eur == null || Number.isNaN(eur)) return "—";
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: "always" }).format(eur);
};

const formatMiles = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: "always" }).format(n);
};

const formatPct = (pct: number | null | undefined): string => {
  if (pct == null || Number.isNaN(pct)) return "—";
  return `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(pct)}%`;
};

const mesCorto = (mes: number | null | undefined): string => {
  if (mes == null || mes < 1 || mes > 12) return "—";
  return MESES_CORTOS[mes];
};

const formatMesAnio = (anio: number | null | undefined, mes: number | null | undefined): string => {
  if (!anio || !mes) return "—";
  return `${mesCorto(mes)} ${anio}`;
};

// ═══════════════════════════════════════════════════════════════════════
// META POR VENTANA — colores chip + offset
// ═══════════════════════════════════════════════════════════════════════

const VENTANA_META: Record<VentanaCode, { label: string; chipBg: string; chipColor: string; descripcion: string }> = {
  m1:    { label: "M1",    chipBg: "rgba(241,239,232,0.12)", chipColor: "rgba(241,239,232,0.85)", descripcion: "Cierre mes" },
  m2:    { label: "M2",    chipBg: "rgba(55,138,221,0.18)",  chipColor: "#85B7EB",                descripcion: "+2m" },
  m7:    { label: "M7",    chipBg: "rgba(15,110,86,0.22)",   chipColor: "#5DCAA5",                descripcion: "+7m" },
  m11:   { label: "M11",   chipBg: "rgba(186,117,23,0.18)",  chipColor: "#FAC775",                descripcion: "+11m" },
  art15: { label: "ART15", chipBg: "rgba(83,74,183,0.22)",   chipColor: "#AFA9EC",                descripcion: "definitivo" },
};

const VENTANAS_ORDEN: VentanaCode[] = ["m1", "m2", "m7", "m11", "art15"];

// ═══════════════════════════════════════════════════════════════════════
// PROPS DEL PANEL
// ═══════════════════════════════════════════════════════════════════════

type Vista = "mensual" | "historico";

type Props = {
  token: string | null;
  onGoToTableGeneral?: () => void;
  onGoToTablePS?: () => void;
  onGoToCarga?: () => void;
};

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

export default function TablasDashboardPanel({ token, onGoToTableGeneral, onGoToTablePS, onGoToCarga }: Props) {
  const [vista, setVista] = useState<Vista>("mensual");
  const [menuOpen, setMenuOpen] = useState(false);

  const [mensual, setMensual] = useState<MensualResponse | null>(null);
  const [historico, setHistorico] = useState<HistoricoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos al montar y al cambiar de vista
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const path = vista === "mensual" ? "/dashboard/tablas/mensual" : "/dashboard/tablas/historico";
        const res = await fetch(`${API_BASE_URL}${path}`, { headers: getAuthHeaders(token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (vista === "mensual") setMensual(data);
        else setHistorico(data);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Error cargando datos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, vista]);

  const tienePendientes = !!mensual?.banda_salud.pendientes_resumen;

  const handleMenuAction = (action: "general" | "ps" | "carga") => {
    setMenuOpen(false);
    if (action === "general" && onGoToTableGeneral) onGoToTableGeneral();
    if (action === "ps" && onGoToTablePS) onGoToTablePS();
    if (action === "carga" && onGoToCarga) onGoToCarga();
  };

  return (
    <section className="ui-card text-sm">
      {/* ═══════ Cabecera con toggle y menú ⋮ ═══════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
            Resumen tablas
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2 }}>
            {vista === "mensual" && mensual
              ? `Carga ${mesCorto(mensual.carga_mes)} ${mensual.carga_anio}`
              : vista === "historico" && historico
                ? `Histórico · últimos ${historico.anios_visibles.length} años`
                : "Cargando…"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <div style={{
            display: "inline-flex", background: "var(--field-bg)", border: "1px solid var(--card-border)",
            borderRadius: 8, padding: 2,
          }}>
            <button type="button" onClick={() => setVista("mensual")}
              className={vista === "mensual" ? "ui-btn ui-btn-xs" : "ui-btn ui-btn-ghost ui-btn-xs"}
              style={{ padding: "4px 14px", borderRadius: 4, fontWeight: 500 }}>
              Mensual
            </button>
            <button type="button" onClick={() => setVista("historico")}
              className={vista === "historico" ? "ui-btn ui-btn-xs" : "ui-btn ui-btn-ghost ui-btn-xs"}
              style={{ padding: "4px 14px", borderRadius: 4, fontWeight: 500 }}>
              Histórico
            </button>
          </div>

          <button type="button" onClick={() => setMenuOpen(v => !v)}
            className="ui-btn ui-btn-ghost ui-btn-xs"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            aria-label="Más acciones">
            ⋮
          </button>

          {menuOpen && (
            <div style={{
              position: "absolute", top: 36, right: 0, background: "var(--card-bg)",
              border: "1px solid var(--card-border)", borderRadius: 8, padding: 4,
              minWidth: 220, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 20,
            }}>
              <button type="button" onClick={() => handleMenuAction("general")}
                className="ui-btn ui-btn-ghost ui-btn-xs"
                style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", padding: "8px 10px" }}>
                Ir a tabla General →
              </button>
              <button type="button" onClick={() => handleMenuAction("ps")}
                className="ui-btn ui-btn-ghost ui-btn-xs"
                style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", padding: "8px 10px" }}>
                Ir a tabla PS →
              </button>
              {vista === "mensual" && tienePendientes && (
                <>
                  <div style={{ height: 1, background: "var(--card-border)", margin: "4px 0" }} />
                  <button type="button" onClick={() => handleMenuAction("carga")}
                    className="ui-btn ui-btn-ghost ui-btn-xs"
                    style={{
                      width: "100%", justifyContent: "flex-start", textAlign: "left", padding: "8px 10px",
                      color: "#FAC775",
                    }}>
                    ⚠ Resolver carga pendiente
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="ui-alert ui-alert--danger mb-4">{error}</div>}

      {loading && !mensual && !historico && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Cargando…</div>
      )}

      {/* ═══════ VISTA MENSUAL ═══════ */}
      {vista === "mensual" && mensual && <MensualView data={mensual} />}

      {/* ═══════ VISTA HISTÓRICO ═══════ */}
      {vista === "historico" && historico && <HistoricoView data={historico} />}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VISTA MENSUAL
// ═══════════════════════════════════════════════════════════════════════

function MensualView({ data }: { data: MensualResponse }) {
  const [empresasExpandidas, setEmpresasExpandidas] = useState<Set<number>>(new Set());
  const [vistaRepartoPS, setVistaRepartoPS] = useState<"tarifa" | "tipo">("tarifa");
  const [detalleGeneralAbierto, setDetalleGeneralAbierto] = useState(false);
  const [detallePSAbierto, setDetallePSAbierto] = useState(false);

  const toggleEmpresa = (id: number) => {
    setEmpresasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const banda = data.banda_salud;
  const todoOk = !banda.pendientes_resumen;

  return (
    <>
      {/* Banda de salud (solo si hay pendientes) */}
      {!todoOk && (
        <div style={{
          background: "rgba(186,117,23,0.08)", border: "1px solid #BA7517",
          borderRadius: 8, padding: "10px 14px", marginBottom: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#BA7517" }} />
            <div style={{ fontSize: 12, fontWeight: 500 }}>
              Carga del mes · {banda.ficheros_recibidos}/{banda.ficheros_esperados} ficheros · {banda.pendientes_resumen}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-muted)" }}>
            <span><strong style={{ color: banda.ventanas_completas === banda.ventanas_total ? "#5DCAA5" : "var(--text)" }}>
              {banda.ventanas_completas}/{banda.ventanas_total}
            </strong> ventanas</span>
            <span><strong style={{ color: banda.ps_completas === banda.ps_total ? "#5DCAA5" : "var(--text)" }}>
              {banda.ps_completas}/{banda.ps_total}
            </strong> PS</span>
          </div>
        </div>
      )}

      {/* ═══════ Bloque GENERAL ═══════ */}
      <div style={{ background: "var(--field-bg)", borderRadius: 12, border: "1px solid var(--card-border)", padding: "14px 18px", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>
          Medidas General · pipeline de carga
        </div>

        {/* 5 tarjetas de ventana */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {data.general.pipeline.map(card => {
            const meta = VENTANA_META[card.ventana];
            const completa = card.empresas_con_dato === card.empresas_total && card.empresas_total > 0;
            const tienePendientes = !completa && card.empresas_total > 0;
            return (
              <div key={card.ventana} style={{
                background: "var(--card-bg)",
                border: tienePendientes ? "1px solid #BA7517" : "1px solid var(--card-border)",
                borderRadius: 6, padding: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ background: meta.chipBg, color: meta.chipColor, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500 }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 9, color: completa ? "#5DCAA5" : "#BA7517", fontWeight: 500 }}>
                    {card.empresas_con_dato}/{card.empresas_total} {completa ? "✓" : "⚠"}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>
                  {card.anio && card.mes ? formatMesAnio(card.anio, card.mes) : "Sin datos"}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{meta.descripcion}</div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 500 }}>{formatGWh(card.energia_kwh)}</span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>GWh</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatPct(card.perdidas_pct)} pérdidas</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detalle por empresa (colapsable) */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
          <button type="button" onClick={() => setDetalleGeneralAbierto(v => !v)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", background: "transparent", border: "none", cursor: "pointer",
              padding: 0, marginBottom: detalleGeneralAbierto ? 10 : 0,
            }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              Detalle por empresa {detalleGeneralAbierto && "· pulsa ▸ para ver meses afectados"}
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {detalleGeneralAbierto ? "▾ ocultar" : "▸ mostrar"}
            </span>
          </button>

          {detalleGeneralAbierto && (
            <DetallePorEmpresaTabla
              pipeline={data.general.pipeline}
              empresas={data.general.detalle_por_empresa}
              empresasExpandidas={empresasExpandidas}
              onToggle={toggleEmpresa}
            />
          )}
        </div>
      </div>

      {/* ═══════ Bloque PS ═══════ */}
      <BloquePS
        data={data.ps}
        vistaReparto={vistaRepartoPS}
        onChangeVistaReparto={setVistaRepartoPS}
        detalleAbierto={detallePSAbierto}
        onToggleDetalle={() => setDetallePSAbierto(v => !v)}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES MENSUAL
// ═══════════════════════════════════════════════════════════════════════

function DetallePorEmpresaTabla({
  pipeline, empresas, empresasExpandidas, onToggle,
}: {
  pipeline: MensualGeneralVentanaCard[];
  empresas: MensualGeneralEmpresaDetalle[];
  empresasExpandidas: Set<number>;
  onToggle: (id: number) => void;
}) {
  // Cabecera con cada ventana y su mes
  const cabecera = pipeline.map(p => ({
    ventana: p.ventana,
    label: p.anio && p.mes ? `${VENTANA_META[p.ventana].label} · ${mesCorto(p.mes).toLowerCase()} ${(p.anio % 100).toString().padStart(2, "0")}` : VENTANA_META[p.ventana].label,
  }));

  return (
    <div style={{ fontVariantNumeric: "tabular-nums" }}>
      {/* Cabecera */}
      <div style={{
        display: "grid", gridTemplateColumns: "16px 130px 1fr 1fr 1fr 1fr 1fr", gap: 6,
        padding: "6px 0", borderBottom: "1px solid var(--card-border)",
        fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500,
      }}>
        <div></div>
        <div>Empresa</div>
        {cabecera.map(c => <div key={c.ventana} style={{ textAlign: "center" }}>{c.label}</div>)}
      </div>

      {/* Filas de empresa */}
      {empresas.map(emp => {
        const expandida = empresasExpandidas.has(emp.empresa.id);
        return (
          <FilaEmpresa
            key={emp.empresa.id}
            empresa={emp}
            expandida={expandida}
            onToggle={() => onToggle(emp.empresa.id)}
          />
        );
      })}
    </div>
  );
}

function FilaEmpresa({
  empresa, expandida, onToggle,
}: {
  empresa: MensualGeneralEmpresaDetalle;
  expandida: boolean;
  onToggle: () => void;
}) {
  const filaContent = (
    <div style={{
      display: "grid", gridTemplateColumns: "16px 130px 1fr 1fr 1fr 1fr 1fr", gap: 6,
      padding: "8px 8px", alignItems: "center", cursor: "pointer",
    }} onClick={onToggle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{
          display: "inline-block", fontSize: 11,
          color: expandida ? "var(--btn-secondary-bg)" : "var(--text-muted)",
          fontWeight: 600,
          transform: expandida ? "rotate(90deg)" : "none",
          transition: "transform 0.15s ease",
        }}>
          ▸
        </span>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{empresa.empresa.nombre}</div>
        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{empresa.empresa.codigo_ree ?? "—"}</div>
      </div>
      {VENTANAS_ORDEN.map(v => {
        const c = empresa.celdas[v];
        if (c.pendiente) {
          return (
            <div key={v} style={{
              background: "var(--card-bg)", border: "1px dashed #BA7517",
              borderRadius: 5, padding: "5px 7px",
            }}>
              <div style={{ fontSize: 10, color: "#BA7517", fontWeight: 500 }}>⚠ pendiente</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>no recibido</div>
            </div>
          );
        }
        return (
          <div key={v} style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: 5, padding: "5px 7px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{formatGWh3(c.energia_kwh)}</span>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>GWh</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {formatPct(c.perdidas_pct)}
              {c.perdidas_kwh != null && <> · {formatMiles(c.perdidas_kwh / 1000)} MWh</>}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!expandida) {
    return (
      <div style={{ borderBottom: "1px solid var(--card-border)" }}>
        {filaContent}
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(55,138,221,0.04)",
      border: "1px solid var(--card-border)",
      borderRadius: 6, margin: "6px 0",
    }}>
      {filaContent}
      <DespliegueEmpresa despliegue={empresa.despliegue_meses} />
    </div>
  );
}

function DespliegueEmpresa({ despliegue }: { despliegue: MensualGeneralEmpresaDespliegueFila[] }) {
  return (
    <div style={{
      background: "var(--card-bg)", borderTop: "1px solid var(--card-border)",
      borderBottomLeftRadius: 5, borderBottomRightRadius: 5, padding: "10px 14px",
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, marginBottom: 8 }}>
        Meses afectados por la publicación
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums" }}>
        {/* Cabecera */}
        <div style={{
          display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 1fr 1fr", gap: 6,
          padding: "4px 0", borderBottom: "1px solid var(--card-border)",
          fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          <div>Mes</div>
          {VENTANAS_ORDEN.map(v => (
            <div key={v} style={{ textAlign: "center" }}>{VENTANA_META[v].label}</div>
          ))}
        </div>
        {/* Filas */}
        {despliegue.map((f, i) => (
          <div key={`${f.anio}-${f.mes}`} style={{
            display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 1fr 1fr", gap: 6,
            padding: "6px 0",
            borderBottom: i < despliegue.length - 1 ? "1px solid var(--card-border)" : "none",
            alignItems: "center", fontSize: 11,
          }}>
            <div style={{ fontWeight: 500 }}>{mesCorto(f.mes).toLowerCase()} {f.anio}</div>
            {VENTANAS_ORDEN.map(v => {
              const c = f.celdas[v];
              if (c.energia_kwh == null) {
                return <div key={v} style={{ textAlign: "center", color: "var(--text-muted)" }}>—</div>;
              }
              return (
                <div key={v} style={{ textAlign: "center" }}>
                  {c.es_ultima_publicacion ? (
                    <strong>{formatGWh(c.energia_kwh)} GWh</strong>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>{formatGWh(c.energia_kwh)} GWh</span>
                  )}
                  <span style={{ color: "var(--text-muted)" }}> · {formatPct(c.perdidas_pct)}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }}>
          En negrita la última publicación · resto = valores anteriores
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BLOQUE PS (mensual)
// ═══════════════════════════════════════════════════════════════════════

const TARIFA_META: Record<string, { label: string; chipBg: string; chipColor: string }> = {
  "20td":   { label: "2.0TD",   chipBg: "rgba(55,138,221,0.18)", chipColor: "#85B7EB" },
  "30td":   { label: "3.0TD",   chipBg: "rgba(15,110,86,0.22)",  chipColor: "#5DCAA5" },
  "30tdve": { label: "3.0TDVE", chipBg: "rgba(186,117,23,0.18)", chipColor: "#FAC775" },
  "61td":   { label: "6.1TD",   chipBg: "rgba(83,74,183,0.22)",  chipColor: "#AFA9EC" },
};

const TIPO_META: Record<string, { label: string }> = {
  "tipo_1": { label: "Tipo 1" },
  "tipo_2": { label: "Tipo 2" },
  "tipo_3": { label: "Tipo 3" },
  "tipo_4": { label: "Tipo 4" },
  "tipo_5": { label: "Tipo 5" },
};

const TARIFAS_ORDEN = ["20td", "30td", "30tdve", "61td"];
const TIPOS_ORDEN = ["tipo_1", "tipo_2", "tipo_3", "tipo_4", "tipo_5"];

function BloquePS({
  data, vistaReparto, onChangeVistaReparto, detalleAbierto, onToggleDetalle,
}: {
  data: MensualPSBlock;
  vistaReparto: "tarifa" | "tipo";
  onChangeVistaReparto: (v: "tarifa" | "tipo") => void;
  detalleAbierto: boolean;
  onToggleDetalle: () => void;
}) {
  const totalCardsCol = vistaReparto === "tarifa" ? TARIFAS_ORDEN.length : TIPOS_ORDEN.length;
  const codigos = vistaReparto === "tarifa" ? TARIFAS_ORDEN : TIPOS_ORDEN;
  const reparto = vistaReparto === "tarifa" ? data.reparto.por_tarifa : data.reparto.por_tipo;

  const labelOf = (codigo: string) => vistaReparto === "tarifa" ? TARIFA_META[codigo]?.label ?? codigo : TIPO_META[codigo]?.label ?? codigo;

  return (
    <div style={{ background: "var(--field-bg)", borderRadius: 12, border: "1px solid var(--card-border)", padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
          Medidas PS · {formatMesAnio(data.anio, data.mes)}
        </div>
        <span style={{ fontSize: 10, color: data.empresas_con_dato === data.empresas_total ? "#5DCAA5" : "#BA7517" }}>
          {data.empresas_con_dato === data.empresas_total ? "✓" : "⚠"} {data.empresas_con_dato}/{data.empresas_total} empresas
        </span>
      </div>

      {/* 3 KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        <KpiCard label="CUPS activos" valor={formatMiles(data.kpis.cups_total)} delta={data.kpis.cups_delta_vs_mes_anterior != null ? `${data.kpis.cups_delta_vs_mes_anterior > 0 ? "+" : ""}${data.kpis.cups_delta_vs_mes_anterior} vs mes anterior` : null} />
        <KpiCard label="Energía" valor={`${formatGWh(data.kpis.energia_kwh)} GWh`} delta={data.kpis.energia_pct_vs_mes_anterior != null ? `${data.kpis.energia_pct_vs_mes_anterior > 0 ? "▲ +" : "▼ "}${data.kpis.energia_pct_vs_mes_anterior.toFixed(1)}% vs mes anterior` : null} deltaColor={(data.kpis.energia_pct_vs_mes_anterior ?? 0) >= 0 ? "#5DCAA5" : "#F09595"} />
        <KpiCard label="Importe" valor={`${formatEur(data.kpis.importe_eur)} €`} delta={data.kpis.importe_pct_vs_mes_anterior != null ? `${data.kpis.importe_pct_vs_mes_anterior > 0 ? "▲ +" : "▼ "}${data.kpis.importe_pct_vs_mes_anterior.toFixed(1)}% vs mes anterior` : null} deltaColor={(data.kpis.importe_pct_vs_mes_anterior ?? 0) >= 0 ? "#5DCAA5" : "#F09595"} />
      </div>

      {/* Toggle reparto */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
          Reparto detallado
        </div>
        <div style={{ display: "inline-flex", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 4, padding: 1 }}>
          <button type="button" onClick={() => onChangeVistaReparto("tarifa")}
            className={vistaReparto === "tarifa" ? "ui-btn ui-btn-xs" : "ui-btn ui-btn-ghost ui-btn-xs"}
            style={{ padding: "3px 12px", fontSize: 10, borderRadius: 3 }}>
            Por tarifa
          </button>
          <button type="button" onClick={() => onChangeVistaReparto("tipo")}
            className={vistaReparto === "tipo" ? "ui-btn ui-btn-xs" : "ui-btn ui-btn-ghost ui-btn-xs"}
            style={{ padding: "3px 12px", fontSize: 10, borderRadius: 3 }}>
            Por tipo
          </button>
        </div>
      </div>

      {/* Tarjetas de reparto */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalCardsCol}, 1fr)`, gap: 6, marginBottom: 14 }}>
        {codigos.map(codigo => {
          const card = reparto.find(r => r.codigo === codigo);
          const meta = vistaReparto === "tarifa" ? TARIFA_META[codigo] : null;
          const total = data.kpis.cups_total;
          const pct = card && total > 0 ? (card.cups / total * 100).toFixed(1) : null;
          return (
            <div key={codigo} style={{
              background: "var(--card-bg)", border: "1px solid var(--card-border)",
              borderRadius: 6, padding: "8px 10px",
            }}>
              {meta ? (
                <span style={{ background: meta.chipBg, color: meta.chipColor, padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 500 }}>
                  {meta.label}
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)" }}>{labelOf(codigo)}</span>
              )}
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500 }}>{formatMiles(card?.cups ?? 0)}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>CUPS{pct != null ? ` · ${pct}%` : ""}</div>
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 3 }}>{formatGWh3(card?.energia_kwh ?? 0)} GWh</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{formatEur(card?.importe_eur ?? 0)} €</div>
            </div>
          );
        })}
      </div>

      {/* Detalle por empresa (colapsable) */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
        <button type="button" onClick={onToggleDetalle}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            width: "100%", background: "transparent", border: "none", cursor: "pointer",
            padding: 0, marginBottom: detalleAbierto ? 8 : 0,
          }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
            Detalle por empresa
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {detalleAbierto ? "▾ ocultar" : "▸ mostrar"}
          </span>
        </button>
      </div>

      {detalleAbierto && (
        <div style={{ fontVariantNumeric: "tabular-nums" }}>
          <div style={{
            display: "grid", gridTemplateColumns: `130px ${codigos.map(() => "1fr").join(" ")}`, gap: 6,
            padding: "6px 0", borderBottom: "1px solid var(--card-border)",
            fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <div>Empresa</div>
            {codigos.map(c => <div key={c} style={{ textAlign: "center" }}>{labelOf(c)}</div>)}
          </div>
          {data.detalle_por_empresa.map((emp, i) => {
            const reparto_emp = vistaReparto === "tarifa" ? emp.por_tarifa : emp.por_tipo;
            return (
              <div key={emp.empresa.id} style={{
                display: "grid", gridTemplateColumns: `130px ${codigos.map(() => "1fr").join(" ")}`, gap: 6,
                padding: "8px 0",
                borderBottom: i < data.detalle_por_empresa.length - 1 ? "1px solid var(--card-border)" : "none",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{emp.empresa.nombre}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{emp.empresa.codigo_ree ?? "—"}</div>
                </div>
                {codigos.map(codigo => {
                  const c = reparto_emp[codigo];
                  const sinDatos = !c || c.cups == null || c.cups === 0;
                  return (
                    <div key={codigo} style={{
                      background: "var(--card-bg)", border: "1px solid var(--card-border)",
                      borderRadius: 5, padding: "5px 7px",
                    }}>
                      {sinDatos ? (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>—</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 500 }}>{formatMiles(c!.cups ?? 0)} CUPS</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                            {formatGWh3(c!.energia_kwh ?? 0)} GWh · {formatEur(c!.importe_eur ?? 0)} €
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, valor, delta, deltaColor }: { label: string; valor: string; delta?: string | null; deltaColor?: string }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500 }}>{valor}</div>
      {delta && <div style={{ fontSize: 10, color: deltaColor ?? "var(--text-muted)" }}>{delta}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VISTA HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════

const ESTADO_LABEL_GENERAL: Record<EstadoAnioGeneral, { texto: string; color: string }> = {
  en_curso:           { texto: "▸ en curso",      color: "var(--text-muted)" },
  en_regularizacion:  { texto: "▸ en regular.",   color: "#FAC775" },
  cerrado:            { texto: "▸ ✓ cerrado",     color: "#5DCAA5" },
  solo_m1:            { texto: "▸ solo M1",       color: "var(--text-muted)" },
};

function HistoricoView({ data }: { data: HistoricoResponse }) {
  const [anioGeneralAbierto, setAnioGeneralAbierto] = useState<number | null>(null);
  const [mesesExpandidosGeneral, setMesesExpandidosGeneral] = useState<Set<string>>(new Set());
  const [anioPSAbierto, setAnioPSAbierto] = useState<number | null>(null);
  const [vistaRepartoPSHist, setVistaRepartoPSHist] = useState<"tarifa" | "tipo">("tarifa");

  // Desglose por empresa (colapsables independientes)
  const [desgloseGeneralAbierto, setDesgloseGeneralAbierto] = useState(false);
  const [desglosePSAbierto, setDesglosePSAbierto] = useState(false);

  // Empresa+año actualmente abierto (formato: "empresaId-anio" o null)
  const [empresaAnioGeneralAbierto, setEmpresaAnioGeneralAbierto] = useState<string | null>(null);
  const [mesesExpandidosEmpresaGeneral, setMesesExpandidosEmpresaGeneral] = useState<Set<string>>(new Set());
  const [empresaAnioPSAbierto, setEmpresaAnioPSAbierto] = useState<string | null>(null);
  const [vistaRepartoPSEmpresa, setVistaRepartoPSEmpresa] = useState<"tarifa" | "tipo">("tarifa");

  // Solo un año abierto a la vez en cada bloque (General y PS independientes)
  const togglAnioGeneral = (anio: number) => {
    setAnioGeneralAbierto(prev => prev === anio ? null : anio);
    setMesesExpandidosGeneral(new Set()); // Cerrar meses al cambiar de año
  };
  const toggleMesGeneral = (anio: number, mes: number) => {
    const k = `${anio}-${mes}`;
    setMesesExpandidosGeneral(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const toggleAnioPS = (anio: number) => {
    setAnioPSAbierto(prev => prev === anio ? null : anio);
  };

  const detalleGeneralAbierto = data.general.detalle_anios.find(d => d.anio === anioGeneralAbierto);
  const detallePSAbierto = data.ps.detalle_anios.find(d => d.anio === anioPSAbierto);

  return (
    <>
      {/* ═══════ BLOQUE HISTÓRICO · GENERAL ═══════ */}
      <div style={{ background: "var(--field-bg)", borderRadius: 12, border: "1px solid var(--card-border)", padding: "14px 18px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
            Medidas General · histórico por año
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>pulsa una tarjeta para ver el detalle</span>
        </div>

        {/* Tarjetas-año General */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.general.anios.length || 5}, 1fr)`, gap: 8 }}>
          {data.general.anios.map(card => {
            const abierta = anioGeneralAbierto === card.anio;
            const estadoMeta = ESTADO_LABEL_GENERAL[card.estado];
            const cerrado = card.estado === "cerrado";
            return (
              <div key={card.anio} onClick={() => togglAnioGeneral(card.anio)} style={{
                background: abierta ? "rgba(55,138,221,0.08)" : "var(--card-bg)",
                border: abierta ? "1px solid var(--btn-secondary-bg)" : "1px solid var(--card-border)",
                borderRadius: 6, padding: 10, cursor: "pointer",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{card.anio}</span>
                  <span style={{ fontSize: 9, color: abierta ? "var(--btn-secondary-bg)" : estadoMeta.color, fontWeight: abierta ? 500 : 400 }}>
                    {abierta ? "▾ abierto" : estadoMeta.texto}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {card.meses_con_dato} {card.meses_con_dato === 1 ? "mes" : "meses"} · {card.empresas} {card.empresas === 1 ? "empresa" : "empresas"}
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 500 }}>{formatGWh(card.energia_kwh)}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>GWh</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatPct(card.perdidas_pct)} pérdidas</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 9, color: cerrado ? "#5DCAA5" : "var(--text-muted)" }}>
                  ART15: <strong style={{ color: cerrado ? "#5DCAA5" : "var(--text)" }}>
                    {card.art15_meses_cerrados}/{card.art15_meses_total}
                  </strong> {cerrado && "✓"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detalle del año abierto */}
        {detalleGeneralAbierto && (
          <DetalleAnioGeneral
            detalle={detalleGeneralAbierto}
            mesesExpandidos={mesesExpandidosGeneral}
            onToggleMes={toggleMesGeneral}
          />
        )}

        {/* Desglose por empresa (colapsable) */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
          <button type="button" onClick={() => setDesgloseGeneralAbierto(v => !v)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", background: "transparent", border: "none", cursor: "pointer",
              padding: 0, marginBottom: desgloseGeneralAbierto ? 12 : 0,
            }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              Desglose por empresa · {data.general.por_empresa.length} empresas
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {desgloseGeneralAbierto ? "▾ ocultar" : "▸ mostrar"}
            </span>
          </button>

          {desgloseGeneralAbierto && (
            <DesgloseEmpresasGeneral
              empresas={data.general.por_empresa}
              empresaAnioAbierto={empresaAnioGeneralAbierto}
              onToggleEmpresaAnio={(empresaId, anio) => {
                const k = `${empresaId}-${anio}`;
                setEmpresaAnioGeneralAbierto(prev => prev === k ? null : k);
                setMesesExpandidosEmpresaGeneral(new Set());
              }}
              mesesExpandidos={mesesExpandidosEmpresaGeneral}
              onToggleMes={(anio, mes) => {
                const k = `${anio}-${mes}`;
                setMesesExpandidosEmpresaGeneral(prev => {
                  const next = new Set(prev);
                  if (next.has(k)) next.delete(k); else next.add(k);
                  return next;
                });
              }}
            />
          )}
        </div>
      </div>

      {/* ═══════ BLOQUE HISTÓRICO · PS ═══════ */}
      <div style={{ background: "var(--field-bg)", borderRadius: 12, border: "1px solid var(--card-border)", padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
            Medidas PS · histórico por año
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>cartera y facturación al final de cada año</span>
        </div>

        {/* Tarjetas-año PS */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.ps.anios.length || 5}, 1fr)`, gap: 8 }}>
          {data.ps.anios.map(card => {
            const abierta = anioPSAbierto === card.anio;
            const cerrado = card.estado === "cerrado";
            return (
              <div key={card.anio} onClick={() => toggleAnioPS(card.anio)} style={{
                background: abierta ? "rgba(55,138,221,0.08)" : "var(--card-bg)",
                border: abierta ? "1px solid var(--btn-secondary-bg)" : "1px solid var(--card-border)",
                borderRadius: 6, padding: 10, cursor: "pointer",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{card.anio}</span>
                  <span style={{
                    fontSize: 9,
                    color: abierta ? "var(--btn-secondary-bg)" : (cerrado ? "#5DCAA5" : "var(--text-muted)"),
                    fontWeight: 500,
                  }}>
                    {abierta ? "▾ abierto" : (cerrado ? `▸ ${card.meses_con_dato}/12 ✓` : "▸ en curso")}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {card.meses_con_dato} {card.meses_con_dato === 1 ? "mes" : "meses"} · {card.empresas} {card.empresas === 1 ? "empresa" : "empresas"}
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{formatMiles(card.cups_final_anio)} CUPS</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatGWh3(card.energia_kwh)} GWh</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatEur(card.importe_eur)} €</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detalle del año PS abierto */}
        {detallePSAbierto && (
          <DetalleAnioPS
            detalle={detallePSAbierto}
            vistaReparto={vistaRepartoPSHist}
            onChangeVistaReparto={setVistaRepartoPSHist}
          />
        )}

        {/* Desglose por empresa PS (colapsable) */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
          <button type="button" onClick={() => setDesglosePSAbierto(v => !v)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", background: "transparent", border: "none", cursor: "pointer",
              padding: 0, marginBottom: desglosePSAbierto ? 12 : 0,
            }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              Desglose por empresa · {data.ps.por_empresa.length} empresas
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {desglosePSAbierto ? "▾ ocultar" : "▸ mostrar"}
            </span>
          </button>

          {desglosePSAbierto && (
            <DesgloseEmpresasPS
              empresas={data.ps.por_empresa}
              empresaAnioAbierto={empresaAnioPSAbierto}
              onToggleEmpresaAnio={(empresaId, anio) => {
                const k = `${empresaId}-${anio}`;
                setEmpresaAnioPSAbierto(prev => prev === k ? null : k);
              }}
              vistaReparto={vistaRepartoPSEmpresa}
              onChangeVistaReparto={setVistaRepartoPSEmpresa}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Detalle año General (mes a mes con desglose por empresa) ───

function DetalleAnioGeneral({
  detalle, mesesExpandidos, onToggleMes,
}: {
  detalle: HistoricoGeneralAnioDetalle;
  mesesExpandidos: Set<string>;
  onToggleMes: (anio: number, mes: number) => void;
}) {
  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--btn-secondary-bg)",
      borderRadius: 6, padding: "12px 14px", marginTop: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--btn-secondary-bg)" }}>
          {detalle.anio} · detalle mes a mes
        </div>
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>pulsa un mes para ver desglose por empresa</span>
      </div>

      <div style={{ fontVariantNumeric: "tabular-nums" }}>
        {/* Cabecera */}
        <div style={{
          display: "grid", gridTemplateColumns: "16px 80px 1fr 1fr 1fr 1fr 1fr", gap: 6,
          padding: "4px 0", borderBottom: "1px solid var(--card-border)",
          fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500,
        }}>
          <div></div>
          <div>Mes</div>
          {VENTANAS_ORDEN.map(v => <div key={v} style={{ textAlign: "center" }}>{VENTANA_META[v].label}</div>)}
        </div>

        {/* Filas de mes */}
        {detalle.meses.map(mesFila => {
          const k = `${mesFila.anio}-${mesFila.mes}`;
          const expandido = mesesExpandidos.has(k);
          return (
            <FilaMesHistorico
              key={k}
              mes={mesFila}
              expandido={expandido}
              onToggle={() => onToggleMes(mesFila.anio, mesFila.mes)}
            />
          );
        })}

        {/* Total año */}
        <div style={{
          display: "grid", gridTemplateColumns: "16px 80px 1fr 1fr 1fr 1fr 1fr", gap: 6,
          padding: "8px 0 4px", marginTop: 4,
          borderTop: "1px solid var(--card-border)",
          fontSize: 11, fontWeight: 500,
        }}>
          <div></div>
          <div>Total</div>
          {VENTANAS_ORDEN.map(v => {
            const c = detalle.total[v];
            if (c.energia_kwh == null) {
              return <div key={v} style={{ textAlign: "center", color: "var(--text-muted)", fontWeight: 400 }}>—</div>;
            }
            return (
              <div key={v} style={{ textAlign: "center" }}>
                {formatGWh(c.energia_kwh)} GWh
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {formatPct(c.perdidas_pct)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilaMesHistorico({
  mes, expandido, onToggle,
}: {
  mes: HistoricoGeneralMesFila;
  expandido: boolean;
  onToggle: () => void;
}) {
  const filaContent = (
    <div onClick={onToggle} style={{
      display: "grid", gridTemplateColumns: "16px 80px 1fr 1fr 1fr 1fr 1fr", gap: 6,
      padding: "5px 8px", alignItems: "center", fontSize: 11, cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span style={{
          fontSize: 11,
          color: expandido ? "var(--btn-secondary-bg)" : "var(--text-muted)",
          fontWeight: 600,
          transform: expandido ? "rotate(90deg)" : "none",
          transition: "transform 0.15s ease",
        }}>
          ▸
        </span>
      </div>
      <div style={{ fontWeight: 500 }}>{mesCorto(mes.mes).toLowerCase()} {mes.anio.toString().slice(2)}</div>
      {VENTANAS_ORDEN.map(v => {
        const c = mes.celdas[v];
        if (c.energia_kwh == null) {
          return <div key={v} style={{ textAlign: "center", color: "var(--text-muted)" }}>—</div>;
        }
        return (
          <div key={v} style={{ textAlign: "center" }}>
            {c.es_ultima_publicacion
              ? <strong>{formatGWh(c.energia_kwh)} GWh</strong>
              : <span style={{ color: "var(--text-muted)" }}>{formatGWh(c.energia_kwh)} GWh</span>
            }
            <span style={{ color: "var(--text-muted)" }}> · {formatPct(c.perdidas_pct)}</span>
          </div>
        );
      })}
    </div>
  );

  if (!expandido) {
    return (
      <div style={{ borderBottom: "1px solid var(--card-border)" }}>
        {filaContent}
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(55,138,221,0.04)",
      border: "1px solid var(--card-border)",
      borderRadius: 5,
      margin: "6px 0",
    }}>
      {filaContent}
      <div style={{
        background: "var(--card-bg)", borderTop: "1px solid var(--card-border)",
        borderBottomLeftRadius: 5, borderBottomRightRadius: 5, padding: "8px 12px",
      }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Desglose por empresa · {mesCorto(mes.mes).toLowerCase()} {mes.anio}
        </div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "130px 1fr 1fr 1fr 1fr 1fr", gap: 6,
            padding: "4px 0", borderBottom: "1px solid var(--card-border)",
            fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <div>Empresa</div>
            {VENTANAS_ORDEN.map(v => <div key={v} style={{ textAlign: "center" }}>{VENTANA_META[v].label}</div>)}
          </div>
          {mes.desglose_por_empresa.map((emp, i) => (
            <div key={emp.empresa.id} style={{
              display: "grid", gridTemplateColumns: "130px 1fr 1fr 1fr 1fr 1fr", gap: 6,
              padding: "5px 0",
              borderBottom: i < mes.desglose_por_empresa.length - 1 ? "1px solid var(--card-border)" : "none",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 500 }}>{emp.empresa.nombre}</div>
              {VENTANAS_ORDEN.map(v => {
                const c = emp.celdas[v];
                if (c.energia_kwh == null) {
                  return <div key={v} style={{ textAlign: "center", color: "var(--text-muted)" }}>—</div>;
                }
                return (
                  <div key={v} style={{ textAlign: "center" }}>
                    {c.es_ultima_publicacion
                      ? <strong>{formatGWh(c.energia_kwh)} GWh</strong>
                      : <span>{formatGWh(c.energia_kwh)} GWh</span>
                    }
                    <span style={{ color: "var(--text-muted)" }}> · {formatPct(c.perdidas_pct)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Detalle año PS (mes a mes con toggle tarifa/tipo) ───

function DetalleAnioPS({
  detalle, vistaReparto, onChangeVistaReparto,
}: {
  detalle: HistoricoPSAnioDetalle;
  vistaReparto: "tarifa" | "tipo";
  onChangeVistaReparto: (v: "tarifa" | "tipo") => void;
}) {
  const codigos = vistaReparto === "tarifa" ? TARIFAS_ORDEN : TIPOS_ORDEN;
  const labelOf = (codigo: string) =>
    vistaReparto === "tarifa" ? (TARIFA_META[codigo]?.label ?? codigo) : (TIPO_META[codigo]?.label ?? codigo);

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--btn-secondary-bg)",
      borderRadius: 6, padding: "12px 14px", marginTop: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--btn-secondary-bg)" }}>
          {detalle.anio} · detalle mes a mes
        </div>
        <div style={{ display: "inline-flex", background: "var(--field-bg)", border: "1px solid var(--card-border)", borderRadius: 4, padding: 1 }}>
          <button type="button" onClick={() => onChangeVistaReparto("tarifa")}
            className={vistaReparto === "tarifa" ? "ui-btn ui-btn-xs" : "ui-btn ui-btn-ghost ui-btn-xs"}
            style={{ padding: "3px 12px", fontSize: 10, borderRadius: 3 }}>
            Por tarifa
          </button>
          <button type="button" onClick={() => onChangeVistaReparto("tipo")}
            className={vistaReparto === "tipo" ? "ui-btn ui-btn-xs" : "ui-btn ui-btn-ghost ui-btn-xs"}
            style={{ padding: "3px 12px", fontSize: 10, borderRadius: 3 }}>
            Por tipo
          </button>
        </div>
      </div>

      <div style={{ fontVariantNumeric: "tabular-nums" }}>
        {/* Cabecera */}
        <div style={{
          display: "grid", gridTemplateColumns: `70px 1fr ${codigos.map(() => "1fr").join(" ")}`, gap: 6,
          padding: "4px 0", borderBottom: "1px solid var(--card-border)",
          fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500,
        }}>
          <div>Mes</div>
          <div style={{ textAlign: "center" }}>CUPS</div>
          {codigos.map(c => <div key={c} style={{ textAlign: "center" }}>{labelOf(c)}</div>)}
        </div>

        {/* Filas de mes */}
        {detalle.meses.map((m, i) => {
          const reparto = vistaReparto === "tarifa" ? m.por_tarifa : m.por_tipo;
          return (
            <div key={`${m.anio}-${m.mes}`} style={{
              display: "grid", gridTemplateColumns: `70px 1fr ${codigos.map(() => "1fr").join(" ")}`, gap: 6,
              padding: "5px 0",
              borderBottom: i < detalle.meses.length - 1 ? "1px solid var(--card-border)" : "none",
              fontSize: 11, alignItems: "center",
            }}>
              <div style={{ fontWeight: 500 }}>{mesCorto(m.mes).toLowerCase()} {m.anio.toString().slice(2)}</div>
              <div style={{ textAlign: "center" }}>{formatMiles(m.cups)}</div>
              {codigos.map(codigo => {
                const c = reparto[codigo];
                if (!c || ((c.importe_eur ?? 0) === 0 && (c.energia_kwh ?? 0) === 0)) {
                  return <div key={codigo} style={{ textAlign: "center", color: "var(--text-muted)" }}>—</div>;
                }
                return (
                  <div key={codigo} style={{ textAlign: "center" }}>
                    {formatGWh3(c.energia_kwh ?? 0)} GWh
                    <span style={{ color: "var(--text-muted)" }}> · {formatEur(c.importe_eur ?? 0)} €</span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Total año — suma columna a columna */}
        <div style={{
          display: "grid", gridTemplateColumns: `70px 1fr ${codigos.map(() => "1fr").join(" ")}`, gap: 6,
          padding: "8px 0 4px", marginTop: 4,
          borderTop: "1px solid var(--card-border)",
          fontSize: 11, fontWeight: 500,
        }}>
          <div>Total</div>
          <div style={{ textAlign: "center" }}>
            {formatMiles(detalle.total.cups ?? 0)}
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> final</span>
          </div>
          {codigos.map(codigo => {
            // Sumamos los 12 meses (o los que haya) para esta columna concreta.
            let sumKwh = 0;
            let sumEur = 0;
            for (const m of detalle.meses) {
              const reparto = vistaReparto === "tarifa" ? m.por_tarifa : m.por_tipo;
              const c = reparto[codigo];
              if (!c) continue;
              sumKwh += c.energia_kwh ?? 0;
              sumEur += c.importe_eur ?? 0;
            }
            if (sumKwh === 0 && sumEur === 0) {
              return <div key={codigo} style={{ textAlign: "center", color: "var(--text-muted)", fontWeight: 400 }}>—</div>;
            }
            return (
              <div key={codigo} style={{ textAlign: "center" }}>
                {formatGWh3(sumKwh)} GWh
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {formatEur(sumEur)} €</span>
              </div>
            );
          })}
        </div>

        {/* Resumen del año */}
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }}>
          Total año: {formatGWh3(detalle.total.energia_kwh ?? 0)} GWh · {formatEur(detalle.total.importe_eur ?? 0)} €
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DESGLOSE POR EMPRESA — General (Histórico)
// ═══════════════════════════════════════════════════════════════════════

function DesgloseEmpresasGeneral({
  empresas, empresaAnioAbierto, onToggleEmpresaAnio, mesesExpandidos, onToggleMes,
}: {
  empresas: HistoricoGeneralEmpresaDetalle[];
  empresaAnioAbierto: string | null;
  onToggleEmpresaAnio: (empresaId: number, anio: number) => void;
  mesesExpandidos: Set<string>;
  onToggleMes: (anio: number, mes: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {empresas.map(emp => {
        const anioAbiertoEnEsta = empresaAnioAbierto?.startsWith(`${emp.empresa.id}-`)
          ? Number(empresaAnioAbierto.split("-")[1])
          : null;
        const detalleAbierto = anioAbiertoEnEsta != null
          ? emp.detalle_anios.find(d => d.anio === anioAbiertoEnEsta) ?? null
          : null;

        return (
          <div key={emp.empresa.id}>
            <div style={{
              display: "grid", gridTemplateColumns: `120px repeat(${emp.anios.length}, 1fr)`, gap: 6,
              alignItems: "center", padding: "6px 0",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{emp.empresa.nombre}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{emp.empresa.codigo_ree ?? "—"}</div>
              </div>

              {emp.anios.map(card => {
                const claveTarjeta = `${emp.empresa.id}-${card.anio}`;
                const tarjetaAbierta = empresaAnioAbierto === claveTarjeta;
                const cerrado = card.art15_meses_cerrados >= 12;

                if (card.sin_datos) {
                  return (
                    <div key={card.anio} style={{
                      background: "var(--card-bg)", border: "1px dashed var(--card-border)",
                      borderRadius: 5, padding: "5px 7px", opacity: 0.5,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{card.anio}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>—</div>
                    </div>
                  );
                }

                return (
                  <div key={card.anio} onClick={() => onToggleEmpresaAnio(emp.empresa.id, card.anio)} style={{
                    background: tarjetaAbierta ? "rgba(55,138,221,0.08)" : "var(--card-bg)",
                    border: tarjetaAbierta ? "1px solid var(--btn-secondary-bg)" : "1px solid var(--card-border)",
                    borderRadius: 5, padding: "5px 7px", cursor: "pointer",
                    transition: "background 0.15s ease, border-color 0.15s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: tarjetaAbierta ? "var(--btn-secondary-bg)" : "#85B7EB",
                        letterSpacing: "0.02em",
                        background: "rgba(55,138,221,0.12)",
                        padding: "1px 6px",
                        borderRadius: 3,
                      }}>
                        {card.anio}
                      </span>
                      <span style={{
                        fontSize: 8,
                        color: tarjetaAbierta ? "var(--btn-secondary-bg)" : (cerrado ? "#5DCAA5" : "var(--text-muted)"),
                      }}>
                        {tarjetaAbierta ? "▾" : `${card.meses_con_dato} m`}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                      {formatGWh3(card.energia_kwh)} <span style={{ fontSize: 8, color: "var(--text-muted)" }}>GWh</span>
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                      {formatPct(card.perdidas_pct)} · ART15 {card.art15_meses_cerrados}/{card.art15_meses_total}
                    </div>
                  </div>
                );
              })}
            </div>

            {detalleAbierto && (
              <div style={{ marginTop: 4, marginBottom: 8, marginLeft: 12 }}>
                <DetalleAnioGeneral
                  detalle={detalleAbierto}
                  mesesExpandidos={mesesExpandidos}
                  onToggleMes={onToggleMes}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DESGLOSE POR EMPRESA — PS (Histórico)
// ═══════════════════════════════════════════════════════════════════════

function DesgloseEmpresasPS({
  empresas, empresaAnioAbierto, onToggleEmpresaAnio, vistaReparto, onChangeVistaReparto,
}: {
  empresas: HistoricoPSEmpresaDetalle[];
  empresaAnioAbierto: string | null;
  onToggleEmpresaAnio: (empresaId: number, anio: number) => void;
  vistaReparto: "tarifa" | "tipo";
  onChangeVistaReparto: (v: "tarifa" | "tipo") => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {empresas.map(emp => {
        const anioAbiertoEnEsta = empresaAnioAbierto?.startsWith(`${emp.empresa.id}-`)
          ? Number(empresaAnioAbierto.split("-")[1])
          : null;
        const detalleAbierto = anioAbiertoEnEsta != null
          ? emp.detalle_anios.find(d => d.anio === anioAbiertoEnEsta) ?? null
          : null;

        return (
          <div key={emp.empresa.id}>
            <div style={{
              display: "grid", gridTemplateColumns: `120px repeat(${emp.anios.length}, 1fr)`, gap: 6,
              alignItems: "center", padding: "6px 0",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{emp.empresa.nombre}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{emp.empresa.codigo_ree ?? "—"}</div>
              </div>

              {emp.anios.map(card => {
                const claveTarjeta = `${emp.empresa.id}-${card.anio}`;
                const tarjetaAbierta = empresaAnioAbierto === claveTarjeta;

                if (card.sin_datos) {
                  return (
                    <div key={card.anio} style={{
                      background: "var(--card-bg)", border: "1px dashed var(--card-border)",
                      borderRadius: 5, padding: "5px 7px", opacity: 0.5,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{card.anio}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>—</div>
                    </div>
                  );
                }

                return (
                  <div key={card.anio} onClick={() => onToggleEmpresaAnio(emp.empresa.id, card.anio)} style={{
                    background: tarjetaAbierta ? "rgba(55,138,221,0.08)" : "var(--card-bg)",
                    border: tarjetaAbierta ? "1px solid var(--btn-secondary-bg)" : "1px solid var(--card-border)",
                    borderRadius: 5, padding: "5px 7px", cursor: "pointer",
                    transition: "background 0.15s ease, border-color 0.15s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: tarjetaAbierta ? "var(--btn-secondary-bg)" : "#85B7EB",
                        letterSpacing: "0.02em",
                        background: "rgba(55,138,221,0.12)",
                        padding: "1px 6px",
                        borderRadius: 3,
                      }}>
                        {card.anio}
                      </span>
                      <span style={{ fontSize: 8, color: tarjetaAbierta ? "var(--btn-secondary-bg)" : "var(--text-muted)" }}>
                        {tarjetaAbierta ? "▾" : `${card.meses_con_dato} m`}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>
                      {formatMiles(card.cups_final_anio)} CUPS
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                      {formatGWh3(card.energia_kwh)} GWh · {formatEur(card.importe_eur)} €
                    </div>
                  </div>
                );
              })}
            </div>

            {detalleAbierto && (
              <div style={{ marginTop: 4, marginBottom: 8, marginLeft: 12 }}>
                <DetalleAnioPS
                  detalle={detalleAbierto}
                  vistaReparto={vistaReparto}
                  onChangeVistaReparto={onChangeVistaReparto}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}