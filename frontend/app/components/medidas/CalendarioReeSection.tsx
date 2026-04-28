"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "../../types";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";
import CalendarioOperativoCard from "./CalendarioOperativoCard";
import CollapsibleCard from "./CollapsibleCard";

type Props = {
  token: string | null;
  currentUser: User | null;
};

type ReeCalendarFileRead = {
  id: number;
  tenant_id: number;
  anio: number;
  filename: string;
  storage_key: string | null;
  mime_type: string | null;
  status: string;
  is_active: boolean;
  uploaded_by: number;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
};

function formatDateEs(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function CalendarioReeSection({ token, currentUser }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const [anio, setAnio]                   = useState<string>(String(currentYear));
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [history, setHistory]             = useState<ReeCalendarFileRead[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState<string | null>(null);
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [historyError, setHistoryError]   = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!token) { setHistory([]); return; }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calendario-ree/files`, {
        method: "GET",
        headers: getAuthHeaders(token),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo cargar el histórico.");
      }
      const json = (await response.json()) as ReeCalendarFileRead[];
      setHistory(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el histórico.";
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const activeCalendar = useMemo(
    () => history.find((item) => item.is_active) ?? null,
    [history]
  );

  const handleOpenFilePicker = () => { fileInputRef.current?.click(); };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setSelectedFile(nextFile);
    setSaveSuccess(null);
    setSaveError(null);
  };

  const handleSaveVersion = async () => {
    if (!token)        { setSaveError("No hay sesión activa."); return; }
    if (!selectedFile) { setSaveError("Selecciona primero un fichero."); return; }
    if (!selectedFile.name.toLowerCase().endsWith(".xlsx")) {
      setSaveError("En esta fase solo se admite subir el calendario en Excel (.xlsx).");
      return;
    }
    const anioNumber = Number(anio);
    if (!Number.isInteger(anioNumber) || anioNumber < 2000 || anioNumber > 2100) {
      setSaveError("Introduce un año válido entre 2000 y 2100.");
      return;
    }
    setSaving(true); setSaveSuccess(null); setSaveError(null);
    try {
      const formData = new FormData();
      formData.append("anio", String(anioNumber));
      formData.append("file", selectedFile);
      const response = await fetch(`${API_BASE_URL}/calendario-ree/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo guardar el calendario.");
      }
      const saved = (await response.json()) as ReeCalendarFileRead;
      setSaveSuccess(`Calendario ${saved.filename} guardado correctamente.`);
      setSelectedFile(null);
      await loadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el calendario.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadOriginal = async () => {
    if (!token)             { setHistoryError("No hay sesión activa."); return; }
    if (!activeCalendar?.id){ setHistoryError("No hay calendario activo para descargar."); return; }
    try {
      setHistoryError(null);
      const response = await fetch(
        `${API_BASE_URL}/calendario-ree/files/${activeCalendar.id}/download`,
        { method: "GET", headers: getAuthHeaders(token) }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo descargar el Excel original.");
      }
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = activeCalendar.filename || `calendario_${activeCalendar.anio}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo descargar el Excel original.";
      setHistoryError(message);
    }
  };

  // ── helpers de estilo inline (colores de la app) ──────────────────
  const appCard: React.CSSProperties = {
    background: "rgba(0,0,0,0.2)",
    border: "1px solid var(--card-border)",
    borderRadius: 10,
  };

  const pillActive: React.CSSProperties = {
    display: "inline-flex", fontSize: 10, padding: "2px 8px",
    borderRadius: 20, fontWeight: 500,
    background: "rgba(5,150,105,0.2)", color: "#6ee7b7",
    border: "1px solid rgba(5,150,105,0.3)",
  };

  const pillArchived: React.CSSProperties = {
    display: "inline-flex", fontSize: 10, padding: "2px 8px",
    borderRadius: 20, fontWeight: 500,
    background: "rgba(255,255,255,0.05)", color: "rgba(226,232,240,0.45)",
    border: "1px solid rgba(255,255,255,0.08)",
  };

  return (
    <section className="text-sm">
      <div className="flex flex-col gap-8">

        {/* ── TARJETA 1: CALENDARIO OPERATIVO REE ─────────────────── */}
        <CollapsibleCard
          title="CALENDARIO OPERATIVO REE"
          subtitle="Consulta operativa de hitos, cierres, publicaciones y ventanas del calendario activo."
          defaultOpen={true}
        >
          <CalendarioOperativoCard
            token={token}
            anioActivo={activeCalendar?.anio ?? null}
          />
        </CollapsibleCard>

        {/* ── TARJETA 2: CALENDARIO REE (carga) ───────────────────── */}
        <CollapsibleCard
          title="CALENDARIO REE"
          subtitle="Carga el calendario anual de REE en Excel y gestiona su versión activa."
          defaultOpen={false}
        >
          {/* Input file oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* ── Tira superior: estado + upload + descarga ── */}
          <div
            className="mb-4"
            style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "stretch" }}
          >
            {/* Bloque estado activo */}
            <div style={{ ...appCard, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: activeCalendar ? "#34d399" : "#fbbf24", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,0.55)", marginBottom: 3 }}>
                  {activeCalendar ? `Versión activa · ${activeCalendar.anio}` : "Sin versión activa"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {activeCalendar?.filename ?? "Ningún calendario cargado"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(226,232,240,0.4)", marginTop: 2 }}>
                  {activeCalendar
                    ? `${formatDateEs(activeCalendar.created_at)} · ${currentUser?.email ?? "—"} · ${currentUser?.rol ?? "—"}`
                    : "Sube un fichero .xlsx para activar el calendario"}
                </div>
              </div>
            </div>

            {/* Bloque upload compacto — todo en una fila */}
            <div style={{ ...appCard, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(226,232,240,0.55)", flexShrink: 0 }}>
                Nueva versión
              </span>
              <input
                type="number"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                min="2020"
                max="2100"
                style={{
                  fontSize: 11, padding: "4px 7px",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
                  background: "rgba(0,0,0,0.4)", color: "var(--text)",
                  width: 66, flexShrink: 0,
                }}
              />
              <button
                type="button"
                onClick={handleOpenFilePicker}
                disabled={saving}
                className="ui-btn ui-btn-outline ui-btn-xs"
              >
                {selectedFile ? `✓ ${selectedFile.name.split(".")[0].substring(0, 12)}…` : "Seleccionar .xlsx"}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveVersion()}
                disabled={!selectedFile || saving}
                className="ui-btn ui-btn-primary ui-btn-xs"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>

            {/* Bloque descarga */}
            <div style={{
              background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)",
              borderRadius: 10, padding: "10px 14px",
              display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, flexShrink: 0,
            }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#93c5fd" }}>
                Excel activo
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadOriginal()}
                disabled={!activeCalendar || historyLoading}
                className="ui-btn ui-btn-outline ui-btn-xs"
                style={{ borderColor: "rgba(37,99,235,0.4)", color: "#93c5fd" }}
              >
                ↓ Descargar
              </button>
            </div>
          </div>

          {/* Alertas save */}
          {saveSuccess && <div className="ui-alert ui-alert--success text-xs mb-3">{saveSuccess}</div>}
          {saveError   && <div className="ui-alert ui-alert--danger text-xs mb-3">{saveError}</div>}
          {historyError && <div className="ui-alert ui-alert--danger text-xs mb-3">{historyError}</div>}

          {/* ── Tabla histórico ── */}
          <div style={{ border: "1px solid var(--card-border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px 8px", borderBottom: "1px solid var(--card-border)",
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>Histórico de versiones</div>
                <div style={{ fontSize: 10, color: "rgba(226,232,240,0.45)", marginTop: 2 }}>
                  Versiones cargadas por año, fecha y estado real en backend
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadHistory()}
                disabled={historyLoading}
                className="ui-btn ui-btn-outline ui-btn-xs"
              >
                {historyLoading ? "…" : "↻"}
              </button>
            </div>

            <table className="w-full text-left" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  {["Año", "Fichero", "Estado", "Activo", "Fecha"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px", fontSize: 10, fontWeight: 500,
                        color: "rgba(226,232,240,0.6)", letterSpacing: "0.04em",
                        borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "10px 12px", color: "rgba(226,232,240,0.5)", fontSize: 11 }}>
                      Cargando histórico...
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "10px 12px", color: "rgba(226,232,240,0.5)", fontSize: 11 }}>
                      Sin versiones guardadas todavía.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid rgba(30,58,95,0.4)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,58,95,0.4)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "7px 12px", color: "var(--text)" }}>{item.anio}</td>
                      <td style={{ padding: "7px 12px", color: "var(--text)" }}>{item.filename}</td>
                      <td style={{ padding: "7px 12px" }}>
                        <span style={item.is_active ? pillActive : pillArchived}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", color: item.is_active ? "#6ee7b7" : "rgba(226,232,240,0.45)" }}>
                        {item.is_active ? "Sí" : "No"}
                      </td>
                      <td style={{ padding: "7px 12px", color: "rgba(226,232,240,0.45)", whiteSpace: "nowrap" }}>
                        {formatDateEs(item.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div style={{ fontSize: 10, color: "rgba(226,232,240,0.35)", padding: "8px 14px", borderTop: "1px solid rgba(30,58,95,0.4)" }}>
              El Excel original queda asociado a la versión activa y puede descargarse cuando lo necesites.
            </div>
          </div>
        </CollapsibleCard>

      </div>
    </section>
  );
}