import "server-only";
import { and, asc, desc, eq, gte, lt, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { invoices, payments, expenses, customers, users } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError, UserError } from "./errors";
import { isoDay, localDateTime } from "@/lib/format";
import { EXPENSE_CATEGORIES, INVOICE_KIND, PAYMENT_METHODS } from "@/lib/domain/catalog";
import { assertCan, isoDate, monthRange, moneyCents, optText, parseMonth, reqText, shiftMonth, MONTH_RE } from "./fields";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

/* ───────────────────────────── Contas a receber ───────────────────────────── */

/** Filtros da URL (em português, como o link do painel: ?status=atrasado). */
export const INVOICE_FILTERS = { todos: "Todos", aberto: "Em aberto", atrasado: "Atrasados", pago: "Pagos", cancelado: "Cancelados" } as const;
export type InvoiceFilter = keyof typeof INVOICE_FILTERS;

export type InvoiceView = "open" | "overdue" | "paid" | "cancelled";
export function invoiceView(i: { status: string; dueOn: string }, today = isoDay()): InvoiceView {
  if (i.status === "paid") return "paid";
  if (i.status === "cancelled") return "cancelled";
  return i.dueOn < today ? "overdue" : "open";
}
export const INVOICE_VIEW_LABEL: Record<InvoiceView, string> = { open: "Em aberto", overdue: "Atrasado", paid: "Pago", cancelled: "Cancelado" };

export async function listInvoices(ctx: C, opts: { status?: string; month?: string; customerId?: string } = {}) {
  assertCan(ctx, "finance.read");
  const status: InvoiceFilter = opts.status && opts.status in INVOICE_FILTERS ? (opts.status as InvoiceFilter) : "todos";
  const month = parseMonth(opts.month);
  const r = monthRange(month);
  const today = isoDay();
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(invoices.tenantId, ctx.tenantId)];
    // "Atrasados" mostra tudo o que venceu e não foi pago, de qualquer mês.
    if (status !== "atrasado") conds.push(gte(invoices.dueOn, r.first), lt(invoices.dueOn, r.next));
    if (status === "aberto") conds.push(eq(invoices.status, "open"));
    if (status === "atrasado") conds.push(eq(invoices.status, "open"), lt(invoices.dueOn, today));
    if (status === "pago") conds.push(eq(invoices.status, "paid"));
    if (status === "cancelado") conds.push(eq(invoices.status, "cancelled"));
    if (opts.customerId) conds.push(eq(invoices.customerId, opts.customerId));
    const rows = await tx
      .select({
        i: invoices,
        customerName: customers.name,
        customerWhatsapp: sql<string | null>`coalesce(${customers.whatsapp}, ${customers.phone})`,
        paidCents: sql<number>`(select coalesce(sum(p.amount_cents),0)::int from payments p where p.tenant_id = ${invoices.tenantId} and p.invoice_id = ${invoices.id})`,
        paymentMethod: sql<string | null>`(select p.method from payments p where p.tenant_id = ${invoices.tenantId} and p.invoice_id = ${invoices.id} order by p.paid_at desc limit 1)`,
      })
      .from(invoices)
      .innerJoin(customers, and(eq(customers.tenantId, invoices.tenantId), eq(customers.id, invoices.customerId)))
      .where(and(...conds))
      .orderBy(asc(invoices.dueOn), asc(customers.name));
    const list = rows.map((x) => ({ ...x.i, customerName: x.customerName, customerWhatsapp: x.customerWhatsapp, paidCents: x.paidCents, paymentMethod: x.paymentMethod, view: invoiceView(x.i, today) }));
    return { status, month, rows: list, totalCents: list.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.amountCents, 0) };
  });
}

export async function getInvoice(ctx: C, id: string) {
  assertCan(ctx, "finance.read");
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select({ i: invoices, customerName: customers.name, customerWhatsapp: sql<string | null>`coalesce(${customers.whatsapp}, ${customers.phone})` })
      .from(invoices)
      .innerJoin(customers, and(eq(customers.tenantId, invoices.tenantId), eq(customers.id, invoices.customerId)))
      .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, id)))
      .limit(1);
    if (!row) throw new NotFoundError("Lançamento não encontrado.");
    const pays = await tx
      .select({ p: payments, recordedByName: users.name })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedBy))
      .where(and(eq(payments.tenantId, ctx.tenantId), eq(payments.invoiceId, id)))
      .orderBy(desc(payments.paidAt));
    return { ...row.i, customerName: row.customerName, customerWhatsapp: row.customerWhatsapp, view: invoiceView(row.i), payments: pays.map((p) => ({ ...p.p, recordedByName: p.recordedByName })) };
  });
}

