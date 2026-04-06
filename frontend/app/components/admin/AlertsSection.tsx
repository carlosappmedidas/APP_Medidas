"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import type { User } from "../../types";

// ── Tipos ──────────────────────────────────────────────────────────────────

type Props = {
  token: string | null;
  currentUser?: User | null;
};

type LifecycleStatus = "nueva" | "en_revision" | "resuelta";
type Severity        = "info" | "warning" | "critical";
type Category        = "mes_anterior" | "absoluta" | "anio_anterior";

type AlertRow = {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  alert_code: string;
  alerta: string;
  category: Category;
  comparison_type: string;
  anio: number;
  mes: number;
  status: string;
  severity: Severity;
  current_value: number | null;
  previous_value: number | null;
  diff_value: number | null;
  diff_unit: string;
  threshold_value: number;
  message: string | null;
  lifecycle_status: LifecycleStatus;
  resolved_by: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type AlertComment = {
  id: number;
  alert_id: number;
  user_id: number | null;
  user_email: string | null;
  comment: string;
  lifecycle_status_at_time: string | null;
  created_at: string;
};

type EmpresaItem = { id: number; nombre: string };

// ── Constantes de presentación ────────────────────────────────────────────

const CATEGORY_LABELS: Record<Category, string> = {
  mes_anterior:  "Mes anterior",
  absoluta:      "Valor absoluto",
  anio_anterior: "Año anterior",
};

const CATEGORY_SUBLABELS: Record<Category, string> = {
  mes_anterior:  "Variación respecto al mes anterior",
  absoluta:      "Valor directamente fuera de rango",
  anio_anterior: "Variación respecto al mismo mes del año anterior",
};

const CATEGORY_COLORS: Record<Category, { bg: string; color: string; border: string }> = {
  mes_anterior:  { bg: "rgba(37,99,235,0.12)",  color: "#60a5fa", border: "rgba(37,99,235,0.3)" },
  absoluta:      { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  anio_anterior: { bg: "rgba(5,150,105,0.12)",  color: "#34d399", border: "rgba(5,150,105,0.3)" },
};

const SEVERITY_COLORS: Record<Severity, { bg: string; color: string }> = {
  info:     { bg: "rgba(30,58,95,0.3)",   color: "var(--text-muted)" },
  warning:  { bg: "rgba(245,158,11,0.2)", color: "#fbbf24" },
  critical: { bg: "rgba(239,68,68,0.18)", color: "#f87171" },
};

const LIFECYCLE_COLORS: Record<LifecycleStatus, { bg: string; color: string }> = {
  nueva:       { bg: "rgba(239,68,68,0.18)",  color: "#f87171" },
  en_revision: { bg: "rgba(37,99,235,0.18)",  color: "#60a5fa" },
  resuelta:    { bg: "rgba(5,150,105,0.18)",  color: "#34d399" },
};

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  nueva:       "Nueva",
  en_revision: "En revisión",
  resuelta:    "Resuelta",
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number | null, unit?: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
  return unit ? `${s} ${unit}` : s;
}

function fmtDatetime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("es-ES");
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 500, background: bg, color,
    }}>
      {children}
    </span>
  );
}

// ── Estilos comunes ────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "0.5px solid var(--card-border)",
  borderRadius: 12,
  marginBottom: 10,
};

const thStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: 11, fontWeight: 500,
  color: "var(--text-muted)", borderBottom: "0.5px solid var(--card-border)",
  whiteSpace: "nowrap", textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 12,
  color: "var(--text)", borderBottom: "0.5px solid var(--card-border)",
  verticalAlign: "middle",
};

const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: "5px 10px",
  border: "0.5px solid var(--card-border)",
  borderRadius: 6, background: "var(--card-bg)",
  color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: "5px 8px",
  border: "0.5px solid var(--card-border)",
  borderRadius: 6, background: "var(--card-bg)",
  color: "var(--text)",
};

// ── Componente principal ───────────────────────────────────────────────────

