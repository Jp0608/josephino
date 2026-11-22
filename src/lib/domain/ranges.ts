export type RangeStatus = "in_range" | "below" | "above" | "not_measured" | "no_range";

/** Compara o valor medido com a faixa configurada pela empresa. Sem faixa, não julga. */
export function rangeStatus(value: number | null | undefined, min: number | null | undefined, max: number | null | undefined): RangeStatus {
  if (value == null || Number.isNaN(value)) return "not_measured";
  if (min == null && max == null) return "no_range";
  if (min != null && value < min) return "below";
  if (max != null && value > max) return "above";
  return "in_range";
}

export const RANGE_LABEL: Record<RangeStatus, string> = {
  in_range: "Dentro da faixa",
  below: "Abaixo da faixa",
  above: "Acima da faixa",
  not_measured: "Não medido",
  no_range: "Sem faixa configurada",
};

export function formatRange(min: number | null | undefined, max: number | null | undefined, unit = "") {
  const f = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
  const u = unit ? ` ${unit}` : "";
  if (min != null && max != null) return `${f(min)} – ${f(max)}${u}`;
  if (min != null) return `≥ ${f(min)}${u}`;
  if (max != null) return `≤ ${f(max)}${u}`;
  return "—";
}
