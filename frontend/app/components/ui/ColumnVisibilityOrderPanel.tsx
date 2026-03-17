// app/components/ui/ColumnVisibilityOrderPanel.tsx
"use client";

import type { DragEvent } from "react";

export type ColumnSettingsMeta = {
  id: string;
  label: string;
  group: string;
};

type Props = {
  show: boolean;
  onToggleShow: () => void;
  canEdit: boolean;
  order: string[];
  hiddenColumns: string[];
  columnsMeta: ColumnSettingsMeta[];
  onToggleVisible: (id: string) => void;
  onReset: () => void;
  onHideAll: () => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
};

export default function ColumnVisibilityOrderPanel({
  show,
  onToggleShow,
  canEdit,
  order,
  hiddenColumns,
  columnsMeta,
  onToggleVisible,
  onReset,
  onHideAll,
  onDragStart,
  onDrop,
  onDragOver,
}: Props) {
  if (!canEdit) return null;

  const third = Math.ceil(order.length / 3) || 1;
  const firstIds = order.slice(0, third);
  const secondIds = order.slice(third, 2 * third);
  const thirdIds = order.slice(2 * third);

  const renderAdjustItem = (id: string, index: number) => {
    const meta = columnsMeta.find((c) => c.id === id);
    const label = meta?.label ?? id;
    const group = meta?.group ?? "-";
    const isChecked = !hiddenColumns.includes(id);

    return (
      <div
        key={id}
        draggable={canEdit}
        onDragStart={() => canEdit && onDragStart(index)}
        onDrop={() => canEdit && onDrop(index)}
        className={[
          "flex items-center justify-between rounded-lg px-2 py-1.5",
          "border border-[var(--field-border)] bg-[var(--field-bg-soft)]",
          canEdit ? "cursor-move hover:opacity-90" : "opacity-80",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={isChecked}
            onChange={() => onToggleVisible(id)}
            onClick={(e) => e.stopPropagation()}
            disabled={!canEdit}
          />
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--field-border)] bg-[var(--field-bg)] text-[9px]">
            {index + 1}
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium">{label}</span>
            <span className="text-[9px] ui-muted">{group}</span>
          </div>
        </div>
        <span className="text-[13px] ui-muted">☰</span>
      </div>
    );
  };

  return (
    <div className="mb-4 rounded-xl border border-[var(--card-border)] bg-[var(--field-bg-soft)]">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h5 className="text-xs font-semibold">Ajustes de columnas</h5>
          <p className="mt-1 text-[10px] ui-muted">
            Marca las columnas que quieres ver y arrástralas para cambiar el orden.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onHideAll} className="ui-btn ui-btn-outline ui-btn-xs">
            Quitar todo
          </button>
          <button type="button" onClick={onReset} className="ui-btn ui-btn-outline ui-btn-xs">
            Reset
          </button>
          <button
            type="button"
            onClick={onToggleShow}
            className="ui-btn ui-btn-outline ui-btn-xs"
          >
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {show && (
        <div
          className="border-t border-[var(--card-border)] px-4 py-3 text-[11px]"
          onDragOver={onDragOver}
        >
          <div className="mb-2 text-[10px] ui-muted">☰ = arrastrar · ✓ = mostrar</div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              {firstIds.map((id, idx) => renderAdjustItem(id, idx))}
            </div>
            <div className="flex-1 space-y-1">
              {secondIds.map((id, idx) => renderAdjustItem(id, third + idx))}
            </div>
            <div className="flex-1 space-y-1">
              {thirdIds.map((id, idx) => renderAdjustItem(id, 2 * third + idx))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}