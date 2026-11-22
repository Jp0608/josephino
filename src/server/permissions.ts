import type { Role } from "@/db/schema";

export const PERMISSIONS = [
  "dashboard.view",
  "customers.read",
  "customers.write",
  "customers.internal_notes",
  "pools.write",
  "agenda.view_all",
  "agenda.write",
  "visits.execute",
  "reports.read",
  "inventory.read",
  "inventory.write",
  "finance.read",
  "finance.write",
  "contracts.write",
  "team.manage",
  "crm.use",
  "settings.manage",
  "billing.manage",
  "audit.read",
  "insights.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const without = (...p: Permission[]) => new Set(PERMISSIONS.filter((x) => !p.includes(x)));

const MATRIX: Record<Role, Set<Permission>> = {
  owner: ALL,
  admin: without("billing.manage"),
  manager: without("billing.manage", "team.manage", "settings.manage"),
  supervisor: new Set<Permission>([
    "dashboard.view", "customers.read", "customers.write", "customers.internal_notes", "pools.write",
    "agenda.view_all", "agenda.write", "visits.execute", "reports.read", "inventory.read", "inventory.write",
  ]),
  // Técnico vê apenas o necessário: a própria agenda, as piscinas que atende e executa visitas.
  technician: new Set<Permission>(["visits.execute", "reports.read", "inventory.read"]),
  finance: new Set<Permission>(["dashboard.view", "customers.read", "finance.read", "finance.write", "contracts.write", "reports.read", "insights.view"]),
  sales: new Set<Permission>(["dashboard.view", "customers.read", "customers.write", "crm.use", "contracts.write"]),
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  supervisor: "Supervisor",
  technician: "Técnico",
  finance: "Financeiro",
  sales: "Comercial",
};

export function can(role: Role, p: Permission) {
  return MATRIX[role]?.has(p) ?? false;
}
