// app/components/SistemaSection.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../apiConfig";
import type { MedidaGeneral } from "../types";
import MedidasPsSection from "./MedidasPsSection";

// ---------- Helpers ----------
const formatNumberEs = (
  v: number | null | undefined,
  decimals: number = 2
): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

const formatPercentEs = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return "-";
  return `${formatNumberEs(v, 2)} %`;
};

type Props = {
  token: string | null;
};

type ColumnDefGeneral = {
  id: string;
  label: string;
  align: "left" | "right";
  render: (m: MedidaGeneral | any) => any;
};

const ALL_COLUMNS_GENERAL_SISTEMA: ColumnDefGeneral[] = [
  {
    id: "tenant_id",
    label: "Tenant",
    align: "left",
    render: (m) => m.tenant_id ?? "-",
  },

  // Identificación
  {
    id: "empresa_id",
    label: "Empresa ID",
    align: "left",
    render: (m) => m.empresa_id,
  },
  {
    id: "empresa_codigo",
    label: "Código empresa",
    align: "left",
    render: (m) => (m as any).empresa_codigo ?? "-",
  },
  { id: "punto_id", label: "Punto", align: "left", render: (m) => m.punto_id },
  { id: "anio", label: "Año", align: "left", render: (m) => m.anio },
  {
    id: "mes",
    label: "Mes",
    align: "left",
    render: (m) => String(m.mes).padStart(2, "0"),
  },

  // General
  {
    id: "energia_bruta_facturada",
    label: "E bruta facturada",
    align: "right",
    render: (m) => formatNumberEs(m.energia_bruta_facturada),
  },
  {
    id: "energia_autoconsumo_kwh",
    label: "E autoconsumo",
    align: "right",
    render: (m) => formatNumberEs(m.energia_autoconsumo_kwh),
  },
  {
    id: "energia_neta_facturada_kwh",
    label: "E neta facturada",
    align: "right",
    render: (m) => formatNumberEs(m.energia_neta_facturada_kwh),
  },
  {
    id: "energia_generada_kwh",
    label: "E generada",
    align: "right",
    render: (m) => formatNumberEs(m.energia_generada_kwh),
  },
  {
    id: "energia_frontera_dd_kwh",
    label: "E frontera DD",
    align: "right",
    render: (m) => formatNumberEs(m.energia_frontera_dd_kwh),
  },
  {
    id: "energia_pf_final_kwh",
    label: "E PF final",
    align: "right",
    render: (m) => formatNumberEs(m.energia_pf_final_kwh),
  },
  {
    id: "perdidas_e_facturada_kwh",
    label: "Pérdidas (kWh)",
    align: "right",
    render: (m) => formatNumberEs(m.perdidas_e_facturada_kwh),
  },
  {
    id: "perdidas_e_facturada_pct",
    label: "Pérdidas (%)",
    align: "right",
    render: (m) => formatPercentEs(m.perdidas_e_facturada_pct),
  },
];