export const invoiceSchema = z.object({
  customerId: z.string({ error: "Escolha o cliente" }).uuid("Escolha o cliente"),
  kind: z.string().refine((v) => v in INVOICE_KIND, "Tipo inválido").default("avulso"),
  description: reqText("Descreva a cobrança", 300),
  amountCents: moneyCents("Informe o valor").refine((v) => v > 0, "O valor precisa ser maior que zero"),
  dueOn: isoDate("Informe o vencimento"),
  competence: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || MONTH_RE.test(v), "Competência inválida (AAAA-MM)"),
});

export async function createInvoice(ctx: C, input: z.input<typeof invoiceSchema>) {
  assertCan(ctx, "finance.write");
  const d = invoiceSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [cust] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, d.customerId))).limit(1);
    if (!cust) throw new NotFoundError("Cliente não encontrado.");
    const [row] = await tx.insert(invoices).values({ ...d, tenantId: ctx.tenantId }).returning();
    await audit(tx, ctx, "invoice.create", "invoice", row.id, { amountCents: row.amountCents, dueOn: row.dueOn });
    return row;
  });
}

export const paymentSchema = z.object({
  method: z.string({ error: "Escolha a forma de pagamento" }).refine((v) => v in PAYMENT_METHODS, "Escolha a forma de pagamento"),
  paidOn: isoDate("Informe a data do pagamento"),
  amountCents: moneyCents("Informe o valor recebido").refine((v) => v > 0, "O valor recebido precisa ser maior que zero"),
  note: optText(500),
});

/**
 * Registro autorizado de pagamento: a ÚNICA forma de marcar uma conta como paga.
 * Cria a linha em payments (origem "manual", quem registrou, forma e data) e quita o lançamento.
 */
export async function recordPayment(ctx: C, invoiceId: string, input: z.input<typeof paymentSchema>) {
  assertCan(ctx, "finance.write");
  const d = paymentSchema.parse(input);
  if (d.paidOn > isoDay()) throw new UserError("A data do pagamento não pode estar no futuro.");
  return withTenant(ctx.tenantId, async (tx) => {
    const [inv] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, invoiceId)))
      .for("update")
      .limit(1);
    if (!inv) throw new NotFoundError("Lançamento não encontrado.");
    if (inv.status === "paid") throw new UserError("Este lançamento já está pago.");
    if (inv.status === "cancelled") throw new UserError("Lançamento cancelado não pode receber pagamento.");
    const paidAt = localDateTime(d.paidOn, "12:00");
    const [pay] = await tx
      .insert(payments)
      .values({ tenantId: ctx.tenantId, invoiceId, amountCents: d.amountCents, method: d.method, paidAt, source: "manual", recordedBy: ctx.userId, note: d.note })
      .returning();
    await tx.update(invoices).set({ status: "paid", paidAt, updatedAt: new Date() }).where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, invoiceId)));
    await audit(tx, ctx, "invoice.paid", "invoice", invoiceId, { paymentId: pay.id, amountCents: d.amountCents, method: d.method, paidOn: d.paidOn, invoiceAmountCents: inv.amountCents });
    return pay;
  });
}

export async function cancelInvoice(ctx: C, invoiceId: string, reason?: string | null) {
  assertCan(ctx, "finance.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, invoiceId))).for("update").limit(1);
    if (!inv) throw new NotFoundError("Lançamento não encontrado.");
    if (inv.status === "paid") throw new UserError("Lançamento pago não pode ser cancelado.");
    if (inv.status === "cancelled") return inv;
    const [row] = await tx.update(invoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(invoices.id, invoiceId)).returning();
    await audit(tx, ctx, "invoice.cancel", "invoice", invoiceId, { reason: reason || null, amountCents: inv.amountCents });
    return row;
  });
}

