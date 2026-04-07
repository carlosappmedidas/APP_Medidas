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

// AGRECL genera ZIP con .bz2 por ID; el resto genera .bz2 directo
const TIPO_GENERA_ZIP: Record<ObjecionTipo, boolean> = {
  AOBAGRECL: true,
  OBJEINCL:  false,
  AOBCUPS:   false,
  AOBCIL:    false,
};

// AGRECL tiene botón individual por fila
const TIPO_GENERA_ONE: Record<ObjecionTipo, boolean> = {
  AOBAGRECL: true,
  OBJEINCL:  false,
  AOBCUPS:   false,
  AOBCIL:    false,
};

interface FicheroStats {
  nombre_fichero: string;
  created_at: string | null;
  total: number;
  pendientes: number;
  aceptadas: number;
  rechazadas: number;
}

interface ObjecionesSectionProps {
  token: string | null;
  currentUser: User | null;
}

interface TabConfig {
  id: ObjecionTipo;
  label: string;
  importLabel: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function BadgeAceptacion({ valor }: { valor: string }) {
  if (!valor) return <span className="ui-badge ui-badge--neutral">Pendiente</span>;
  if (valor === "S") return <span className="ui-badge ui-badge--ok">Aceptada</span>;
  return <span className="ui-badge ui-badge--err">Rechazada</span>;
}

function BadgeNum({ n, variant }: { n: number; variant: "neutral" | "ok" | "err" }) {
  if (n === 0) return <span className="ui-muted" style={{ fontSize: 11 }}>—</span>;
  return <span className={`ui-badge ui-badge--${variant}`}>{n}</span>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

async function downloadBlob(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename=(.+)/);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Iconos ───────────────────────────────────────────────────────────────────

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

const IconChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObjecionesSection({ token, currentUser }: ObjecionesSectionProps) {
  const [activeTab, setActiveTab]           = useState<ObjecionTipo>("AOBAGRECL");
  const [ficheiroActivo, setFicheroActivo]  = useState<string | null>(null);

  const [ficheros, setFicheros]             = useState<FicheroStats[]>([]);
  const [loadingFicheros, setLoadingFicheros] = useState(false);

  const [filas, setFilas]                   = useState<ObjecionRow[]>([]);
  const [loadingFilas, setLoadingFilas]     = useState(false);
  const [selectedIds, setSelectedIds]       = useState<Set<number>>(new Set());

  const [importing, setImporting]           = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [generatingOne, setGeneratingOne]   = useState<number | null>(null); // id de fila generando
  const [deleting, setDeleting]             = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const [empresas, setEmpresas]             = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId]           = useState<number | null>(null);

  const [modalOpen, setModalOpen]           = useState(false);
  const [filaIdx, setFilaIdx]               = useState<number | null>(null);
  const [saving, setSaving]                 = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tab    = TABS.find((t) => t.id === activeTab)!;
  const ruta   = TIPO_RUTA[activeTab];

  useEffect(() => {
    setFicheroActivo(null); setFicheros([]); setFilas([]);
    setSelectedIds(new Set()); setError(null);
  }, [activeTab]);

  useEffect(() => { setSelectedIds(new Set()); }, [ficheiroActivo]);

  // ── Cargar empresas ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    const fetch_ = async () => {
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
    void fetch_();
  }, [token, currentUser]);

  // ── Cargar ficheros ───────────────────────────────────────────────────────

  const cargarFicheros = useCallback(async () => {
    if (!token || !empresaId) return;
    setLoadingFicheros(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/ficheros?empresa_id=${empresaId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando ficheros");
    } finally {
      setLoadingFicheros(false);
    }
  }, [token, empresaId, ruta]);

  useEffect(() => {
    if (ficheiroActivo === null) cargarFicheros();
  }, [ficheiroActivo, cargarFicheros]);

  // ── Cargar filas de un fichero ────────────────────────────────────────────

  const cargarFilas = useCallback(async (nombre: string) => {
    if (!token || !empresaId) return;
    setLoadingFilas(true); setError(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), nombre_fichero: nombre });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}?${params}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando objeciones");
    } finally {
      setLoadingFilas(false);
    }
  }, [token, empresaId, ruta]);

  useEffect(() => {
    if (ficheiroActivo !== null) cargarFilas(ficheiroActivo);
  }, [ficheiroActivo, cargarFilas]);

  // ── Importar ──────────────────────────────────────────────────────────────

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !empresaId) return;
    setImporting(true); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/import?empresa_id=${empresaId}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Error ${res.status}`);
      }
      await cargarFicheros();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error importando fichero");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Generar fichero (nivel 1 — por fichero completo) ──────────────────────

  const handleGenerate = async (nombreFichero: string) => {
    if (!token || !empresaId) return;
    setGenerating(true); setError(null);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), nombre_fichero: nombreFichero });
      const endpoint = `${API_BASE_URL}/objeciones/${ruta}/generate?${params}`;
      const res = await fetch(endpoint, { method: "POST", headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const ext = TIPO_GENERA_ZIP[activeTab] ? ".zip" : ".bz2";
      await downloadBlob(res, `REOB${activeTab}${ext}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error generando fichero");
    } finally {
      setGenerating(false);
    }
  };

  // ── Generar individual (nivel 2 — por fila, solo AGRECL) ─────────────────

  const handleGenerateOne = async (row: ObjecionRow, nombreFichero: string) => {
    if (!token || !empresaId) return;
    const rowId = Number(row.id);
    setGeneratingOne(rowId); setError(null);
    try {
      const params = new URLSearchParams({
        empresa_id: String(empresaId),
        objecion_id: String(rowId),
        nombre_fichero: nombreFichero,
      });
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/generate-one?${params}`, {
        method: "POST", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await downloadBlob(res, `REOBAGRECL_${rowId}.bz2`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error generando fichero individual");
    } finally {
      setGeneratingOne(null);
    }
  };

  // ── Borrar fichero completo ───────────────────────────────────────────────

  const handleDeleteFichero = async (nombreFichero: string) => {
    if (!token) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/ficheros/${encodeURIComponent(nombreFichero)}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFicheros((prev) => prev.filter((f) => f.nombre_fichero !== nombreFichero));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando fichero");
    } finally {
      setDeleting(false);
    }
  };

  // ── Borrado individual ────────────────────────────────────────────────────

  const handleDeleteOne = async (id: number) => {
    if (!token) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/${id}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => Number(r.id) !== id));
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      if (ficheiroActivo) await cargarFicheros();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando");
    } finally {
      setDeleting(false);
    }
  };

  // ── Borrado en bloque ─────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!token || selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/bulk-delete`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setFilas((prev) => prev.filter((r) => !selectedIds.has(Number(r.id))));
      setSelectedIds(new Set());
      if (ficheiroActivo) await cargarFicheros();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error borrando");
    } finally {
      setDeleting(false);
    }
  };

  // ── Selección ─────────────────────────────────────────────────────────────

  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filas.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filas.map((r) => Number(r.id))));
  };

  const allSelected  = filas.length > 0 && selectedIds.size === filas.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filas.length;

  // ── Modal ─────────────────────────────────────────────────────────────────

  const filaSeleccionada = filaIdx !== null ? filas[filaIdx] : null;
  const modalConfig: ObjecionDetalleConfig = { tipo: activeTab, camposLectura: tab.camposLectura };

  const handleSave = async (respuesta: { aceptacion: string; motivo_no_aceptacion: string; comentario_respuesta: string }) => {
    if (filaIdx === null || !token) return;
    setSaving(true);
    const fila = filas[filaIdx];
    try {
      const res = await fetch(`${API_BASE_URL}/objeciones/${ruta}/${fila.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(respuesta),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const actualizada: ObjecionRow = await res.json();
      setFilas((prev) => { const c = [...prev]; c[filaIdx] = actualizada; return c; });
      if (ficheiroActivo) await cargarFicheros();
      setModalOpen(false); setFilaIdx(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const tabBar = (
    <div style={{ display: "flex", backgroundColor: "#1a2332", borderRadius: "6px 6px 0 0", paddingLeft: "8px", gap: "2px" }}>
      {TABS.map((t) => {
        const isActive = t.id === activeTab;
        const count = ficheros.reduce((s, f) => s + f.total, 0);
        return (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "9px 16px", fontSize: "11px", fontWeight: 500,
            color: isActive ? "white" : "rgba(255,255,255,0.4)",
            background: "transparent", border: "none",
            borderBottom: isActive ? "2px solid #60a5fa" : "2px solid transparent",
            cursor: "pointer", letterSpacing: "0.06em",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            {t.label}
            {isActive && count > 0 && (
              <span style={{ fontSize: "10px", background: "#60a5fa", color: "white", borderRadius: "10px", padding: "1px 6px", fontWeight: 600 }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const empresaSelector = empresas.length > 1 ? (
    <select className="ui-select" value={empresaId ?? ""} onChange={(e) => setEmpresaId(Number(e.target.value))} style={{ fontSize: "11px", padding: "4px 8px", minWidth: 140, height: 28 }}>
      {empresas.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombre || emp.codigo_ree || `Empresa ${emp.id}`}</option>)}
    </select>
  ) : null;

  // ── NIVEL 1: lista de ficheros ────────────────────────────────────────────

  if (ficheiroActivo === null) {
    return (
      <section className="ui-card text-sm">
        <input ref={fileInputRef} type="file" accept=".0,.csv,.txt" style={{ display: "none" }} onChange={handleFileChange} />
        {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}
        {tabBar}
        <div className="flex items-center justify-between gap-2 mb-3" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none" }}>
          <div className="flex items-center gap-2">
            {empresaSelector}
            <button type="button" onClick={handleImportClick} disabled={importing || !empresaId} className="ui-btn ui-btn-outline ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <IconFolder />
              {importing ? "Importando..." : tab.importLabel}
            </button>
          </div>
          <span className="ui-muted" style={{ fontSize: "11px" }}>
            {loadingFicheros ? "Cargando..." : `${ficheros.length} fichero${ficheros.length !== 1 ? "s" : ""}`}
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
                <th className="ui-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingFicheros ? (
                <tr className="ui-tr"><td colSpan={8} className="ui-td text-center ui-muted" style={{ padding: "48px 16px" }}>Cargando...</td></tr>
              ) : ficheros.length === 0 ? (
                <tr className="ui-tr"><td colSpan={8} className="ui-td text-center ui-muted" style={{ padding: "48px 16px" }}>
                  Sin ficheros importados · Usa &quot;{tab.importLabel}&quot; para cargar
                </td></tr>
              ) : (
                ficheros.map((f) => (
                  <tr key={f.nombre_fichero} className="ui-tr" style={{ cursor: "pointer" }} onClick={() => setFicheroActivo(f.nombre_fichero)}>
                    <td className="ui-td" style={{ width: 28, color: "var(--text-muted)", textAlign: "center" }}><IconChevron /></td>
                    <td className="ui-td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "10px" }}>{f.nombre_fichero}</td>
                    <td className="ui-td ui-muted">{fmtDate(f.created_at)}</td>
                    <td className="ui-td" style={{ textAlign: "center", fontWeight: 500 }}>{f.total}</td>
                    <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.pendientes} variant="neutral" /></td>
                    <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.aceptadas} variant="ok" /></td>
                    <td className="ui-td" style={{ textAlign: "center" }}><BadgeNum n={f.rechazadas} variant="err" /></td>
                    <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleGenerate(f.nombre_fichero)}
                          disabled={generating || (f.aceptadas + f.rechazadas) === 0}
                          className="ui-btn ui-btn-outline ui-btn-xs"
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}
                          title={TIPO_GENERA_ZIP[activeTab] ? "Genera ZIP con un .bz2 por ID (solo con respuesta)" : "Genera fichero REOB"}
                        >
                          <IconDownload />
                          {TIPO_GENERA_ZIP[activeTab] ? "Generar ZIP" : "Generar REOB"}
                        </button>
                        <button type="button" onClick={() => handleDeleteFichero(f.nombre_fichero)} disabled={deleting} className="ui-btn ui-btn-danger ui-btn-xs" style={{ padding: "4px 7px", display: "flex", alignItems: "center" }}>
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  // ── NIVEL 2: objeciones del fichero ───────────────────────────────────────

  const generaOne = TIPO_GENERA_ONE[activeTab];

  return (
    <section className="ui-card text-sm">
      <input ref={fileInputRef} type="file" accept=".0,.csv,.txt" style={{ display: "none" }} onChange={handleFileChange} />
      {error && <div className="ui-alert ui-alert--danger mb-3">{error}</div>}
      {tabBar}

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "none", borderBottom: "none" }}>
        <button type="button" onClick={() => setFicheroActivo(null)} className="ui-btn ui-btn-outline ui-btn-xs">← Volver</button>
        <span className="ui-muted" style={{ fontSize: 11 }}>{activeTab} ›</span>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--text)" }}>{ficheiroActivo}</span>
      </div>

      {/* Toolbar nivel 2 */}
      <div className="flex items-center justify-between gap-2 mb-3" style={{ padding: "8px 10px", background: "var(--field-bg-soft)", border: "1px solid var(--card-border)", borderTop: "0.5px solid var(--card-border)" }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleGenerate(ficheiroActivo!)}
            disabled={generating || filas.length === 0}
            className="ui-btn ui-btn-outline ui-btn-xs"
            style={{ display: "flex", alignItems: "center", gap: 5 }}
            title={TIPO_GENERA_ZIP[activeTab] ? "Genera ZIP con un .bz2 por ID (solo con respuesta S o N)" : "Genera fichero REOB"}
          >
            <IconDownload />
            {generating
              ? "Generando..."
              : TIPO_GENERA_ZIP[activeTab]
              ? "Generar ZIP (por ID)"
              : `Generar REOB`}
          </button>
          {selectedIds.size > 0 && (
            <button type="button" onClick={handleBulkDelete} disabled={deleting} className="ui-btn ui-btn-danger ui-btn-xs" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <IconTrash />
              {deleting ? "Borrando..." : `Borrar ${selectedIds.size} seleccionada${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
        <span className="ui-muted" style={{ fontSize: "11px" }}>
          {loadingFilas ? "Cargando..." : `${filas.length} objeción${filas.length !== 1 ? "es" : ""}`}
        </span>
      </div>

      {/* Tabla */}
      <div className="ui-table-wrap">
        <table className="ui-table text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="ui-thead">
            <tr>
              <th className="ui-th" style={{ width: 36, padding: "8px 10px", textAlign: "center" }}>
                <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }} onChange={toggleSelectAll} style={{ cursor: "pointer", accentColor: "#1a2332" }} />
              </th>
              {tab.columns.map((col) => (
                <th key={col.id} className={["ui-th", col.align === "right" ? "ui-th-right" : ""].join(" ")} style={{ whiteSpace: "nowrap" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingFilas ? (
              <tr className="ui-tr"><td colSpan={tab.columns.length + 1} className="ui-td text-center ui-muted" style={{ padding: "48px 16px" }}>Cargando...</td></tr>
            ) : filas.length === 0 ? (
              <tr className="ui-tr"><td colSpan={tab.columns.length + 1} className="ui-td text-center ui-muted" style={{ padding: "48px 16px" }}>Sin objeciones en este fichero</td></tr>
            ) : (
              filas.map((row, ri) => {
                const rowId = Number(row.id);
                const isSel = selectedIds.has(rowId);
                const isGeneratingThis = generatingOne === rowId;
                const tieneRespuesta = row.aceptacion === "S" || row.aceptacion === "N";
                return (
                  <tr key={ri} className="ui-tr" style={{ background: isSel ? "var(--nav-item-hover)" : undefined }}>
                    <td className="ui-td" style={{ width: 36, padding: "6px 10px", textAlign: "center" }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(rowId)} style={{ cursor: "pointer", accentColor: "#1a2332" }} />
                    </td>
                    {tab.columns.map((col) => {
                      if (col.id === "_acciones") return (
                        <td key="_acciones" className="ui-td" style={{ width: generaOne ? 88 : 64, padding: "6px 8px" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button type="button" onClick={() => { setFilaIdx(ri); setModalOpen(true); }} className="ui-btn ui-btn-ghost ui-btn-xs" title="Editar respuesta" style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}>
                              <IconEdit />
                            </button>
                            {/* Botón generar individual — solo AGRECL y solo si tiene respuesta */}
                            {generaOne && (
                              <button
                                type="button"
                                onClick={() => handleGenerateOne(row, ficheiroActivo!)}
                                disabled={isGeneratingThis || !tieneRespuesta}
                                className="ui-btn ui-btn-outline ui-btn-xs"
                                title={tieneRespuesta ? "Generar REOB de esta objeción" : "Debe tener respuesta (S o N)"}
                                style={{ padding: "4px 6px", display: "flex", alignItems: "center", opacity: tieneRespuesta ? 1 : 0.4 }}
                              >
                                {isGeneratingThis ? "…" : <IconDownload />}
                              </button>
                            )}
                            <button type="button" onClick={() => handleDeleteOne(rowId)} disabled={deleting} className="ui-btn ui-btn-danger ui-btn-xs" title="Borrar" style={{ padding: "4px 6px", display: "flex", alignItems: "center" }}>
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      );
                      if (col.id === "aceptacion") return (
                        <td key={col.id} className="ui-td" style={{ whiteSpace: "nowrap" }}>
                          <BadgeAceptacion valor={row.aceptacion ?? ""} />
                        </td>
                      );
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

      <ObjecionDetalleModal open={modalOpen} onClose={() => { setModalOpen(false); setFilaIdx(null); }} onSave={handleSave} config={modalConfig} fila={filaSeleccionada} saving={saving} />
    </section>
  );
}
