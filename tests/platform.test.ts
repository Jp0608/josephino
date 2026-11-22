import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { billingEvents, plans, platformAudit, tenants } from "@/db/schema";
import { getPlatformMetrics, updatePlan, listPlansAdmin, adminSetStatus, adminExtendTrial, adminChangePlan, adminReactivate, listTenants } from "@/server/platform";
import { requestPlanChange, getUsage } from "@/server/billing";
import { UserError } from "@/server/errors";
import { newTenant, systemDb } from "./helpers";

const actor = { email: "admin@ondaro.dev" };

describe("Super administrador", () => {
  it("edição de plano persiste (preço, limites, recursos, visibilidade)", async () => {
    const [starter] = await systemDb().select().from(plans).where(eq(plans.code, "starter"));
    const row = await updatePlan(actor, starter.id, {
      name: "Starter+",
      description: "Novo texto",
      price: "79,90",
      maxUsers: "2",
      maxPools: "",
      features: ["core", "reports", "crm", "inexistente"],
      sortOrder: 1,
      public: true,
      active: true,
    });
    expect(row.priceCents).toBe(7990);
    const [again] = await systemDb().select().from(plans).where(eq(plans.id, starter.id));
    expect(again.name).toBe("Starter+");
    expect(again.maxUsers).toBe(2);
    expect(again.maxPools).toBeNull();
    expect(again.features).toEqual(["core", "reports", "crm"]);
    const audit = await systemDb().select().from(platformAudit).where(eq(platformAudit.action, "plan.update"));
    expect(audit.length).toBeGreaterThan(0);
    await expect(updatePlan(actor, starter.id, { name: "X", price: "-1" })).rejects.toThrow();
    // restaura
    await updatePlan(actor, starter.id, { ...starter, price: String(starter.priceCents / 100), maxUsers: String(starter.maxUsers), maxPools: String(starter.maxPools), features: starter.features });
    expect((await listPlansAdmin()).length).toBeGreaterThanOrEqual(4);
  });

  it("métricas contam corretamente (ativas, teste, vencido, suspensas, MRR, conversão)", async () => {
    const before = await getPlatformMetrics();
    const a = await newTenant("pro");
    const b = await newTenant("business");
    const c = await newTenant("starter");
    const d = await newTenant("starter");
    await adminSetStatus(actor, a.tenantId, "active");
    await systemDb().update(tenants).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(tenants.id, b.tenantId));
    await expect(adminSetStatus(actor, c.tenantId, "suspended")).rejects.toBeInstanceOf(UserError);
    await adminSetStatus(actor, c.tenantId, "suspended", "Uso indevido");
    await adminSetStatus(actor, d.tenantId, "past_due");

    const after = await getPlatformMetrics();
    const [pro] = await systemDb().select().from(plans).where(eq(plans.code, "pro"));
    expect(after.total - before.total).toBe(4);
    expect(after.active - before.active).toBe(1);
    expect(after.trialExpired - before.trialExpired).toBe(1);
    expect(after.suspended - before.suspended).toBe(1);
    expect(after.pastDue - before.pastDue).toBe(1);
    expect(after.trialing - before.trialing).toBe(0);
    expect(after.newSignups30 - before.newSignups30).toBe(4);
    expect(after.mrrCents - before.mrrCents).toBe(pro.priceCents);
    expect(after.paying - before.paying).toBe(2);

    const listed = await listTenants({ q: a.tenant.name });
    expect(listed.find((t) => t.id === a.tenantId)?.users).toBe(1);
    expect(listed.find((t) => t.id === b.tenantId)?.effectiveStatus ?? "trial_expired").toBe("trial_expired");

    // prorrogar teste vencido volta a "em teste"; billing_events e platform_audit registrados
    await adminExtendTrial(actor, b.tenantId, 7);
    const m3 = await getPlatformMetrics();
    expect(m3.trialing - before.trialing).toBe(1);
    await adminChangePlan(actor, b.tenantId, "pro", "upgrade combinado");
    await adminReactivate(actor, c.tenantId);
    const ev = await systemDb().select().from(billingEvents).where(eq(billingEvents.tenantId, b.tenantId));
    expect(ev.map((e) => e.kind)).toEqual(expect.arrayContaining(["trial_started", "trial_extended", "plan_changed"]));
    const pa = await systemDb().select().from(platformAudit).where(eq(platformAudit.tenantId, c.tenantId));
    expect(pa.map((e) => e.action)).toEqual(expect.arrayContaining(["tenant.status.suspended", "tenant.reactivate"]));
    expect(pa.every((e) => e.actorEmail === actor.email)).toBe(true);
  });

  it("pedido de plano só registra evento (não ativa) e bloqueia downgrade acima do limite", async () => {
    const t = await newTenant("business");
    const ctx = { ...t, email: "dono@test.dev" };
    const r = await requestPlanChange(ctx, "pro");
    expect(r.duplicate).toBe(false);
    const [tt] = await systemDb().select().from(tenants).where(eq(tenants.id, t.tenantId));
    expect(tt.planId).toBe(t.plan.id);
    expect(tt.status).toBe("trialing");
    const ev = await systemDb().select().from(billingEvents).where(eq(billingEvents.tenantId, t.tenantId));
    expect(ev.some((e) => e.kind === "plan_change_requested" && e.planCode === "pro")).toBe(true);
    expect((await requestPlanChange(ctx, "pro")).duplicate).toBe(true);
    // 4 usuários ativos não cabem no Profissional (3 usuários)
    const { addMember } = await import("./helpers");
    const t2 = await newTenant("business");
    for (let i = 0; i < 3; i++) await addMember(t2.tenantId, "technician");
    expect((await getUsage(t2)).users).toBe(4);
    await expect(requestPlanChange({ ...t2, email: "dono2@test.dev" }, "pro")).rejects.toThrow(/usuários ativos/);
    // plano fora da vitrine não pode ser pedido
    await expect(requestPlanChange(ctx, "starter")).rejects.toThrow();
  });
});
