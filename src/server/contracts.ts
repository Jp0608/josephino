import "server-only";
import { and, asc, desc, eq, sql, inArray, lte, gte, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { servicePlans, contracts, customers, pools, invoices, recurrences, memberships, users } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError, UserError } from "./errors";
import { addDays, isoDay } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/domain/catalog";
import { scheduleVisit, type ScheduleResult } from "./visits";
import { assertCan, isoDate, monthName, monthRange, moneyCents, optIsoDate, optText, reqText, MONTH_RE } from "./fields";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

const weekdaysField = z
  .array(z.coerce.number().int().min(0).max(6))
  .optional()
  .default([])
  .transform((v) => [...new Set(v)].sort());

/* ───────────────────────────── Planos de serviço (modelos) ───────────────────────────── */

export const servicePlanSchema = z.object({
  name: reqText("Dê um nome ao plano", 120),
  weekdays: weekdaysField,
  intervalWeeks: z.coerce.number({ error: "Frequência inválida" }).int().refine((v) => [1, 2, 4].includes(v), "Frequência inválida").default(1),
  visitsPerMonth: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v, c) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        c.addIssue({ code: "custom", message: "Informe entre 1 e 31 visitas" });
        return z.NEVER;
      }
      return n;
    }),
  includedServices: optText(3000),
  extras: optText(3000),
  priceCents: moneyCents("Informe o preço mensal"),
  conditions: optText(5000),
});

export async function listServicePlans(ctx: C, opts: { includeInactive?: boolean } = {}) {
  assertCan(ctx, "contracts.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(servicePlans.tenantId, ctx.tenantId)];
    if (!opts.includeInactive) conds.push(eq(servicePlans.active, true));
    return tx
      .select({
        p: servicePlans,
        contracts: sql<number>`(select count(*)::int from contracts c where c.tenant_id = service_plans.tenant_id and c.service_plan_id = service_plans.id and c.status = 'active')`,
      })
      .from(servicePlans)
      .where(and(...conds))
      .orderBy(desc(servicePlans.active), asc(servicePlans.priceCents))
      .then((rows) => rows.map((r) => ({ ...r.p, activeContracts: r.contracts })));
  });
}

export async function getServicePlan(ctx: C, id: string) {
  assertCan(ctx, "contracts.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const [p] = await tx.select().from(servicePlans).where(and(eq(servicePlans.tenantId, ctx.tenantId), eq(servicePlans.id, id))).limit(1);
    if (!p) throw new NotFoundError("Plano não encontrado.");
    return p;
  });
}

export async function createServicePlan(ctx: C, input: z.input<typeof servicePlanSchema>) {
  assertCan(ctx, "contracts.write");
  const d = servicePlanSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.insert(servicePlans).values({ ...d, weekdays: d.weekdays.length ? d.weekdays : null, tenantId: ctx.tenantId }).returning();
    await audit(tx, ctx, "service_plan.create", "service_plan", row.id, { name: row.name, priceCents: row.priceCents });
    return row;
  });
}

export async function updateServicePlan(ctx: C, id: string, input: z.input<typeof servicePlanSchema>) {
  assertCan(ctx, "contracts.write");
  const d = servicePlanSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .update(servicePlans)
      .set({ ...d, weekdays: d.weekdays.length ? d.weekdays : null })
      .where(and(eq(servicePlans.tenantId, ctx.tenantId), eq(servicePlans.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Plano não encontrado.");
    await audit(tx, ctx, "service_plan.update", "service_plan", id, { name: row.name, priceCents: row.priceCents });
    return row;
  });
}

export async function setServicePlanActive(ctx: C, id: string, active: boolean) {
  assertCan(ctx, "contracts.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.update(servicePlans).set({ active }).where(and(eq(servicePlans.tenantId, ctx.tenantId), eq(servicePlans.id, id))).returning({ id: servicePlans.id });
    if (!row) throw new NotFoundError("Plano não encontrado.");
    await audit(tx, ctx, active ? "service_plan.activate" : "service_plan.deactivate", "service_plan", id);
  });
}

/* ───────────────────────────── Contratos ───────────────────────────── */

export const CONTRACT_STATUS: Record<string, string> = { draft: "Rascunho", active: "Ativo", paused: "Pausado", ended: "Encerrado", cancelled: "Cancelado" };

