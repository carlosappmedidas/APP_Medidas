"use client";
import React, { useEffect, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

type CalendarioOperativoItem = {
  id: number;
  anio: number;
  fecha: string;
  mes_visual: string;
  categoria: string;
  evento: string;
  mes_afectado: string;
  estado: "pendiente" | "hoy" | "proximo" | "cerrado";
  sort_order: number;
};

type CalendarioOperativoResponse = {
  anio: number | null;
  source: string;
  page: number;
  page_size: number;
  total: number;
  pages: number;
  total_hitos: number;
  hitos_pendientes: number;
  hitos_cerrados: number;
  categoria_actual: string | null;
  proximo_hito: CalendarioOperativoItem | null;
  proximos_hitos: CalendarioOperativoItem[];
  items: CalendarioOperativoItem[];
};

type Props = {
  token: string | null;
  anioActivo: number | null;
};

function formatDateEs(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(date);
}

function getEstadoLabel(estado: CalendarioOperativoItem["estado"]): string {
  switch (estado) {
    case "hoy":     return "Hoy";
    case "proximo": return "Próximo";
    case "cerrado": return "Cerrado";
    default:        return "Pendiente";
  }
}

export default function CalendarioOperativoCard({ token, anioActivo }: Props) {
  const [categoriaFiltro, setCategoriaFiltro]             = useState<string>("todas");
  const [estadoFiltro, setEstadoFiltro]                   = useState<string>("todos");
  const [textoFiltro, setTextoFiltro]                     = useState<string>("");
  const [textoFiltroDebounced, setTextoFiltroDebounced]   = useState<string>("");
  const [page, setPage]                                   = useState<number>(1);
  const [pageSize, setPageSize]                           = useState<number>(20);
  const [itemsRaw, setItemsRaw]                           = useState<CalendarioOperativoItem[]>([]);
  const [loading, setLoading]                             = useState(false);
  const [error, setError]                                 = useState<string | null>(null);
  const [source, setSource]                               = useState<string>("db");
  const [total, setTotal]                                 = useState<number>(0);
  const [pages, setPages]                                 = useState<number>(1);
  const [totalHitos, setTotalHitos]                       = useState<number>(0);
  const [hitosPendientes, setHitosPendientes]             = useState<number>(0);
  const [hitosCerrados, setHitosCerrados]                 = useState<number>(0);
  const [categoriaActual, setCategoriaActual]             = useState<string | null>(null);
  const [proximoHito, setProximoHito]                     = useState<CalendarioOperativoItem | null>(null);
  const [proximosHitos, setProximosHitos]                 = useState<CalendarioOperativoItem[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setTextoFiltroDebounced(textoFiltro), 350);
    return () => window.clearTimeout(timeout);
  }, [textoFiltro]);

  useEffect(() => {
    setPage(1);
  }, [anioActivo, categoriaFiltro, estadoFiltro, textoFiltroDebounced, pageSize]);

  const loadOperativo = async () => {
    if (!token) {
      setItemsRaw([]); setTotal(0); setPages(1); setTotalHitos(0);
      setHitosPendientes(0); setHitosCerrados(0); setCategoriaActual(null);
      setProximoHito(null); setProximosHitos([]);
      return;
    }
    setLoading(true); setError(null);
    try {
      const searchParams = new URLSearchParams();
      if (anioActivo) searchParams.set("anio", String(anioActivo));
      if (categoriaFiltro !== "todas") searchParams.set("categoria", categoriaFiltro);
      if (estadoFiltro !== "todos") searchParams.set("estado", estadoFiltro);
      const search = textoFiltroDebounced.trim();
      if (search) searchParams.set("search", search);
      searchParams.set("page", String(page));
      searchParams.set("page_size", String(pageSize));

      const response = await fetch(
        `${API_BASE_URL}/calendario-ree/operativo?${searchParams.toString()}`,
        { method: "GET", headers: getAuthHeaders(token) }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo cargar el calendario operativo.");
      }
      const json = (await response.json()) as CalendarioOperativoResponse;
      setItemsRaw(json.items ?? []);
      setSource(json.source ?? "db");
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
      setTotalHitos(json.total_hitos ?? 0);
      setHitosPendientes(json.hitos_pendientes ?? 0);
      setHitosCerrados(json.hitos_cerrados ?? 0);
      setCategoriaActual(json.categoria_actual ?? null);
      setProximoHito(json.proximo_hito ?? null);
      setProximosHitos(json.proximos_hitos ?? []);
      if (json.page && json.pages && json.page > json.pages) setPage(json.pages);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el calendario operativo.";
      setError(message);
      setItemsRaw([]); setTotal(0); setPages(1); setTotalHitos(0);
      setHitosPendientes(0); setHitosCerrados(0); setCategoriaActual(null);
      setProximoHito(null); setProximosHitos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperativo();
  }, [token, anioActivo, categoriaFiltro, estadoFiltro, textoFiltroDebounced, page, pageSize]);

  const currentPage = pages <= 0 ? 1 : Math.min(page, pages);
  const pageStart   = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd     = total === 0 ? 0 : Math.min(currentPage * pageSize, total);

  // ── helpers de badge con colores de la app ──────────────────────────
  function badgeEstado(estado: CalendarioOperativoItem["estado"]) {
    const base = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium";
    switch (estado) {
      case "hoy":
        return <span className={base} style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" }}>Hoy</span>;
      case "proximo":
        return <span className={base} style={{ background: "rgba(37,99,235,0.2)", color: "#93c5fd", border: "1px solid rgba(37,99,235,0.35)" }}>Próximo</span>;
      case "cerrado":
        return <span className={base} style={{ background: "rgba(5,150,105,0.2)", color: "#6ee7b7", border: "1px solid rgba(5,150,105,0.35)" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", display: "inline-block" }}></span>Cerrado</span>;
      default:
        return <span className={base} style={{ background: "rgba(245,158,11,0.2)", color: "#fcd34d", border: "1px solid rgba(245,158,11,0.35)" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }}></span>Pendiente</span>;
    }
  }

  function badgeCategoria(categoria: string) {
    const isArt15 = categoria.toLowerCase().includes("art");
    const base = "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium";
    if (isArt15) return <span className={base} style={{ background: "rgba(37,99,235,0.2)", color: "#93c5fd", border: "1px solid rgba(37,99,235,0.3)" }}>{categoria}</span>;
    return <span className={base} style={{ background: "rgba(217,119,6,0.2)", color: "#fcd34d", border: "1px solid rgba(217,119,6,0.3)" }}>{categoria}</span>;
  }

  // ── KPI card ────────────────────────────────────────────────────────
  function KpiCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--card-border)" }}
      >
        <div className="text-[10px] ui-muted mb-1">{label}</div>
        <div className="text-2xl font-medium" style={{ color: color ?? "var(--text)" }}>{value}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Año activo"   value={anioActivo ?? "—"} color="#60a5fa" />
        <KpiCard label="Total hitos"  value={totalHitos} />
        <KpiCard label="Pendientes"   value={hitosPendientes} color="#fbbf24" />
        <KpiCard label="Cerrados"     value={hitosCerrados}   color="#34d399" />
      </div>

      {/* ── Timeline + sidebar ────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">

        {/* Próximos hitos — timeline */}
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--card-border)" }}
        >
          <div className="text-[10px] font-medium uppercase tracking-widest ui-muted mb-3">
            Próximos hitos
          </div>
          {loading && proximosHitos.length === 0 ? (
            <div className="text-xs ui-muted">Cargando...</div>
          ) : proximosHitos.length === 0 ? (
            <div className="text-xs ui-muted">No hay próximos hitos disponibles.</div>
          ) : (
            <div className="flex flex-col gap-0">
              {proximosHitos.map((item, index) => (
                <div key={item.id} className="flex gap-3" style={{ position: "relative" }}>
                  {/* línea vertical */}
                  {index < proximosHitos.length - 1 && (
                    <div style={{ position: "absolute", left: 43, top: 20, width: 1, height: "calc(100% + 4px)", background: "var(--card-border)" }} />
                  )}
                  {/* fecha */}
                  <div className="text-[11px] ui-muted shrink-0 text-right pt-1" style={{ minWidth: 38 }}>
                    {formatDateEs(item.fecha)}
                  </div>
                  {/* dot */}
                  <div
                    className="shrink-0 mt-1.5"
                    style={{
                      width: 8, height: 8, borderRadius: "50%", zIndex: 1,
                      background: item.estado === "cerrado" ? "#34d399" : "#fbbf24",
                    }}
                  />
                  {/* body */}
                  <div className="flex-1 pb-4">
                    <div className="text-[12px] leading-snug mb-1.5" style={{ color: "var(--text)" }}>
                      {item.evento}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {badgeCategoria(item.categoria)}
                      <span className="text-[10px] ui-muted">{item.mes_afectado}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar — próximo hito + filtros */}
        <div className="flex flex-col gap-3">

          {/* Próximo hito destacado */}
          {proximoHito && (
            <div
              className="rounded-xl p-3"
              style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.4)" }}
            >
              <div className="text-[10px] font-medium uppercase tracking-widest mb-1.5" style={{ color: "#93c5fd" }}>
                Próximo hito
              </div>
              <div className="text-[12px] leading-snug mb-2" style={{ color: "var(--text)" }}>
                {proximoHito.evento}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium" style={{ color: "#60a5fa" }}>
                  {formatDateEs(proximoHito.fecha)}
                </span>
                {badgeEstado(proximoHito.estado)}
              </div>
            </div>
          )}

          {/* Filtros */}
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--card-border)" }}
          >
            <div className="text-[10px] font-medium uppercase tracking-widest ui-muted mb-3">
              Filtros
            </div>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="ui-label">Categoría</label>
                <select className="ui-select w-full" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                  <option value="todas">Todas</option>
                  <option value="M+1">M+1</option>
                  <option value="M+2">M+2</option>
                  <option value="Intermedio">Intermedio</option>
                  <option value="Provisional">Provisional</option>
                  <option value="Definitivo">Definitivo</option>
                  <option value="Art. 15">Art. 15</option>
                </select>
              </div>
              <div>
                <label className="ui-label">Estado</label>
                <select className="ui-select w-full" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="proximo">Próximo</option>
                  <option value="hoy">Hoy</option>
                  <option value="cerrado">Cerrado</option>
                </select>
              </div>
              <div>
                <label className="ui-label">Buscar</label>
                <input
                  type="text"
                  className="ui-input w-full"
                  value={textoFiltro}
                  onChange={(e) => setTextoFiltro(e.target.value)}
                  placeholder="Evento, mes, categoría..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && <div className="ui-alert ui-alert--danger text-xs">{error}</div>}

      {/* ── Tabla ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-left text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--table-head-bg)" }}>
              {["Fecha", "Mes visual", "Categoría", "Evento", "Mes afectado", "Estado"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 font-medium uppercase tracking-wider"
                  style={{ fontSize: 10, color: "var(--text-muted)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-xs ui-muted">Cargando calendario operativo...</td>
              </tr>
            ) : itemsRaw.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-xs ui-muted">No hay hitos que cumplan los filtros actuales.</td>
              </tr>
            ) : (
              itemsRaw.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", cursor: "default" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,58,95,0.5)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-3 py-2" style={{ whiteSpace: "nowrap", color: "var(--text)" }}>{formatDateEs(item.fecha)}</td>
                  <td className="px-3 py-2" style={{ whiteSpace: "nowrap", color: "rgba(226,232,240,0.65)" }}>{item.mes_visual}</td>
                  <td className="px-3 py-2">{badgeCategoria(item.categoria)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text)", lineHeight: 1.35 }}>{item.evento}</td>
                  <td className="px-3 py-2" style={{ whiteSpace: "nowrap", color: "rgba(226,232,240,0.65)" }}>{item.mes_afectado}</td>
                  <td className="px-3 py-2">{badgeEstado(item.estado)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-[11px] ui-muted">
        <div>
          Mostrando{" "}
          <span className="font-medium" style={{ color: "var(--text)" }}>{pageStart}–{pageEnd}</span>
          {" "}de{" "}
          <span className="font-medium" style={{ color: "var(--text)" }}>{total}</span>
          {" "}hitos
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span>Filas por página:</span>
            <select
              className="ui-select w-auto"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              disabled={loading}
              style={{ minHeight: 28, height: 28, paddingTop: 2, paddingBottom: 2, paddingLeft: 8, paddingRight: 8 }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            disabled={currentPage <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >← Anterior</button>
          <span>Página <span className="font-medium" style={{ color: "var(--text)" }}>{currentPage}</span> / <span className="font-medium" style={{ color: "var(--text)" }}>{Math.max(1, pages)}</span></span>
          <button
            type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            disabled={currentPage >= pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >Siguiente →</button>
        </div>
      </div>

    </div>
  );
}