// app/stg/wsprime/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { API_BASE_URL } from "../../apiConfig";
import { useStgEmpresaId } from "../components/StgEmpresaSelector";
import WsPrimeConfigPanel from "./components/WsPrimeConfigPanel";
import { ConcentradorBasico, WsPrimeConfigOut } from "./components/WsPrimeTypes";

interface ListResponse {
  total: number;
  items: ConcentradorListItem[];
}

interface ConcentradorListItem extends ConcentradorBasico {
  // Backend ya devuelve estos campos en /stg/concentradores
  codigo_ct: string;
  numero_cups_asociados: number | null;
  ultimo_contacto: string | null;
}

// Mapa concentrador_id → config (null si no tiene)
type ConfigMap = Record<number, WsPrimeConfigOut | null>;

export default function StgWsPrimePage() {
  const empresaId = useStgEmpresaId();
  const [mounted, setMounted] = useState(false);

  const [concentradores, setConcentradores] = useState<ConcentradorListItem[] | null>(null);
  const [configMap, setConfigMap] = useState<ConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "configurados" | "sin_configurar">("todos");

  const [selectedConcentrador, setSelectedConcentrador] = useState<ConcentradorBasico | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Carga concentradores de la empresa
  useEffect(() => {
    if (!empresaId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    setConcentradores(null);
    setConfigMap({});

    fetch(`${API_BASE_URL}/stg/concentradores?empresa_id=${empresaId}&page_size=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ListResponse) => {
        setConcentradores(data.items);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [empresaId]);

  // Carga configs WS-PRIME de cada concentrador (en paralelo)
  const loadConfigs = useCallback(async () => {
    if (!concentradores || concentradores.length === 0) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setLoadingConfigs(true);
    const promises = concentradores.map(async (c) => {
      try {
        const r = await fetch(`${API_BASE_URL}/stg/wsprime/config/${c.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.status === 404) return [c.id, null] as const;
        if (!r.ok) return [c.id, null] as const;
        const data: WsPrimeConfigOut = await r.json();
        return [c.id, data] as const;
      } catch {
        return [c.id, null] as const;
      }
    });
    const results = await Promise.all(promises);
    const newMap: ConfigMap = {};
    results.forEach(([id, cfg]) => { newMap[id] = cfg; });
    setConfigMap(newMap);
    setLoadingConfigs(false);
  }, [concentradores]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Filtrar
  const concentradoresFiltrados = (concentradores || []).filter((c) => {
    // Filtro estado
    const cfg = configMap[c.id];
    if (filtroEstado === "configurados" && !cfg) return false;
    if (filtroEstado === "sin_configurar" && cfg) return false;

    // Filtro texto
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${c.codigo_ct} ${c.nombre ?? ""} ${c.fabricante ?? ""} ${c.modelo ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  if (!mounted) {
    // Evita hydration mismatch: el servidor no tiene localStorage,
    // el cliente sí — renderizamos un placeholder neutral hasta hidratar.
    return <div style={{ padding: 24 }} />;
  }

  if (!empresaId) {
    return (
      <div style={{ padding: 24, color: "rgba(241,239,232,0.5)" }}>
        Selecciona una empresa.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, padding: 24, height: "100%" }}>
      {/* Columna izquierda: lista de concentradores */}
      <div style={{ flex: selectedConcentrador ? 1 : 1, maxWidth: selectedConcentrador ? 480 : 900 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 8px" }}>
          WS-PRIME
        </h1>
        <p style={{ fontSize: 12, color: "rgba(241,239,232,0.5)", margin: "0 0 16px" }}>
          Configura el endpoint WS-PRIME por concentrador. Soporta MockAdapter (pruebas) y, próximamente, Circutor/ZIV/Sagemcom/Landis.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar (CT, nombre, fabricante)…"
            style={{ flex: 1, minWidth: 200, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13, outline: "none" }}
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
            style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", color: "var(--ds-text-primary, #F1EFE8)", fontSize: 13, outline: "none" }}
          >
            <option value="todos">Todos</option>
            <option value="configurados">Solo configurados</option>
            <option value="sin_configurar">Solo sin configurar</option>
          </select>
        </div>

        {error && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: "rgba(241,239,232,0.5)", padding: 20 }}>Cargando concentradores…</div>
        ) : concentradores && concentradores.length === 0 ? (
          <div style={{ padding: 20, color: "rgba(241,239,232,0.5)", textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
            No hay concentradores para esta empresa.
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "8px 12px", fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
              <div style={{ flex: 2 }}>Concentrador</div>
              <div style={{ flex: 1 }}>Estado WS-PRIME</div>
              <div style={{ width: 100, textAlign: "right" }}>Acción</div>
            </div>

            {concentradoresFiltrados.map((c) => {
              const cfg = configMap[c.id];
              const isSelected = selectedConcentrador?.id === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                    background: isSelected ? "rgba(175,169,236,0.08)" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedConcentrador(c)}
                >
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 13, color: "var(--ds-text-primary, #F1EFE8)", fontFamily: "monospace" }}>
                      {c.codigo_ct}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", marginTop: 2 }}>
                      {c.nombre || "(sin nombre)"} · {c.fabricante || "?"}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <WsPrimeStatusBadge cfg={cfg} loading={loadingConfigs} />
                  </div>
                  <div style={{ width: 100, textAlign: "right" }}>
                    <button
                      style={{ background: "rgba(83,74,183,0.22)", color: "#AFA9EC", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); setSelectedConcentrador(c); }}
                    >
                      {cfg ? "Ver/Editar" : "Configurar"}
                    </button>
                  </div>
                </div>
              );
            })}

            {concentradoresFiltrados.length === 0 && (
              <div style={{ padding: 20, color: "rgba(241,239,232,0.5)", textAlign: "center" }}>
                Ningún concentrador coincide con el filtro.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Columna derecha: panel de configuración (cuando hay concentrador seleccionado) */}
      {selectedConcentrador && (
        <div style={{ flex: 1, background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "auto" }}>
          <WsPrimeConfigPanel
            concentrador={selectedConcentrador}
            onClose={() => setSelectedConcentrador(null)}
            onConfigChanged={() => { loadConfigs(); }}
          />
        </div>
      )}
    </div>
  );
}

// ---- Badge de estado de la config ----
function WsPrimeStatusBadge({ cfg, loading }: { cfg: WsPrimeConfigOut | null | undefined; loading: boolean }) {
  if (loading && cfg === undefined) {
    return <span style={{ fontSize: 11, color: "rgba(241,239,232,0.4)" }}>…</span>;
  }
  if (!cfg) {
    return (
      <span style={{ display: "inline-block", background: "rgba(255,255,255,0.06)", color: "rgba(241,239,232,0.5)", fontSize: 11, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        sin configurar
      </span>
    );
  }
  if (!cfg.activo) {
    return (
      <span style={{ display: "inline-block", background: "rgba(239,159,39,0.2)", color: "#EF9F27", fontSize: 11, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        inactivo
      </span>
    );
  }
  if (cfg.ultima_conexion_ok === true) {
    return (
      <span style={{ display: "inline-block", background: "rgba(29,158,117,0.2)", color: "#1D9E75", fontSize: 11, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        ok · {cfg.fabricante}
      </span>
    );
  }
  if (cfg.ultima_conexion_ok === false) {
    return (
      <span style={{ display: "inline-block", background: "rgba(226,75,74,0.2)", color: "#E24B4A", fontSize: 11, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        error · {cfg.fabricante}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-block", background: "rgba(175,169,236,0.15)", color: "#AFA9EC", fontSize: 11, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      sin probar · {cfg.fabricante}
    </span>
  );
}