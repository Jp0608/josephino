import type { VisitStatus, LeadStage } from "@/db/schema";

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  on_the_way: "A caminho",
  in_progress: "Em andamento",
  waiting_info: "Aguardando informações",
  completed: "Concluída",
  not_done: "Não realizada",
  rescheduled: "Reagendada",
  cancelled: "Cancelada",
};
export const VISIT_STATUS_TONE: Record<VisitStatus, "neutral" | "info" | "warn" | "ok" | "danger"> = {
  scheduled: "neutral",
  confirmed: "info",
  on_the_way: "info",
  in_progress: "warn",
  waiting_info: "warn",
  completed: "ok",
  not_done: "danger",
  rescheduled: "neutral",
  cancelled: "danger",
};
export const OPEN_VISIT_STATUSES: VisitStatus[] = ["scheduled", "confirmed", "on_the_way", "in_progress", "waiting_info"];

export const SERVICE_TYPES: Record<string, string> = {
  manutencao: "Manutenção de rotina",
  tratamento: "Tratamento de água",
  recuperacao: "Recuperação (água verde)",
  limpeza_pesada: "Limpeza pesada",
  equipamento: "Manutenção de equipamento",
  vistoria: "Vistoria / orçamento",
  outro: "Outro serviço",
};

export const POOL_USAGE: Record<string, string> = {
  residencial: "Residencial",
  condominio: "Condomínio",
  comercial: "Comercial",
  hotel: "Hotel / pousada",
  academia: "Academia",
  clube: "Clube",
  outro: "Outro",
};
export const LINING: Record<string, string> = { vinil: "Vinil", azulejo: "Azulejo / pastilha", fibra: "Fibra", concreto: "Concreto / pintura", outro: "Outro" };
export const DISINFECTION: Record<string, string> = { cloro: "Cloro", sal: "Gerador de cloro (sal)", ozonio: "Ozônio", uv: "Ultravioleta", ionizador: "Ionizador", outro: "Outro" };

/** Inspeção visual. Estados: ok | attention | problem | not_checked. */
export const CHECKLIST = [
  { key: "agua_transparente", label: "Água transparente" },
  { key: "agua_turva", label: "Água turva" },
  { key: "agua_verde", label: "Água esverdeada" },
  { key: "algas", label: "Presença de algas" },
  { key: "sujeira", label: "Sujeira no fundo" },
  { key: "folhas", label: "Folhas e resíduos" },
  { key: "odor", label: "Odor anormal" },
  { key: "bordas", label: "Estado das bordas" },
  { key: "revestimento", label: "Estado do revestimento" },
  { key: "bomba", label: "Funcionamento da bomba" },
  { key: "filtro", label: "Funcionamento do filtro" },
  { key: "equipamentos", label: "Condições dos equipamentos" },
];
export const CHECK_STATE_LABEL: Record<string, string> = { ok: "Normal", attention: "Atenção", problem: "Problema", not_checked: "Não verificado" };

export const PROCEDURES = [
  { key: "aspiracao", label: "Aspiração" },
  { key: "escovacao", label: "Escovação" },
  { key: "peneiracao", label: "Peneiração" },
  { key: "bordas", label: "Limpeza das bordas" },
  { key: "retrolavagem", label: "Retrolavagem" },
  { key: "enxague", label: "Enxágue do filtro" },
  { key: "pre_filtro", label: "Limpeza do pré-filtro" },
  { key: "bomba", label: "Verificação da bomba" },
  { key: "correcao_ph", label: "Correção de pH" },
  { key: "alcalinidade", label: "Ajuste de alcalinidade" },
  { key: "desinfeccao", label: "Desinfecção" },
  { key: "algas", label: "Tratamento contra algas" },
  { key: "clarificacao", label: "Clarificação" },
  { key: "decantacao", label: "Decantação" },
];

/** Parâmetros iniciais: rótulos e unidades. As FAIXAS ficam vazias até a empresa configurar. */
export const DEFAULT_PARAMETERS = [
  { key: "ph", label: "pH", unit: "" },
  { key: "cloro_livre", label: "Cloro livre", unit: "mg/L" },
  { key: "cloro_total", label: "Cloro total", unit: "mg/L" },
  { key: "alcalinidade", label: "Alcalinidade total", unit: "mg/L" },
  { key: "dureza", label: "Dureza cálcica", unit: "mg/L" },
  { key: "cianurico", label: "Ácido cianúrico", unit: "mg/L" },
  { key: "temperatura", label: "Temperatura", unit: "°C" },
  { key: "salinidade", label: "Salinidade", unit: "mg/L", appliesTo: "sal" },
];

export const MEASURE_METHODS: Record<string, string> = { kit: "Kit reagente", fotometro: "Fotômetro", tira: "Fita / tira", sonda: "Sonda digital", outro: "Outro" };

export const PRODUCT_CATEGORIES: Record<string, string> = {
  desinfetante: "Desinfetante (cloro)",
  ph: "Corretor de pH",
  alcalinidade: "Alcalinidade",
  algicida: "Algicida",
  clarificante: "Clarificante",
  floculante: "Floculante / decantador",
  oxidante: "Oxidante",
  limpeza: "Limpeza",
  outro: "Outro",
};
export const UNITS = ["kg", "g", "L", "mL", "un"];

export const MOVEMENT_KIND: Record<string, string> = {
  entrada: "Entrada (compra)",
  saida: "Saída",
  consumo_visita: "Consumo em visita",
  ajuste: "Ajuste de inventário",
  perda: "Perda / avaria",
  devolucao: "Devolução",
  transferencia: "Transferência",
};

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "Lead novo",
  contacted: "Primeiro contato",
  qualified: "Qualificado",
  quote_sent: "Orçamento enviado",
  negotiation: "Negociação",
  won: "Fechado",
  lost: "Perdido",
};

export const EXPENSE_CATEGORIES: Record<string, string> = {
  produtos: "Produtos químicos",
  combustivel: "Combustível",
  veiculo: "Manutenção de veículos",
  equipamentos: "Equipamentos",
  pessoal: "Funcionários",
  fornecedores: "Fornecedores",
  administrativo: "Administrativo",
  outro: "Outro",
};
export const PAYMENT_METHODS: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão", dinheiro: "Dinheiro", transferencia: "Transferência" };
export const INVOICE_KIND: Record<string, string> = { mensalidade: "Mensalidade", avulso: "Serviço avulso", tratamento: "Tratamento especial", produto: "Venda de produto", outro: "Outro" };
