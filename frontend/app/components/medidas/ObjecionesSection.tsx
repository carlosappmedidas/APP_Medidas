"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { User } from "../../types";
import ObjecionDetalleModal from "./ObjecionDetalleModal";
import type { ObjecionRow, ObjecionDetalleConfig } from "./ObjecionDetalleModal";
import { API_BASE_URL, getAuthHeaders } from "../../apiConfig";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ObjecionTipo = "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL";

const TIPO_RUTA: Record<ObjecionTipo, string> = {
  AOBAGRECL: "agrecl",
  OBJEINCL:  "incl",
  AOBCUPS:   "cups",
  AOBCIL:    "cil",
};

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

interface TabConfig {
  id: ObjecionTipo;
  label: string;
  importLabel: string;
  generateLabel: string;
  columns: { id: string; label: string; align: "left" | "right" }[];
  camposLectura: { id: string; label: string }[];
}

type EmpresaOption = { id: number; nombre: string; codigo_ree: string | null };

// ─── Configuración de tabs ────────────────────────────────────────────────────

const TABS: TabConfig[] = [
  {
    id: "AOBAGRECL",
    label: "AOBAGRECL",
    importLabel: "Importar AOBAGRECL",
    generateLabel: "Generar REOBAGRECL",
    columns: [
      { id: "_acciones",        label: "",                       align: "left"  },
      { id: "id_objecion",      label: "ID objeción",            align: "left"  },
      { id: "distribuidor",     label: "Distribuidor",           align: "left"  },
      { id: "comercializador",  label: "Comercializador",        align: "left"  },
      { id: "nivel_tension",    label: "Nivel tensión",          align: "left"  },
      { id: "tarifa_acceso",    label: "Tarifa de acceso",       align: "left"  },
      { id: "disc_horaria",     label: "Disc. horaria",          align: "left"  },
      { id: "tipo_punto",       label: "Tipo punto",             align: "left"  },
      { id: "provincia",        label: "Provincia",              align: "left"  },
      { id: "tipo_demanda",     label: "Tipo demanda",           align: "left"  },
      { id: "periodo",          label: "Periodo",                align: "left"  },
      { id: "motivo",           label: "Motivo objeción",        align: "left"  },
      { id: "magnitud",         label: "Magnitud",               align: "left"  },
      { id: "e_publicada",      label: "E. publicada (kWh)",     align: "right" },
      { id: "e_propuesta",      label: "E. propuesta (kWh)",     align: "right" },
      { id: "comentario_emisor",label: "Comentario emisor",      align: "left"  },
      { id: "autoobjecion",     label: "Autoobjeción",           align: "left"  },
      { id: "aceptacion",       label: "Aceptada",               align: "left"  },
    ],
    camposLectura: [
      { id: "id_objecion",      label: "ID objeción"               },
      { id: "distribuidor",     label: "Distribuidor"              },
      { id: "comercializador",  label: "Comercializador"           },
      { id: "nivel_tension",    label: "Nivel de tensión"          },
      { id: "tarifa_acceso",    label: "Tarifa de acceso"          },
      { id: "disc_horaria",     label: "Discriminación horaria"    },
      { id: "tipo_punto",       label: "Tipo de punto"             },
      { id: "provincia",        label: "Provincia"                 },
      { id: "tipo_demanda",     label: "Tipo de demanda"           },
      { id: "periodo",          label: "Periodo"                   },
      { id: "motivo",           label: "Motivo de objeción"        },
      { id: "magnitud",         label: "Magnitud"                  },
      { id: "e_publicada",      label: "E. activa publicada (kWh)" },
      { id: "e_propuesta",      label: "E. activa propuesta (kWh)"},
      { id: "comentario_emisor",label: "Comentario del emisor"     },
      { id: "autoobjecion",     label: "Objeción a autoobjeción"   },
    ],
  },
  {
    id: "OBJEINCL",
    label: "OBJEINCL",
    importLabel: "Importar OBJEINCL",
    generateLabel: "Generar REOBJEINCL",
    columns: [
      { id: "_acciones",        label: "",                          align: "left"  },
      { id: "cups",             label: "CUPS",                      align: "left"  },
      { id: "periodo",          label: "Periodo",                   align: "left"  },
      { id: "motivo",           label: "Motivo",                    align: "left"  },
      { id: "ae_publicada",     label: "AE publicada (kWh)",        align: "right" },
      { id: "ae_propuesta",     label: "AE propuesta (kWh)",        align: "right" },
      { id: "as_publicada",     label: "AS publicada (kWh)",        align: "right" },
      { id: "as_propuesta",     label: "AS propuesta (kWh)",        align: "right" },
      { id: "comentario_emisor",label: "Comentario",                align: "left"  },
      { id: "autoobjecion",     label: "Autoobjeción",              align: "left"  },
      { id: "aceptacion",       label: "Aceptada",                  align: "left"  },
    ],
    camposLectura: [
      { id: "cups",             label: "CUPS"                       },
      { id: "periodo",          label: "Periodo de la objeción"     },
      { id: "motivo",           label: "Motivo"                     },
      { id: "ae_publicada",     label: "AE publicada (kWh)"         },
      { id: "ae_propuesta",     label: "AE propuesta (kWh)"         },
      { id: "as_publicada",     label: "AS publicada (kWh)"         },
      { id: "as_propuesta",     label: "AS propuesta (kWh)"         },
      { id: "comentario_emisor",label: "Comentario"                 },
      { id: "autoobjecion",     label: "Objeción a autoobjeción"    },
    ],
  },
  {
    id: "AOBCUPS",
    label: "AOBCUPS",
    importLabel: "Importar AOBCUPS",
    generateLabel: "Generar REOBCUPS",
    columns: [
      { id: "_acciones",           label: "",                          align: "left"  },
      { id: "id_objecion",         label: "ID objeción",               align: "left"  },
      { id: "cups",                label: "CUPS",                      align: "left"  },
      { id: "periodo",             label: "Periodo",                   align: "left"  },
      { id: "motivo",              label: "Motivo",                    align: "left"  },
      { id: "e_publicada",         label: "E. publicada (kWh)",        align: "right" },
      { id: "e_propuesta",         label: "E. propuesta (kWh)",        align: "right" },
      { id: "comentario_emisor",   label: "Comentario emisor",         align: "left"  },
      { id: "autoobjecion",        label: "Autoobjeción (S/N)",        align: "left"  },
      { id: "aceptacion",          label: "Aceptada",                  align: "left"  },
      { id: "motivo_no_aceptacion",label: "Motivo no acept.",          align: "left"  },
      { id: "comentario_respuesta",label: "Comentario respuesta",      align: "left"  },
      { id: "magnitud",            label: "Magnitud",                  align: "left"  },
    ],
    camposLectura: [
      { id: "id_objecion",       label: "ID objeción"                    },
      { id: "cups",              label: "CUPS"                           },
      { id: "periodo",           label: "Periodo de cierre objetado"     },
      { id: "motivo",            label: "Motivo de objeción"             },
      { id: "e_publicada",       label: "E. activa publicada (kWh)"      },
      { id: "e_propuesta",       label: "E. activa propuesta (kWh)"      },
      { id: "comentario_emisor", label: "Comentario del emisor"          },
      { id: "autoobjecion",      label: "Objeción a autoobjeción (S/N)"  },
      { id: "magnitud",          label: "Magnitud"                       },
    ],
  },
  {
    id: "AOBCIL",
    label: "AOBCIL",
    importLabel: "Importar AOBCIL",
    generateLabel: "Generar REOBCIL",
    columns: [
      { id: "_acciones",    label: "",                              align: "left"  },
      { id: "id_objecion",  label: "ID objeción",                  align: "left"  },
      { id: "cil",          label: "CIL",                          align: "left"  },
      { id: "periodo",      label: "Periodo",                      align: "left"  },
      { id: "motivo",       label: "Motivo",                       align: "left"  },
      { id: "eas_publicada",label: "E. act. sal. pub. (kWh)",      align: "right" },
      { id: "eas_propuesta",label: "E. act. sal. prop. (kWh)",     align: "right" },
      { id: "eq2_publicada",label: "E. react. Q2 pub. (kVArh)",   align: "right" },
      { id: "eq2_propuesta",label: "E. react. Q2 prop. (kVArh)",  align: "right" },
      { id: "eq3_publicada",label: "E. react. Q3 pub. (kVArh)",   align: "right" },
      { id: "eq3_propuesta",label: "E. react. Q3 prop. (kVArh)",  align: "right" },
      { id: "comentario_emisor",label: "Comentario emisor",        align: "left"  },
      { id: "autoobjecion", label: "Autoobjeción",                 align: "left"  },
      { id: "aceptacion",   label: "Aceptada",                     align: "left"  },
    ],
    camposLectura: [
      { id: "id_objecion",   label: "ID objeción"                    },
      { id: "cil",           label: "CIL"                            },
      { id: "periodo",       label: "Periodo de cierre objetado"     },
      { id: "motivo",        label: "Motivo de objeción"             },
      { id: "eas_publicada", label: "E. activa saliente pub. (kWh)"  },
      { id: "eas_propuesta", label: "E. activa saliente prop. (kWh)" },
      { id: "eq2_publicada", label: "E. reactiva Q2 pub. (kVArh)"   },
      { id: "eq2_propuesta", label: "E. reactiva Q2 prop. (kVArh)"  },
      { id: "eq3_publicada", label: "E. reactiva Q3 pub. (kVArh)"   },
      { id: "eq3_propuesta", label: "E. reactiva Q3 prop. (kVArh)"  },
      { id: "comentario_emisor",label: "Comentario del emisor"       },
      { id: "autoobjecion",  label: "Objeción a autoobjeción"        },
    ],
  },
];

