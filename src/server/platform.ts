import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { systemDb } from "@/db";
import { tenants, plans, billingEvents, platformAudit } from "@/db/schema";
import { computeSubscription, getCtx } from "./auth";
import { ForbiddenError, NotFoundError, UserError } from "./errors";
import { integrationStatus } from "./integrations";
import { FEATURE_CODES } from "./plan-features";
import { parseMoneyToCents } from "@/lib/format";

/**
 * Administração da plataforma. Usa systemDb() (fora do RLS das empresas), por isso expõe
 * apenas agregados e metadados da empresa — nunca clientes, piscinas, conteúdo de visitas,
 * telefones ou endereços.
 */

type Actor = { email: string };

/** Para server actions do /admin: exige sessão de administrador da plataforma. */
export async function platformActor(): Promise<Actor> {
  const ctx = await getCtx();
  if (!ctx?.isPlatformAdmin) throw new ForbiddenError("Acesso restrito à administração da plataforma.");
  return { email: ctx.email };
}

export const TENANT_STATUS_LABEL: Record<string, string> = {
  trialing: "Em teste",
  trial_expired: "Teste vencido",
  active: "Ativa",
  past_due: "Pagamento pendente",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

export async function getPlatformMetrics(now = new Date()) {
  const db = systemDb();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const nowIso = now.toISOString();
  const [t] = await db
    .select({
      total: sql<number>`count(*) filter (where not ${tenants.isDemo})::int`,
      demo: sql<number>`count(*) filter (where ${tenants.isDemo})::int`,
      active: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.status} = 'active')::int`,
      trialing: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.status} = 'trialing' and ${tenants.trialEndsAt} > ${nowIso}::timestamptz)::int`,
      trialExpired: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.status} = 'trialing' and (${tenants.trialEndsAt} is null or ${tenants.trialEndsAt} <= ${nowIso}::timestamptz))::int`,
      pastDue: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.status} = 'past_due')::int`,
      suspended: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.status} = 'suspended')::int`,
      cancelled: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.status} = 'cancelled')::int`,
      newSignups30: sql<number>`count(*) filter (where not ${tenants.isDemo} and ${tenants.createdAt} >= ${d30}::timestamptz)::int`,
      mrrCents: sql<number>`coalesce(sum(${plans.priceCents}) filter (where not ${tenants.isDemo} and ${tenants.status} = 'active'), 0)::int`,
    })
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId));
  const [u] = await db.execute<{ visits30: number; reports30: number; reportsTotal: number }>(sql`
    select
      (select count(*)::int from visits v join tenants t on t.id = v.tenant_id where not t.is_demo and v.status = 'completed' and v.completed_at >= ${d30}::timestamptz) as "visits30",
      (select count(*)::int from technical_reports r join tenants t on t.id = r.tenant_id where not t.is_demo and r.created_at >= ${d30}::timestamptz) as "reports30",
      (select count(*)::int from technical_reports r join tenants t on t.id = r.tenant_id where not t.is_demo) as "reportsTotal"
  `);
  // Conversão do teste: pagantes (ativas + pendentes) ÷ empresas que já saíram do teste.
  const paying = t.active + t.pastDue;
  const decided = paying + t.trialExpired + t.cancelled + t.suspended;
  return {
    ...t,
    paying,
    conversionRate: decided ? paying / decided : null,
    visits30: Number(u?.visits30 ?? 0),
    reports30: Number(u?.reports30 ?? 0),
    reportsTotal: Number(u?.reportsTotal ?? 0),
    integrations: integrationStatus(),
  };
}

export async function listTenants(opts: { q?: string; status?: string } = {}, now = new Date()) {
  const db = systemDb();
  const conds = [];
  const q = opts.q?.trim();
  if (q) conds.push(or(ilike(tenants.name, `%${q}%`), ilike(tenants.slug, `%${q}%`))!);
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      trialEndsAt: tenants.trialEndsAt,
      createdAt: tenants.createdAt,
      isDemo: tenants.isDemo,
      planName: plans.name,
      planCode: plans.code,
      users: sql<number>`(select count(*)::int from memberships m where m.tenant_id = ${tenants.id} and m.active)`,
      pools: sql<number>`(select count(*)::int from pools p where p.tenant_id = ${tenants.id} and p.active)`,
      lastActivity: sql<string | null>`(select max(s.last_seen_at) from sessions s where s.tenant_id = ${tenants.id})`,
    })
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(tenants.createdAt))
    .limit(300);
  const out = rows.map((r) => ({
    ...r,
    lastActivity: r.lastActivity ? new Date(r.lastActivity) : null,
    effectiveStatus: computeSubscription({ status: r.status, trialEndsAt: r.trialEndsAt }, now).status,
  }));
  return opts.status && opts.status !== "all" ? out.filter((r) => r.effectiveStatus === opts.status) : out;
}

