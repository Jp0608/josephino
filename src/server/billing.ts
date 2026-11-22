import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { plans, memberships, pools, billingEvents, customers, visits, measurements, technicalReports, invoices } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { ForbiddenError, UserError } from "./errors";
import { can } from "./permissions";
import { paymentGatewayConfigured } from "./integrations";
import { NAV } from "@/lib/nav";

type C = Pick<Ctx, "tenantId" | "userId" | "role" | "plan" | "email">;

function assertBilling(ctx: C) {
  if (!can(ctx.role, "billing.manage")) throw new ForbiddenError();
}

export const BILLING_EVENT_LABEL: Record<string, string> = {
  trial_started: "Teste grátis iniciado",
  plan_change_requested: "Mudança de plano solicitada",
  plan_changed: "Plano alterado",
  payment_confirmed: "Pagamento confirmado",
  suspended: "Conta suspensa",
  reactivated: "Conta reativada",
  trial_extended: "Teste prorrogado",
  status_active: "Assinatura ativada",
  status_past_due: "Pagamento pendente",
  status_cancelled: "Assinatura cancelada",
};

export async function getUsage(ctx: Pick<Ctx, "tenantId">) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [{ u }] = await tx
      .select({ u: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.active, true)));
    const [{ p }] = await tx
      .select({ p: sql<number>`count(*)::int` })
      .from(pools)
      .where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.active, true)));
    return { users: u, pools: p };
  });
}

export async function getBillingOverview(ctx: C) {
  assertBilling(ctx);
  const usage = await getUsage(ctx);
  return withTenant(ctx.tenantId, async (tx) => {
    const catalog = await tx.select().from(plans).where(and(eq(plans.public, true), eq(plans.active, true))).orderBy(asc(plans.sortOrder), asc(plans.priceCents));
    const events = await tx.select().from(billingEvents).where(eq(billingEvents.tenantId, ctx.tenantId)).orderBy(desc(billingEvents.createdAt)).limit(100);
    return { usage, catalog, events, gatewayConfigured: paymentGatewayConfigured() };
  });
}

/** Mensagem de bloqueio se o uso atual não cabe nos limites do plano de destino (ou null se cabe). */
export function limitBlockers(usage: { users: number; pools: number }, target: Pick<typeof plans.$inferSelect, "maxUsers" | "maxPools" | "name">) {
  const out: string[] = [];
  if (target.maxUsers != null && usage.users > target.maxUsers)
    out.push(`${usage.users} usuários ativos (o ${target.name} permite ${target.maxUsers}) — desative ${usage.users - target.maxUsers} em Equipe`);
  if (target.maxPools != null && usage.pools > target.maxPools)
    out.push(`${usage.pools} piscinas ativas (o ${target.name} permite ${target.maxPools}) — desative ${usage.pools - target.maxPools}`);
  return out;
}

/**
 * Registra o pedido de mudança de plano. O gateway de pagamento não está conectado:
 * nada é ativado aqui — a equipe Ondaro confirma a ativação após o pagamento.
 */
export async function requestPlanChange(ctx: C, planCode: string) {
  assertBilling(ctx);
  const usage = await getUsage(ctx);
  return withTenant(ctx.tenantId, async (tx) => {
    const [target] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.code, String(planCode)), eq(plans.public, true), eq(plans.active, true)))
      .limit(1);
    if (!target) throw new UserError("Plano não disponível.");
    const blockers = limitBlockers(usage, target);
    if (blockers.length) throw new UserError(`Não é possível mudar para o ${target.name} agora: ${blockers.join("; ")}.`);
    const since = new Date(Date.now() - 24 * 3600000);
    const [recent] = await tx
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(and(eq(billingEvents.tenantId, ctx.tenantId), eq(billingEvents.kind, "plan_change_requested"), eq(billingEvents.planCode, target.code), gte(billingEvents.createdAt, since)))
      .limit(1);
    if (recent) return { duplicate: true, plan: target };
    const isCurrent = ctx.plan?.id === target.id;
    await tx.insert(billingEvents).values({
      tenantId: ctx.tenantId,
      kind: "plan_change_requested",
      planCode: target.code,
      amountCents: target.priceCents,
      note: isCurrent ? `Pedido de ativação do plano atual (${target.name})` : `De ${ctx.plan?.name ?? "sem plano"} para ${target.name}`,
      actor: ctx.email,
    });
    await audit(tx, ctx, "billing.plan_change_requested", "tenant", ctx.tenantId, { planCode: target.code });
    return { duplicate: false, plan: target };
  });
}

/** Plano público mais barato (menor ordem) que inclui o recurso do item de menu bloqueado. */
export async function planForFeatureLabel(ctx: Pick<Ctx, "tenantId">, label: string) {
  const item = NAV.find((n) => n.label === label);
  if (!item?.feature) return null;
  const feature = item.feature;
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.select().from(plans).where(and(eq(plans.public, true), eq(plans.active, true))).orderBy(asc(plans.sortOrder), asc(plans.priceCents));
    return rows.find((p) => p.features.includes(feature)) ?? null;
  });
}

/** Portabilidade (LGPD): dados da empresa em JSON. Somente desta empresa, sob RLS. */
export async function exportTenantData(ctx: C) {
  assertBilling(ctx);
  return withTenant(ctx.tenantId, async (tx) => {
    const t = ctx.tenantId;
    const c = await tx.select().from(customers).where(eq(customers.tenantId, t)).orderBy(asc(customers.createdAt));
    const p = await tx.select().from(pools).where(eq(pools.tenantId, t)).orderBy(asc(pools.createdAt));
    const v = await tx.select().from(visits).where(eq(visits.tenantId, t)).orderBy(asc(visits.scheduledStart));
    const m = await tx.select().from(measurements).where(eq(measurements.tenantId, t));
    const r = await tx
        .select({
          id: technicalReports.id,
          protocol: technicalReports.protocol,
          visitId: technicalReports.visitId,
          poolId: technicalReports.poolId,
          customerId: technicalReports.customerId,
          createdAt: technicalReports.createdAt,
          viewCount: technicalReports.viewCount,
          lastViewedAt: technicalReports.lastViewedAt,
          acknowledgedAt: technicalReports.acknowledgedAt,
          acknowledgedName: technicalReports.acknowledgedName,
          revokedAt: technicalReports.revokedAt,
        })
        .from(technicalReports)
        .where(eq(technicalReports.tenantId, t))
        .orderBy(asc(technicalReports.createdAt));
    const i = await tx.select().from(invoices).where(eq(invoices.tenantId, t)).orderBy(asc(invoices.dueOn));
    await audit(tx, ctx, "data.export", "tenant", t, { customers: c.length, visits: v.length });
    // Tokens de links públicos não fazem parte da exportação (são credenciais de acesso).
    return {
      customers: c.map(({ portalToken: _t, ...rest }) => rest),
      pools: p,
      visits: v,
      measurements: m,
      reports: r,
      invoices: i,
    };
  });
}