// ─── Badge de aceptación ──────────────────────────────────────────────────────

function BadgeAceptacion({ valor }: { valor: string }) {
  if (!valor) return <span className="ui-badge ui-badge--neutral">Pendiente</span>;
  if (valor === "S") return <span className="ui-badge ui-badge--ok">Aceptada</span>;
  return <span className="ui-badge ui-badge--err">Rechazada</span>;
}

// ─── Iconos SVG ───────────────────────────────────────────────────────────────

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconEdit = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjecionesSection({ token, currentUser }: ObjecionesSectionProps) {
  const [activeTab, setActiveTab]   = useState<ObjecionTipo>("AOBAGRECL");
  const [filas, setFilas]           = useState<Record<ObjecionTipo, ObjecionRow[]>>({
    AOBAGRECL: [], OBJEINCL: [], AOBCUPS: [], AOBCIL: [],
  });
  const [loading, setLoading]       = useState(false);
  const [importing, setImporting]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Selector de empresa
  const [empresas, setEmpresas]   = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId] = useState<number | null>(null);

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [filaIdx, setFilaIdx]     = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const tab       = TABS.find((t) => t.id === activeTab)!;
  const ruta      = TIPO_RUTA[activeTab];
  const rows      = filas[activeTab];
  const totalRows = rows.length;
  const selectedCount = selectedIds.size;

  // Limpiar selección al cambiar tab
  useEffect(() => { setSelectedIds(new Set()); }, [activeTab]);

  // ── Cargar empresas ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    const fetchEmpresas = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/empresas/`, { headers: getAuthHeaders(token) });
        if (!res.ok) return;
        const data: EmpresaOption[] = await res.json();
        setEmpresas(data);
        const permitidas = currentUser?.empresa_ids_permitidas ?? [];
        if (permitidas.length > 0) setEmpresaId(permitidas[0]);
        else if (data.length > 0) setEmpresaId(data[0].id);
      } catch { /* silencioso */ }
    };
    void fetchEmpresas();
  }, [token, currentUser]);

  // ── Cargar datos ──────────────────────────────────────────────────────────

  const cargarDatos = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: ObjecionRow[] = await res.json();
      setFilas((prev) => ({ ...prev, [activeTab]: data }));
      setSelectedIds(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando objeciones");
    } finally {
      setLoading(false);
    }
  }, [token, empresaId, ruta, activeTab]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ── Importar ──────────────────────────────────────────────────────────────

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !empresaId) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/import?empresa_id=${empresaId}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      if (!res.ok) throw new Error(`Error ${res.status} al importar`);
      await cargarDatos();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error importando fichero");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Generar ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!token || !empresaId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/generate?empresa_id=${empresaId}`, {
        method: "POST", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status} al generar fichero`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=(.+)/);
      const filename = match ? match[1] : `REOB${activeTab}.bz2`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error generando fichero");
    } finally {
      setGenerating(false);
    }
  };

  // ── Borrado individual ────────────────────────────────────────────────────

  const handleDeleteOne = async (id: number) => {
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/${id}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status} al borrar`);
      setFilas((prev) => ({ ...prev, [activeTab]: prev[activeTab].filter((r) => Number(r.id) !== id) }));
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando objeción");
    } finally {
      setDeleting(false);
    }
  };

  // ── Borrado en bloque ─────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!token || selectedIds.size === 0) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/bulk-delete`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error(`Error ${res.status} al borrar`);
      setFilas((prev) => ({ ...prev, [activeTab]: prev[activeTab].filter((r) => !selectedIds.has(Number(r.id))) }));
      setSelectedIds(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando objeciones");
    } finally {
      setDeleting(false);
    }
  };

  // ── Selección ─────────────────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => Number(r.id))));
    }
  };

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < rows.length;

  // ── Modal ─────────────────────────────────────────────────────────────────

  const filaSeleccionada = filaIdx !== null ? rows[filaIdx] : null;
  const modalConfig: ObjecionDetalleConfig = { tipo: activeTab, camposLectura: tab.camposLectura };

  const handleOpenModal  = (idx: number) => { setFilaIdx(idx); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setFilaIdx(null); };

  const handleSave = async (respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string }) => {
    if (filaIdx === null || !token) return;
    setSaving(true);
    const fila = rows[filaIdx];
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/${fila.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(respuesta),
      });
      if (!res.ok) throw new Error(`Error ${res.status} al guardar`);
      const actualizada: ObjecionRow = await res.json();
      setFilas((prev) => {
        const copia = [...prev[activeTab]];
        copia[filaIdx] = actualizada;
        return { ...prev, [activeTab]: copia };
      });
      setModalOpen(false);
      setFilaIdx(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error guardando respuesta");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="ui-card text-sm">

      <input ref={fileInputRef} type="file" accept=".0,.csv,.txt" style={{ display: "none" }} onChange={handleFileChange} />

      {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}

      {/* ── Barra de tabs ── */}
      <div style={{ display: "flex", backgroundColor: "#1a2332", borderRadius: "6px 6px 0 0", paddingLeft: "8px", gap: "2px" }}>
        {TABS.map((t) => {
          const isActive = t.id === activeTab;
          const count    = filas[t.id].length;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "9px 16px", fontSize: "11px", fontWeight: 500,
              color: isActive ? "white" : "rgba(255,255,255,0.4)",
              background: "transparent", border: "none",
              borderBottom: isActive ? "2px solid #60a5fa" : "2px solid transparent",
              cursor: "pointer", letterSpacing: "0.06em",
              display: "flex", alignItems: "center", gap: "6px", transition: "color 0.15s",
            }}>
              {t.label}
              {count > 0 && (
                <span style={{ fontSize: "10px", background: isActive ? "#60a5fa" : "rgba(255,255,255,0.15)", color: "white", borderRadius: "10px", padding: "1px 6px", fontWeight: 600 }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-2 mb-3" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none" }}>
        <div className="flex items-center gap-2">

          {/* Selector empresa */}
          {empresas.length > 1 && (
            <select className="ui-select" value={empresaId ?? ""} onChange={(e) => setEmpresaId(Number(e.target.value))} style={{ fontSize: "11px", padding: "4px 8px", minWidth: 140, height: 28 }}>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>
              ))}
            </select>
          )}

          <button type="button" onClick={handleImportClick} disabled={importing || !empresaId} className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IconFolder />
            {importing ? "Importando..." : tab.importLabel}
          </button>

          <button type="button" onClick={handleGenerate} disabled={generating || totalRows === 0 || !empresaId} className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IconDownload />
            {generating ? "Generando..." : tab.generateLabel}
          </button>

          {/* Botón borrar selección */}
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={deleting}
              className="ui-btn ui-btn-danger ui-btn-xs"
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <IconTrash />
              {deleting ? "Borrando..." : `Borrar ${selectedCount} seleccionada${selectedCount !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>

        <span className="ui-muted" style={{ fontSize: "11px" }}>
          {loading ? "Cargando..." : totalRows === 0 ? "Sin registros" : `${totalRows} registro${totalRows !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* ── Tabla ── */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="ui-thead">
            <tr>
              {/* Checkbox seleccionar todo */}
              <th className="ui-th" style={{ width: 36, padding: "8px 10px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  style={{ cursor: "pointer", accentColor: "#1a2332" }}
                />
              </th>
              {tab.columns.map((col) => (
                <th key={col.id} className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")} style={{ whiteSpace: "nowrap" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="ui-tr">
                <td colSpan={tab.columns.length + 1} className="ui-td text-center ui-muted" style={{ padding: "48px 16px" }}>Cargando...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="ui-tr">
                <td colSpan={tab.columns.length + 1} className="ui-td text-center ui-muted" style={{ padding: "48px 16px" }}>
                  Sin objeciones cargadas · Usa &quot;{tab.importLabel}&quot; para cargar un fichero
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => {
                const rowId = Number(row.id);
                const isSelected = selectedIds.has(rowId);
                return (
                  <tr key={ri} className="ui-tr" style={{ background: isSelected ? "var(--nav-item-hover)" : undefined }}>
                    {/* Checkbox fila */}
                    <td className="ui-td" style={{ width: 36, padding: "6px 10px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(rowId)}
                        style={{ cursor: "pointer", accentColor: "#1a2332" }}
                      />
                    </td>

                    {tab.columns.map((col) => {
                      if (col.id === "_acciones") {
                        return (
                          <td key="_acciones" className="ui-td" style={{ width: 64, padding: "6px 8px" }}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button type="button" onClick={() => handleOpenModal(ri)} className="ui-btn ui-btn-ghost ui-btn-xs" title="Editar respuesta" style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}>
                                <IconEdit />
                              </button>
                              <button type="button" onClick={() => handleDeleteOne(rowId)} disabled={deleting} className="ui-btn ui-btn-danger ui-btn-xs" title="Borrar" style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}>
                                <IconTrash />
                              </button>
                            </div>
                          </td>
                        );
                      }
                      if (col.id === "aceptacion") {
                        return (
                          <td key={col.id} className="ui-td" style={{ whiteSpace: "nowrap" }}>
                            <BadgeAceptacion valor={row.aceptacion ?? ""} />
                          </td>
                        );
                      }
                      return (
                        <td key={col.id} className={["ui-td", col.align === "right" ? "ui-td-right" : ""].join(" ")} style={{ whiteSpace: "nowrap" }}>
                          {row[col.id] || <span className="ui-muted">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal detalle ── */}
      <ObjecionDetalleModal open={modalOpen} onClose={handleCloseModal} onSave={handleSave} config={modalConfig} fila={filaSeleccionada} saving={saving} />
    </section>
  );
}