export async function getTenantAdmin(id: string, now = new Date()) {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Empresa não encontrada.");
  const db = systemDb();
  const [row] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      trialEndsAt: tenants.trialEndsAt,
      currentPeriodEnd: tenants.currentPeriodEnd,
      suspendedReason: tenants.suspendedReason,
      createdAt: tenants.createdAt,
      isDemo: tenants.isDemo,
      planId: tenants.planId,
      planName: plans.name,
      planCode: plans.code,
      planPriceCents: plans.priceCents,
      users: sql<number>`(select count(*)::int from memberships m where m.tenant_id = ${tenants.id} and m.active)`,
      pools: sql<number>`(select count(*)::int from pools p where p.tenant_id = ${tenants.id} and p.active)`,
      customers: sql<number>`(select count(*)::int from customers c where c.tenant_id = ${tenants.id})`,
      visits30: sql<number>`(select count(*)::int from visits v where v.tenant_id = ${tenants.id} and v.status = 'completed' and v.completed_at >= now() - interval '30 days')`,
      reports: sql<number>`(select count(*)::int from technical_reports r where r.tenant_id = ${tenants.id})`,
      lastActivity: sql<string | null>`(select max(s.last_seen_at) from sessions s where s.tenant_id = ${tenants.id})`,
    })
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("Empresa não encontrada.");
  const events = await db.select().from(billingEvents).where(eq(billingEvents.tenantId, id)).orderBy(desc(billingEvents.createdAt)).limit(100);
  const auditRows = await db.select().from(platformAudit).where(eq(platformAudit.tenantId, id)).orderBy(desc(platformAudit.createdAt)).limit(100);
  return {
    tenant: { ...row, lastActivity: row.lastActivity ? new Date(row.lastActivity) : null, effectiveStatus: computeSubscription(row, now) },
    events,
    audit: auditRows,
  };
}

/* ───────────── Ações sobre empresas (cada uma grava platform_audit + billing_events) ───────────── */

async function loadTenant(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Empresa não encontrada.");
  const [t] = await systemDb().select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t) throw new NotFoundError("Empresa não encontrada.");
  return t;
}

export async function adminChangePlan(actor: Actor, tenantId: string, planCode: string, note?: string) {
  const t = await loadTenant(tenantId);
  const db = systemDb();
  const [p] = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1);
  if (!p) throw new UserError("Plano não encontrado.");
  if (p.id === t.planId) throw new UserError("A empresa já está neste plano.");
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({ planId: p.id, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    await tx.insert(billingEvents).values({ tenantId, kind: "plan_changed", planCode: p.code, amountCents: p.priceCents, note: note?.trim() || null, actor: actor.email });
    await tx.insert(platformAudit).values({ actorEmail: actor.email, action: "tenant.plan", tenantId, data: { from: t.planId, to: p.id, planCode: p.code, note: note?.trim() || null } });
  });
}

const STATUS_KIND: Record<string, string> = { active: "status_active", past_due: "status_past_due", suspended: "suspended", cancelled: "status_cancelled" };

export async function adminSetStatus(actor: Actor, tenantId: string, statusRaw: string, reasonRaw?: string) {
  const status = z.enum(["active", "past_due", "suspended", "cancelled"], { error: "Situação inválida" }).parse(statusRaw);
  const reason = (reasonRaw ?? "").trim().slice(0, 500) || null;
  if (status === "suspended" && (!reason || reason.length < 3)) throw new UserError("Informe o motivo da suspensão.");
  const t = await loadTenant(tenantId);
  if (t.status === status) throw new UserError("A empresa já está nesta situação.");
  const db = systemDb();
  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ status, suspendedReason: status === "suspended" ? reason : null, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
    await tx.insert(billingEvents).values({ tenantId, kind: STATUS_KIND[status], note: reason, actor: actor.email });
    await tx.insert(platformAudit).values({ actorEmail: actor.email, action: `tenant.status.${status}`, tenantId, data: { from: t.status, to: status, reason } });
  });
}

export async function adminExtendTrial(actor: Actor, tenantId: string, daysRaw: number | string) {
  const days = z.coerce.number().int("Informe um número inteiro de dias").min(1, "Mínimo 1 dia").max(90, "Máximo 90 dias").parse(daysRaw);
  const t = await loadTenant(tenantId);
  if (t.status !== "trialing") throw new UserError("Só empresas em teste (ativo ou vencido) podem ter o teste prorrogado.");
  const base = Math.max(Date.now(), t.trialEndsAt?.getTime() ?? 0);
  const until = new Date(base + days * 86400000);
  const db = systemDb();
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({ trialEndsAt: until, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    await tx.insert(billingEvents).values({ tenantId, kind: "trial_extended", note: `+${days} dia${days === 1 ? "" : "s"} (até ${until.toISOString().slice(0, 10)})`, actor: actor.email });
    await tx.insert(platformAudit).values({ actorEmail: actor.email, action: "tenant.trial_extend", tenantId, data: { days, until: until.toISOString() } });
  });
  return until;
}

