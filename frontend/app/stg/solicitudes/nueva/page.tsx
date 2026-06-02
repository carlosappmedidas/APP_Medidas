// app/stg/solicitudes/nueva/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../../../apiConfig";
import { useStgEmpresaId } from "../../components/StgEmpresaSelector";

export default function StgNuevaSolicitudPage() {
  const router = useRouter();
  const empresaId = useStgEmpresaId();

  const [ambito, setAmbito] = useState<"cups" | "concentrador">("cups");
  const [cupsCodigo, setCupsCodigo] = useState("");
  const [concentradorCodigoCt, setConcentradorCodigoCt] = useState("");
  const [tipoFichero, setTipoFichero] = useState<"S02" | "S04" | "S05" | "S09">("S02");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [prioridad, setPrioridad] = useState<"normal" | "alta" | "urgente">("normal");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaId) {
      setError("Selecciona una empresa antes de enviar.");
      return;
    }
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setEnviando(true);
    setError(null);

    // Resolver cups_id o concentrador_id según el ámbito
    // De momento se manda solo el código y el backend lo resolverá en
    // próximos paquetes; aquí asumimos que el usuario teclea el código
    // y el backend lo asocia. En Paquete 2 añadiremos autocomplete real.
    const payload: any = {
      empresa_id: empresaId,
      tipo_fichero: tipoFichero,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      prioridad,
    };

    // Nota: en el paquete 1 no resolvemos id desde código; mandamos null.
    // El usuario tecleará pero la solicitud se registra sin asociar todavía.
    // En el paquete 2 metemos autocomplete que devuelve el id directamente.
    payload.cups_id = null;
    payload.concentrador_id = null;

    try {
      const r = await fetch(`${API_BASE_URL}/stg/solicitudes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt}`);
      }
      router.push("/stg/solicitudes");
    } catch (e) {
      setError(String(e));
    } finally {
      setEnviando(false);
    }
  };

  if (!empresaId) {
    return <div style={{ color: "rgba(241,239,232,0.5)" }}>Selecciona una empresa.</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 24px" }}>
        Nueva solicitud de fichero
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: 24,
        }}
      >
        <Field label="Ámbito de la petición">
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 4, width: "fit-content" }}>
            <ToggleOpt label="CUPS individual" active={ambito === "cups"} onClick={() => setAmbito("cups")} />
            <ToggleOpt label="Concentrador entero" active={ambito === "concentrador"} onClick={() => setAmbito("concentrador")} />
          </div>
        </Field>

        {ambito === "cups" ? (
          <Field label="Código CUPS">
            <Input value={cupsCodigo} onChange={setCupsCodigo} placeholder="ES0336000…" />
          </Field>
        ) : (
          <Field label="Código del CT">
            <Input value={concentradorCodigoCt} onChange={setConcentradorCodigoCt} placeholder="CT-0118" />
          </Field>
        )}

        <Field label="Tipo de fichero">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <TipoCard tipo="S02" nombre="S02" desc="Curva horaria" active={tipoFichero === "S02"} onClick={() => setTipoFichero("S02")} />
            <TipoCard tipo="S04" nombre="S04" desc="Lecturas diarias" active={tipoFichero === "S04"} onClick={() => setTipoFichero("S04")} />
            <TipoCard tipo="S05" nombre="S05" desc="Lecturas absolutas" active={tipoFichero === "S05"} onClick={() => setTipoFichero("S05")} />
            <TipoCard tipo="S09" nombre="S09" desc="Eventos" active={tipoFichero === "S09"} onClick={() => setTipoFichero("S09")} />
          </div>
        </Field>

        <Field label="Rango de fechas">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input type="date" value={fechaDesde} onChange={setFechaDesde} />
            <Input type="date" value={fechaHasta} onChange={setFechaHasta} />
          </div>
        </Field>

        <Field label="Prioridad">
          <div style={{ display: "flex", gap: 6 }}>
            {(["normal", "alta", "urgente"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrioridad(p)}
                style={{
                  flex: 1,
                  background: prioridad === p ? "rgba(239,159,39,0.2)" : "rgba(255,255,255,0.04)",
                  color: prioridad === p ? "#EF9F27" : "rgba(241,239,232,0.7)",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  padding: "8px",
                  fontSize: 12,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.4)", color: "#E24B4A", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, paddingTop: 16, borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
          <button
            type="button"
            onClick={() => router.push("/stg/solicitudes")}
            style={{ background: "transparent", color: "rgba(241,239,232,0.7)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            style={{ background: "rgba(83,74,183,0.22)", color: "#AFA9EC", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: enviando ? "wait" : "pointer", opacity: enviando ? 0.6 : 1 }}
          >
            {enviando ? "Enviando…" : "Enviar al STG"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, color: "rgba(241,239,232,0.5)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 6,
        padding: "8px 12px",
        color: "var(--ds-text-primary, #F1EFE8)",
        fontSize: 13,
        outline: "none",
      }}
    />
  );
}

function ToggleOpt({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: active ? "var(--ds-text-primary, #F1EFE8)" : "rgba(241,239,232,0.7)",
        border: "none",
        borderRadius: 4,
        padding: "5px 12px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function TipoCard({ tipo, nombre, desc, active, onClick }: { tipo: string; nombre: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(55,138,221,0.15)" : "rgba(255,255,255,0.04)",
        border: active ? "2px solid #378ADD" : "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 6,
        padding: active ? "9px 11px" : "10px 12px",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ds-text-primary, #F1EFE8)" }}>{nombre}</div>
      <div style={{ fontSize: 11, color: "rgba(241,239,232,0.5)", marginTop: 2 }}>{desc}</div>
    </button>
  );
}
