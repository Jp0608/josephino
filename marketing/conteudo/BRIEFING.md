# Briefing de conteúdo — Ondaro (leia inteiro antes de escrever)

## Produto (fatos — só afirme o que está aqui)
Ondaro (ondaro.vercel.app): app web mobile para piscineiros autônomos e empresas de manutenção de piscinas, no Brasil.
- Agenda com recorrência (ex.: toda terça e sexta às 8h), aviso de conflito de horário, visita duplicada bloqueada, Maps/Waze.
- Atendimento no celular em 8 etapas: identificação (última visita, recomendações pendentes), inspeção visual (Normal/Atenção/Problema/Não verificado), parâmetros da água (pH, cloro livre/total, alcalinidade, dureza, ácido cianúrico, temperatura, salinidade) comparados com FAIXAS CONFIGURADAS PELA EMPRESA (o app não define limites técnicos), serviços realizados, produtos aplicados (com lote e baixa no estoque), observações/recomendações, fotos antes/depois, finalização.
- Funciona sem internet (rascunho salvo no aparelho, sincroniza depois).
- Ao finalizar: relatório técnico com a marca da empresa (logo, cor), protocolo, link privado; envio em 1 toque pelo WhatsApp do próprio profissional (envio automático pela API oficial ainda NÃO está ligado — nunca diga que envia sozinho); o cliente pode registrar ciência.
- Portal do cliente por link: próximas visitas, evolução da água em gráfico, histórico de relatórios, pedido de visita/problema. Nunca mostra notas internas.
- Prontuário permanente de cada piscina + QR code na casa de máquinas.
- Estoque de químicos (alertas de mínimo/validade, custo químico por cliente), financeiro (contas a receber/pagar — pagamento registrado manualmente; NÃO há Pix/boleto automático), contratos que geram mensalidades e agenda, CRM com funil e propostas com aceite por link, equipe com funções e permissões (técnico vê só a própria agenda), indicadores.
- Planos: Profissional R$129/mês (até 3 usuários), Empresa R$299/mês (até 30 usuários, funções/permissões, suporte prioritário). 14 dias grátis, sem cartão. Em desenvolvimento (NÃO prometa como pronto): assistente com IA, várias unidades, API.
- O Ondaro NÃO recomenda dosagem. Registra o que o profissional fez. Não presume que a piscina está liberada.

## Mercado (pesquisa de 23/11/2026 — use, cite fonte quando citar número)
- Concorrentes BR mais baratos com funções parecidas: AquApp (grátis/R$67/R$147), Piscina Prime (R$75/R$150, fala em IA), Kloro (R$49,90). NÃO cite concorrentes por nome no conteúdo. Nunca fale mal de concorrente.
- Dores documentadas (fontes internacionais): cliente que diz "ninguém veio"; inadimplência e cobrança; falta de comunicação é uma das maiores queixas dos donos de piscina; medo de reajustar preço; "nunca desligar" da cabeça; apps lentos/difíceis de configurar.
- Reclame Aqui BR (títulos): "Serviço pago e não realizado", "Falta de compromisso", água verde por 20 dias sem técnico.
- Mitos com evidência: água verde nem sempre é só falta de cloro (pH fora de faixa, metais oxidados) — Olhar Digital 21/08/2026; cheiro forte de "cloro" vem de cloraminas (cloro reagindo com suor/urina) — Folha PE; aplicar todos os produtos juntos atrapalha (Olhar Digital); receitas caseiras (gelatina, vinagre) circulam em portais.
- Quanto cobrar (fontes comerciais, números divergentes): R$150–300/mês (Cronoshare), R$350–600/mês (Revista Oeste 12/2025), ~R$80/visita (GetNinjas). Apresente como faixas encontradas, nunca como recomendação.
- Piscineiro pode ser MEI (CNAE 8129-0/00) — contabilidade.com.
- Resolução CFQ 332/2025 (responsável químico/ART em piscinas coletivas) é contestada (OAB-SP); status atual NÃO verificado — se usar, marque "[verificar status antes de publicar]".
- ANAPP (via imprensa, sem data): Brasil tem 3,5+ milhões de piscinas.
- Sazonalidade: pico de venda nov–dez; verão = crise de água verde; inverno: manter tratamento.
- Instagram OFICIAL: sinais principais watch time, likes, sends (Mosseri, 01/2025); sends pesam mais com não seguidores; conteúdo original é exigido (abr/2026) — sem marca d'água/repost; Trial Reels testam com não seguidores; carrosséis indo bem. Nada de "fórmula do algoritmo".
- Criadores do nicho: vídeos "satisfatórios" de limpeza de piscina suja viralizam (Rhuan Félix ~2,3M TikTok em 2022).