export const contractSchema = z
  .object({
    customerId: z.string({ error: "Escolha o cliente" }).uuid("Escolha o cliente"),
    poolId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v == null || z.string().uuid().safeParse(v).success, "Piscina inválida"),
    servicePlanId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v == null || z.string().uuid().safeParse(v).success, "Plano inválido"),
    title: reqText("Dê um título ao contrato", 160),
    monthlyCents: moneyCents("Informe o valor mensal"),
    billingDay: z.coerce.number({ error: "Dia de vencimento inválido" }).int().min(1, "Use um dia entre 1 e 31").max(31, "Use um dia entre 1 e 31"),
    paymentMethod: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v == null || v in PAYMENT_METHODS, "Forma de pagamento inválida"),
    startsOn: isoDate("Informe a data de início"),
    endsOn: optIsoDate,
    adjustmentRule: optText(500),
    conditions: optText(10000),
    status: z.enum(["draft", "active", "paused", "ended", "cancelled"]).default("active"),
  })
  .refine((d) => !d.endsOn || d.endsOn >= d.startsOn, { path: ["endsOn"], message: "O término precisa ser depois do início" });

/** Agenda recorrente opcional criada junto com o contrato (usa scheduleVisit da agenda). */
export const contractScheduleSchema = z.object({
  repeat: z.enum(["weekly", "biweekly", "monthly"], { error: "Escolha a frequência" }),
  weekdays: weekdaysField.refine((v) => v.length > 0, "Escolha ao menos um dia da semana"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido"),
  firstDate: isoDate("Informe a data da primeira visita"),
  durationMin: z.coerce.number().int().min(10).max(600).default(60),
  assignedUserId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || undefined),
  force: z.boolean().default(false),
});

async function checkRefs(tx: Parameters<Parameters<typeof withTenant>[1]>[0], ctx: C, d: z.infer<typeof contractSchema>) {
  const [cust] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, d.customerId))).limit(1);
  if (!cust) throw new NotFoundError("Cliente não encontrado.");
  if (d.poolId) {
    const [p] = await tx.select({ customerId: pools.customerId }).from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, d.poolId))).limit(1);
    if (!p) throw new NotFoundError("Piscina não encontrada.");
    if (p.customerId !== d.customerId) throw new UserError("A piscina escolhida não pertence a este cliente.");
  }
  if (d.servicePlanId) {
    const [sp] = await tx.select({ id: servicePlans.id }).from(servicePlans).where(and(eq(servicePlans.tenantId, ctx.tenantId), eq(servicePlans.id, d.servicePlanId))).limit(1);
    if (!sp) throw new NotFoundError("Plano não encontrado.");
  }
}

export async function createContract(ctx: C, input: z.input<typeof contractSchema>) {
  assertCan(ctx, "contracts.write");
  const d = contractSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    await checkRefs(tx, ctx, d);
    const [row] = await tx.insert(contracts).values({ ...d, tenantId: ctx.tenantId }).returning();
    await audit(tx, ctx, "contract.create", "contract", row.id, { title: row.title, monthlyCents: row.monthlyCents });
    return row;
  });
}

export async function updateContract(ctx: C, id: string, input: z.input<typeof contractSchema>) {
  assertCan(ctx, "contracts.write");
  const d = contractSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    await checkRefs(tx, ctx, d);
    const [row] = await tx
      .update(contracts)
      .set({ ...d, updatedAt: new Date() })
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Contrato não encontrado.");
    await audit(tx, ctx, "contract.update", "contract", id, { status: row.status, monthlyCents: row.monthlyCents });
    return row;
  });
}

export async function setContractStatus(ctx: C, id: string, status: string) {
  assertCan(ctx, "contracts.write");
  if (!(status in CONTRACT_STATUS)) throw new UserError("Status inválido.");
  return withTenant(ctx.tenantId, async (tx) => {
    const [prev] = await tx.select().from(contracts).where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, id))).limit(1);
    if (!prev) throw new NotFoundError("Contrato não encontrado.");
    const [row] = await tx.update(contracts).set({ status, updatedAt: new Date() }).where(eq(contracts.id, id)).returning();
    await audit(tx, ctx, "contract.status", "contract", id, { from: prev.status, to: status });
    return row;
  });
}

