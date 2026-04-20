// Tabla de resultados del panel "Descarga en Objeciones" (FASE 5 · Sub-paso 5.2).
// - Columnas: [☐] · Fichero · Empresa · Tipo · Periodo · Versión · Fecha SFTP · Tamaño · Estado
// - Checkboxes condicionales según estado (spec V8 · punto 22):
//     ⚪ Nuevo        → checkbox ✅
//     🟠 Actualizable → checkbox ✅ (modal confirmación en ejecución — sub-paso 5.3)
//     🟢 Importado    → checkbox ❌
//     ⚫ Obsoleta     → checkbox ❌

"use client";

import type { BusquedaResult } from "./shared/types";
import { BadgeEstadoDescarga } from "./shared/badges";

interface DescargaTablaProps {
  resultados:    BusquedaResult[];
  loading:       boolean;
  seleccionados: Set<string>;              // keys: "empresa_id|nombre"
  setSeleccionados: (s: Set<string>) => void;
  buscado:       boolean;                   // true si ya se ha hecho al menos 1 búsqueda
}

// ── Helpers ────────────────────────────────────────────────────────────────

const selectableStates = new Set(["nuevo", "actualizable"]);

function keyOf(r: BusquedaResult): string {
  return `${r.empresa_id}|${r.nombre}`;
}

function fmtBytes(n: number): string {
  if (!n || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtPeriodo(aaaamm: string): string {
  if (!aaaamm || aaaamm.length !== 6) return aaaamm || "—";
  return `${aaaamm.slice(0, 4)}-${aaaamm.slice(4)}`;
}

function tooltipFor(r: BusquedaResult): string | undefined {
  if (r.estado === "importado") {
    return `Ya importado (v.${r.version_importada ?? r.version})`;
  }
  if (r.estado === "obsoleta") {
    return "Hay una versión más reciente del mismo fichero";
  }
  if (r.estado === "actualizable") {
    return `Sustituirá a la versión v.${r.version_importada ?? "?"} importada`;
  }
  return undefined;
}

// ── Render ─────────────────────────────────────────────────────────────────

export default function DescargaTabla({
  resultados, loading, seleccionados, setSeleccionados, buscado,
}: DescargaTablaProps) {

  // Selección
  const seleccionables = resultados.filter((r) => selectableStates.has(r.estado));
  const allSelKeys = new Set(seleccionables.map(keyOf));
  const numSelec = seleccionados.size;
  const allSelected = seleccionables.length > 0 && numSelec === seleccionables.length
    && seleccionables.every((r) => seleccionados.has(keyOf(r)));
  const someSelected = numSelec > 0 && !allSelected;

  const toggleOne = (r: BusquedaResult) => {
    if (!selectableStates.has(r.estado)) return;
    const k = keyOf(r);
    const next = new Set(seleccionados);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSeleccionados(next);
  };

  const toggleAll = () => {
    if (allSelected) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(allSelKeys);
    }
  };

  return (
    <div className="ui-table-wrap" style={{ marginTop: 4 }}>
      <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead className="ui-thead">
          <tr>
            <th className="ui-th" style={{ width: 36, textAlign: "center" }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                disabled={seleccionables.length === 0}
                style={{ cursor: seleccionables.length === 0 ? "not-allowed" : "pointer", accentColor: "#1a2332" }}
              />
            </th>
            <th className="ui-th">Fichero</th>
            <th className="ui-th">Empresa</th>
            <th className="ui-th">Tipo</th>
            <th className="ui-th">Periodo</th>
            <th className="ui-th" style={{ textAlign: "center" }}>Versión</th>
            <th className="ui-th">Fecha SFTP</th>
            <th className="ui-th" style={{ textAlign: "right" }}>Tamaño</th>
            <th className="ui-th">Estado</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="ui-tr">
              <td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                Buscando en el SFTP...
              </td>
            </tr>
          ) : !buscado ? (
            <tr className="ui-tr">
              <td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                Configura los filtros y pulsa <em>Buscar</em> para listar ficheros del SFTP.
              </td>
            </tr>
          ) : resultados.length === 0 ? (
            <tr className="ui-tr">
              <td colSpan={9} className="ui-td text-center ui-muted" style={{ padding: "32px 16px" }}>
                Sin ficheros AOB encontrados para los filtros indicados.
              </td>
            </tr>
          ) : (
            resultados.map((r) => {
              const k          = keyOf(r);
              const seleccional = selectableStates.has(r.estado);
              const isChecked  = seleccionados.has(k);
              const tooltip    = tooltipFor(r);
              const rowStyle: React.CSSProperties = {
                background: isChecked ? "var(--nav-item-hover)" : undefined,
                opacity: (r.estado === "importado" || r.estado === "obsoleta") ? 0.6 : 1,
              };
              return (
                <tr key={k} className="ui-tr" style={rowStyle}>
                  <td className="ui-td" style={{ width: 36, textAlign: "center", padding: "6px 10px" }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(r)}
                      disabled={!seleccional}
                      title={tooltip}
                      style={{ cursor: seleccional ? "pointer" : "not-allowed", accentColor: "#1a2332" }}
                    />
                  </td>
                  <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>
                    {r.nombre}
                  </td>
                  <td className="ui-td">{r.empresa_nombre}</td>
                  <td className="ui-td">{r.tipo}</td>
                  <td className="ui-td">{fmtPeriodo(r.periodo)}</td>
                  <td className="ui-td" style={{ textAlign: "center" }}>.{r.version}</td>
                  <td className="ui-td ui-muted">{r.fecha_sftp ?? "—"}</td>
                  <td className="ui-td" style={{ textAlign: "right" }}>{fmtBytes(r.tamanio)}</td>
                  <td className="ui-td">
                    <span title={tooltip}>
                      <BadgeEstadoDescarga estado={r.estado} />
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}