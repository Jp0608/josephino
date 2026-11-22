/** Fuso padrão. O Brasil não tem horário de verão desde 2019; Brasília = UTC−3. */
export const TZ = "America/Sao_Paulo";
export const TZ_OFFSET = "-03:00";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (cents: number | null | undefined) => (cents == null ? "—" : brl.format(cents / 100));

export const num = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(v);

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...o });
const dDate = fmt({ day: "2-digit", month: "2-digit", year: "numeric" });
const dShort = fmt({ day: "2-digit", month: "short" });
const dTime = fmt({ hour: "2-digit", minute: "2-digit" });
const dWeek = fmt({ weekday: "short", day: "2-digit", month: "short" });
const dLong = fmt({ weekday: "long", day: "numeric", month: "long" });
const dMonth = fmt({ month: "long", year: "numeric" });

const toDate = (d: Date | string) => (typeof d === "string" ? (d.length === 10 ? new Date(`${d}T12:00:00${TZ_OFFSET}`) : new Date(d)) : d);
export const date = (d: Date | string | null | undefined) => (d ? dDate.format(toDate(d)) : "—");
export const dateShort = (d: Date | string | null | undefined) => (d ? dShort.format(toDate(d)).replace(".", "") : "—");
export const time = (d: Date | string | null | undefined) => (d ? dTime.format(toDate(d)) : "—");
export const dateTime = (d: Date | string | null | undefined) => (d ? `${date(d)} ${time(d)}` : "—");
export const weekday = (d: Date | string) => dWeek.format(toDate(d)).replace(/\./g, "");
export const longDay = (d: Date | string) => dLong.format(toDate(d));
export const monthLabel = (d: Date | string) => dMonth.format(toDate(d));

/** "2026-11-22" no fuso local. */
export function isoDay(d: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p;
}
export function isoMonth(d: Date = new Date()) {
  return isoDay(d).slice(0, 7);
}
/** Início do dia local (00:00 em Brasília) em UTC. */
export function dayStart(day: string) {
  return new Date(`${day}T00:00:00${TZ_OFFSET}`);
}
export function localDateTime(day: string, hhmm: string) {
  return new Date(`${day}T${hhmm}:00${TZ_OFFSET}`);
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = domingo. */
export function weekdayOf(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
export function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
export const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

/** Link wa.me com mensagem pronta (o profissional envia pelo próprio WhatsApp). */
export function waLink(phone: string | null | undefined, text: string) {
  let d = onlyDigits(phone);
  if (d && d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
export function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
export function wazeLink(address: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
export function parseMoneyToCents(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
export function parseDecimal(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
