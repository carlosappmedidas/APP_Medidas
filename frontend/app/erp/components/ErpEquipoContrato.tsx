// app/erp/components/ErpEquipoContrato.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, readApiError } from "../../apiConfig";

const AUTH_TOKEN_STORAGE_KEY = "auth_token";
function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
  return t ? { Authorization: "Bearer " + t } : {};
}

interface Equipo {
  id: number;
  numero_serie: string;
  fabricante: string | null;
  modelo: string | null;
  estado: string;
  suministro_id: number | null;
}

const monoFont = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "rgba(241,239,232,0.55)", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 6,
  color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13,
  padding: "8px 10px", outline: "none", boxSizing: "border-box",
};
const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)",
  borderRadius: 10, padding: "16px 18px", marginBottom: 12,
};
const cardTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: "var(--ds-text-primary, #F1EFE8)", marginBottom: 12,
};
const btnPrimary: React.CSSProperties = {
  background: "#F1EFE8", color: "#0E1014", border: "none", borderRadius: 6,
  padding: "8px 16px", fontSize: 13, fontWeight: 500,
};

/**
 * Bloque para la ficha de contrato: muestra el equipo instalado en el CUPS del
 * contrato y, si no hay, permite instalar uno del almacen (con buscador local).
 * El vinculo fisico es contador<->CUPS (suministro_id); el contrato lo ve via CUPS.
 */
export default function ErpEquipoContrato({
  empresaId,
  suministroId,
}: {
  empresaId: number | null;
  suministroId: number | null;
}) {
  const [instalado, setInstalado] = useState<Equipo | null>(null);
  const [almacen, setAlmacen] = useState<Equipo[]>([]);
  const [filtro, setFiltro] = useState<string>("");
  const [sel, setSel] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [lectura, setLectura] = useState<string>("");
  const [tipoUso, setTipoUso] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    if (empresaId == null || suministroId == null) return;
    setLoading(true);
    setError(null);
    try {
      // 1) equipo instalado en este CUPS
      const rInst = await fetch(
        `${API_BASE_URL}/erp/equipos?empresa_id=${empresaId}&estado=instalado`,
        { headers: authHeaders() }
      );
      const insArr: Equipo[] = rInst.ok ? await rInst.json() : [];
      const enEsteCups = Array.isArray(insArr)
        ? insArr.find((e) => e.suministro_id === suministroId) ?? null
        : null;
      setInstalado(enEsteCups);

      // 2) equipos en almacen (solo si no hay instalado)
      if (!enEsteCups) {
        const rAlm = await fetch(
          `${API_BASE_URL}/erp/equipos?empresa_id=${empresaId}&estado=en_almacen&solo_activos=true`,
          { headers: authHeaders() }
        );
        const almArr: Equipo[] = rAlm.ok ? await rAlm.json() : [];
        setAlmacen(Array.isArray(almArr) ? almArr : []);
      } else {
        setAlmacen([]);
      }
    } catch {
      setError("No se pudo cargar la información del equipo.");
    } finally {
      setLoading(false);
    }
  }, [empresaId, suministroId]);

  useEffect(() => {
    setFecha(new Date().toISOString().slice(0, 10));
    cargar();
  }, [cargar]);

  // Buscador local: filtra por nº serie / fabricante / modelo
  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (q === "") return almacen;
    return almacen.filter((e) =>
      [e.numero_serie, e.fabricante, e.modelo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [almacen, filtro]);

  async function instalar() {
    if (!sel || suministroId == null) {
      setError("Selecciona un equipo del almacén.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        suministro_id: suministroId,
        fecha: fecha.trim() === "" ? null : fecha.trim(),
        lectura: lectura.trim() === "" ? null : Number(lectura),
        tipo_uso: tipoUso === "" ? null : tipoUso,
        motivo: "Asignado desde el contrato",
      };
      const r = await fetch(`${API_BASE_URL}/erp/equipos/${sel}/instalar`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setError(await readApiError(r, "No se pudo instalar el equipo."));
        return;
      }
      setSel("");
      setLectura("");
      setTipoUso("");
      setFiltro("");
      cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  if (suministroId == null) return null;

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>Equipo de medida (en este CUPS)</div>

      {error && (
        <div style={{ background: "rgba(240,153,155,0.1)", border: "0.5px solid rgba(240,153,155,0.4)", color: "#F0999B", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13, margin: 0 }}>Cargando…</p>
      ) : instalado ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 12, color: "rgba(241,239,232,0.5)" }}>Nº serie</span>
            <div style={{ fontFamily: monoFont, fontWeight: 600 }}>{instalado.numero_serie}</div>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "rgba(241,239,232,0.5)" }}>Fabricante / modelo</span>
            <div>{[instalado.fabricante, instalado.modelo].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          <span style={{ background: "rgba(74,222,128,0.15)", color: "#7BE0A3", fontSize: 12, padding: "2px 9px", borderRadius: 6 }}>
            instalado
          </span>
          <span style={{ fontSize: 12, color: "rgba(241,239,232,0.45)" }}>
            Gestiona la retirada desde la ficha del equipo (Equipos).
          </span>
        </div>
      ) : (
        <div>
          <p style={{ color: "rgba(241,239,232,0.6)", fontSize: 13, marginTop: 0 }}>
            No hay ningún equipo instalado en este CUPS. Puedes instalar uno del almacén:
          </p>
          {almacen.length === 0 ? (
            <p style={{ color: "rgba(241,239,232,0.5)", fontSize: 13 }}>
              No hay equipos en almacén disponibles en esta empresa.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, alignItems: "end" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Buscar equipo (nº serie, fabricante, modelo)</label>
                <input style={inputStyle} value={filtro} placeholder="Escribe para filtrar…"
                  onChange={(e) => setFiltro(e.target.value)} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Equipo en almacén ({filtrados.length})</label>
                <select style={inputStyle} value={sel} onChange={(e) => setSel(e.target.value)}>
                  <option value="" style={{ background: "#16181D" }}>— elegir —</option>
                  {filtrados.map((e) => (
                    <option key={e.id} value={String(e.id)} style={{ background: "#16181D" }}>
                      {e.numero_serie}{e.fabricante ? ` · ${e.fabricante}` : ""}{e.modelo ? ` ${e.modelo}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tipo de uso</label>
                <select style={inputStyle} value={tipoUso} onChange={(e) => setTipoUso(e.target.value)}>
                  <option value="" style={{ background: "#16181D" }}>—</option>
                  <option value="consumo" style={{ background: "#16181D" }}>Consumo</option>
                  <option value="generacion" style={{ background: "#16181D" }}>Generación</option>
                  <option value="supervisor" style={{ background: "#16181D" }}>Supervisor</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Fecha instalación</label>
                <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Lectura instalación</label>
                <input type="number" style={inputStyle} value={lectura} onChange={(e) => setLectura(e.target.value)} />
              </div>
              <div>
                <button onClick={instalar} disabled={saving || !sel}
                  style={{ ...btnPrimary, cursor: saving || !sel ? "default" : "pointer", opacity: saving || !sel ? 0.5 : 1 }}>
                  {saving ? "Instalando…" : "Instalar aquí"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
