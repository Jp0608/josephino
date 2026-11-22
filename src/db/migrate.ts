import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { systemDb } from "./index";
import { plans } from "./schema";
import { sql } from "drizzle-orm";

/** Planos iniciais. Preços e limites são editáveis em /admin, sem mudar código. */
export const DEFAULT_PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "Para o piscineiro autônomo",
    priceCents: 5900,
    maxUsers: 1,
    maxPools: 60,
    features: ["core", "reports", "portal"],
    sortOrder: 1,
  },
  {
    code: "pro",
    name: "Pro",
    description: "Para o profissional em crescimento",
    priceCents: 12900,
    maxUsers: 3,
    maxPools: 250,
    features: ["core", "reports", "portal", "whatsapp", "automations", "finance", "contracts", "inventory", "routes", "crm", "insights"],
    sortOrder: 2,
  },
  {
    code: "business",
    name: "Business",
    description: "Para empresas de manutenção com equipe",
    priceCents: 29900,
    maxUsers: 25,
    maxPools: null,
    features: ["core", "reports", "portal", "whatsapp", "automations", "finance", "contracts", "inventory", "routes", "crm", "insights", "team", "advanced_permissions", "ai", "multiunit"],
    sortOrder: 3,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Operações com várias unidades — sob consulta",
    priceCents: 0,
    maxUsers: null,
    maxPools: null,
    features: ["core", "reports", "portal", "whatsapp", "automations", "finance", "contracts", "inventory", "routes", "crm", "insights", "team", "advanced_permissions", "ai", "multiunit", "api"],
    sortOrder: 4,
  },
];

export async function runMigrations() {
  const db = systemDb();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  for (const p of DEFAULT_PLANS) {
    await db.insert(plans).values(p).onConflictDoNothing({ target: plans.code });
  }
  await db.execute(sql`select 1`);
}
