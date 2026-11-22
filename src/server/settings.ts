import "server-only";
import { and, asc, desc, eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { systemDb, withTenant } from "@/db";
import {
  tenants,
  parameterDefinitions,
  customers,
  pools,
  visits,
  technicalReports,
  measurements,
  serviceRequests,
  messageLogs,
  users,
  contracts,
} from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError, UserError } from "./errors";
import type { ReportSnapshot } from "./reports";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;
const opt = z.string().trim().max(300).optional().transform((v) => (v ? v : null));

/* ───────────── Empresa ───────────── */

export const companySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa").max(120),
  legalName: opt,
  document: opt,
  phone: opt,
  whatsapp: opt,
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  address: opt,
  city: opt,
  state: opt,
  operationType: opt,
  teamSize: opt,
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
  reportFooter: z.string().trim().max(1000).optional().transform((v) => v || null),
  defaultFrequencyDays: z.coerce.number().int().min(1).max(90).optional().or(z.literal("").transform(() => undefined)),
});

export async function updateCompany(ctx: C, input: z.input<typeof companySchema>) {
  const d = companySchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    await tx
      .update(tenants)
      .set({ ...d, defaultFrequencyDays: d.defaultFrequencyDays ?? null, updatedAt: new Date() })
      .where(eq(tenants.id, ctx.tenantId));
    await audit(tx, ctx, "tenant.update", "tenant", ctx.tenantId);
  });
}

export async function finishOnboarding(ctx: C) {
  return withTenant(ctx.tenantId, async (tx) => {
    await tx.update(tenants).set({ onboardingDone: true, updatedAt: new Date() }).where(eq(tenants.id, ctx.tenantId));
  });
}

/** Progresso do primeiro acesso, calculado pelos dados reais. */
export async function onboardingProgress(ctx: C) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [t] = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId));
    const n = async (table: typeof customers | typeof pools | typeof visits) => {
      const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.tenantId, ctx.tenantId));
      return r.n;
    };
    const [c, p, v] = [await n(customers), await n(pools), await n(visits)];
    const [fp] = await tx.select({ id: pools.id }).from(pools).where(eq(pools.tenantId, ctx.tenantId)).limit(1);
    const [fc] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.tenantId, ctx.tenantId)).limit(1);
    const [ranges] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(parameterDefinitions)
      .where(and(eq(parameterDefinitions.tenantId, ctx.tenantId), sql`(range_min is not null or range_max is not null)`));
    return {
      tenant: t,
      company: !!(t.phone || t.whatsapp) && !!t.city,
      logo: !!t.logoKey,
      ranges: ranges.n > 0,
      customers: c,
      pools: p,
      visits: v,
      firstPoolId: fp?.id ?? null,
      firstCustomerId: fc?.id ?? null,
    };
  });
}

/* ───────────── Parâmetros da água ───────────── */

export async function listParameters(ctx: C) {
  return withTenant(ctx.tenantId, (tx) =>
    tx.select().from(parameterDefinitions).where(eq(parameterDefinitions.tenantId, ctx.tenantId)).orderBy(asc(parameterDefinitions.sortOrder)),
  );
}

const num = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n)) throw new UserError("Valor de faixa inválido.");
    return n;
  });

export const paramSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  unit: z.string().trim().max(20).default(""),
  rangeMin: num,
  rangeMax: num,
  referenceSource: z.string().trim().max(200).optional().transform((v) => v || null),
  active: z.boolean().default(true),
});

export async function saveParameters(ctx: C, rows: z.input<typeof paramSchema>[]) {
  const data = rows.map((r) => paramSchema.parse(r));
  for (const r of data) {
    if (r.rangeMin != null && r.rangeMax != null && r.rangeMin > r.rangeMax) throw new UserError(`${r.label}: o mínimo é maior que o máximo.`);
    if ((r.rangeMin != null || r.rangeMax != null) && !r.referenceSource)
      throw new UserError(`${r.label}: informe a fonte da faixa (norma, fabricante, responsável técnico).`);
  }
  return withTenant(ctx.tenantId, async (tx) => {
    for (const r of data) {
      await tx
        .update(parameterDefinitions)
        .set({ label: r.label, unit: r.unit, rangeMin: r.rangeMin, rangeMax: r.rangeMax, referenceSource: r.referenceSource, active: r.active })
        .where(and(eq(parameterDefinitions.tenantId, ctx.tenantId), eq(parameterDefinitions.id, r.id)));
    }
    await audit(tx, ctx, "parameters.update", "parameter_definitions", null, { count: data.length });
  });
}

export async function addParameter(ctx: C, label: string, unit: string) {
  const l = label.trim();
  if (l.length < 2) throw new UserError("Dê um nome ao parâmetro.");
  const key = l.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  return withTenant(ctx.tenantId, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(parameterDefinitions).where(eq(parameterDefinitions.tenantId, ctx.tenantId));
    await tx.insert(parameterDefinitions).values({ tenantId: ctx.tenantId, key, label: l, unit: unit.trim().slice(0, 20), sortOrder: n });
    await audit(tx, ctx, "parameters.add", "parameter_definitions", null, { key });
  });
}

