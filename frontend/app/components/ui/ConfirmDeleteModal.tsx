// app/components/ui/ConfirmDeleteModal.tsx
"use client";

import React, { useEffect, useId } from "react";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  error?: string | null;

  confirmText?: string;
  cancelText?: string;
  loadingText?: string;

  loading?: boolean;
  danger?: boolean;

  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export default function ConfirmDeleteModal({
  open,
  title = "Confirmar borrado",
  description = "¿Seguro que quieres borrar? Esta acción no se puede deshacer.",
  error = null,
  confirmText = "Borrar",
  cancelText = "Cancelar",
  loadingText = "Procesando...",
  loading = false,
  danger = true,
  onConfirm,
  onClose,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (loading) return;
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
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

          {description ? (
            <p id={descId} className="ui-card-subtitle">
              {description}
            </p>
          ) : null}
        </div>

        {error ? (
          <div id={errorId} className="ui-alert ui-alert--danger mb-3">
            {error}
          </div>
        ) : null}

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
            {loading ? loadingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}