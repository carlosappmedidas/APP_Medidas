"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectDropdownProps = {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
};

export default function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  disabled = false,
  placeholder = "Todas",
  compact = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = useMemo(() => {
    const selectedSet = new Set(selectedValues);
    return options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);
  }, [options, selectedValues]);

  const buttonText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length <= 2) return selectedLabels.join(", ");
    return `${selectedValues.length} seleccionados`;
  }, [placeholder, selectedLabels, selectedValues.length]);

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const allSelected = options.length > 0 && selectedValues.length === options.length;

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map((o) => o.value));
  };

  const buttonStyle = compact
    ? {
        minHeight: 28,
        height: 28,
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 8,
        paddingRight: 8,
        lineHeight: 1.05,
      }
    : {
        minHeight: 30,
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 8,
        paddingRight: 8,
        lineHeight: 1.15,
      };

  return (
    <div className="relative" ref={rootRef}>
      <label className="ui-label">{label}</label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="ui-select flex w-full items-center justify-between text-left text-[10px]"
        style={buttonStyle}
      >
        <span className="truncate">{buttonText}</span>
        <span className="ml-2 shrink-0 ui-muted text-[10px]">{open ? "▴" : "▾"}</span>
      </button>

      {open && !disabled && (
        <div
          className="absolute z-30 mt-1.5 w-full rounded-xl border p-2 shadow-lg"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="mb-2 border-b pb-2" style={{ borderColor: "var(--card-border)" }}>
            <label className="flex cursor-pointer items-center gap-2 text-[10px]">
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={allSelected}
                onChange={toggleAll}
              />
              <span>Seleccionar todo</span>
            </label>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {options.length === 0 ? (
              <div className="px-2 py-2 text-[10px] ui-muted">Sin opciones</div>
            ) : (
              options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[10px] hover:bg-[var(--field-bg-soft)]"
                >
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={selectedValues.includes(opt.value)}
                    onChange={() => toggleValue(opt.value)}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>

          <div
            className="mt-2 flex items-center justify-end gap-2 border-t pt-2"
            style={{ borderColor: "var(--card-border)" }}
          >
            <button
              type="button"
              className="ui-btn ui-btn-outline ui-btn-xs"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-xs"
              onClick={() => setOpen(false)}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}