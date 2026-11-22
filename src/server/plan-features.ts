/**
 * Códigos de recurso conhecidos pelo app (coluna plans.features).
 * Os planos em si (preço, limites, quais recursos) vivem no banco e são editados em /admin.
 * Sem "server-only": também é usado em componentes de cliente para rótulos.
 */
export const FEATURE_LABEL: Record<string, string> = {
  core: "Agenda, clientes e piscinas",
  reports: "Relatórios técnicos",
  portal: "Portal do cliente",
  whatsapp: "WhatsApp",
  automations: "Automações",
  finance: "Financeiro",
  contracts: "Contratos e planos de serviço",
  inventory: "Estoque de produtos",
  routes: "Rotas",
  crm: "CRM comercial",
  insights: "Indicadores",
  team: "Gestão de equipe",
  advanced_permissions: "Permissões avançadas",
  ai: "Assistente com IA",
  multiunit: "Várias unidades",
  api: "API",
};

export const FEATURE_CODES = Object.keys(FEATURE_LABEL);

export function featureLabel(code: string) {
  return FEATURE_LABEL[code] ?? code;
}
