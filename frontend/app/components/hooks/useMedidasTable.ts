// app/components/hooks/useMedidasTable.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

export type EmpresaFilterOption = {
  id: number;
  codigo?: string | null;
  nombre?: string | null;
  tenant_id?: number | null;
};

type FiltersResponse = {
  empresas: EmpresaFilterOption[];
  anios: number[];
  meses: number[];
};

type PaginatedResponse<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

type UseMedidasTableParams<T> = {
  token: string | null;
  scope?: "tenant" | "all";

  filtersEndpointTenant: string;
  filtersEndpointAll: string;
  pageEndpointTenant: string;
  pageEndpointAll: string;

  defaultColumnOrder: string[];
  columnOrder?: string[];
  setColumnOrder?: (order: string[]) => void;
  hiddenColumns?: string[];
  setHiddenColumns?: (cols: string[]) => void;

  loadErrorMessage: string;
};

export function useMedidasTable<T>({
  token,
  scope = "tenant",
  filtersEndpointTenant,
  filtersEndpointAll,
  pageEndpointTenant,
  pageEndpointAll,
  defaultColumnOrder,
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
  loadErrorMessage,
}: UseMedidasTableParams<T>) {
  const isSistema = scope === "all";

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [filtroTenant, setFiltroTenant] = useState<string>("");
  const [filtroEmpresaIds, setFiltroEmpresaIds] = useState<string[]>([]);
  const [filtroAnios, setFiltroAnios] = useState<string[]>([]);
  const [filtroMeses, setFiltroMeses] = useState<string[]>([]);

  const [opcionesEmpresa, setOpcionesEmpresa] = useState<EmpresaFilterOption[]>([]);
  const [opcionesAnio, setOpcionesAnio] = useState<number[]>([]);
  const [opcionesMes, setOpcionesMes] = useState<number[]>([]);

  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(0);
  const [totalFilas, setTotalFilas] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [showAdjust, setShowAdjust] = useState<boolean>(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const safeColumnOrder = useMemo(() => {
    if (Array.isArray(columnOrder) && columnOrder.length > 0) return columnOrder;
    return defaultColumnOrder;
  }, [columnOrder, defaultColumnOrder]);

  const safeHiddenColumns = useMemo(() => {
    if (Array.isArray(hiddenColumns)) return hiddenColumns;
    return [];
  }, [hiddenColumns]);

  const canEditAdjustments = !!setColumnOrder && !!setHiddenColumns;

  const orderForAdjustments = useMemo(() => {
    const missing = defaultColumnOrder.filter((id) => !safeColumnOrder.includes(id));
    return [...safeColumnOrder, ...missing];
  }, [safeColumnOrder, defaultColumnOrder]);

  const filtrosActivosCount =
    (isSistema && filtroTenant ? 1 : 0) +
    (filtroEmpresaIds.length > 0 ? 1 : 0) +
    (filtroAnios.length > 0 ? 1 : 0) +
    (filtroMeses.length > 0 ? 1 : 0);

  const clearFilters = useCallback(() => {
    setFiltroTenant("");
    setFiltroEmpresaIds([]);
    setFiltroAnios([]);
    setFiltroMeses([]);
    setPage(0);
  }, []);

  const loadFilters = useCallback(async () => {
    if (!token) return;

    try {
      const endpoint = isSistema ? filtersEndpointAll : filtersEndpointTenant;

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) return;

      const json = (await res.json()) as FiltersResponse;

      setOpcionesEmpresa(Array.isArray(json?.empresas) ? json.empresas : []);
      setOpcionesAnio(Array.isArray(json?.anios) ? json.anios : []);
      setOpcionesMes(Array.isArray(json?.meses) ? json.meses : []);
    } catch (e) {
      console.error("Error cargando filtros:", e);
    }
  }, [token, isSistema, filtersEndpointAll, filtersEndpointTenant]);

  const handleLoadData = useCallback(
    async (nextPage?: number) => {
      if (!token) return;

      const effectivePage = typeof nextPage === "number" ? nextPage : page;

      setLoading(true);
      setError(null);

      try {
        const endpoint = isSistema ? pageEndpointAll : pageEndpointTenant;

        const params = new URLSearchParams();
        params.set("page", String(effectivePage));
        params.set("page_size", String(pageSize));

        if (isSistema && filtroTenant) params.set("tenant_id", filtroTenant);
        if (filtroEmpresaIds.length > 0) params.set("empresa_ids", filtroEmpresaIds.join(","));
        if (filtroAnios.length > 0) params.set("anios", filtroAnios.join(","));
        if (filtroMeses.length > 0) params.set("meses", filtroMeses.join(","));

        const res = await fetch(`${API_BASE_URL}${endpoint}?${params.toString()}`, {
          headers: getAuthHeaders(token),
        });

        if (!res.ok) throw new Error(`Error ${res.status}`);

        const json = (await res.json()) as PaginatedResponse<T>;

        setData(Array.isArray(json?.items) ? json.items : []);
        setTotalFilas(typeof json?.total === "number" ? json.total : 0);
        setTotalPages(typeof json?.total_pages === "number" ? json.total_pages : 1);
        setHasLoadedOnce(true);
      } catch (err) {
        console.error("Error cargando datos paginados:", err);
        setError(loadErrorMessage);
        setData([]);
        setTotalFilas(0);
        setTotalPages(1);
        setHasLoadedOnce(true);
      } finally {
        setLoading(false);
      }
    },
    [
      token,
      page,
      pageSize,
      isSistema,
      pageEndpointAll,
      pageEndpointTenant,
      filtroTenant,
      filtroEmpresaIds,
      filtroAnios,
      filtroMeses,
      loadErrorMessage,
    ]
  );

  const bootKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) {
      bootKeyRef.current = "";
      setHasLoadedOnce(false);
      setError(null);
      setData([]);
      setOpcionesEmpresa([]);
      setOpcionesAnio([]);
      setOpcionesMes([]);
      setFiltroTenant("");
      setFiltroEmpresaIds([]);
      setFiltroAnios([]);
      setFiltroMeses([]);
      setPage(0);
      setTotalFilas(0);
      setTotalPages(1);
      return;
    }

    const key = `${token}::${scope}`;
    if (bootKeyRef.current === key) return;
    bootKeyRef.current = key;

    setPage(0);
    void loadFilters().then(() => {
      void handleLoadData(0);
    });
  }, [token, scope, loadFilters, handleLoadData]);

  const filterKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) return;

    const key = `${scope}::${filtroTenant}::${filtroEmpresaIds.join(",")}::${filtroAnios.join(",")}::${filtroMeses.join(",")}::${pageSize}`;
    if (filterKeyRef.current === key) return;
    filterKeyRef.current = key;

    setPage(0);
    void handleLoadData(0);
  }, [
    token,
    scope,
    filtroTenant,
    filtroEmpresaIds,
    filtroAnios,
    filtroMeses,
    pageSize,
    handleLoadData,
  ]);

  const pageKeyRef = useRef<string>("");
  useEffect(() => {
    if (!token) return;

    const key = `${scope}::${page}`;
    if (pageKeyRef.current === key) return;
    pageKeyRef.current = key;

    void handleLoadData(page);
  }, [token, scope, page, handleLoadData]);

  const opcionesTenant = useMemo(() => {
    if (!isSistema) return [];
    const tenants = new Set<number>();

    for (const e of opcionesEmpresa) {
      if (typeof e?.tenant_id === "number") tenants.add(e.tenant_id);
    }

    return Array.from(tenants).sort((a, b) => a - b).map(String);
  }, [isSistema, opcionesEmpresa]);

  const opcionesEmpresaFiltradas = useMemo(() => {
    if (!isSistema) return opcionesEmpresa;
    if (!filtroTenant) return opcionesEmpresa;

    const tenant = Number.parseInt(filtroTenant, 10);
    if (Number.isNaN(tenant)) return opcionesEmpresa;

    return opcionesEmpresa.filter((e) => e.tenant_id === tenant);
  }, [isSistema, opcionesEmpresa, filtroTenant]);

  const handleDragStart = (index: number) => setDragIndex(index);

  const handleDrop = (index: number) => {
    if (!canEditAdjustments) return;
    if (dragIndex === null || dragIndex === index) return;

    const copy = [...orderForAdjustments];
    const [item] = copy.splice(dragIndex, 1);
    copy.splice(index, 0, item);

    setColumnOrder?.(copy);
    setDragIndex(null);
  };

  const toggleVisible = (id: string) => {
    if (!canEditAdjustments) return;

    if (safeHiddenColumns.includes(id)) {
      setHiddenColumns?.(safeHiddenColumns.filter((c) => c !== id));
    } else {
      setHiddenColumns?.([...safeHiddenColumns, id]);
    }
  };

  const resetOrder = () => {
    if (!canEditAdjustments) return;
    setColumnOrder?.(defaultColumnOrder);
    setHiddenColumns?.([]);
  };

  const hideAllColumns = () => {
    if (!canEditAdjustments) return;
    setHiddenColumns?.(defaultColumnOrder);
  };

  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const startIndex = totalFilas === 0 ? 0 : currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFilas);

  return {
    isSistema,

    data,
    loading,
    error,
    setError,
    hasLoadedOnce,

    filtroTenant,
    setFiltroTenant,
    filtroEmpresaIds,
    setFiltroEmpresaIds,
    filtroAnios,
    setFiltroAnios,
    filtroMeses,
    setFiltroMeses,

    opcionesEmpresa,
    opcionesAnio,
    opcionesMes,
    opcionesTenant,
    opcionesEmpresaFiltradas,

    pageSize,
    setPageSize,
    page,
    setPage,
    totalFilas,
    totalPages,
    currentPage,
    startIndex,
    endIndex,

    showAdjust,
    setShowAdjust,
    dragIndex,
    handleDragStart,
    handleDrop,

    safeColumnOrder,
    safeHiddenColumns,
    canEditAdjustments,
    orderForAdjustments,

    filtrosActivosCount,

    clearFilters,
    loadFilters,
    handleLoadData,

    toggleVisible,
    resetOrder,
    hideAllColumns,
  };
}