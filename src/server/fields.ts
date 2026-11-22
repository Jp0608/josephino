/**
 * Campos zod reutilizados pelos módulos de estoque, financeiro e contratos.
 * Aceitam tanto valores vindos de formulário (strings "12,50") quanto números (testes/serviços).
 */
import { z } from "zod";
import { addDays, dayStart, isoMonth, parseDecimal, parseMoneyToCents } from "@/lib/format";
import { ForbiddenError } from "./errors";
import { can, type Permission } from "./permissions";
import type { Role } from "@/db/schema";

export const optText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const reqText = (msg: string, max = 160) => z.string({ error: msg }).trim().min(1, msg).max(max, `Use no máximo ${max} caracteres`);

/** Dinheiro em centavos. String "1.234,56" / "1234.56" ou número (já em centavos). */
export const moneyCents = (msg = "Valor inválido") =>
  z.union([z.number(), z.string()]).transform((v, c) => {
    const n = typeof v === "number" ? Math.round(v) : parseMoneyToCents(v);
    if (n == null || !Number.isFinite(n) || n < 0) {
      c.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return n;
  });

export const optMoneyCents = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v, c) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? Math.round(v) : parseMoneyToCents(v);
    if (n == null || n < 0) {
      c.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return n;
  });

export const decimal = (msg = "Número inválido") =>
  z.union([z.number(), z.string()]).transform((v, c) => {
    const n = typeof v === "number" ? v : parseDecimal(v);
    if (n == null || !Number.isFinite(n)) {
      c.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return Math.round(n * 1000) / 1000;
  });

export const optDecimal = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v, c) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseDecimal(v);
    if (n == null || !Number.isFinite(n)) {
      c.addIssue({ code: "custom", message: "Número inválido" });
      return z.NEVER;
    }
    return Math.round(n * 1000) / 1000;
  });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isoDate = (msg = "Data inválida") => z.string({ error: msg }).regex(DAY, msg);
export const optIsoDate = z
  .string()
  .optional()
  .nullable()
  .transform((v, c) => {
    if (!v) return null;
    if (!DAY.test(v)) {
      c.addIssue({ code: "custom", message: "Data inválida" });
      return z.NEVER;
    }
    return v;
  });

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function parseMonth(v: string | null | undefined, fallback = isoMonth()) {
  return v && MONTH_RE.test(v) ? v : fallback;
}

/** "2026-11" → limites do mês no fuso de Brasília. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const next = `${nextMonth}-01`;
  const last = addDays(next, -1);
  return { first, last, next, start: dayStart(first), end: dayStart(next), days: Number(last.slice(8, 10)) };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[m - 1]} de ${y}`;
}

/** Verificação de permissão dentro do serviço (não depende só da interface/ação). */
export function assertCan(ctx: { role: Role }, perm: Permission) {
  if (!can(ctx.role, perm)) throw new ForbiddenError();
}

/** "Novembro de 2026" (só a primeira letra maiúscula). */
export function monthTitle(month: string) {
  const s = monthName(month);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
