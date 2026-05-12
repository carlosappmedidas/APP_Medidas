"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import TablePaginationFooter from "../ui/TablePaginationFooter";

// ─── Tipos del histórico de inventario ────────────────────────────────────────

export interface EnvioInventario {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  codigo_ree_empresa: string;
  tipo: string;                          // AUTOCONSUMO / CUPSCAU / CUPS45 / CUPSDAT
  frecuencia: string;                    // 'mensual' | 'diario'
  fecha_generacion: string;              // ISO date
  version: number;
  nombre_fichero: string;
  subido_sftp_at: string;
  estado_ree: string;                    // 'pendiente' | 'ok' | 'bad'
  estado_ree_n: number | null;
  respuesta_recibida_at: string | null;
  respuesta_nombre_fichero: string | null;
  reintentos: number;
  created_at: string;
  updated_at: string;
}

export interface CountInventario {
  total: number;
  pendiente: number;
  ok: number;
  bad: number;
}

interface EmpresaOption { id: number; nombre: string; codigo_ree: string | null; }

// ─── Opciones de filtros ──────────────────────────────────────────────────────

const TIPO_INV_OPTIONS: { value: string; label: string }[] = [
  { value: "AUTOCONSUMO", label: "AUTOCONSUMO" },
  { value: "CUPSCAU",     label: "CUPSCAU" },
  { value: "CUPS45",      label: "CUPS45" },
  { value: "CUPSDAT",     label: "CUPSDAT" },
];
const FRECUENCIA_OPTIONS: { value: string; label: string }[] = [
  { value: "mensual", label: "Mensual" },
  { value: "diario",  label: "Diario" },
];
const ESTADO_OPTIONS: { value: string; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "ok",        label: "OK" },
  { value: "bad",       label: "BAD" },
];

// ─── Helpers (duplicados de EnviosSection — preferimos duplicar a refactorizar) ───

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

function fmtFechaSimple(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return s; }
}

