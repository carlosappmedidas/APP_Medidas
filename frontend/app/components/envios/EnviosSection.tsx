"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import ExploradorFtpPanel, { type FtpConfig } from "../comunicaciones/ExploradorFtpPanel";
import TablePaginationFooter from "../ui/TablePaginationFooter";

interface Props { token: string | null; }

// ─── Tipos del histórico ──────────────────────────────────────────────────────

interface EnvioM {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  codigo_ree_empresa: string;
  tipo: string;                          // AGRECL / INMECL / MAGCL
  comercializadora_codigo: string | null;
  periodo_anio: number | null;
  periodo_mes: number | null;
  fecha_generacion: string;              // ISO date
  version: number;
  m_clasificacion: string;
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

interface CountResult {
  total: number;
  pendiente: number;
  ok: number;
  bad: number;
}

interface EmpresaOption { id: number; nombre: string; codigo_ree: string | null; }

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "10px", overflow: "hidden", marginBottom: "10px",
};
const panelHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 20px", cursor: "pointer", userSelect: "none",
};
const panelTitleStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text)",
};
const panelDescStyle: React.CSSProperties = {
  fontSize: "11px", color: "var(--text-muted)", marginTop: 3,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtPeriodo(anio: number | null, mes: number | null): string {
  if (!anio || !mes) return "—";
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EnviosSection({ token }: Props) {
  const [panelEnvioOpen, setPanelEnvioOpen] = useState(true);
  const [panelHistOpen, setPanelHistOpen]   = useState(false);

  const [configs, setConfigs] = useState<FtpConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorConfigs, setErrorConfigs] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // Histórico M2
  const [envios, setEnvios] = useState<EnvioM[]>([]);
  const [loadingEnvios, setLoadingEnvios] = useState(false);
  const [errorEnvios, setErrorEnvios] = useState<string | null>(null);
  const [countEnvios, setCountEnvios] = useState<CountResult | null>(null);

  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");      // "" o id
  const [filtroTipo, setFiltroTipo]       = useState<string>("");      // "" / AGRECL / INMECL / MAGCL
  const [filtroEstado, setFiltroEstado]   = useState<string>("");      // "" / pendiente / ok / bad

  const [pageEnvios, setPageEnvios]         = useState(0);
  const [pageSizeEnvios, setPageSizeEnvios] = useState(20);

  const [revisandoRespuestas, setRevisandoRespuestas] = useState(false);

  // ── Cargar configs FTP (para tarjeta Envío) ────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (!panelEnvioOpen && !panelHistOpen) return;
    let cancelled = false;
    setLoadingConfigs(true); setErrorConfigs(null);
    fetch(`${API_BASE_URL}/ftp/configs`, { headers: getAuthHeaders(token) })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((d: FtpConfig[]) => { if (!cancelled) setConfigs(d); })
      .catch((e: unknown) => {
        if (!cancelled) setErrorConfigs(e instanceof Error ? e.message : "Error cargando conexiones");
      })
      .finally(() => { if (!cancelled) setLoadingConfigs(false); });
    return () => { cancelled = true; };
  }, [token, panelEnvioOpen, panelHistOpen]);

  // ── Cargar empresas (para filtro del histórico) ────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : [])
      .then((d: EmpresaOption[]) => setEmpresas(d))
      .catch(() => {});
  }, [token]);

  // ── Cargar histórico M2 ────────────────────────────────────────────────────
  const cargarEnvios = useCallback(async () => {
    if (!token) return;
    setLoadingEnvios(true); setErrorEnvios(null);
    try {
      // Siempre filtramos por M2 en esta tarjeta
      const params = new URLSearchParams({ m_clasificacion: "M2", limit: "500" });
      if (filtroEmpresa) params.set("empresa_id", filtroEmpresa);
      if (filtroTipo)    params.set("tipo", filtroTipo);
      if (filtroEstado)  params.set("estado", filtroEstado);

      const [resList, resCount] = await Promise.all([
        fetch(`${API_BASE_URL}/envios/historico?${params}`, { headers: getAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/envios/historico/count?m_clasificacion=M2`, { headers: getAuthHeaders(token) }),
      ]);
      if (!resList.ok) throw new Error(`Error ${resList.status}`);
      const list: EnvioM[] = await resList.json();
      setEnvios(list);
      setPageEnvios(0);
      if (resCount.ok) {
        const c: CountResult = await resCount.json();
        setCountEnvios(c);
      }
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error cargando histórico");
    } finally { setLoadingEnvios(false); }
  }, [token, filtroEmpresa, filtroTipo, filtroEstado]);

  // Recargar al abrir tarjeta o cambiar filtros
  useEffect(() => {
    if (panelHistOpen) cargarEnvios();
  }, [panelHistOpen, cargarEnvios]);

  // ── Paginación cliente ─────────────────────────────────────────────────────
  const enviosPagina = envios.slice(pageEnvios * pageSizeEnvios, (pageEnvios + 1) * pageSizeEnvios);
  const totalPagesEnvios = Math.ceil(envios.length / pageSizeEnvios);

  // ── Revisar respuestas REE ─────────────────────────────────────────────────
  const handleRevisarRespuestas = async () => {
    if (!token) return;
    setRevisandoRespuestas(true); setErrorEnvios(null);
    try {
      const res = await fetch(`${API_BASE_URL}/envios/buscar-respuestas`, {
        method: "POST",
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      const data = await res.json();
      const partes: string[] = [];
      if (data.ok_marcados > 0)  partes.push(`${data.ok_marcados} marcados como OK`);
      if (data.bad_marcados > 0) partes.push(`${data.bad_marcados} marcados como BAD`);
      if (data.bad_borrados > 0) partes.push(`${data.bad_borrados} BAD obsoletos borrados`);
      const resumen = partes.length > 0 ? partes.join(", ") : "Sin cambios";
      const errs = (data.errores || []) as string[];
      const msgErr = errs.length > 0 ? `\n\nAvisos:\n${errs.join("\n")}` : "";
      alert(`Revisión completa.\n\n${resumen}.${msgErr}`);
      // Recargar el histórico para reflejar los cambios
      await cargarEnvios();
    } catch (e: unknown) {
      setErrorEnvios(e instanceof Error ? e.message : "Error revisando respuestas");
    } finally {
      setRevisandoRespuestas(false);
    }
  };

  return (
    <div className="text-sm">

      {/* ══ TARJETA 1 — ENVÍO DE FICHEROS ══════════════════════════════════ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelEnvioOpen(v => !v)}>
          <div>
            <div style={panelTitleStyle}>📤 Envío de ficheros</div>
            <div style={panelDescStyle}>
              Sube AGRECL, INMECL y MAGCL al SFTP REE. Se registran automáticamente
              en el histórico al subirlos.
            </div>
          </div>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
            onClick={e => { e.stopPropagation(); setPanelEnvioOpen(v => !v); }}>
            {panelEnvioOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {panelEnvioOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 16px" }}>
            {errorConfigs && <div className="ui-alert ui-alert--danger mb-3">{errorConfigs}</div>}
            {loadingConfigs && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
                Cargando conexiones FTP...
              </div>
            )}
            {!loadingConfigs && configs.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
                Sin conexiones FTP configuradas. Configura una en la pestaña Comunicaciones primero.
              </div>
            )}
            {!loadingConfigs && configs.length > 0 && (
              <ExploradorFtpPanel
                token={token}
                configs={configs}
                titulo="Explorador SFTP"
                onUploadCompleted={(r) => {
                  console.log("Subidos al SFTP:", r);
                  // Si la tarjeta del histórico está abierta → recargar para ver los nuevos
                  if (panelHistOpen) cargarEnvios();
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ══ TARJETA 2 — HISTÓRICO M2 ═══════════════════════════════════════ */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle} onClick={() => setPanelHistOpen(v => !v)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={panelTitleStyle}>📋 Histórico M2</div>
              <div style={panelDescStyle}>
                Envíos M2 (AGRECL, INMECL, MAGCL) con estado de respuesta REE.
              </div>
            </div>
            {countEnvios && panelHistOpen && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span className="ui-badge ui-badge--neutral">{countEnvios.total} total</span>
                {countEnvios.pendiente > 0 && <span className="ui-badge ui-badge--neutral">{countEnvios.pendiente} pendiente</span>}
                {countEnvios.ok > 0 && <span className="ui-badge ui-badge--ok">{countEnvios.ok} OK</span>}
                {countEnvios.bad > 0 && <span className="ui-badge ui-badge--err">{countEnvios.bad} BAD</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {panelHistOpen && (
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                onClick={e => { e.stopPropagation(); handleRevisarRespuestas(); }}
                disabled={revisandoRespuestas}
                title="Escanear el SFTP en busca de respuestas .ok/.bad de REE">
                <IconRefresh /> {revisandoRespuestas ? "Revisando..." : "Revisar respuestas REE"}
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={e => { e.stopPropagation(); setPanelHistOpen(v => !v); }}>
              {panelHistOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        {panelHistOpen && (
          <div style={{ borderTop: "1px solid var(--card-border)" }}>
            {/* Filtros */}
            <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap", alignItems: "flex-end", background: "var(--field-bg-soft)", borderBottom: "1px solid var(--card-border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Empresa</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, minWidth: 160 }} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                  <option value="">Todas</option>
                  {empresas.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}{emp.codigo_ree ? ` (${emp.codigo_ree})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Tipo</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, width: 110 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="AGRECL">AGRECL</option>
                  <option value="INMECL">INMECL</option>
                  <option value="MAGCL">MAGCL</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Estado REE</label>
                <select className="ui-select" style={{ fontSize: 11, height: 28, width: 120 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="ok">OK</option>
                  <option value="bad">BAD</option>
                </select>
              </div>
              {(filtroEmpresa || filtroTipo || filtroEstado) && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ height: 28 }}
                  onClick={() => { setFiltroEmpresa(""); setFiltroTipo(""); setFiltroEstado(""); }}>
                  ✕ Limpiar
                </button>
              )}
              <button type="button" className="ui-btn ui-btn-outline ui-btn-xs" style={{ height: 28, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}
                onClick={cargarEnvios} disabled={loadingEnvios}>
                <IconRefresh /> {loadingEnvios ? "Cargando..." : "Actualizar"}
              </button>
            </div>

            {errorEnvios && <div className="ui-alert ui-alert--danger" style={{ margin: "12px 14px" }}>{errorEnvios}</div>}

            {/* Tabla */}
            <div className="ui-table-wrap">
              <table className="ui-table text-[11px]">
                <thead className="ui-thead">
                  <tr>
                    <th className="ui-th">Empresa</th>
                    <th className="ui-th">Tipo</th>
                    <th className="ui-th">Comerc.</th>
                    <th className="ui-th">Periodo</th>
                    <th className="ui-th">Fecha gen.</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Ver.</th>
                    <th className="ui-th">Nombre fichero</th>
                    <th className="ui-th">Subido SFTP</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Estado REE</th>
                    <th className="ui-th">Respuesta</th>
                    <th className="ui-th" style={{ textAlign: "center" }}>Reint.</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEnvios ? (
                    <tr className="ui-tr"><td colSpan={11} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
                  ) : envios.length === 0 ? (
                    <tr className="ui-tr"><td colSpan={11} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                      Sin envíos M2 todavía. Sube ficheros AGRECL, INMECL o MAGCL desde la tarjeta superior y aparecerán aquí.
                    </td></tr>
                  ) : enviosPagina.map(e => (
                    <tr key={e.id} className="ui-tr">
                      <td className="ui-td">
                        <div style={{ fontWeight: 500 }}>{e.empresa_nombre}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>{e.codigo_ree_empresa}</div>
                      </td>
                      <td className="ui-td"><span className="ui-badge ui-badge--neutral" style={{ fontSize: 9 }}>{e.tipo}</span></td>
                      <td className="ui-td" style={{ fontFamily: "monospace", fontSize: 10 }}>{e.comercializadora_codigo ?? "—"}</td>
                      <td className="ui-td">{fmtPeriodo(e.periodo_anio, e.periodo_mes)}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter
              loading={loadingEnvios}
              hasLoadedOnce={!loadingEnvios}
              totalFilas={envios.length}
              startIndex={pageEnvios * pageSizeEnvios}
              endIndex={Math.min((pageEnvios + 1) * pageSizeEnvios, envios.length)}
              pageSize={pageSizeEnvios}
              setPageSize={(v) => { setPageSizeEnvios(v); setPageEnvios(0); }}
              currentPage={pageEnvios}
              totalPages={totalPagesEnvios}
              setPage={setPageEnvios}
              compact
            />
          </div>
        )}
      </div>

    </div>
  );
}