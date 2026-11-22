import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { systemDb } from "./index";
import { plans } from "./schema";
import { sql } from "drizzle-orm";

/** Planos iniciais. Preços e limites são editáveis em /admin, sem mudar código. */
export const DEFAULT_PLANS = [
  {
    code: "pro",
    name: "Profissional",
    description: "A operação completa para quem atende piscinas todos os dias",
    priceCents: 12900,
    maxUsers: 3,
    maxPools: null,
    features: ["core", "reports", "portal", "whatsapp", "finance", "contracts", "inventory", "crm", "insights", "team"],
    sortOrder: 1,
  },
  {
    code: "business",
    name: "Empresa",
    description: "Para empresas com equipes, várias funções e muitos clientes",
    priceCents: 29900,
    maxUsers: 30,
    maxPools: null,
    features: ["core", "reports", "portal", "whatsapp", "finance", "contracts", "inventory", "crm", "insights", "team", "advanced_permissions", "support_priority", "ai", "multiunit", "api"],
    sortOrder: 2,
  },
  // Fora da vitrine: mantidos só para contas antigas e negociações sob consulta.
  { code: "starter", name: "Starter", description: "Plano antigo (fora da vitrine)", priceCents: 5900, maxUsers: 1, maxPools: 60, features: ["core", "reports", "portal"], sortOrder: 9, public: false },
  { code: "enterprise", name: "Enterprise", description: "Sob consulta", priceCents: 0, maxUsers: null, maxPools: null, features: ["core", "reports", "portal", "whatsapp", "finance", "contracts", "inventory", "crm", "insights", "team", "advanced_permissions", "support_priority", "ai", "multiunit", "api"], sortOrder: 10, public: false },
];

export async function runMigrations() {
  const db = systemDb();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle"), migrationsSchema: "ondaro" });
  for (const p of DEFAULT_PLANS) {
    await db.insert(plans).values(p).onConflictDoNothing({ target: plans.code });
  }
  await db.execute(sql`select 1`);
}