/** Reativa empresa suspensa ou cancelada (volta a ficar ativa). */
export async function adminReactivate(actor: Actor, tenantId: string, note?: string) {
  const t = await loadTenant(tenantId);
  if (t.status !== "suspended" && t.status !== "cancelled") throw new UserError("Só empresas suspensas ou canceladas podem ser reativadas.");
  const db = systemDb();
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({ status: "active", suspendedReason: null, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    await tx.insert(billingEvents).values({ tenantId, kind: "reactivated", note: note?.trim() || null, actor: actor.email });
    await tx.insert(platformAudit).values({ actorEmail: actor.email, action: "tenant.reactivate", tenantId, data: { from: t.status, note: note?.trim() || null } });
  });
}

/* ───────────── Planos ───────────── */

const optInt = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, c) => {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = Number(String(v).trim());
    if (!Number.isInteger(n) || n < 1) {
      c.addIssue({ code: "custom", message: "Use um número inteiro maior que zero, ou deixe em branco para ilimitado" });
      return z.NEVER;
    }
    return n;
  });

export const planSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(60),
  description: z.string().trim().max(300).default(""),
  price: z.union([z.string(), z.number()]).transform((v, c) => {
    const cents = typeof v === "number" ? Math.round(v * 100) : parseMoneyToCents(v);
    if (cents == null || cents < 0) {
      c.addIssue({ code: "custom", message: "Preço inválido (ex.: 129,00)" });
      return z.NEVER;
    }
    return cents;
  }),
  maxUsers: optInt,
  maxPools: optInt,
  features: z.array(z.string()).default([]).transform((a) => [...new Set(a)].filter((f) => FEATURE_CODES.includes(f))),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  public: z.boolean().default(false),
  active: z.boolean().default(false),
});

export async function listPlansAdmin() {
  const db = systemDb();
  return db
    .select({
      plan: plans,
      tenants: sql<number>`(select count(*)::int from tenants t where t.plan_id = "plans"."id")`,
    })
    .from(plans)
    .orderBy(asc(plans.sortOrder), asc(plans.priceCents));
}

export async function updatePlan(actor: Actor, id: string, input: z.input<typeof planSchema>) {
  const d = planSchema.parse(input);
  const db = systemDb();
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Plano não encontrado.");
  return db.transaction(async (tx) => {
    const [prev] = await tx.select().from(plans).where(eq(plans.id, id)).limit(1);
    if (!prev) throw new NotFoundError("Plano não encontrado.");
    const [row] = await tx
      .update(plans)
      .set({ name: d.name, description: d.description, priceCents: d.price, maxUsers: d.maxUsers, maxPools: d.maxPools, features: d.features, sortOrder: d.sortOrder, public: d.public, active: d.active, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    await tx.insert(platformAudit).values({
      actorEmail: actor.email,
      action: "plan.update",
      data: {
        code: prev.code,
        before: { name: prev.name, priceCents: prev.priceCents, maxUsers: prev.maxUsers, maxPools: prev.maxPools, features: prev.features, public: prev.public, active: prev.active },
        after: { name: row.name, priceCents: row.priceCents, maxUsers: row.maxUsers, maxPools: row.maxPools, features: row.features, public: row.public, active: row.active },
      },
    });
    return row;
  });
}

export async function createPlan(actor: Actor, code: string, input: z.input<typeof planSchema>) {
  const c = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_-]{1,30}$/, "Código: letras minúsculas, números, - ou _ (ex.: pro_anual)")
    .parse(code);
  const d = planSchema.parse(input);
  const db = systemDb();
  const [dupe] = await db.select({ id: plans.id }).from(plans).where(eq(plans.code, c)).limit(1);
  if (dupe) throw new UserError("Já existe um plano com esse código.");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(plans)
      .values({ code: c, name: d.name, description: d.description, priceCents: d.price, maxUsers: d.maxUsers, maxPools: d.maxPools, features: d.features, sortOrder: d.sortOrder, public: d.public, active: d.active })
      .returning();
    await tx.insert(platformAudit).values({ actorEmail: actor.email, action: "plan.create", data: { code: c, priceCents: row.priceCents } });
    return row;
  });
}

export async function listPlatformAudit(limit = 200) {
  return systemDb()
    .select({ a: platformAudit, tenantName: tenants.name })
    .from(platformAudit)
    .leftJoin(tenants, eq(tenants.id, platformAudit.tenantId))
    .orderBy(desc(platformAudit.createdAt))
    .limit(Math.min(500, limit));
}