## Posicionamento
Ondaro = o padrão profissional da manutenção de piscinas. Não é "mais um app de agenda".
Promessa central: "Cada piscina com prontuário. Cada visita com prova." / "Piscineiro que documenta não discute."
Para quem: (1) piscineiro em crescimento que atende cliente exigente (condomínio, alto padrão, hotel, academia) e quer cobrar mais e perder menos clientes; (2) empresas com técnicos que precisam saber o que cada um fez.
Inimigo comum: o "achismo" (caderno, memória, foto perdida na galeria, "confia em mim").
Tom: direto, de igual para igual com o piscineiro, sem jargão de marketing, sem coach, sem promessa de resultado, humor leve permitido, frases curtas, "você". Emojis com moderação (0–2 por legenda).
Proibido: "revolucionário", "solução completa", "nunca mais", "garantido", números inventados, depoimentos inventados, histórias apresentadas como reais que não aconteceram (use "Cena comum:", "Imagine:"), dosagens de produtos, prometer envio automático/Pix/IA.

## Identidade visual (para direção de arte)
Cores: abismo #06263A (fundo escuro), raia #0B6E99 / #1391BE (ação), espuma #5EEAD4 (destaque), fundo claro #F5F8FA, texto #0B1D29. Tipos: Manrope ExtraBold (títulos), Inter (texto). Símbolo: anel com onda. Estética limpa, premium, muito respiro; telas reais do app em moldura de celular. Vídeos: gravados em campo pelo piscineiro (originais), com legendas grandes, cortes secos, sem marca d'água de outro app.
Telas reais disponíveis para artes (use estes nomes em "img"): 01-inicio (painel com próximo atendimento), 02-agenda (agenda do dia), 03-inspecao (checklist), 04-agua (medições com faixa), 05-fotos (antes/depois), 06-finalizado (atendimento finalizado + botão WhatsApp), 07-relatorio (relatório com marca), 07b-relatorio-agua (tabela da água no relatório), 08-portal (portal do cliente).

## Formato de saída (OBRIGATÓRIO) — um arquivo JSON (array), um objeto por peça:
{
 "id": "R01" | "C01" | "S01" | "E01",
 "formato": "Reel" | "Carrossel" | "Stories" | "Estático",
 "pilar": "Descoberta" | "Identificação" | "Educação" | "Negócio do piscineiro" | "Produto" | "Prova" | "Conversão" | "Relacionamento",
 "titulo": "nome interno curto",
 "objetivo": "1 frase: o que essa peça deve causar e por quê",
 "publico": "quem exatamente",
 "metrica_principal": "ex.: envios por alcance / salvamentos / visitas ao perfil / cliques no link",
 "gancho": "texto/falas dos 1–3 primeiros segundos (Reel) ou capa (Carrossel)",
 "roteiro": [ {"tempo":"0–3s","cena":"o que aparece","fala":"texto falado","tela":"texto na tela"} ... ]   // Reels e Stories (stories: cada item = 1 story, use "tempo":"Story 1")
 "slides": [ ... ]   // Carrossel e Estático: slides no esquema do motor de artes (abaixo)
 "edicao": "direção de edição, ritmo, duração estimada, som/estilo sonoro (sem nomear músicas protegidas; sugerir 'áudio em alta no momento' só se fizer sentido)",
 "legenda": "legenda completa pronta para postar (com quebras de linha \n), primeira linha forte, palavras-chave naturais do nicho (piscina, piscineiro, manutenção de piscina, água verde, pH, cloro...)",
 "cta": "chamada final",
 "hashtags": "3–5 hashtags relevantes ou vazio",
 "justificativa": "por que essa peça existe, qual mecanismo (identificação, utilidade, contraste...) e qual evidência da pesquisa a sustenta",
 "reaproveitamento": "como vira TikTok/Shorts/Stories/carrossel"
}

### Esquema dos slides (motor de artes 1080x1350). Tipos:
- {"type":"cover","theme":"dark|light|blue","kicker":"curto","title":"título (pode usar <span class='hl'>destaque</span>)","sub":"opcional","swipe":true}
- {"type":"text","theme":"...","num":"01 (opcional)","kicker":"opcional","title":"...","body":"opcional, até ~35 palavras","size":"mid|sm"}
- {"type":"list","theme":"...","kicker":"opcional","title":"...","items":["até 5 itens curtos"],"mark":"✓ (opcional; senão numera)"}
- {"type":"compare","theme":"light","kicker":"opcional","title":"...","leftTitle":"...","left":["até 3 itens curtos"],"rightTitle":"...","right":["até 3 itens curtos"]}
- {"type":"phone","theme":"light|dark","kicker":"opcional","title":"curto","body":"opcional curto","img":"nome da tela"}
- {"type":"quote","theme":"dark|blue","title":"frase","body":"opcional"}
- {"type":"cta","theme":"dark|blue|light","kicker":"opcional","title":"...","body":"opcional","button":"texto do botão (ex.: Link na bio — 14 dias grátis)"}
Regras de carrossel: 5–8 slides, pouco texto por slide (título ≤ 12 palavras; body ≤ 35), cada slide puxa o próximo, último é CTA. Estático = 1 slide (pode ser quote/text/compare/cover). Tamanhos de título: cover usa "big" por padrão; se título longo (> 8 palavras) use "size":"mid".
Escreva em português do Brasil impecável. Seja específico, nada genérico. Qualidade acima de tudo.