/* ───────────────────────────── Contas a pagar ───────────────────────────── */

export const EXPENSE_FILTERS = { todos: "Todas", aberto: "A pagar", atrasado: "Vencidas", pago: "Pagas", cancelado: "Canceladas" } as const;

export const expenseSchema = z.object({
  category: z.string({ error: "Escolha a categoria" }).refine((v) => v in EXPENSE_CATEGORIES, "Escolha a categoria"),
  description: reqText("Descreva a despesa", 300),
  supplier: optText(160),
  amountCents: moneyCents("Informe o valor").refine((v) => v > 0, "O valor precisa ser maior que zero"),
  dueOn: isoDate("Informe o vencimento"),
  paidNow: z.boolean().default(false),
});

export async function listExpenses(ctx: C, opts: { status?: string; month?: string } = {}) {
  assertCan(ctx, "finance.read");
  const status = opts.status && opts.status in EXPENSE_FILTERS ? (opts.status as keyof typeof EXPENSE_FILTERS) : "todos";
  const month = parseMonth(opts.month);
  const r = monthRange(month);
  const today = isoDay();
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(expenses.tenantId, ctx.tenantId)];
    if (status !== "atrasado") conds.push(gte(expenses.dueOn, r.first), lt(expenses.dueOn, r.next));
    if (status === "aberto") conds.push(eq(expenses.status, "open"));
    if (status === "atrasado") conds.push(eq(expenses.status, "open"), lt(expenses.dueOn, today));
    if (status === "pago") conds.push(eq(expenses.status, "paid"));
    if (status === "cancelado") conds.push(eq(expenses.status, "cancelled"));
    const rows = await tx.select().from(expenses).where(and(...conds)).orderBy(asc(expenses.dueOn), asc(expenses.description));
    return { status, month, rows: rows.map((e) => ({ ...e, view: invoiceView(e, today) })) };
  });
}

export async function createExpense(ctx: C, input: z.input<typeof expenseSchema>) {
  assertCan(ctx, "finance.write");
  const d = expenseSchema.parse(input);
  const { paidNow, ...data } = d;
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({ ...data, tenantId: ctx.tenantId, createdBy: ctx.userId, status: paidNow ? "paid" : "open", paidAt: paidNow ? new Date() : null })
      .returning();
    await audit(tx, ctx, "expense.create", "expense", row.id, { amountCents: row.amountCents, paid: paidNow });
    return row;
  });
}

export async function markExpensePaid(ctx: C, id: string, paidOnInput?: string) {
  assertCan(ctx, "finance.write");
  const paidOn = paidOnInput ? isoDate().parse(paidOnInput) : isoDay();
  if (paidOn > isoDay()) throw new UserError("A data do pagamento não pode estar no futuro.");
  return withTenant(ctx.tenantId, async (tx) => {
    const [e] = await tx.select().from(expenses).where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, id))).for("update").limit(1);
    if (!e) throw new NotFoundError("Despesa não encontrada.");
    if (e.status === "paid") throw new UserError("Esta despesa já está paga.");
    if (e.status === "cancelled") throw new UserError("Despesa cancelada não pode ser paga.");
    const paidAt = paidOn === isoDay() ? new Date() : localDateTime(paidOn, "12:00");
    const [row] = await tx.update(expenses).set({ status: "paid", paidAt }).where(eq(expenses.id, id)).returning();
    await audit(tx, ctx, "expense.paid", "expense", id, { amountCents: e.amountCents, paidOn });
    return row;
  });
}

export async function cancelExpense(ctx: C, id: string) {
  assertCan(ctx, "finance.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const [e] = await tx.select().from(expenses).where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, id))).limit(1);
    if (!e) throw new NotFoundError("Despesa não encontrada.");
    if (e.status === "paid") throw new UserError("Despesa paga não pode ser cancelada.");
    if (e.status === "cancelled") return e;
    const [row] = await tx.update(expenses).set({ status: "cancelled" }).where(eq(expenses.id, id)).returning();
    await audit(tx, ctx, "expense.cancel", "expense", id, { amountCents: e.amountCents });
    return row;
  });
}

/* ───────────────────────────── Resumo do mês ───────────────────────────── */

