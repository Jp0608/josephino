import { addDays, weekdayOf } from "../format";

export type RecurrenceRule = {
  weekdays: number[]; // 0=dom … 6=sáb
  intervalWeeks: number; // 1 semanal, 2 quinzenal, 4 ~mensal
  startsOn: string; // AAAA-MM-DD
  endsOn?: string | null;
};

/** Domingo da semana do dia (âncora para contar semanas de intervalo). */
function weekAnchor(day: string) {
  return addDays(day, -weekdayOf(day));
}
function weeksBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / (7 * 86400000));
}

/**
 * Dias (AAAA-MM-DD) em que a recorrência acontece entre `from` e `to` (inclusive).
 * Dias em `skip` (feriados, folgas) são pulados.
 */
export function occurrences(rule: RecurrenceRule, from: string, to: string, skip: Set<string> = new Set()): string[] {
  if (!rule.weekdays.length || rule.intervalWeeks < 1) return [];
  const start = from > rule.startsOn ? from : rule.startsOn;
  const end = rule.endsOn && rule.endsOn < to ? rule.endsOn : to;
  const anchor = weekAnchor(rule.startsOn);
  const days = new Set(rule.weekdays);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!days.has(weekdayOf(d))) continue;
    if (weeksBetween(anchor, weekAnchor(d)) % rule.intervalWeeks !== 0) continue;
    if (skip.has(d)) continue;
    out.push(d);
  }
  return out;
}

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function describeRule(rule: Pick<RecurrenceRule, "weekdays" | "intervalWeeks">, time?: string) {
  const days = [...rule.weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(", ");
  const every = rule.intervalWeeks === 1 ? "Toda semana" : rule.intervalWeeks === 2 ? "A cada 15 dias" : `A cada ${rule.intervalWeeks} semanas`;
  return `${every} · ${days}${time ? ` · ${time}` : ""}`;
}

/** Intervalos [início, fim) se sobrepõem? */
export function overlaps(aStart: Date, aMin: number, bStart: Date, bMin: number) {
  const aEnd = aStart.getTime() + aMin * 60000;
  const bEnd = bStart.getTime() + bMin * 60000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}
