import "server-only";
import { and, asc, desc, eq, ilike, or, sql, inArray, exists } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { customers, pools, visits, invoices, technicalReports, contracts, plans } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError, UserError } from "./errors";
import { can } from "./permissions";
import { newToken } from "./crypto";
import { estimateVolumeLiters } from "@/lib/domain/volume";
import { onlyDigits } from "@/lib/format";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

const opt = z.string().trim().max(300).optional().transform((v) => (v ? v : null));

export const customerSchema = z.object({
  kind: z.enum(["pf", "pj"]).default("pf"),
  name: z.string().trim().min(2, "Informe o nome").max(160),
  document: opt,
  phone: opt,
  whatsapp: opt,
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  contactName: opt,
  zip: opt,
  street: opt,
  number: opt,
  complement: opt,
  district: opt,
  city: opt,
  state: opt,
  source: opt,
  status: z.enum(["active", "paused", "inactive"]).default("active"),
  internalNotes: z.string().trim().max(5000).optional().transform((v) => v || null),
  whatsappConsent: z.boolean().default(false),
  startedAt: opt,
});

export function customerAddress(c: Pick<typeof customers.$inferSelect, "street" | "number" | "complement" | "district" | "city" | "state">) {
  return [
    [c.street, c.number].filter(Boolean).join(", "),
    c.complement,
    c.district,
    [c.city, c.state].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function validateDocument(kind: string, doc: string | null) {
  if (!doc) return null;
  const d = onlyDigits(doc);
  if (kind === "pf" && d.length !== 11) throw new UserError("CPF deve ter 11 dígitos.");
  if (kind === "pj" && d.length !== 14) throw new UserError("CNPJ deve ter 14 dígitos.");
  return d;
}

export async function listCustomers(ctx: C, opts: { q?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const size = Math.min(100, opts.pageSize ?? 30);
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(customers.tenantId, ctx.tenantId)];
    if (opts.status && opts.status !== "all") conds.push(eq(customers.status, opts.status));
    const q = opts.q?.trim();
    if (q) {
      const like = `%${q}%`;
      const digits = onlyDigits(q);
      conds.push(
        or(
          ilike(customers.name, like),
          ilike(customers.email, like),
          ilike(customers.street, like),
          ilike(customers.district, like),
          ilike(customers.city, like),
          digits.length >= 4 ? sql`regexp_replace(coalesce(${customers.phone},'') || coalesce(${customers.whatsapp},''), '\\D', '', 'g') like ${"%" + digits + "%"}` : undefined,
          exists(
            tx.select({ x: sql`1` }).from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.customerId, customers.id), or(ilike(pools.name, like), ilike(pools.code, like)))),
          ),
        )!,
      );
    }
    const where = and(...conds);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(customers).where(where);
    const rows = await tx
      .select({
        c: customers,
        poolCount: sql<number>`(select count(*)::int from pools p where p.tenant_id = ${customers.tenantId} and p.customer_id = ${customers.id} and p.active)`,
        lastVisit: sql<Date | null>`(select max(v.completed_at) from visits v where v.tenant_id = ${customers.tenantId} and v.customer_id = ${customers.id} and v.status = 'completed')`,
        nextVisit: sql<Date | null>`(select min(v.scheduled_start) from visits v where v.tenant_id = ${customers.tenantId} and v.customer_id = ${customers.id} and v.status in ('scheduled','confirmed','on_the_way') and v.scheduled_start >= now())`,
        overdueCents: sql<number>`(select coalesce(sum(i.amount_cents),0)::int from invoices i where i.tenant_id = ${customers.tenantId} and i.customer_id = ${customers.id} and i.status = 'open' and i.due_on < current_date)`,
      })
      .from(customers)
      .where(where)
      .orderBy(asc(customers.name))
      .limit(size)
      .offset((page - 1) * size);
    return {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / size)),
      rows: rows.map((r) => ({
        ...r.c,
        lastVisit: r.lastVisit ? new Date(r.lastVisit) : null,
        nextVisit: r.nextVisit ? new Date(r.nextVisit) : null,
        poolCount: r.poolCount,
        overdueCents: r.overdueCents,
      })),
    };
  });
}