/**
 * Resumo financeiro do mês, regime de caixa para recebido/pago.
 * Lucro estimado (caixa) = recebido no mês − despesas pagas no mês.
 */
export async function getFinanceSummary(ctx: C, monthInput?: string) {
  assertCan(ctx, "finance.read");
  const month = parseMonth(monthInput);
  const r = monthRange(month);
  const flowMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const flowStart = monthRange(flowMonths[0]).start;
  return withTenant(ctx.tenantId, async (tx) => {
    const q = async <T,>(s: ReturnType<typeof sql>) => (await tx.execute(s)) as unknown as T[];
    const t = ctx.tenantId;
    const start = r.start.toISOString();
    const end = r.end.toISOString();
    const [s] = await q<Record<string, number>>(sql`
      select
        (select coalesce(sum(amount_cents),0)::int from invoices where tenant_id = ${t} and status <> 'cancelled' and due_on >= ${r.first}::date and due_on < ${r.next}::date) as billed,
        (select count(*)::int from invoices where tenant_id = ${t} and status <> 'cancelled' and due_on >= ${r.first}::date and due_on < ${r.next}::date) as billed_count,
        (select coalesce(sum(amount_cents),0)::int from payments where tenant_id = ${t} and paid_at >= ${start}::timestamptz and paid_at < ${end}::timestamptz) as received,
        (select count(*)::int from payments where tenant_id = ${t} and paid_at >= ${start}::timestamptz and paid_at < ${end}::timestamptz) as received_count,
        (select coalesce(sum(amount_cents),0)::int from invoices where tenant_id = ${t} and status = 'open' and due_on >= ${r.first}::date and due_on < ${r.next}::date) as open_month,
        (select coalesce(sum(amount_cents),0)::int from invoices where tenant_id = ${t} and status = 'open' and due_on < current_date) as overdue,
        (select count(*)::int from invoices where tenant_id = ${t} and status = 'open' and due_on < current_date) as overdue_count,
        (select count(distinct customer_id)::int from invoices where tenant_id = ${t} and status = 'open' and due_on < current_date) as overdue_customers,
        (select coalesce(sum(amount_cents),0)::int from expenses where tenant_id = ${t} and status = 'paid' and paid_at >= ${start}::timestamptz and paid_at < ${end}::timestamptz) as expenses_paid,
        (select coalesce(sum(amount_cents),0)::int from expenses where tenant_id = ${t} and status = 'open' and due_on >= ${r.first}::date and due_on < ${r.next}::date) as expenses_open,
        (select coalesce(sum(amount_cents),0)::int from expenses where tenant_id = ${t} and status = 'open' and due_on < current_date) as expenses_overdue
    `);

    // Fluxo de caixa: 6 meses terminando no mês escolhido (meses locais de Brasília).
    const flowRows = await q<{ m: string; received: number; paid: number }>(sql`
      with months as (
        select to_char(d, 'YYYY-MM') as m from generate_series(${monthRange(flowMonths[0]).first}::date, ${r.first}::date, interval '1 month') d
      ),
      rec as (
        select to_char(paid_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as m, sum(amount_cents)::int as v
        from payments where tenant_id = ${t} and paid_at >= ${flowStart.toISOString()}::timestamptz and paid_at < ${end}::timestamptz group by 1
      ),
      exp as (
        select to_char(paid_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as m, sum(amount_cents)::int as v
        from expenses where tenant_id = ${t} and status = 'paid' and paid_at >= ${flowStart.toISOString()}::timestamptz and paid_at < ${end}::timestamptz group by 1
      )
      select months.m, coalesce(rec.v, 0)::int as received, coalesce(exp.v, 0)::int as paid
      from months left join rec on rec.m = months.m left join exp on exp.m = months.m order by months.m`);

    // Margem por cliente (estimativa): recebido do cliente no mês − custo químico das visitas concluídas no mês.
    const margin = await q<{ customer_id: string; name: string; received: number; chem: number; visits: number }>(sql`
      with rec as (
        select i.customer_id, sum(p.amount_cents)::int as v
        from payments p join invoices i on i.tenant_id = p.tenant_id and i.id = p.invoice_id
        where p.tenant_id = ${t} and p.paid_at >= ${start}::timestamptz and p.paid_at < ${end}::timestamptz
        group by i.customer_id
      ),
      chem as (
        select v.customer_id, coalesce(sum(ca.cost_cents),0)::int as v, count(distinct v.id)::int as visits
        from visits v left join chemical_applications ca on ca.tenant_id = v.tenant_id and ca.visit_id = v.id
        where v.tenant_id = ${t} and v.status = 'completed' and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz
        group by v.customer_id
      )
      select c.id as customer_id, c.name, coalesce(rec.v,0)::int as received, coalesce(chem.v,0)::int as chem, coalesce(chem.visits,0)::int as visits
      from customers c
      left join rec on rec.customer_id = c.id
      left join chem on chem.customer_id = c.id
      where c.tenant_id = ${t} and (rec.v is not null or chem.v > 0)
      order by coalesce(rec.v,0) - coalesce(chem.v,0) desc
      limit 30`);

    return {
      month,
      billedCents: s.billed,
      billedCount: s.billed_count,
      receivedCents: s.received,
      receivedCount: s.received_count,
      openMonthCents: s.open_month,
      overdueCents: s.overdue,
      overdueCount: s.overdue_count,
      overdueCustomers: s.overdue_customers,
      expensesPaidCents: s.expenses_paid,
      expensesOpenCents: s.expenses_open,
      expensesOverdueCents: s.expenses_overdue,
      estimatedProfitCents: s.received - s.expenses_paid,
      cashflow: flowRows.map((f) => ({ month: f.m, receivedCents: f.received, paidCents: f.paid, netCents: f.received - f.paid })),
      margin: margin.map((m) => ({ customerId: m.customer_id, name: m.name, receivedCents: m.received, chemicalCents: m.chem, visits: m.visits, marginCents: m.received - m.chem })),
    };
  });
}

