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

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
  }).format(date);
}

function getEstadoLabel(estado: CalendarioOperativoItem["estado"]): string {
  switch (estado) {
    case "hoy":
      return "Hoy";
    case "proximo":
      return "Próximo";
    case "cerrado":
      return "Cerrado";
    default:
      return "Pendiente";
  }
}

function getEstadoBadgeClass(estado: CalendarioOperativoItem["estado"]): string {
  switch (estado) {
    case "hoy":
      return "bg-amber-100 text-amber-800";
    case "proximo":
      return "bg-blue-100 text-blue-800";
    case "cerrado":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-emerald-100 text-emerald-800";
  }
}

export default function CalendarioOperativoCard({ token, anioActivo }: Props) {
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");
  const [textoFiltro, setTextoFiltro] = useState<string>("");
  const [textoFiltroDebounced, setTextoFiltroDebounced] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [itemsRaw, setItemsRaw] = useState<CalendarioOperativoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<string>("db");
  const [total, setTotal] = useState<number>(0);
  const [pages, setPages] = useState<number>(1);
  const [totalHitos, setTotalHitos] = useState<number>(0);
  const [hitosPendientes, setHitosPendientes] = useState<number>(0);
  const [hitosCerrados, setHitosCerrados] = useState<number>(0);
  const [categoriaActual, setCategoriaActual] = useState<string | null>(null);
  const [proximoHito, setProximoHito] = useState<CalendarioOperativoItem | null>(null);
  const [proximosHitos, setProximosHitos] = useState<CalendarioOperativoItem[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setTextoFiltroDebounced(textoFiltro);
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [textoFiltro]);

  useEffect(() => {
    setPage(1);
  }, [anioActivo, categoriaFiltro, estadoFiltro, textoFiltroDebounced, pageSize]);

  const loadOperativo = async () => {
    if (!token) {
      setItemsRaw([]);
      setTotal(0);
      setPages(1);
      setTotalHitos(0);
      setHitosPendientes(0);
      setHitosCerrados(0);
      setCategoriaActual(null);
      setProximoHito(null);
      setProximosHitos([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();

      if (anioActivo) {
        searchParams.set("anio", String(anioActivo));
      }

      if (categoriaFiltro !== "todas") {
        searchParams.set("categoria", categoriaFiltro);
      }

      if (estadoFiltro !== "todos") {
        searchParams.set("estado", estadoFiltro);
      }

      const search = textoFiltroDebounced.trim();
      if (search) {
        searchParams.set("search", search);
      }

      searchParams.set("page", String(page));
      searchParams.set("page_size", String(pageSize));

      const response = await fetch(
        `${API_BASE_URL}/calendario-ree/operativo?${searchParams.toString()}`,
        {
          method: "GET",
          headers: getAuthHeaders(token),
        }
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

      if (json.page && json.pages && json.page > json.pages) {
        setPage(json.pages);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo cargar el calendario operativo.";
      setError(message);
      setItemsRaw([]);
      setTotal(0);
      setPages(1);
      setTotalHitos(0);
      setHitosPendientes(0);
      setHitosCerrados(0);
      setCategoriaActual(null);
      setProximoHito(null);
      setProximosHitos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperativo();
  }, [token, anioActivo, categoriaFiltro, estadoFiltro, textoFiltroDebounced, page, pageSize]);

  const currentPage = pages <= 0 ? 1 : Math.min(page, pages);
  const pageStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(currentPage * pageSize, total);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Calendario activo
          </div>

          <div className="mt-2 text-2xl font-semibold">{anioActivo ?? "—"}</div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="ui-muted">Total hitos</span>
              <span className="font-semibold">{totalHitos}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ui-muted">Pendientes</span>
              <span className="font-semibold">{hitosPendientes}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ui-muted">Cerrados</span>
              <span className="font-semibold">{hitosCerrados}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ui-muted">Categoría actual</span>
              <span className="font-semibold">{categoriaActual ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ui-muted">Fuente</span>
              <span className="font-semibold">
                {source === "db" ? "Excel cargado" : source}
              </span>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Próximos hitos
          </div>

          <div className="mt-4 space-y-3">
            {proximosHitos.length === 0 ? (
              <div className="text-sm ui-muted">No hay próximos hitos disponibles.</div>
            ) : (
              proximosHitos.map((item, index) => (
                <div
                  key={item.id}
                  className={index < proximosHitos.length - 1 ? "border-b pb-3" : ""}
                  style={
                    index < proximosHitos.length - 1
                      ? { borderColor: "var(--card-border)" }
                      : undefined
                  }
                >
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                    <div className={index === 0 ? "text-base font-semibold" : "text-sm font-medium"}>
                      {item.evento}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-sm font-semibold">
                      <span>{formatDateEs(item.fecha)}</span>
                      <span className="ui-muted">·</span>
                      <span>{item.categoria}</span>
                    </div>
                  </div>

                  <div className="mt-1 text-xs ui-muted">{item.mes_afectado}</div>
                </div>
              ))
            )}
          </div>

          {proximoHito && (
            <div className="mt-4 text-xs ui-muted">
              Principal: {proximoHito.evento}
            </div>
          )}
        </div>

        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="ui-label">Categoría</label>
              <select
                className="ui-select"
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
              >
                <option value="todas">Todas</option>
                <option value="M+1">M+1</option>
                <option value="M+2">M+2</option>
                <option value="Intermedio">Intermedio</option>
                <option value="Provisional">Provisional</option>
                <option value="Definitivo">Definitivo</option>
                <option value="Art. 15">Art. 15</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="ui-label">Estado</label>
              <select
                className="ui-select"
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="proximo">Próximo</option>
                <option value="hoy">Hoy</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="ui-label">Buscar</label>
              <input
                type="text"
                className="ui-input"
                value={textoFiltro}
                onChange={(e) => setTextoFiltro(e.target.value)}
                placeholder="Evento, mes, categoría..."
              />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="ui-alert ui-alert--danger mt-4 text-xs">{error}</div>}

      <div
        className="mt-4 overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--card-border)" }}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ background: "var(--btn-secondary-bg)", color: "#fff" }}>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Mes visual</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Evento</th>
              <th className="px-3 py-2">Mes afectado</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3" colSpan={6}>
                  Cargando calendario operativo...
                </td>
              </tr>
            ) : itemsRaw.length === 0 ? (
              <tr>
                <td className="px-3 py-3" colSpan={6}>
                  No hay hitos que cumplan los filtros actuales.
                </td>
              </tr>
            ) : (
              itemsRaw.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3">{formatDateEs(item.fecha)}</td>
                  <td className="px-3 py-3">{item.mes_visual}</td>
                  <td className="px-3 py-3">{item.categoria}</td>
                  <td className="px-3 py-3">{item.evento}</td>
                  <td className="px-3 py-3">{item.mes_afectado}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getEstadoBadgeClass(
                        item.estado
                      )}`}
                    >
                      {getEstadoLabel(item.estado)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs ui-muted">
          Mostrando {pageStart}-{pageEnd} de {total} filas
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs ui-muted">Filas por página:</label>
            <select
              className="ui-select w-[84px]"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              disabled={loading}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-outline ui-btn-xs"
            disabled={currentPage <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            ← Anterior
          </button>

          <div className="px-1 text-xs ui-muted">
            Página {currentPage} / {Math.max(1, pages)}
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-outline ui-btn-xs"
            disabled={currentPage >= pages || loading}
            onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}