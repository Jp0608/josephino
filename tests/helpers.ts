import { createAccount } from "@/server/signup";
import type { Role } from "@/db/schema";
import { systemDb } from "@/db";
import { users, memberships, plans, tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/server/auth";

let n = 0;
/** Cria uma empresa nova (dono + plano business) e devolve um ctx de serviço. */
export async function newTenant(planCode: "starter" | "pro" | "business" = "business") {
  n++;
  const email = `owner${Date.now()}${n}@test.dev`;
  const { tenant, user } = await createAccount(
    { companyName: `Empresa ${n}`, name: `Dono ${n}`, email, password: "senha1234", planCode, acceptTerms: true },
    { skipRateLimit: true },
  );
  const [plan] = await systemDb().select().from(plans).where(eq(plans.id, tenant.planId!));
  return { tenantId: tenant.id, userId: user.id, role: "owner" as Role, plan, tenant };
}

export async function addMember(tenantId: string, role: Role) {
  n++;
  const [u] = await systemDb()
    .insert(users)
    .values({ email: `m${Date.now()}${n}@test.dev`, name: `Membro ${n}`, passwordHash: await hashPassword("senha1234") })
    .returning();
  await systemDb().insert(memberships).values({ tenantId, userId: u.id, role });
  return { tenantId, userId: u.id, role };
}

export { systemDb, tenants };