/* ───────────── Solicitações do portal ───────────── */

export async function listServiceRequests(ctx: C, status = "open") {
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ r: serviceRequests, customerName: customers.name, poolName: pools.name })
      .from(serviceRequests)
      .innerJoin(customers, and(eq(customers.tenantId, serviceRequests.tenantId), eq(customers.id, serviceRequests.customerId)))
      .leftJoin(pools, and(eq(pools.tenantId, serviceRequests.tenantId), eq(pools.id, serviceRequests.poolId)))
      .where(and(eq(serviceRequests.tenantId, ctx.tenantId), status === "all" ? sql`true` : eq(serviceRequests.status, status)))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(100),
  );
}

export async function setServiceRequestStatus(ctx: C, id: string, status: "open" | "scheduled" | "done" | "dismissed") {
  return withTenant(ctx.tenantId, async (tx) => {
    const [r] = await tx
      .update(serviceRequests)
      .set({ status })
      .where(and(eq(serviceRequests.tenantId, ctx.tenantId), eq(serviceRequests.id, id)))
      .returning({ id: serviceRequests.id });
    if (!r) throw new NotFoundError();
    await audit(tx, ctx, "service_request.status", "service_request", id, { status });
  });
}

export async function listMessages(ctx: C) {
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ m: messageLogs, customerName: customers.name })
      .from(messageLogs)
      .leftJoin(customers, and(eq(customers.tenantId, messageLogs.tenantId), eq(customers.id, messageLogs.customerId)))
      .where(eq(messageLogs.tenantId, ctx.tenantId))
      .orderBy(desc(messageLogs.createdAt))
      .limit(100),
  );
}

/* ───────────── Portal do cliente (sem login, por token) ───────────── */

/**
 * O cliente vê só o que é dele e só o que pode ver: relatórios emitidos (snapshot),
 * próximas visitas, parâmetros medidos. Nunca notas internas, dados financeiros da empresa
 * ou dados de outros clientes.
 */
export async function getPortal(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [hit] = await systemDb().select({ id: customers.id, tenantId: customers.tenantId }).from(customers).where(eq(customers.portalToken, token)).limit(1);
  if (!hit) return null;
  return withTenant(hit.tenantId, async (tx) => {
    const [c] = await tx.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, hit.id));
    const [t] = await tx
      .select({ name: tenants.name, phone: tenants.phone, whatsapp: tenants.whatsapp, email: tenants.email, brandColor: tenants.brandColor, logoKey: tenants.logoKey })
      .from(tenants)
      .where(eq(tenants.id, hit.tenantId));
    const poolRows = await tx
      .select({ id: pools.id, name: pools.name, code: pools.code, volumeLiters: pools.volumeLiters })
      .from(pools)
      .where(and(eq(pools.tenantId, hit.tenantId), eq(pools.customerId, hit.id), eq(pools.active, true)))
      .orderBy(asc(pools.name));
    const upcoming = await tx
      .select({ id: visits.id, poolId: visits.poolId, scheduledStart: visits.scheduledStart, serviceType: visits.serviceType, status: visits.status })
      .from(visits)
      .where(
        and(
          eq(visits.tenantId, hit.tenantId),
          eq(visits.customerId, hit.id),
          inArray(visits.status, ["scheduled", "confirmed", "on_the_way"]),
          sql`${visits.scheduledStart} >= now()`,
        ),
      )
      .orderBy(asc(visits.scheduledStart))
      .limit(6);
    const reports = await tx
      .select({ id: technicalReports.id, poolId: technicalReports.poolId, protocol: technicalReports.protocol, publicToken: technicalReports.publicToken, createdAt: technicalReports.createdAt, snapshot: technicalReports.snapshot })
      .from(technicalReports)
      .where(and(eq(technicalReports.tenantId, hit.tenantId), eq(technicalReports.customerId, hit.id), sql`${technicalReports.revokedAt} is null`))
      .orderBy(desc(technicalReports.createdAt))
      .limit(24);
    const poolIds = poolRows.map((p) => p.id);
    const meas = poolIds.length
      ? await tx
          .select({ poolId: measurements.poolId, parameterKey: measurements.parameterKey, label: measurements.label, value: measurements.value, unit: measurements.unit, status: measurements.status, measuredAt: measurements.measuredAt, rangeMin: measurements.rangeMin, rangeMax: measurements.rangeMax })
          .from(measurements)
          .innerJoin(visits, and(eq(visits.tenantId, measurements.tenantId), eq(visits.id, measurements.visitId)))
          .where(and(eq(measurements.tenantId, hit.tenantId), inArray(measurements.poolId, poolIds), eq(visits.status, "completed")))
          .orderBy(asc(measurements.measuredAt))
      : [];
    const [contract] = await tx
      .select({ title: contracts.title, startsOn: contracts.startsOn, endsOn: contracts.endsOn, status: contracts.status })
      .from(contracts)
      .where(and(eq(contracts.tenantId, hit.tenantId), eq(contracts.customerId, hit.id), eq(contracts.status, "active")))
      .limit(1);
    const openReqs = await tx
      .select({ id: serviceRequests.id, message: serviceRequests.message, createdAt: serviceRequests.createdAt, status: serviceRequests.status })
      .from(serviceRequests)
      .where(and(eq(serviceRequests.tenantId, hit.tenantId), eq(serviceRequests.customerId, hit.id)))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(5);
    return {
      tenantId: hit.tenantId,
      customer: c,
      company: t,
      pools: poolRows,
      upcoming,
      reports: reports.map((r) => ({ ...r, snapshot: r.snapshot as ReportSnapshot })),
      measurements: meas,
      contract: contract ?? null,
      requests: openReqs,
    };
  });
}

