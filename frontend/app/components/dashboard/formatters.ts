export function formatNumberEs(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";

  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatSignedNumberEs(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumberEs(value, decimals)}`;
}

export function formatKwhEur(
  kwh: number | null | undefined,
  eur: number | null | undefined
): string {
  return `${formatNumberEs(kwh, 2)} kWh / ${formatNumberEs(eur, 2)} €`;
}

export function formatKwhOnly(value: number | null | undefined): string {
  return `${formatNumberEs(value, 2)} kWh`;
}

export function formatMonthYear(
  anio: number | null | undefined,
  mes: number | null | undefined
): string {
  if (!anio || !mes) return "—";
  return `${String(mes).padStart(2, "0")}/${anio}`;
}