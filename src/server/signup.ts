import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { systemDb } from "@/db";
import { users, tenants, memberships, plans, parameterDefinitions, billingEvents } from "@/db/schema";
import { DEFAULT_PARAMETERS } from "@/lib/domain/catalog";
import { hashPassword, validatePassword, rateLimit } from "./auth";
import { UserError } from "./errors";

export const TRIAL_DAYS = 14;

export const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Informe o nome da empresa").max(120),
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: z.string().trim().max(30).optional(),
  password: z.string(),
  planCode: z.enum(["starter", "pro", "business"]).default("pro"),
  acceptTerms: z.literal(true, { error: "É preciso aceitar os termos de uso e a política de privacidade." }),
});

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "empresa";
}

/** Cria empresa + dono + parâmetros padrão (sem faixas) e inicia o teste grátis. */
export async function createAccount(input: z.input<typeof signupSchema>, opts: { isDemo?: boolean; skipRateLimit?: boolean } = {}) {
  const data = signupSchema.parse(input);
  validatePassword(data.password);
  if (!opts.skipRateLimit) await rateLimit(`signup:${data.email}`, 5, 60);
  const db = systemDb();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (exists) throw new UserError("Já existe uma conta com este e-mail. Entre ou recupere a senha.");
  const [plan] = await db.select().from(plans).where(eq(plans.code, data.planCode)).limit(1);
  const passwordHash = await hashPassword(data.password);

  return db.transaction(async (tx) => {
    const base = slugify(data.companyName);
    let slug = base;
    for (let i = 2; ; i++) {
      const [taken] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!taken) break;
      slug = `${base}-${i}`;
    }
    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug,
        name: data.companyName,
        phone: data.phone || null,
        email: data.email,
        planId: plan?.id,
        status: "trialing",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000),
        isDemo: !!opts.isDemo,
      })
      .returning();
    const [user] = await tx.insert(users).values({ email: data.email, name: data.name, phone: data.phone || null, passwordHash }).returning();
    await tx.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
    await tx.insert(parameterDefinitions).values(
      DEFAULT_PARAMETERS.map((p, i) => ({ tenantId: tenant.id, key: p.key, label: p.label, unit: p.unit, appliesTo: p.appliesTo ?? null, sortOrder: i })),
    );
    await tx.insert(billingEvents).values({ tenantId: tenant.id, kind: "trial_started", planCode: data.planCode, note: `${TRIAL_DAYS} dias de teste` });
    return { tenant, user };
  });
}
