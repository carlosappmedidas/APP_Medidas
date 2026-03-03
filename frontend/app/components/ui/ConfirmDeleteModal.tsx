// app/components/ui/ConfirmDeleteModal.tsx
"use client";

import React, { useEffect, useId } from "react";

type Props = {
  open: boolean;
  title?: string;
  description?: string;

  confirmText?: string; // default: "Borrar"
  cancelText?: string; // default: "Cancelar"

  loading?: boolean; // deshabilita botones y muestra estado
  danger?: boolean; // si true, usa estilo danger en confirmar

  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export default function ConfirmDeleteModal({
  open,
  title = "Confirmar borrado",
  description = "¿Seguro que quieres borrar? Esta acción no se puede deshacer.",
  confirmText = "Borrar",
  cancelText = "Cancelar",
  loading = false,
  danger = true,
  onConfirm,
  onClose,
}: Props) {
  const titleId = useId();
  const descId = useId();

  // ESC para cerrar (solo cuando está abierto)
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // solo cierra si el click fue en el backdrop, no dentro del modal
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onMouseDown={handleBackdropClick}
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="ui-card ui-card--border w-full max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <h4 id={titleId} className="ui-card-title">
            {title}
          </h4>
          <p id={descId} className="ui-card-subtitle">
            {description}
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="ui-btn ui-btn-outline"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={["ui-btn", danger ? "ui-btn-danger" : "ui-btn-primary"].join(" ")}
            onClick={() => void onConfirm()}
            disabled={loading}
          >
            {loading ? "Procesando..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}