/**
 * Cria a agenda recorrente do contrato chamando o agendamento da agenda (mesmas regras de conflito).
 * Sem `force`, conflitos voltam para o usuário decidir e nada é criado.
 */
export async function scheduleContractVisits(ctx: C, contractId: string, input: z.input<typeof contractScheduleSchema>): Promise<ScheduleResult> {
  assertCan(ctx, "contracts.write");
  assertCan(ctx, "agenda.write");
  const s = contractScheduleSchema.parse(input);
  const ct = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.select().from(contracts).where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, contractId))).limit(1);
    if (!row) throw new NotFoundError("Contrato não encontrado.");
    return row;
  });
  if (!ct.poolId) throw new UserError("Vincule uma piscina ao contrato para criar a agenda recorrente.");
  if (ct.endsOn && s.firstDate > ct.endsOn) throw new UserError("A primeira visita cai depois do término do contrato.");
  const firstDate = s.firstDate < isoDay() ? isoDay() : s.firstDate;
  const res = await scheduleVisit(ctx, {
    poolId: ct.poolId,
    date: firstDate,
    time: s.time,
    durationMin: s.durationMin,
    assignedUserId: s.assignedUserId,
    serviceType: "manutencao",
    repeat: s.repeat,
    weekdays: s.weekdays,
    endsOn: ct.endsOn ?? undefined,
    force: s.force,
  });
  if (res.ok && res.recurrenceId) {
    await withTenant(ctx.tenantId, async (tx) => {
      await tx.update(recurrences).set({ contractId }).where(and(eq(recurrences.tenantId, ctx.tenantId), eq(recurrences.id, res.recurrenceId!)));
      await audit(tx, ctx, "contract.schedule", "contract", contractId, { recurrenceId: res.recurrenceId, visits: res.created, forced: s.force });
    });
  }
  return res;
}

export async function listContracts(ctx: C, opts: { status?: string } = {}) {
  assertCan(ctx, "contracts.write");
  const today = isoDay();
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(contracts.tenantId, ctx.tenantId)];
    if (opts.status && opts.status !== "todos" && opts.status in CONTRACT_STATUS) conds.push(eq(contracts.status, opts.status));
    const rows = await tx
      .select({
        ct: contracts,
        customerName: customers.name,
        poolName: pools.name,
        planName: servicePlans.name,
      })
      .from(contracts)
      .innerJoin(customers, and(eq(customers.tenantId, contracts.tenantId), eq(customers.id, contracts.customerId)))
      .leftJoin(pools, and(eq(pools.tenantId, contracts.tenantId), eq(pools.id, contracts.poolId)))
      .leftJoin(servicePlans, and(eq(servicePlans.tenantId, contracts.tenantId), eq(servicePlans.id, contracts.servicePlanId)))
      .where(and(...conds))
      .orderBy(asc(customers.name), desc(contracts.startsOn));
    return rows.map((r) => ({
      ...r.ct,
      customerName: r.customerName,
      poolName: r.poolName,
      planName: r.planName,
      endingSoon: r.ct.status === "active" && !!r.ct.endsOn && r.ct.endsOn <= addDays(today, 30),
      ended: !!r.ct.endsOn && r.ct.endsOn < today,
    }));
  });
}

export async function getContract(ctx: C, id: string) {
  assertCan(ctx, "contracts.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select({ ct: contracts, customer: customers })
      .from(contracts)
      .innerJoin(customers, and(eq(customers.tenantId, contracts.tenantId), eq(customers.id, contracts.customerId)))
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, id)))
      .limit(1);
    if (!row) throw new NotFoundError("Contrato não encontrado.");
    const [pool] = row.ct.poolId ? await tx.select().from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, row.ct.poolId))) : [];
    const [plan] = row.ct.servicePlanId ? await tx.select().from(servicePlans).where(and(eq(servicePlans.tenantId, ctx.tenantId), eq(servicePlans.id, row.ct.servicePlanId))) : [];
    const recs = await tx
      .select({ r: recurrences, techName: users.name })
      .from(recurrences)
      .leftJoin(users, eq(users.id, recurrences.assignedUserId))
      .where(and(eq(recurrences.tenantId, ctx.tenantId), eq(recurrences.contractId, id)))
      .orderBy(desc(recurrences.createdAt));
    const invs = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.contractId, id)))
      .orderBy(desc(invoices.dueOn))
      .limit(24);
    return {
      contract: row.ct,
      customer: row.customer,
      pool: pool ?? null,
      plan: plan ?? null,
      recurrences: recs.map((r) => ({ ...r.r, techName: r.techName })),
      invoices: invs,
    };
  });
}

