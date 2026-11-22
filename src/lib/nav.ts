import type { Permission } from "@/server/permissions";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission; feature?: string; group: "operacao" | "gestao" | "crescimento" | "conta" };

export const NAV: NavItem[] = [
  { href: "/app", label: "Início", icon: "home", group: "operacao" },
  { href: "/app/agenda", label: "Agenda", icon: "calendar", group: "operacao" },
  { href: "/app/clientes", label: "Clientes", icon: "users", perm: "customers.read", group: "operacao" },
  { href: "/app/piscinas", label: "Piscinas", icon: "waves", perm: "customers.read", group: "operacao" },
  { href: "/app/relatorios", label: "Relatórios", icon: "file", perm: "reports.read", group: "operacao" },
  { href: "/app/solicitacoes", label: "Solicitações", icon: "inbox", perm: "agenda.write", group: "operacao" },
  { href: "/app/estoque", label: "Estoque", icon: "flask", perm: "inventory.read", feature: "inventory", group: "gestao" },
  { href: "/app/financeiro", label: "Financeiro", icon: "wallet", perm: "finance.read", feature: "finance", group: "gestao" },
  { href: "/app/contratos", label: "Contratos e planos", icon: "repeat", perm: "contracts.write", feature: "contracts", group: "gestao" },
  { href: "/app/equipe", label: "Equipe", icon: "badge", perm: "team.manage", group: "gestao" },
  { href: "/app/crm", label: "CRM comercial", icon: "target", perm: "crm.use", feature: "crm", group: "crescimento" },
  { href: "/app/mensagens", label: "Mensagens", icon: "message", perm: "agenda.write", group: "crescimento" },
  { href: "/app/indicadores", label: "Indicadores", icon: "chart", perm: "insights.view", feature: "insights", group: "crescimento" },
  { href: "/app/configuracoes", label: "Configurações", icon: "settings", perm: "settings.manage", group: "conta" },
  { href: "/app/plano", label: "Plano e assinatura", icon: "card", perm: "billing.manage", group: "conta" },
];

export const NAV_GROUP_LABEL = { operacao: "Operação", gestao: "Gestão", crescimento: "Crescimento", conta: "Conta" };