function fmtMesAnio(anio: number, mes: number): string {
  const meses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${meses[mes] || mes}/${anio}`;
}

function badgeEstadoClass(estado: string): string {
  if (estado === "ok")  return "ui-badge ui-badge--ok";
  if (estado === "bad") return "ui-badge ui-badge--err";
  return "ui-badge ui-badge--neutral";
}

function badgeEstadoLabel(estado: string, n: number | null): string {
  if (estado === "ok")  return "OK";
  if (estado === "bad") return n ? `BAD${n}` : "BAD";
  return "Pendiente";
}

const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  token: string | null;
  empresas: EmpresaOption[];          // viene del padre (ya está cargado)
  onCountChange?: (count: CountInventario | null) => void;  // notificar al padre
  recargarNonce?: number;             // incrementar para forzar refresh externo
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InventarioPanel({ token, empresas, onCountChange, recargarNonce }: Props) {
  const [envios, setEnvios]     = useState<EnvioInventario[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [count, setCount]       = useState<CountInventario | null>(null);

  // Filtros multi-select. Array vacío = "todos" (sin filtro).
  const [filtroEmpresa, setFiltroEmpresa]       = useState<string[]>([]);
  const [filtroTipo, setFiltroTipo]             = useState<string[]>([]);
  const [filtroFrecuencia, setFiltroFrecuencia] = useState<string[]>([]);
  const [filtroEstado, setFiltroEstado]         = useState<string[]>([]);
  const [filtroMes, setFiltroMes]               = useState<string[]>([]);

  // Para los dropdowns: qué filtro está abierto ahora mismo (solo uno a la vez).
  const [dropdownAbierto, setDropdownAbierto] = useState<string | null>(null);

  const [mesesDisponibles, setMesesDisponibles] = useState<{ anio: number; mes: number }[]>([]);

  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const [borrandoId, setBorrandoId]         = useState<number | null>(null);
  const [descargandoId, setDescargandoId]   = useState<number | null>(null);
  const [menuAbiertoId, setMenuAbiertoId]   = useState<number | null>(null);

  // ── Cargar meses disponibles ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/envios-inventario/historico/meses`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: { anio: number; mes: number }[]) => setMesesDisponibles(d))
      .catch(() => setMesesDisponibles([]));
  }, [token, recargarNonce]);

  // ── Cargar histórico ──────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (filtroEmpresa.length > 0)    params.set("empresa_ids", filtroEmpresa.join(","));
      if (filtroTipo.length > 0)       params.set("tipos",       filtroTipo.join(","));
      if (filtroFrecuencia.length > 0) params.set("frecuencias", filtroFrecuencia.join(","));
      if (filtroEstado.length > 0)     params.set("estados",     filtroEstado.join(","));
      if (filtroMes.length > 0)        params.set("meses",       filtroMes.join(","));

      const [resList, resCount] = await Promise.all([
        fetch(`${API_BASE_URL}/envios-inventario/historico?${params}`, { headers: getAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/envios-inventario/historico/count`, { headers: getAuthHeaders(token) }),
      ]);
      if (!resList.ok) throw new Error(`Error ${resList.status}`);
      const list: EnvioInventario[] = await resList.json();
      setEnvios(list);
      setPage(0);
      if (resCount.ok) {
        const c: CountInventario = await resCount.json();
        setCount(c);
        onCountChange?.(c);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando histórico de inventario");
    } finally { setLoading(false); }
  }, [token, filtroEmpresa, filtroTipo, filtroFrecuencia, filtroEstado, filtroMes, onCountChange]);

  // Recargar al montar, al cambiar filtros, o al cambiar el nonce externo
  useEffect(() => {
    cargar();
  }, [cargar, recargarNonce]);

  // ── Paginación cliente ────────────────────────────────────────────────────
  const enviosPagina = envios.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(envios.length / pageSize);

  // ── Descargar fichero (original o respuesta) ──────────────────────────────
  const handleDescargar = async (envio: EnvioInventario, tipo: "original" | "respuesta") => {
    if (!token) return;
    setMenuAbiertoId(null);
    setDescargandoId(envio.id);
    setError(null);

    const nombreSugerido = tipo === "original"
      ? envio.nombre_fichero
      : (envio.respuesta_nombre_fichero || `${envio.nombre_fichero}.respuesta`);

    type SaveFilePickerOptions = { suggestedName?: string };
    type FileSystemWritableFileStreamLike = {
      write: (data: Blob | ArrayBuffer | string) => Promise<void>;
      close: () => Promise<void>;
    };
    type FileSystemFileHandleLike = {
      createWritable: () => Promise<FileSystemWritableFileStreamLike>;
    };
    const win = window as unknown as {
      showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
    };

    let fileHandle: FileSystemFileHandleLike | null = null;
    if (typeof win.showSaveFilePicker === "function") {
      try {
        fileHandle = await win.showSaveFilePicker({ suggestedName: nombreSugerido });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setDescargandoId(null);
          return;
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/envios-inventario/${envio.id}/descargar/${tipo}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const blob = await res.blob();

      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreSugerido;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error descargando fichero");
    } finally {
      setDescargandoId(null);
    }
  };

  // ── Borrar envío del histórico ────────────────────────────────────────────
  const handleBorrar = async (envio: EnvioInventario) => {
    if (!token) return;
    setMenuAbiertoId(null);
    if (!confirm(`¿Borrar este envío del histórico?\n\nFichero: ${envio.nombre_fichero}\n\nEsto NO toca el SFTP — el fichero seguirá allí.`)) return;

    setBorrandoId(envio.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios-inventario/${envio.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando envío");
    } finally {
      setBorrandoId(null);
    }
  };

  // ── Cerrar dropdown de filtros al hacer click fuera ───────────────────────
  useEffect(() => {
    if (dropdownAbierto === null) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-filter-dropdown-inv]")) {
        setDropdownAbierto(null);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [dropdownAbierto]);

  // ── Componente inline: dropdown multi-select con checkboxes ───────────────
  const renderMultiSelect = (
    id: string,
    label: string,
    selected: string[],
    setSelected: (vs: string[]) => void,
    options: { value: string; label: string }[],
    width: number = 140,
  ) => {
    const isOpen = dropdownAbierto === id;
    const todoSeleccionado = options.length > 0 && selected.length === options.length;

    const buttonText =
      selected.length === 0 ? "Todos"
      : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} seleccionados`;

    const toggleOne = (value: string) => {
      if (selected.includes(value)) {
        setSelected(selected.filter(v => v !== value));
      } else {
        setSelected([...selected, value]);
      }
    };

    const seleccionarTodo = () => setSelected(options.map(o => o.value));
    const limpiar = () => setSelected([]);

    return (
      <div data-filter-dropdown-inv style={{ position: "relative", display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</label>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDropdownAbierto(isOpen ? null : id); }}
          className="ui-select"
          style={{
            fontSize: 11, height: 28, width, textAlign: "left",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 8px", cursor: "pointer",
            background: "var(--field-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 4,
            color: selected.length === 0 ? "var(--text-muted)" : "var(--text)",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buttonText}</span>
          <span style={{ fontSize: 9, marginLeft: 4, color: "var(--text-muted)" }}>▾</span>
        </button>

        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 2,
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              minWidth: width, maxWidth: 280,
              maxHeight: 280, overflowY: "auto",
              padding: 4,
            }}
          >
            <div style={{ display: "flex", gap: 4, padding: "4px 6px", borderBottom: "1px solid var(--card-border)", marginBottom: 4 }}>
              <button type="button"
                onClick={todoSeleccionado ? limpiar : seleccionarTodo}
                className="ui-btn ui-btn-ghost ui-btn-xs"
                style={{ fontSize: 10, padding: "3px 6px", flex: 1 }}>
                {todoSeleccionado ? "✕ Limpiar" : "☑ Todos"}
              </button>
            </div>

            {options.length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 6px", textAlign: "center" }}>
                Sin opciones disponibles
              </div>
            ) : options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 6px", fontSize: 11, cursor: "pointer",
                    borderRadius: 4,
                    background: checked ? "rgba(96,165,250,0.10)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(opt.value)}
                    style={{ cursor: "pointer", margin: 0 }}
                  />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap", alignItems: "flex-end", background: "var(--field-bg-soft)", borderBottom: "1px solid var(--card-border)" }}>
        {renderMultiSelect(
          "inv_empresa",
          "Empresa",
          filtroEmpresa,
          setFiltroEmpresa,
          empresas.map(emp => ({
            value: String(emp.id),
            label: `${emp.nombre}${emp.codigo_ree ? ` (${emp.codigo_ree})` : ""}`,
          })),
          180,
        )}
        {renderMultiSelect(
          "inv_tipo",
          "Tipo",
          filtroTipo,
          setFiltroTipo,
          TIPO_INV_OPTIONS,
          150,
        )}
        {renderMultiSelect(
          "inv_frecuencia",
          "Frecuencia",
          filtroFrecuencia,
          setFiltroFrecuencia,
          FRECUENCIA_OPTIONS,
          120,
        )}
        {renderMultiSelect(
          "inv_estado",
          "Estado REE",
          filtroEstado,
          setFiltroEstado,
          ESTADO_OPTIONS,
          130,
        )}
        {renderMultiSelect(
          "inv_mes",
          "Mes generación",
          filtroMes,
          setFiltroMes,
          mesesDisponibles.map(m => ({
            value: `${m.anio}-${m.mes}`,
            label: fmtMesAnio(m.anio, m.mes),
          })),
          140,
        )}

        {(filtroEmpresa.length > 0 || filtroTipo.length > 0 || filtroFrecuencia.length > 0 || filtroEstado.length > 0 || filtroMes.length > 0) && (
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 28 }}
            onClick={() => {
              setFiltroEmpresa([]); setFiltroTipo([]); setFiltroFrecuencia([]);
              setFiltroEstado([]); setFiltroMes([]);
            }}>
            ✕ Limpiar
          </button>
        )}

        <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
          style={{ height: 28, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}
          onClick={cargar} disabled={loading}>
          <IconRefresh /> {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {error && <div className="ui-alert ui-alert--danger" style={{ margin: "12px 14px" }}>{error}</div>}

      {/* Tabla */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]">
          <thead className="ui-thead">
            <tr>
              <th className="ui-th">Empresa</th>
              <th className="ui-th">Tipo</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Frec.</th>
              <th className="ui-th">Fecha gen.</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Ver.</th>
              <th className="ui-th">Nombre fichero</th>
              <th className="ui-th">Subido SFTP</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Estado REE</th>
              <th className="ui-th">Respuesta</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Reint.</th>
              <th className="ui-th" style={{ textAlign: "center", width: 50 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="ui-tr"><td colSpan={11} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
            ) : envios.length === 0 ? (
              <tr className="ui-tr"><td colSpan={11} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                Sin envíos de inventario todavía. Sube ficheros AUTOCONSUMO, CUPSCAU, CUPS45 o CUPSDAT desde la tarjeta superior y aparecerán aquí.
              </td></tr>
            ) : enviosPagina.map(e => (
              <tr key={e.id} className="ui-tr">
                <td className="ui-td">
                  <div style={{ fontWeight: 500 }}>{e.empresa_nombre}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>{e.codigo_ree_empresa}</div>
                </td>
                <td className="ui-td"><span className="ui-badge ui-badge--neutral" style={{ fontSize: 9 }}>{e.tipo}</span></td>
                <td className="ui-td" style={{ textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>{e.frecuencia}</td>
                <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtFechaSimple(e.fecha_generacion)}</td>
                <td className="ui-td" style={{ textAlign: "center" }}>{e.version}</td>
                <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 9, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.nombre_fichero}>
                  {e.nombre_fichero}
                </td>
                <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtDate(e.subido_sftp_at)}</td>
                <td className="ui-td" style={{ textAlign: "center" }}>
                  <span className={badgeEstadoClass(e.estado_ree)} style={{ fontSize: 9 }}>{badgeEstadoLabel(e.estado_ree, e.estado_ree_n)}</span>
                </td>
                <td className="ui-td ui-muted" style={{ fontSize: 10 }}>{fmtDate(e.respuesta_recibida_at)}</td>
                <td className="ui-td" style={{ textAlign: "center" }}>{e.reintentos}</td>
                <td className="ui-td" style={{ textAlign: "center", position: "relative" }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost ui-btn-xs"
                    style={{ padding: "2px 8px", fontWeight: 700, fontSize: 14, lineHeight: "14px" }}
                    title="Acciones"
                    disabled={borrandoId === e.id || descargandoId === e.id}
                    onClick={ev => { ev.stopPropagation(); setMenuAbiertoId(menuAbiertoId === e.id ? null : e.id); }}>
                    {borrandoId === e.id || descargandoId === e.id ? "…" : "⋯"}
                  </button>
                  {menuAbiertoId === e.id && (
                    <div
                      onClick={ev => ev.stopPropagation()}
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        zIndex: 50,
                        background: "var(--card-bg)",
                        border: "1px solid var(--card-border)",
                        borderRadius: 6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                        minWidth: 220,
                        padding: 4,
                        textAlign: "left",
                      }}>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "6px 10px" }}
                        onClick={() => handleDescargar(e, "original")}>
                        ⬇ Descargar fichero enviado
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "6px 10px" }}
                        disabled={!e.respuesta_nombre_fichero}
                        title={e.respuesta_nombre_fichero ? undefined : "Aún no hay respuesta REE"}
                        onClick={() => handleDescargar(e, "respuesta")}>
                        ⬇ Descargar respuesta REE
                      </button>
                      <div style={{ borderTop: "1px solid var(--card-border)", margin: "4px 0" }} />
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "6px 10px", color: "#E24B4A" }}
                        onClick={() => handleBorrar(e)}>
                        🗑 Borrar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePaginationFooter
        loading={loading}
        hasLoadedOnce={!loading}
        totalFilas={envios.length}
        startIndex={page * pageSize}
        endIndex={Math.min((page + 1) * pageSize, envios.length)}
        pageSize={pageSize}
        setPageSize={(v) => { setPageSize(v); setPage(0); }}
        currentPage={page}
        totalPages={totalPages}
        setPage={setPage}
        compact
      />
    </>
  );
}