export async function createPortalRequest(token: string, input: { poolId?: string | null; kind: string; message: string }) {
  const msg = input.message.trim();
  if (msg.length < 5) throw new UserError("Descreva o que você precisa.");
  if (msg.length > 1000) throw new UserError("Mensagem muito longa.");
  const [hit] = await systemDb().select({ id: customers.id, tenantId: customers.tenantId }).from(customers).where(eq(customers.portalToken, token)).limit(1);
  if (!hit) throw new NotFoundError();
  return withTenant(hit.tenantId, async (tx) => {
    let poolId: string | null = null;
    if (input.poolId) {
      const [p] = await tx.select({ id: pools.id }).from(pools).where(and(eq(pools.tenantId, hit.tenantId), eq(pools.customerId, hit.id), eq(pools.id, input.poolId)));
      poolId = p?.id ?? null;
    }
    await tx.insert(serviceRequests).values({
      tenantId: hit.tenantId,
      customerId: hit.id,
      poolId,
      kind: ["visita_extra", "problema", "outro"].includes(input.kind) ? input.kind : "outro",
      message: msg,
    });
    await audit(tx, { tenantId: hit.tenantId, userId: null }, "service_request.create", "customer", hit.id);
  });
}

/* ───────────── Indicadores ───────────── */

export async function getInsights(ctx: C) {
  return withTenant(ctx.tenantId, async (tx) => {
    const q = async <T,>(s: ReturnType<typeof sql>) => (await tx.execute(s)) as unknown as T[];
    const months = await q<{ month: string; done: number; cancelled: number; not_done: number; total: number }>(sql`
      select to_char(date_trunc('month', scheduled_start at time zone 'America/Sao_Paulo'), 'YYYY-MM') as month,
        count(*) filter (where status = 'completed')::int as done,
        count(*) filter (where status = 'cancelled')::int as cancelled,
        count(*) filter (where status = 'not_done')::int as not_done,
        count(*)::int as total
      from visits where tenant_id = ${ctx.tenantId} and scheduled_start >= date_trunc('month', now()) - interval '5 months' and scheduled_start < date_trunc('month', now()) + interval '1 month'
      group by 1 order by 1`);
    const byTech = await q<{ name: string; done: number; avg_min: number | null }>(sql`
      select coalesce(u.name, 'Sem responsável') as name, count(*)::int as done,
        round(avg(extract(epoch from (v.completed_at - v.started_at)) / 60))::int as avg_min
      from visits v left join users u on u.id = v.assigned_user_id
      where v.tenant_id = ${ctx.tenantId} and v.status = 'completed' and v.completed_at >= now() - interval '90 days'
      group by 1 order by 2 desc`);
    const revenue = await q<{ id: string; name: string; received: number; chem: number }>(sql`
      select c.id, c.name,
        coalesce((select sum(p.amount_cents) from payments p join invoices i on i.tenant_id = p.tenant_id and i.id = p.invoice_id where p.tenant_id = c.tenant_id and i.customer_id = c.id and p.paid_at >= now() - interval '90 days'), 0)::int as received,
        coalesce((select sum(a.cost_cents) from chemical_applications a join visits v on v.tenant_id = a.tenant_id and v.id = a.visit_id where a.tenant_id = c.tenant_id and v.customer_id = c.id and v.completed_at >= now() - interval '90 days'), 0)::int as chem
      from customers c where c.tenant_id = ${ctx.tenantId}
      order by received desc limit 10`);
    const problems = await q<{ id: string; pool: string; customer: string; n: number }>(sql`
      select p.id, p.name as pool, c.name as customer, count(*)::int as n
      from measurements m join pools p on p.tenant_id = m.tenant_id and p.id = m.pool_id
      join customers c on c.tenant_id = p.tenant_id and c.id = p.customer_id
      where m.tenant_id = ${ctx.tenantId} and m.status in ('below','above') and m.measured_at >= now() - interval '30 days'
      group by 1, 2, 3 order by 4 desc limit 8`);
    const [growth] = await q<{ active: number; new30: number; inactive: number }>(sql`
      select count(*) filter (where status = 'active')::int as active,
             count(*) filter (where created_at >= now() - interval '30 days')::int as new30,
             count(*) filter (where status = 'inactive')::int as inactive
      from customers where tenant_id = ${ctx.tenantId}`);
    return { months, byTech, revenue, problems, growth };
  });
}

export { users };