function MedidasGeneralAllSection({ token }: { token: string | null }) {
  const [data, setData] = useState<MedidaGeneral[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [filtroTenant, setFiltroTenant] = useState<string>("");
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");
  const [filtroAnio, setFiltroAnio] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");

  // paginación
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(0);

  const handleLoad = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/medidas/general/all`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Respuesta /medidas/general/all:", text);
        throw new Error(`Error ${res.status}`);
      }

      const json = (await res.json()) as MedidaGeneral[];
      setData(Array.isArray(json) ? json : []);
      setPage(0);
    } catch (e) {
      console.error("Error cargando medidas_general/all:", e);
      setError("No se pudieron cargar las medidas general (all).");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
  }, [filtroTenant, filtroEmpresa, filtroAnio, filtroMes, pageSize]);

  const { opcionesTenant, opcionesEmpresa, opcionesAnio, opcionesMes } =
    useMemo(() => {
      const tenants = new Set<number>();
      const empresas = new Set<string>();
      const anios = new Set<number>();
      const meses = new Set<number>();

      for (const m of data) {
        if (typeof (m as any).tenant_id === "number") {
          tenants.add((m as any).tenant_id);
        }
        const cod = (m as any).empresa_codigo as string | undefined;
        if (cod) empresas.add(cod);
        if (typeof m.anio === "number") anios.add(m.anio);
        if (typeof m.mes === "number") meses.add(m.mes);
      }

      return {
        opcionesTenant: Array.from(tenants)
          .sort((a, b) => a - b)
          .map(String),
        opcionesEmpresa: Array.from(empresas).sort(),
        opcionesAnio: Array.from(anios).sort((a, b) => a - b),
        opcionesMes: Array.from(meses).sort((a, b) => a - b),
      };
    }, [data]);

  const filasVisibles = useMemo(() => {
    const filtradas = data.filter((m) => {
      const tenantId = String((m as any).tenant_id ?? "");
      const empresaCodigo = ((m as any).empresa_codigo ?? "") as string;

      const matchTenant = !filtroTenant || tenantId === filtroTenant;
      const matchEmpresa = !filtroEmpresa || empresaCodigo === filtroEmpresa;
      const matchAnio =
        !filtroAnio || m.anio === Number.parseInt(filtroAnio, 10);
      const matchMes = !filtroMes || m.mes === Number.parseInt(filtroMes, 10);

      return matchTenant && matchEmpresa && matchAnio && matchMes;
    });

    return [...filtradas].sort((a, b) => {
      const tA = (a as any).tenant_id ?? 0;
      const tB = (b as any).tenant_id ?? 0;
      if (tA !== tB) return tA - tB;

      const codA = ((a as any).empresa_codigo ?? "") as string;
      const codB = ((b as any).empresa_codigo ?? "") as string;
      const cmpCod = codA.localeCompare(codB);
      if (cmpCod !== 0) return cmpCod;

      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.mes - b.mes;
    });
  }, [data, filtroTenant, filtroEmpresa, filtroAnio, filtroMes]);

  const totalFilas = filasVisibles.length;
  const totalPages = Math.max(1, Math.ceil(totalFilas / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFilas);
  const filasPaginadas =
    totalFilas === 0 ? [] : filasVisibles.slice(startIndex, endIndex);

  return (
    <section className="ui-card ui-card--border text-sm">
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="ui-card-title">Medidas general (Sistema)</h4>
          <p className="ui-card-subtitle">
            Vista global (todos los tenants). Requiere superusuario.
          </p>
        </div>

        <button
          onClick={handleLoad}
          disabled={loading || !token}
          className="ui-btn ui-btn-primary"
        >
          {loading ? "Cargando..." : "Cargar medidas general"}
        </button>
      </header>

      {error && <p className="mb-4 text-[11px] text-red-400">{error}</p>}

      {/* Filtros */}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div>
          <label className="ui-label">Tenant</label>
          <select
            className="ui-select"
            value={filtroTenant}
            onChange={(e) => setFiltroTenant(e.target.value)}
          >
            <option value="">Todos</option>
            {opcionesTenant.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ui-label">Código empresa</label>
          <select
            className="ui-select"
            value={filtroEmpresa}
            onChange={(e) => setFiltroEmpresa(e.target.value)}
          >
            <option value="">Todas</option>
            {opcionesEmpresa.map((cod) => (
              <option key={cod} value={cod}>
                {cod}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ui-label">Año</label>
          <select
            className="ui-select"
            value={filtroAnio}
            onChange={(e) => setFiltroAnio(e.target.value)}
          >
            <option value="">Todos</option>
            {opcionesAnio.map((anio) => (
              <option key={anio} value={anio}>
                {anio}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="ui-label">Mes</label>
          <select
            className="ui-select"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
          >
            <option value="">Todos</option>
            {opcionesMes.map((mes) => (
              <option key={mes} value={mes}>
                {String(mes).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              {ALL_COLUMNS_GENERAL_SISTEMA.map((col) => (
                <th
                  key={col.id}
                  className={[
                    "ui-th",
                    col.align === "right" ? "ui-th-right" : "",
                  ].join(" ")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {totalFilas === 0 ? (
              <tr className="ui-tr">
                <td
                  colSpan={ALL_COLUMNS_GENERAL_SISTEMA.length}
                  className="ui-td text-center ui-muted"
                >
                  No hay medidas general que cumplan los filtros.
                </td>
              </tr>
            ) : (
              filasPaginadas.map((m: any) => (
                <tr
                  key={`${m.tenant_id}-${m.empresa_id}-${m.punto_id}-${m.anio}-${m.mes}`}
                  className="ui-tr"
                >
                  {ALL_COLUMNS_GENERAL_SISTEMA.map((col) => (
                    <td
                      key={col.id}
                      className={[
                        "ui-td",
                        col.align === "right" ? "ui-td-right" : "",
                      ].join(" ")}
                    >
                      {col.render(m)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalFilas > 0 && (
          <div className="flex flex-col gap-2 border-t border-[var(--card-border)] px-4 py-3 text-[11px] ui-muted md:flex-row md:items-center md:justify-between">
            <div>
              Mostrando{" "}
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {startIndex + 1}
              </span>{" "}
              -{" "}
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {endIndex}
              </span>{" "}
              de{" "}
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {totalFilas}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span>Filas por página:</span>
                <select
                  className="ui-select w-auto px-2 py-1 text-[11px]"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 10)}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="ui-btn ui-btn-outline ui-btn-xs"
                >
                  ← Anterior
                </button>
                <span>
                  Página{" "}
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {currentPage + 1}
                  </span>{" "}
                  /{" "}
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {totalPages}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={currentPage >= totalPages - 1}
                  className="ui-btn ui-btn-outline ui-btn-xs"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- UI: Desplegable ----------
function SistemaAccordion({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="ui-card ui-card--border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-6 rounded-2xl px-6 py-5 text-left"
      >
        <div className="min-w-0">
          <div className="ui-card-title">{title}</div>
          {subtitle ? <div className="ui-card-subtitle">{subtitle}</div> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] ui-muted">
            {open ? "Ocultar" : "Mostrar"}
          </span>
          <span
            className={[
              "inline-flex items-center justify-center text-[13px] ui-muted transition-transform",
              open ? "rotate-180" : "rotate-0",
            ].join(" ")}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
      </button>

      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function SistemaSection({ token }: Props) {
  return (
    <div className="space-y-6">
      <SistemaAccordion
        title="Medidas PS (Sistema)"
        subtitle="Vista global (todos los tenants). Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasPsSection token={token} scope="all" />
      </SistemaAccordion>

      <SistemaAccordion
        title="Medidas general (Sistema)"
        subtitle="Vista global (todos los tenants). Requiere superusuario."
        defaultOpen={false}
      >
        <MedidasGeneralAllSection token={token} />
      </SistemaAccordion>
    </div>
  );
}