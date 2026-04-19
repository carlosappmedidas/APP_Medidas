// Nivel 1 de Gestión: tabla de ficheros + toolbar de importar + menú 3 puntos.
// Extraído de GestionPanel.tsx (Fase 0 · Paso 0.8b).

"use client";

import { useState, useEffect } from "react";
import type { ObjecionTipo, FicheroStats, TabConfig } from "./shared/types";
import { TIPO_GENERA_ZIP } from "./shared/constants";
import { fmtDate } from "./shared/helpers";
import {
  IconFolder, IconDownload, IconTrash,
  IconChevron, IconSend, IconDotsV,
} from "./shared/icons";
import { BadgeNum } from "./shared/badges";

interface GestionFicherosListaProps {
  tab: TabConfig;
  activeTab: ObjecionTipo;
  ficheros: FicheroStats[];
  loadingFicheros: boolean;
  empresaIdGestion: number | null;
  importing: boolean;
  generating: boolean;
  deleting: boolean;
  onImportClick: () => void;
  onFicheroClick: (nombre: string) => void;
  onGenerate: (nombre: string) => void;
  onAbrirSftpModal: (nombre: string) => void;
  onToggleSftp: (nombre: string, e: React.MouseEvent) => void;
  onDeleteFichero: (nombre: string) => void;
}

export default function GestionFicherosLista({
  tab, activeTab, ficheros, loadingFicheros, empresaIdGestion,
  importing, generating, deleting,
  onImportClick, onFicheroClick, onGenerate,
  onAbrirSftpModal, onToggleSftp, onDeleteFichero,
}: GestionFicherosListaProps) {
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{top: number; right: number}>({top: 0, right: 0});

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-menu-container]")) {
        setMenuAbierto(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-2" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none", marginBottom: 1 }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onImportClick} disabled={importing || !empresaIdGestion}
            className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}
            title={!empresaIdGestion ? "Selecciona una empresa para importar" : ""}>
            <IconFolder />
            {importing ? "Importando..." : tab.importLabel}
          </button>
          {!empresaIdGestion && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Selecciona una empresa para importar</span>
          )}
        </div>
        <span className="ui-muted" style={{ fontSize: "11px" }}>
          {loadingFicheros ? "Cargando..." : !empresaIdGestion ? "Selecciona empresa" : `${ficheros.length} fichero${ficheros.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="ui-thead">
            <tr>
              <th className="ui-th" style={{ width: 28 }}></th>
              <th className="ui-th">Fichero</th>
              <th className="ui-th">Cargado</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Total</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Pendientes</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Aceptadas</th>
              <th className="ui-th" style={{ textAlign: "center" }}>Rechazadas</th>
              <th className="ui-th">Estado</th>
              <th className="ui-th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!empresaIdGestion ? (
              <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                Selecciona una empresa para ver sus ficheros
              </td></tr>
            ) : loadingFicheros ? (
              <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>Cargando...</td></tr>
            ) : ficheros.length === 0 ? (
              <tr className="ui-tr"><td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                Sin ficheros importados · Usa &quot;{tab.importLabel}&quot; para cargar
              </td></tr>
            ) : (
              ficheros.map((f) => (
                <tr key={f.nombre_fichero} className="ui-tr" style={{ cursor: "pointer" }} onClick={() => onFicheroClick(f.nombre_fichero)}>
                  <td className="ui-td" style={{ width: 28, color: "var(--text-muted)", textAlign: "center" }}><IconChevron /></td>
                  <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "10px" }}>{f.nombre_fichero}</td>
                  <td className="ui-td ui-muted">{fmtDate(f.created_at)}</td>
                  <td className="ui-td" style={{ textAlign: "center", fontWeight: 500 }}>{f.total}</td>
                  <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.pendientes} variant="neutral" /></td>
                  <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.aceptadas} variant="ok" /></td>
                  <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.rechazadas} variant="err" /></td>
                  <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={(e) => onToggleSftp(f.nombre_fichero, e)}
                        title={f.enviado_sftp_at ? `Enviado ${fmtDate(f.enviado_sftp_at)} · Click para desmarcar` : "No enviado · Click para marcar"}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: f.enviado_sftp_at ? "#378ADD" : "var(--card-border)" }} />
                        <span style={{ fontSize: 8, color: "var(--text-muted)" }}>sftp</span>
                      </button>
                    </div>
                  </td>
                  <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                    <div style={{ position: "relative" }} data-menu-container onClick={(e) => e.stopPropagation()}>
                      <button type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuAbierto === f.nombre_fichero) {
                            setMenuAbierto(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setMenuAbierto(f.nombre_fichero);
                          }
                        }}
                        className="ui-btn ui-btn-ghost ui-btn-xs"
                        style={{ padding: "4px 7px", display: "flex", alignItems: "center" }}>
                        <IconDotsV />
                      </button>
                      {menuAbierto === f.nombre_fichero && (
                        <div style={{
                          position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 200,
                          background: "var(--card-bg)", border: "1px solid var(--card-border)",
                          borderRadius: 8, minWidth: 155, overflow: "hidden",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        }}>
                          <button type="button"
                            onClick={() => { setMenuAbierto(null); onGenerate(f.nombre_fichero); }}
                            disabled={generating || (f.aceptadas + f.rechazadas) === 0}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                            <IconDownload />
                            {TIPO_GENERA_ZIP[activeTab] ? "Generar ZIP" : "Generar REOB"}
                          </button>
                          <button type="button"
                            onClick={() => { setMenuAbierto(null); onAbrirSftpModal(f.nombre_fichero); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                            <IconSend />
                            Enviar al SFTP
                          </button>
                          <div style={{ height: "0.5px", background: "var(--card-border)", margin: "2px 0" }} />
                          <button type="button"
                            onClick={() => { setMenuAbierto(null); onDeleteFichero(f.nombre_fichero); }}
                            disabled={deleting}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "#E24B4A", textAlign: "left" }}>
                            <IconTrash />
                            Eliminar fichero
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}