/** Opções para o formulário: clientes com suas piscinas, planos ativos e quem pode receber visitas. */
export async function getContractFormOptions(ctx: C) {
  assertCan(ctx, "contracts.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const custs = await tx
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.tenantId, ctx.tenantId), inArray(customers.status, ["active", "paused"])))
      .orderBy(asc(customers.name));
    const poolRows = await tx
      .select({ id: pools.id, name: pools.name, code: pools.code, customerId: pools.customerId })
      .from(pools)
      .where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.active, true)))
      .orderBy(asc(pools.name));
    const plans = await tx.select().from(servicePlans).where(and(eq(servicePlans.tenantId, ctx.tenantId), eq(servicePlans.active, true))).orderBy(asc(servicePlans.priceCents));
    const team = await tx
      .select({ id: users.id, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.active, true), inArray(memberships.role, ["owner", "admin", "manager", "supervisor", "technician"])))
      .orderBy(asc(users.name));
    return { customers: custs, pools: poolRows, plans, team };
  });
}

/* ───────────────────────────── Mensalidades ───────────────────────────── */

/**
 * Gera uma conta a receber por contrato ativo para a competência (AAAA-MM). Idempotente:
 * o índice único (tenant, contrato, competência) impede duplicar — rodar de novo não cria nada.
 * Vencimento = dia de cobrança do contrato (limitado ao último dia do mês).
 */
export async function generateMonthlyInvoices(ctx: C, month: string) {
  assertCan(ctx, "contracts.write");
  assertCan(ctx, "finance.write");
  if (!MONTH_RE.test(month)) throw new UserError("Competência inválida.");
  const r = monthRange(month);
  const [, mm] = month.split("-");
  return withTenant(ctx.tenantId, async (tx) => {
    const active = await tx
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, ctx.tenantId),
          eq(contracts.status, "active"),
          lte(contracts.startsOn, r.last),
          or(isNull(contracts.endsOn), gte(contracts.endsOn, r.first)),
          sql`${contracts.monthlyCents} > 0`,
        ),
      );
    if (!active.length) return { month, created: 0, eligible: 0, label: monthName(month) };
    const created = await tx
      .insert(invoices)
      .values(
        active.map((c) => ({
          tenantId: ctx.tenantId,
          customerId: c.customerId,
          contractId: c.id,
          kind: "mensalidade",
          description: `Mensalidade ${mm}/${month.slice(0, 4)} — ${c.title}`,
          amountCents: c.monthlyCents,
          dueOn: `${month}-${String(Math.min(c.billingDay, r.days)).padStart(2, "0")}`,
          competence: month,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: invoices.id, contractId: invoices.contractId });
    if (created.length) {
      await tx
        .update(contracts)
        .set({ lastInvoicedMonth: sql`greatest(coalesce(${contracts.lastInvoicedMonth}, ''), ${month})` })
        .where(and(eq(contracts.tenantId, ctx.tenantId), inArray(contracts.id, created.map((c) => c.contractId!))));
    }
    await audit(tx, ctx, "invoice.generate_monthly", "contract", null, { month, created: created.length, eligible: active.length });
    return { month, created: created.length, eligible: active.length, label: monthName(month) };
  });
}

/** Quantos contratos ativos ainda não têm mensalidade gerada na competência. */
export async function pendingMonthlyCount(ctx: C, month: string) {
  assertCan(ctx, "contracts.write");
  const r = monthRange(month);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, ctx.tenantId),
          eq(contracts.status, "active"),
          lte(contracts.startsOn, r.last),
          or(isNull(contracts.endsOn), gte(contracts.endsOn, r.first)),
          sql`${contracts.monthlyCents} > 0`,
          sql`not exists (select 1 from invoices i where i.tenant_id = contracts.tenant_id and i.contract_id = contracts.id and i.competence = ${month})`,
        ),
      );
    return row.n;
  });
}