export default function AlertsSection({ token, currentUser }: Props) {
  const canManage = !!currentUser && (
    currentUser.is_superuser ||
    currentUser.rol === "admin" ||
    currentUser.rol === "owner"
  );

  // ── Filtros ────────────────────────────────────────────────────────────
  const [filtroEmpresa,  setFiltroEmpresa]  = useState<string>("all");
  const [filtroAnio,     setFiltroAnio]     = useState<string>("all");
  const [filtroMes,      setFiltroMes]      = useState<string>("all");
  const [filtroSeverity, setFiltroSeverity] = useState<string>("all");
  const [filtroLifecycle,setFiltroLifecycle]= useState<string>("all");

  // ── Datos ──────────────────────────────────────────────────────────────
  const [alerts,          setAlerts]         = useState<AlertRow[]>([]);
  const [empresas,        setEmpresas]        = useState<EmpresaItem[]>([]);
  const [aniosDisponibles,setAniosDisponibles]= useState<number[]>([]);
  const [mesesDisponibles,setMesesDisponibles]= useState<number[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [infoMsg,         setInfoMsg]         = useState<string | null>(null);

  // ── Recálculo ──────────────────────────────────────────────────────────
  const [recalculating,       setRecalculating]       = useState(false);
  const [recalculatingAll,    setRecalculatingAll]    = useState(false);
  const [recalculatingHistory,setRecalculatingHistory]= useState(false);
  const [historyProgress,     setHistoryProgress]     = useState<string | null>(null);

  // ── Categorías colapsables ─────────────────────────────────────────────
  const [openCats, setOpenCats] = useState<Record<Category, boolean>>({
    mes_anterior: true, absoluta: true, anio_anterior: true,
  });

  // ── Detalle y comentarios ──────────────────────────────────────────────
  const [selectedAlert,  setSelectedAlert]  = useState<AlertRow | null>(null);
  const [comments,       setComments]        = useState<AlertComment[]>([]);
  const [loadingComments,setLoadingComments] = useState(false);
  const [newComment,     setNewComment]      = useState("");
  const [sendingComment, setSendingComment]  = useState(false);
  const [changingStatus, setChangingStatus]  = useState(false);

  // ── Cargar empresas y periodos disponibles desde medidas/general ──────
  const loadEmpresas = useCallback(async () => {
    if (!token) return;
    setLoadingEmpresas(true);
    try {
      const res = await fetch(`${API_BASE_URL}/empresas/?solo_activas=false`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;
      const json = await res.json();
      setEmpresas(
        (Array.isArray(json) ? json : [])
          .map((e: any) => ({ id: Number(e.id), nombre: String(e.nombre ?? `Empresa ${e.id}`) }))
          .sort((a: EmpresaItem, b: EmpresaItem) => a.nombre.localeCompare(b.nombre))
      );
    } catch { /* silencioso */ }
    finally { setLoadingEmpresas(false); }
  }, [token]);

  // Cargar periodos disponibles desde medidas/general/filters
  const loadPeriodos = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/medidas/general/filters`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;
      const json = await res.json();
      setAniosDisponibles(
        Array.isArray(json.anios) ? [...json.anios].sort((a, b) => b - a) : []
      );
      setMesesDisponibles(
        Array.isArray(json.meses) ? [...json.meses].sort((a, b) => a - b) : []
      );
    } catch { /* silencioso */ }
  }, [token]);

  useEffect(() => {
    loadEmpresas();
    loadPeriodos();
  }, [loadEmpresas, loadPeriodos]);

  // ── Cargar alertas ─────────────────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    if (!token) { setAlerts([]); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEmpresa  !== "all") params.set("empresa_id",      filtroEmpresa);
      if (filtroAnio     !== "all") params.set("anio",            filtroAnio);
      if (filtroMes      !== "all") params.set("mes",             filtroMes);
      if (filtroSeverity !== "all") params.set("severity",        filtroSeverity);
      if (filtroLifecycle!== "all") params.set("lifecycle_status",filtroLifecycle);
      const url = `${API_BASE_URL}/alerts/results${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setAlerts(await res.json());
    } catch {
      setError("No se pudieron cargar las alertas.");
      setAlerts([]);
    } finally { setLoading(false); }
  }, [token, filtroEmpresa, filtroAnio, filtroMes, filtroSeverity, filtroLifecycle]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // ── Cargar comentarios ─────────────────────────────────────────────────
  const loadComments = useCallback(async (alertId: number) => {
    if (!token) return;
    setLoadingComments(true);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/results/${alertId}/comments`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error();
      setComments(await res.json());
    } catch { setComments([]); }
    finally { setLoadingComments(false); }
  }, [token]);

  const handleSelectAlert = (alert: AlertRow) => {
    if (selectedAlert?.id === alert.id) {
      setSelectedAlert(null);
      setComments([]);
    } else {
      setSelectedAlert(alert);
      loadComments(alert.id);
    }
  };

  // ── Cambiar estado lifecycle ───────────────────────────────────────────
  const handleChangeLifecycle = async (newStatus: LifecycleStatus) => {
    if (!token || !selectedAlert || !newComment.trim()) {
      setError("El comentario es obligatorio para cambiar el estado.");
      return;
    }
    setChangingStatus(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/results/${selectedAlert.id}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ lifecycle_status: newStatus, comment: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated: AlertRow = await res.json();
      setSelectedAlert(updated);
      setAlerts((prev) => prev.map((a) => a.id === updated.id ? updated : a));
      setNewComment("");
      await loadComments(updated.id);
      setInfoMsg(`Estado cambiado a "${LIFECYCLE_LABELS[newStatus]}".`);
    } catch { setError("No se pudo cambiar el estado."); }
    finally { setChangingStatus(false); }
  };

  // ── Añadir comentario libre ────────────────────────────────────────────
  const handleSendComment = async () => {
    if (!token || !selectedAlert || !newComment.trim()) return;
    setSendingComment(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/results/${selectedAlert.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ comment: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewComment("");
      await loadComments(selectedAlert.id);
    } catch { setError("No se pudo enviar el comentario."); }
    finally { setSendingComment(false); }
  };

  // ── Recalcular empresa+mes específico ─────────────────────────────────
  const handleRecalculate = async () => {
    if (!token || !canManage) return;
    if (filtroEmpresa === "all" || filtroAnio === "all" || filtroMes === "all") {
      setError("Selecciona empresa, año y mes para recalcular.");
      return;
    }
    setRecalculating(true);
    setError(null);
    setInfoMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({
          empresa_id: Number(filtroEmpresa),
          anio: Number(filtroAnio),
          mes: Number(filtroMes),
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setInfoMsg(`Recalculadas ${json.triggered ?? 0} alertas nuevas.`);
      await loadAlerts();
    } catch { setError("No se pudo recalcular."); }
    finally { setRecalculating(false); }
  };

  // ── Recalcular todo el tenant para un año+mes ─────────────────────────
  const handleRecalculateAll = async () => {
    if (!token || !canManage) return;
    if (filtroAnio === "all" || filtroMes === "all") {
      setError("Selecciona año y mes para recalcular todo el tenant.");
      return;
    }
    setRecalculatingAll(true);
    setError(null);
    setInfoMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/recalculate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ anio: Number(filtroAnio), mes: Number(filtroMes) }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setInfoMsg(`Recalculadas ${json.total_triggered ?? 0} alertas en ${json.empresas_procesadas ?? 0} empresas.`);
      await loadAlerts();
    } catch { setError("No se pudo recalcular el tenant."); }
    finally { setRecalculatingAll(false); }
  };

  // ── Recalcular histórico completo (todos los periodos disponibles) ─────
  const handleRecalculateHistory = async () => {
    if (!token || !canManage) return;
    if (aniosDisponibles.length === 0) {
      setError("No hay periodos disponibles para recalcular.");
      return;
    }
    setRecalculatingHistory(true);
    setError(null);
    setInfoMsg(null);
    setHistoryProgress(null);
    let totalTriggered = 0;
    let totalPeriods = 0;
    try {
      for (const anio of aniosDisponibles) {
        for (const mes of mesesDisponibles) {
          setHistoryProgress(`Recalculando ${MESES[mes - 1]} ${anio}...`);
          try {
            const res = await fetch(`${API_BASE_URL}/alerts/recalculate-all`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
              body: JSON.stringify({ anio, mes }),
            });
            if (res.ok) {
              const json = await res.json();
              totalTriggered += json.total_triggered ?? 0;
              totalPeriods++;
            }
          } catch { /* continúa con el siguiente periodo */ }
        }
      }
      setInfoMsg(`Histórico recalculado: ${totalTriggered} alertas en ${totalPeriods} periodos.`);
      await loadAlerts();
    } catch { setError("Error recalculando el histórico."); }
    finally {
      setRecalculatingHistory(false);
      setHistoryProgress(null);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    nuevas:      alerts.filter((a) => a.lifecycle_status === "nueva").length,
    en_revision: alerts.filter((a) => a.lifecycle_status === "en_revision").length,
    resueltas:   alerts.filter((a) => a.lifecycle_status === "resuelta").length,
    criticas:    alerts.filter((a) => a.severity === "critical").length,
  }), [alerts]);

  // ── Agrupación por categoría ───────────────────────────────────────────
  const byCategory = useMemo(() => {
    const groups: Record<Category, AlertRow[]> = {
      mes_anterior: [], absoluta: [], anio_anterior: [],
    };
    for (const a of alerts) {
      if (a.category in groups) groups[a.category as Category].push(a);
    }
    return groups;
  }, [alerts]);

  // ── Tabla de alertas por categoría ────────────────────────────────────
  const renderTable = (cat: Category, rows: AlertRow[]) => {
    const isAbs = cat === "absoluta";
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>Empresa</th>
              <th style={thStyle}>Periodo</th>
              <th style={thStyle}>Regla</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Valor actual</th>
              {!isAbs && <th style={{ ...thStyle, textAlign: "right" }}>Referencia</th>}
              <th style={{ ...thStyle, textAlign: "right" }}>
                {isAbs ? "Umbral" : "Diferencia"}
              </th>
              <th style={thStyle}>Severidad</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={isAbs ? 8 : 9}
                  style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>
                  No hay alertas en esta categoría.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const isSelected = selectedAlert?.id === a.id;
              return (
                <React.Fragment key={a.id}>
                  <tr
                    style={{ background: isSelected ? "rgba(37,99,235,0.08)" : undefined, cursor: "pointer" }}
                    onClick={() => handleSelectAlert(a)}
                  >
                    <td style={tdStyle}><span style={{ fontWeight: 500 }}>{a.empresa_nombre}</span></td>
                    <td style={tdStyle}>{MESES[(a.mes ?? 1) - 1]} {a.anio}</td>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>
                      <div style={{ fontWeight: 500 }}>{a.alerta}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{a.alert_code}</div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {fmt(a.current_value, a.diff_unit === "%" ? "%" : undefined)}
                    </td>
                    {!isAbs && (
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {fmt(a.previous_value, a.diff_unit === "%" ? "%" : undefined)}
                      </td>
                    )}
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {isAbs ? fmt(a.threshold_value, a.diff_unit) : fmt(a.diff_value, a.diff_unit)}
                    </td>
                    <td style={tdStyle}>
                      <Badge {...SEVERITY_COLORS[a.severity]}>
                        {a.severity === "critical" ? "Crítica" : a.severity === "warning" ? "Warning" : "Info"}
                      </Badge>
                    </td>
                    <td style={tdStyle}>
                      <Badge {...LIFECYCLE_COLORS[a.lifecycle_status]}>
                        {LIFECYCLE_LABELS[a.lifecycle_status]}
                      </Badge>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button
                        style={btnStyle}
                        onClick={(e) => { e.stopPropagation(); handleSelectAlert(a); }}
                      >
                        {isSelected ? "Cerrar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                  {isSelected && (
                    <tr>
                      <td colSpan={isAbs ? 8 : 9} style={{ padding: 0 }}>
                        {renderDetail(a)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Panel de detalle ──────────────────────────────────────────────────
  const renderDetail = (a: AlertRow) => (
    <div style={{
      margin: "0 12px 12px", padding: 16,
      background: "var(--field-bg-soft)",
      border: "0.5px solid var(--card-border)",
      borderRadius: 8,
    }}>
      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Valor actual",   value: fmt(a.current_value, a.diff_unit === "%" ? "%" : undefined) },
          { label: "Referencia",     value: fmt(a.previous_value, a.diff_unit === "%" ? "%" : undefined) },
          { label: a.category === "absoluta" ? "Umbral" : "Diferencia",
            value: a.category === "absoluta" ? fmt(a.threshold_value, a.diff_unit) : fmt(a.diff_value, a.diff_unit) },
          { label: "Detectada",      value: fmtDatetime(a.created_at) },
        ].map((k) => (
          <div key={k.label} style={{
            background: "var(--card-bg)", border: "0.5px solid var(--card-border)",
            borderRadius: 6, padding: "8px 10px",
          }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{k.label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 3 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Mensaje */}
      {a.message && (
        <div style={{
          background: "var(--card-bg)", border: "0.5px solid var(--card-border)",
          borderRadius: 6, padding: "8px 10px", fontSize: 12,
          color: "var(--text-muted)", marginBottom: 12,
        }}>
          {a.message}
        </div>
      )}

      {/* Cambio de estado */}
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Cambiar estado</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["nueva", "en_revision", "resuelta"] as LifecycleStatus[]).map((s) => {
              const isActive = a.lifecycle_status === s;
              const c = LIFECYCLE_COLORS[s];
              return (
                <button key={s}
                  disabled={isActive || changingStatus}
                  onClick={() => handleChangeLifecycle(s)}
                  style={{
                    ...btnStyle,
                    background: isActive ? c.bg : undefined,
                    color: isActive ? c.color : undefined,
                    borderColor: isActive ? c.color : undefined,
                  }}
                >
                  {LIFECYCLE_LABELS[s]}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            El comentario de abajo se adjuntará al cambio de estado.
          </div>
        </div>
      )}

      {/* Historial de comentarios */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500 }}>
          Historial de comentarios
        </div>
        {loadingComments ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Cargando...</div>
        ) : comments.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sin comentarios todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {comments.map((c) => {
              const ls = c.lifecycle_status_at_time as LifecycleStatus | null;
              const dotColor = ls ? LIFECYCLE_COLORS[ls]?.color : "var(--text-muted)";
              return (
                <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: dotColor, marginTop: 4, flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {c.user_email ?? "Sistema"} · {fmtDatetime(c.created_at)}
                      {ls && (
                        <> · <Badge {...LIFECYCLE_COLORS[ls]}>{LIFECYCLE_LABELS[ls]}</Badge></>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text)", marginTop: 2 }}>{c.comment}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input comentario */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          style={{ ...inputStyle, flex: 1, resize: "vertical", minHeight: 60, fontFamily: "inherit" }}
          placeholder="Escribe un comentario..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          disabled={sendingComment || changingStatus}
        />
        <button
          style={{ ...btnStyle, alignSelf: "flex-end" }}
          disabled={!newComment.trim() || sendingComment || changingStatus}
          onClick={handleSendComment}
        >
          {sendingComment ? "Enviando..." : "Comentar"}
        </button>
      </div>
    </div>
  );

  // ── Cabecera colapsable de categoría ─────────────────────────────────
  const renderCategoryHeader = (cat: Category, count: number) => {
    const c = CATEGORY_COLORS[cat];
    const isOpen = openCats[cat];
    return (
      <button
        type="button"
        onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !prev[cat] }))}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", background: "none", border: "none",
          borderBottom: isOpen ? "0.5px solid var(--card-border)" : "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          display: "inline-block", padding: "2px 7px", borderRadius: 4,
          fontSize: 10, fontWeight: 500, background: c.bg, color: c.color,
          border: `0.5px solid ${c.border}`, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {CATEGORY_LABELS[cat]}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          {CATEGORY_SUBLABELS[cat]}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {count} alerta{count !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{isOpen ? "▾" : "▸"}</span>
      </button>
    );
  };

  // ── Render principal ───────────────────────────────────────────────────
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {error && <div className="ui-alert ui-alert--danger">{error}</div>}

      {infoMsg && (
        <div style={{
          padding: "8px 12px", background: "rgba(5,150,105,0.1)",
          border: "0.5px solid rgba(5,150,105,0.3)", borderRadius: 8,
          fontSize: 12, color: "#34d399",
        }}>
          {infoMsg}
        </div>
      )}

      {historyProgress && (
        <div style={{
          padding: "8px 12px", background: "rgba(37,99,235,0.1)",
          border: "0.5px solid rgba(37,99,235,0.3)", borderRadius: 8,
          fontSize: 12, color: "#60a5fa",
        }}>
          {historyProgress}
        </div>
      )}

      {/* ── Header + Stats ── */}
      <div style={cardStyle}>
        <div style={{
          padding: "14px 16px", borderBottom: "0.5px solid var(--card-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Alertas · Medidas General</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Seguimiento de desviaciones en energía y pérdidas por empresa y periodo
            </div>
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={btnStyle} disabled={recalculating} onClick={handleRecalculate}>
                {recalculating ? "Recalculando..." : "Recalcular empresa+mes"}
              </button>
              <button
                style={{ ...btnStyle, background: "rgba(37,99,235,0.15)", color: "#60a5fa", borderColor: "rgba(37,99,235,0.3)" }}
                disabled={recalculatingAll}
                onClick={handleRecalculateAll}
              >
                {recalculatingAll ? "Recalculando..." : "Recalcular tenant (mes)"}
              </button>
              <button
                style={{ ...btnStyle, background: "rgba(168,85,247,0.15)", color: "#c084fc", borderColor: "rgba(168,85,247,0.3)" }}
                disabled={recalculatingHistory}
                onClick={handleRecalculateHistory}
                title="Recalcula todos los periodos disponibles para todas las empresas del tenant"
              >
                {recalculatingHistory ? "Recalculando histórico..." : "Recalcular histórico completo"}
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, padding: "12px 16px" }}>
          {[
            { label: "Nuevas",       value: stats.nuevas,      color: "#f87171" },
            { label: "En revisión",  value: stats.en_revision, color: "#60a5fa" },
            { label: "Resueltas",    value: stats.resueltas,   color: "#34d399" },
            { label: "Críticas",     value: stats.criticas,    color: "#f87171" },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--field-bg-soft)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{
          borderTop: "0.5px solid var(--card-border)", padding: "12px 16px",
          display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 8,
        }}>
          {[
            {
              label: "Empresa", value: filtroEmpresa, onChange: setFiltroEmpresa,
              options: [
                { value: "all", label: "Todas" },
                ...empresas.map((e) => ({ value: String(e.id), label: e.nombre })),
              ],
            },
            {
              label: "Año", value: filtroAnio, onChange: setFiltroAnio,
              options: [
                { value: "all", label: "Todos" },
                ...aniosDisponibles.map((a) => ({ value: String(a), label: String(a) })),
              ],
            },
            {
              label: "Mes", value: filtroMes, onChange: setFiltroMes,
              options: [
                { value: "all", label: "Todos" },
                ...mesesDisponibles.map((m) => ({ value: String(m), label: MESES[m - 1] ?? String(m) })),
              ],
            },
            {
              label: "Severidad", value: filtroSeverity, onChange: setFiltroSeverity,
              options: [
                { value: "all", label: "Todas" },
                { value: "critical", label: "Crítica" },
                { value: "warning",  label: "Warning" },
                { value: "info",     label: "Info" },
              ],
            },
            {
              label: "Estado", value: filtroLifecycle, onChange: setFiltroLifecycle,
              options: [
                { value: "all",         label: "Todos" },
                { value: "nueva",       label: "Nueva" },
                { value: "en_revision", label: "En revisión" },
                { value: "resuelta",    label: "Resuelta" },
              ],
            },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{f.label}</div>
              <select
                style={{ ...inputStyle, width: "100%" }}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                disabled={loading || loadingEmpresas}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tablas por categoría ── */}
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Cargando alertas...
        </div>
      ) : (
        (["mes_anterior", "absoluta", "anio_anterior"] as Category[]).map((cat) => (
          <div key={cat} style={cardStyle}>
            {renderCategoryHeader(cat, byCategory[cat].length)}
            {openCats[cat] && renderTable(cat, byCategory[cat])}
          </div>
        ))
      )}

    </section>
  );
}