/** Clientes para o seletor de nova cobrança. */
export async function listCustomerOptions(ctx: C) {
  assertCan(ctx, "finance.read");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: customers.id, name: customers.name, status: customers.status })
      .from(customers)
      .where(and(eq(customers.tenantId, ctx.tenantId), inArray(customers.status, ["active", "paused"])))
      .orderBy(asc(customers.name)),
  );
}

/* ───────────────────────────── Exportação CSV ───────────────────────────── */

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvMoney = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const brDate = (d: string | Date | null | undefined) => (!d ? "" : (typeof d === "string" ? d : isoDay(d)).split("-").reverse().join("/"));

/** CSV (separador ";", padrão do Excel em português) com BOM para abrir com acentos corretos. */
export async function exportFinanceCsv(ctx: C, kind: "receber" | "pagar", monthInput?: string) {
  assertCan(ctx, "finance.read");
  const month = parseMonth(monthInput);
  const lines: string[][] = [];
  if (kind === "receber") {
    const { rows } = await listInvoices(ctx, { month, status: "todos" });
    lines.push(["Vencimento", "Cliente", "Descrição", "Tipo", "Competência", "Valor (R$)", "Situação", "Pago em", "Valor recebido (R$)", "Forma"]);
    for (const i of rows)
      lines.push([brDate(i.dueOn), i.customerName, i.description, INVOICE_KIND[i.kind] ?? i.kind, i.competence ?? "", csvMoney(i.amountCents), INVOICE_VIEW_LABEL[i.view], brDate(i.paidAt), i.paidCents ? csvMoney(i.paidCents) : "", i.paymentMethod ? PAYMENT_METHODS[i.paymentMethod] ?? i.paymentMethod : ""]);
  } else {
    const { rows } = await listExpenses(ctx, { month, status: "todos" });
    lines.push(["Vencimento", "Categoria", "Descrição", "Fornecedor", "Valor (R$)", "Situação", "Pago em"]);
    for (const e of rows)
      lines.push([brDate(e.dueOn), EXPENSE_CATEGORIES[e.category] ?? e.category, e.description, e.supplier ?? "", csvMoney(e.amountCents), e.view === "paid" ? "Paga" : e.view === "cancelled" ? "Cancelada" : e.view === "overdue" ? "Vencida" : "A pagar", brDate(e.paidAt)]);
  }
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
  return { filename: `ondaro-${kind === "receber" ? "contas-a-receber" : "contas-a-pagar"}-${month}.csv`, body };
}