export async function getCustomer(ctx: C, id: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [c] = await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, id))).limit(1);
    if (!c) throw new NotFoundError("Cliente não encontrado.");
    const poolRows = await tx.select().from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.customerId, id))).orderBy(asc(pools.name));
    const visitRows = await tx
      .select({ id: visits.id, scheduledStart: visits.scheduledStart, status: visits.status, serviceType: visits.serviceType, poolId: visits.poolId, completedAt: visits.completedAt })
      .from(visits)
      .where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.customerId, id)))
      .orderBy(desc(visits.scheduledStart))
      .limit(50);
    const reportRows = await tx
      .select({ id: technicalReports.id, protocol: technicalReports.protocol, createdAt: technicalReports.createdAt, publicToken: technicalReports.publicToken, viewCount: technicalReports.viewCount, poolId: technicalReports.poolId, visitId: technicalReports.visitId })
      .from(technicalReports)
      .where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.customerId, id)))
      .orderBy(desc(technicalReports.createdAt))
      .limit(30);
    const canFinance = can(ctx.role, "finance.read");
    const invoiceRows = canFinance
      ? await tx.select().from(invoices).where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.customerId, id))).orderBy(desc(invoices.dueOn)).limit(30)
      : [];
    const contractRows = await tx
      .select({ ct: contracts, planName: sql<string | null>`(select name from service_plans sp where sp.id = ${contracts.servicePlanId})` })
      .from(contracts)
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.customerId, id)))
      .orderBy(desc(contracts.startsOn));
    return {
      customer: can(ctx.role, "customers.internal_notes") ? c : { ...c, internalNotes: null },
      pools: poolRows,
      visits: visitRows,
      reports: reportRows,
      invoices: invoiceRows,
      contracts: contractRows.map((r) => ({ ...r.ct, planName: r.planName })),
    };
  });
}

export async function createCustomer(ctx: C, input: z.input<typeof customerSchema>) {
  const d = customerSchema.parse(input);
  const document = validateDocument(d.kind, d.document);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .insert(customers)
      .values({
        ...d,
        document,
        tenantId: ctx.tenantId,
        whatsappConsentAt: d.whatsappConsent ? new Date() : null,
        startedAt: d.startedAt ?? new Date().toISOString().slice(0, 10),
      })
      .returning();
    await audit(tx, ctx, "customer.create", "customer", row.id, { name: row.name });
    return row;
  });
}

export async function updateCustomer(ctx: C, id: string, input: z.input<typeof customerSchema>) {
  const d = customerSchema.parse(input);
  const document = validateDocument(d.kind, d.document);
  return withTenant(ctx.tenantId, async (tx) => {
    const [prev] = await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, id))).limit(1);
    if (!prev) throw new NotFoundError("Cliente não encontrado.");
    const [row] = await tx
      .update(customers)
      .set({
        ...d,
        document,
        internalNotes: can(ctx.role, "customers.internal_notes") ? d.internalNotes : prev.internalNotes,
        whatsappConsentAt: d.whatsappConsent && !prev.whatsappConsent ? new Date() : d.whatsappConsent ? prev.whatsappConsentAt : null,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, id)))
      .returning();
    await audit(tx, ctx, "customer.update", "customer", id, { status: row.status });
    return row;
  });
}

/** Gera (ou renova, revogando o anterior) o link seguro do portal do cliente. */
export async function rotatePortalToken(ctx: C, id: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const token = newToken(24);
    const [row] = await tx
      .update(customers)
      .set({ portalToken: token, updatedAt: new Date() })
      .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, id)))
      .returning({ id: customers.id });
    if (!row) throw new NotFoundError();
    await audit(tx, ctx, "customer.portal_link", "customer", id);
    return token;
  });
}

/* ───────────────────────────── Piscinas ───────────────────────────── */

const optNum = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  });

export const poolSchema = z.object({
  customerId: z.string().uuid("Escolha o cliente"),
  name: z.string().trim().min(1, "Dê um nome à piscina").max(120),
  code: z.string().trim().max(20).optional(),
  usage: z.string().default("residencial"),
  address: opt,
  shape: opt,
  lengthM: optNum,
  widthM: optNum,
  depthMinM: optNum,
  depthMaxM: optNum,
  volumeLiters: optNum,
  lining: opt,
  filtration: opt,
  pump: opt,
  pumpSpec: opt,
  heating: opt,
  disinfection: opt,
  frequencyDays: optNum,
  technicalNotes: z.string().trim().max(5000).optional().transform((v) => v || null),
});

