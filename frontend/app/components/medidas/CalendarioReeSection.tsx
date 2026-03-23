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

  const [anio, setAnio] = useState<string>(String(currentYear));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [history, setHistory] = useState<ReeCalendarFileRead[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!token) {
      setHistory([]);
      return;
    }

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
      const message =
        error instanceof Error ? error.message : "No se pudo cargar el histórico.";
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const activeCalendar = useMemo(() => {
    return history.find((item) => item.is_active) ?? null;
  }, [history]);

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setSelectedFile(nextFile);
    setSaveSuccess(null);
    setSaveError(null);
  };

  const handleSaveVersion = async () => {
    if (!token) {
      setSaveError("No hay sesión activa.");
      return;
    }

    if (!selectedFile) {
      setSaveError("Selecciona primero un fichero.");
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".xlsx")) {
      setSaveError("En esta fase solo se admite subir el calendario en Excel (.xlsx).");
      return;
    }

    const anioNumber = Number(anio);
    if (!Number.isInteger(anioNumber) || anioNumber < 2000 || anioNumber > 2100) {
      setSaveError("Introduce un año válido entre 2000 y 2100.");
      return;
    }

    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const formData = new FormData();
      formData.append("anio", String(anioNumber));
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE_URL}/calendario-ree/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      const message =
        error instanceof Error ? error.message : "No se pudo guardar el calendario.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadOriginal = async () => {
    if (!token) {
      setHistoryError("No hay sesión activa.");
      return;
    }

    if (!activeCalendar?.id) {
      setHistoryError("No hay calendario activo para descargar.");
      return;
    }

    try {
      setHistoryError(null);

      const response = await fetch(
        `${API_BASE_URL}/calendario-ree/files/${activeCalendar.id}/download`,
        {
          method: "GET",
          headers: getAuthHeaders(token),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo descargar el Excel original.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = activeCalendar.filename || `calendario_${activeCalendar.anio}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo descargar el Excel original.";
      setHistoryError(message);
    }
  };

  const fileExtension = useMemo(() => {
    if (!selectedFile?.name) return "—";
    const parts = selectedFile.name.split(".");
    return parts.length > 1 ? parts.at(-1)?.toUpperCase() ?? "—" : "—";
  }, [selectedFile]);

  return (
    <section className="ui-card text-sm">
      <div className="flex flex-col gap-4">
        <CollapsibleCard
          title="CALENDARIO REE"
          subtitle="Carga el calendario anual de REE en Excel y gestiona su versión activa."
          defaultOpen={false}
        >
          <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
                  Calendario vigente
                </div>

                <div className="mt-4 flex flex-col gap-2 text-sm">
                  <div>
                    <span className="ui-muted">Año activo:</span>{" "}
                    <span>{activeCalendar?.anio ?? anio ?? "—"}</span>
                  </div>
                  <div>
                    <span className="ui-muted">Estado:</span>{" "}
                    <span>
                      {activeCalendar
                        ? `Activo: ${activeCalendar.filename}`
                        : selectedFile
                          ? "Excel seleccionado en sesión"
                          : "Sin calendario cargado"}
                    </span>
                  </div>
                  <div>
                    <span className="ui-muted">Usuario:</span>{" "}
                    <span>{currentUser?.email ?? "—"}</span>
                  </div>
                  <div>
                    <span className="ui-muted">Rol:</span>{" "}
                    <span>{currentUser?.rol ?? "—"}</span>
                  </div>
                  <div className="mt-2 text-xs ui-muted">
                    {activeCalendar
                      ? `Última subida: ${formatDateEs(activeCalendar.created_at)}`
                      : "Todavía no hay una versión activa guardada en backend."}
                  </div>
                </div>
              </div>

              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
                  Carga de calendario
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="ui-label">Año del calendario</label>
                    <input
                      type="number"
                      value={anio}
                      onChange={(e) => setAnio(e.target.value)}
                      className="ui-input"
                      min="2020"
                      max="2100"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="ui-label">Fichero del calendario</label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleOpenFilePicker}
                        className="ui-btn ui-btn-outline ui-btn-sm"
                        disabled={saving}
                      >
                        Cargar calendario
                      </button>

                      <button
                        type="button"
                        className="ui-btn ui-btn-sm"
                        disabled={!selectedFile || saving}
                        onClick={() => {
                          void handleSaveVersion();
                        }}
                      >
                        {saving ? "Guardando..." : "Guardar versión"}
                      </button>
                    </div>

                    <div className="text-xs ui-muted">
                      En esta fase solo se admite Excel (.xlsx).
                    </div>

                    {saveSuccess && (
                      <div className="ui-alert ui-alert--success text-xs">{saveSuccess}</div>
                    )}

                    {saveError && (
                      <div className="ui-alert ui-alert--danger text-xs">{saveError}</div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
                  Estado del fichero
                </div>

                <div className="mt-4 flex flex-col gap-2 text-sm">
                  <div>
                    <span className="ui-muted">Nombre:</span>{" "}
                    <span>
                      {selectedFile?.name ??
                        activeCalendar?.filename ??
                        "Ningún fichero seleccionado"}
                    </span>
                  </div>

                  <div>
                    <span className="ui-muted">Tipo:</span>{" "}
                    <span>{selectedFile?.type || activeCalendar?.mime_type || "—"}</span>
                  </div>

                  <div>
                    <span className="ui-muted">Extensión:</span>{" "}
                    <span>{selectedFile ? fileExtension : "XLSX"}</span>
                  </div>

                  <div>
                    <span className="ui-muted">Tamaño:</span>{" "}
                    <span>
                      {selectedFile
                        ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                        : "—"}
                    </span>
                  </div>

                  <div className="mt-2 text-xs ui-muted">
                    Estado de sesión: {token ? "Activa" : "Sin sesión"}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border p-4"
              style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide ui-muted">
                    Histórico y original
                  </div>
                  <div className="mt-1 text-sm">
                    Descarga el Excel original del calendario activo y revisa las versiones cargadas.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadOriginal();
                  }}
                  className="ui-btn ui-btn-outline ui-btn-sm"
                  disabled={!activeCalendar || historyLoading}
                >
                  Descargar Excel original
                </button>
              </div>

              <div className="mt-4">
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Histórico de calendarios</div>
                      <p className="mt-2 text-xs ui-muted">
                        Versiones cargadas por año, fecha y estado real en backend.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void loadHistory();
                      }}
                      className="ui-btn ui-btn-outline ui-btn-xs"
                      disabled={historyLoading}
                    >
                      {historyLoading ? "Actualizando..." : "Actualizar"}
                    </button>
                  </div>

                  {historyError && (
                    <div className="ui-alert ui-alert--danger mt-3 text-xs">
                      {historyError}
                    </div>
                  )}

                  <div
                    className="mt-4 overflow-hidden rounded-xl border"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr style={{ background: "var(--btn-secondary-bg)", color: "#fff" }}>
                          <th className="px-3 py-2">Año</th>
                          <th className="px-3 py-2">Fichero</th>
                          <th className="px-3 py-2">Estado</th>
                          <th className="px-3 py-2">Activo</th>
                          <th className="px-3 py-2">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyLoading ? (
                          <tr>
                            <td className="px-3 py-3" colSpan={5}>
                              Cargando histórico...
                            </td>
                          </tr>
                        ) : history.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3" colSpan={5}>
                              Sin versiones guardadas todavía.
                            </td>
                          </tr>
                        ) : (
                          history.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-3">{item.anio}</td>
                              <td className="px-3 py-3">{item.filename}</td>
                              <td className="px-3 py-3">{item.status}</td>
                              <td className="px-3 py-3">{item.is_active ? "Sí" : "No"}</td>
                              <td className="px-3 py-3">{formatDateEs(item.created_at)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-xs ui-muted">
                    El Excel original queda asociado a la versión activa y puede descargarse cuando lo necesites.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="CALENDARIO OPERATIVO REE"
          subtitle="Consulta operativa de hitos, cierres, publicaciones y ventanas del calendario activo."
          defaultOpen={false}
        >
          <CalendarioOperativoCard token={token} anioActivo={activeCalendar?.anio ?? null} />
        </CollapsibleCard>
      </div>
    </section>
  );
}