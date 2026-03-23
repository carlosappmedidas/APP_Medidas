"use client";

import React, { useEffect, useMemo, useState } from "react";
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

const CATEGORY_ORDER = ["M+1", "M+2", "Intermedio", "Provisional", "Definitivo", "Art. 15"];

export default function CalendarioOperativoCard({ token, anioActivo }: Props) {
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");
  const [textoFiltro, setTextoFiltro] = useState<string>("");

  const [itemsRaw, setItemsRaw] = useState<CalendarioOperativoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOperativo = async () => {
    if (!token) {
      setItemsRaw([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = anioActivo ? `?anio=${anioActivo}` : "";
      const response = await fetch(`${API_BASE_URL}/calendario-ree/operativo${query}`, {
        method: "GET",
        headers: getAuthHeaders(token),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo cargar el calendario operativo.");
      }

      const json = (await response.json()) as CalendarioOperativoResponse;
      setItemsRaw(json.items ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo cargar el calendario operativo.";
      setError(message);
      setItemsRaw([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperativo();
  }, [token, anioActivo]);

  const items = useMemo(() => {
    return itemsRaw.filter((item) => {
      const matchCategoria =
        categoriaFiltro === "todas" || item.categoria === categoriaFiltro;

      const matchEstado = estadoFiltro === "todos" || item.estado === estadoFiltro;

      const texto = textoFiltro.trim().toLowerCase();
      const matchTexto =
        !texto ||
        item.evento.toLowerCase().includes(texto) ||
        item.mes_visual.toLowerCase().includes(texto) ||
        item.mes_afectado.toLowerCase().includes(texto) ||
        item.categoria.toLowerCase().includes(texto);

      return matchCategoria && matchEstado && matchTexto;
    });
  }, [itemsRaw, categoriaFiltro, estadoFiltro, textoFiltro]);

  const proximoHito = useMemo(() => {
    return (
      items.find(
        (item) =>
          item.estado === "hoy" ||
          item.estado === "proximo" ||
          item.estado === "pendiente"
      ) ?? null
    );
  }, [items]);

  const categoriaActual = useMemo(() => {
    return proximoHito?.categoria ?? "—";
  }, [proximoHito]);

  const totalHitos = useMemo(() => items.length, [items]);

  const hitosPendientes = useMemo(() => {
    return items.filter(
      (item) =>
        item.estado === "pendiente" ||
        item.estado === "proximo" ||
        item.estado === "hoy"
    ).length;
  }, [items]);

  const hitosCerrados = useMemo(() => {
    return items.filter((item) => item.estado === "cerrado").length;
  }, [items]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CalendarioOperativoItem[]>();

    for (const item of items) {
      if (!groups.has(item.categoria)) {
        groups.set(item.categoria, []);
      }
      groups.get(item.categoria)?.push(item);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const indexA = CATEGORY_ORDER.indexOf(a);
        const indexB = CATEGORY_ORDER.indexOf(b);

        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      })
      .map(([categoria, categoriaItems]) => ({
        categoria,
        items: categoriaItems.sort((left, right) => {
          if (left.fecha !== right.fecha) {
            return left.fecha.localeCompare(right.fecha);
          }
          return left.sort_order - right.sort_order;
        }),
      }));
  }, [items]);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Calendario activo
          </div>
          <div className="mt-2 text-lg font-semibold">{anioActivo ?? "—"}</div>
        </div>

        <div
          className="rounded-xl border p-4 xl:col-span-2"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Próximo hito
          </div>
          <div className="mt-2 text-sm font-semibold">
            {proximoHito?.evento ?? "—"}
          </div>
          <div className="mt-1 text-xs ui-muted">
            {proximoHito ? `${formatDateEs(proximoHito.fecha)} · ${proximoHito.categoria}` : "—"}
          </div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Total hitos
          </div>
          <div className="mt-2 text-lg font-semibold">{totalHitos}</div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Pendientes
          </div>
          <div className="mt-2 text-lg font-semibold">{hitosPendientes}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Categoría actual
          </div>
          <div className="mt-2 text-lg font-semibold">{categoriaActual}</div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Cerrados
          </div>
          <div className="mt-2 text-lg font-semibold">{hitosCerrados}</div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
            Fuente
          </div>
          <div className="mt-2 text-sm font-semibold">Excel operativo cargado</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
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

      {error && <div className="ui-alert ui-alert--danger mt-4 text-xs">{error}</div>}

      {loading ? (
        <div
          className="mt-4 rounded-xl border p-6 text-sm"
          style={{ borderColor: "var(--card-border)" }}
        >
          Cargando calendario operativo...
        </div>
      ) : groupedItems.length === 0 ? (
        <div
          className="mt-4 rounded-xl border p-6 text-sm"
          style={{ borderColor: "var(--card-border)" }}
        >
          No hay hitos que cumplan los filtros actuales.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {groupedItems.map((group) => (
            <div
              key={group.categoria}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--card-border)" }}
            >
              <div
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ background: "var(--btn-secondary-bg)", color: "#fff" }}
              >
                <div className="text-sm font-semibold">{group.categoria}</div>
                <div className="text-xs opacity-90">{group.items.length} hitos</div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Mes visual</th>
                      <th className="px-3 py-2">Evento</th>
                      <th className="px-3 py-2">Mes afectado</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3">{formatDateEs(item.fecha)}</td>
                        <td className="px-3 py-3">{item.mes_visual}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs ui-muted">
        El calendario operativo ya lee todos los eventos persistidos desde el Excel cargado.
      </div>
    </div>
  );
}