function resolveVolume(d: z.infer<typeof poolSchema>) {
  if (d.volumeLiters && d.volumeLiters > 0) return { volumeLiters: Math.round(d.volumeLiters), volumeIsEstimated: false };
  const est = estimateVolumeLiters(d);
  return { volumeLiters: est, volumeIsEstimated: true };
}

async function nextPoolCode(tx: Parameters<Parameters<typeof withTenant>[1]>[0], tenantId: string) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(pools).where(eq(pools.tenantId, tenantId));
  for (let i = n + 1; ; i++) {
    const code = `P${String(i).padStart(3, "0")}`;
    const [hit] = await tx.select({ id: pools.id }).from(pools).where(and(eq(pools.tenantId, tenantId), eq(pools.code, code))).limit(1);
    if (!hit) return code;
  }
}

export async function createPool(ctx: C & { plan?: typeof plans.$inferSelect | null }, input: z.input<typeof poolSchema>) {
  const d = poolSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    if (ctx.plan?.maxPools != null) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.active, true)));
      if (n >= ctx.plan.maxPools)
        throw new UserError(`Seu plano permite ${ctx.plan.maxPools} piscinas ativas. Faça upgrade em Plano e assinatura para cadastrar mais.`);
    }
    const [cust] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, d.customerId))).limit(1);
    if (!cust) throw new NotFoundError("Cliente não encontrado.");
    const code = d.code?.toUpperCase() || (await nextPoolCode(tx, ctx.tenantId));
    const [dupe] = await tx.select({ id: pools.id }).from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.code, code))).limit(1);
    if (dupe) throw new UserError(`Já existe uma piscina com a identificação ${code}.`);
    const [row] = await tx
      .insert(pools)
      .values({ ...d, code, tenantId: ctx.tenantId, frequencyDays: d.frequencyDays ? Math.round(d.frequencyDays) : null, ...resolveVolume(d) })
      .returning();
    await audit(tx, ctx, "pool.create", "pool", row.id, { name: row.name, code });
    return row;
  });
}

export async function updatePool(ctx: C, id: string, input: z.input<typeof poolSchema>) {
  const d = poolSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const code = d.code?.toUpperCase();
    if (code) {
      const [dupe] = await tx
        .select({ id: pools.id })
        .from(pools)
        .where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.code, code), sql`${pools.id} <> ${id}`))
        .limit(1);
      if (dupe) throw new UserError(`Já existe uma piscina com a identificação ${code}.`);
    }
    const [row] = await tx
      .update(pools)
      .set({ ...d, ...(code ? { code } : {}), frequencyDays: d.frequencyDays ? Math.round(d.frequencyDays) : null, ...resolveVolume(d), updatedAt: new Date() })
      .where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Piscina não encontrada.");
    await audit(tx, ctx, "pool.update", "pool", id);
    return row;
  });
}

export async function setPoolActive(ctx: C, id: string, active: boolean) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.update(pools).set({ active, updatedAt: new Date() }).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, id))).returning({ id: pools.id });
    if (!row) throw new NotFoundError();
    await audit(tx, ctx, active ? "pool.activate" : "pool.deactivate", "pool", id);
  });
}

export async function listPools(ctx: C, opts: { q?: string; customerIds?: string[] } = {}) {
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(pools.tenantId, ctx.tenantId)];
    if (opts.customerIds?.length) conds.push(inArray(pools.customerId, opts.customerIds));
    if (opts.q) conds.push(or(ilike(pools.name, `%${opts.q}%`), ilike(pools.code, `%${opts.q}%`), ilike(customers.name, `%${opts.q}%`))!);
    return tx
      .select({
        pool: pools,
        customerName: customers.name,
        lastVisit: sql<Date | null>`(select max(v.completed_at) from visits v where v.tenant_id = ${pools.tenantId} and v.pool_id = ${pools.id} and v.status = 'completed')`,
        outOfRange: sql<number>`(select count(*)::int from measurements m where m.tenant_id = ${pools.tenantId} and m.visit_id = (select v2.id from visits v2 where v2.tenant_id = ${pools.tenantId} and v2.pool_id = ${pools.id} and v2.status='completed' order by v2.completed_at desc limit 1) and m.status in ('below','above'))`,
      })
      .from(pools)
      .innerJoin(customers, and(eq(customers.tenantId, pools.tenantId), eq(customers.id, pools.customerId)))
      .where(and(...conds))
      .orderBy(asc(customers.name), asc(pools.name));
  });
}
