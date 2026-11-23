#!/usr/bin/env python3
"""
hookscore_pt.py - adaptação para português do Brasil do hookscore.py da skill
instagram-agent-skill (MIT, Jake Schincariol). Não altera o original: importa o
módulo e acrescenta léxicos em português (números falados, dinheiro, tensão,
aberturas fracas, imperativos, tratamento por "você") e o vocabulário do nicho
de piscinas.

Uso: python3 hookscore_pt.py ganchos.txt   (um gancho por linha)
     python3 hookscore_pt.py --hook "O cliente disse que você não veio."
Caminho da skill: variável IG_SKILL_DIR (padrão: ../../jakeschincariol/instagram-agent-skill/skills).
"""
import os, re, sys, importlib.util

SKILL = os.environ.get("IG_SKILL_DIR", "/home/user/jakeschincariol/instagram-agent-skill/skills")
spec = importlib.util.spec_from_file_location("hookscore", os.path.join(SKILL, "ig-reel", "hookscore.py"))
hs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hs)

hs.WORD_RE = re.compile(r"[A-Za-zÀ-ÿ0-9$%'’-]+")
hs.PROPER_RE = re.compile(r"(?<!^)\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b")
hs.NUMBER_RE = re.compile(
    r"R\$\s?\d[\d.]*(?:,\d+)?|\$\s?\d[\d,]*(?:\.\d+)?"
    r"|\b\d[\d.,]*\s?(?:%|mil\b|h\b|horas?\b|min\b|minutos?\b|dias?\b|semanas?\b|meses\b|m[eê]s\b|anos?\b|x\b)?",
    re.IGNORECASE)
hs.SPOKEN_NUMBERS |= {"zero", "dois", "duas", "três", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
                      "doze", "quinze", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "cem", "cento", "mil",
                      "milhão", "milhões", "metade", "dobro", "triplo", "dúzia"}
hs.MONEY_WORDS |= {"reais", "real", "conto", "contos", "lucro", "faturamento", "mensalidade", "prejuízo", "salário",
                   "cobrar", "cobrança", "preço", "caro", "barato"}
hs.STAKES |= {"não", "nunca", "pare", "para", "errado", "errada", "erro", "erros", "perdeu", "perder", "perdi", "perde",
              "custa", "custou", "quebrou", "falhou", "ninguém", "sem", "só", "ainda", "antes", "mas", "problema", "risco",
              "perigo", "cuidado", "verdade", "segredo", "mentira", "pior", "golpe", "cancelou", "cancelar", "trocou",
              "trocar", "calote", "atrasado", "atraso", "inadimplente", "verde", "turva", "prova", "culpa", "reclamação",
              "briga", "discute", "discutir", "chute", "achismo", "desperdício", "demais", "nada", "nenhum", "nenhuma"}
hs.WEAK_OPENERS += ["então", "bom", "oi", "olá", "e aí", "fala", "pessoal", "galera", "hoje", "basicamente",
                    "sinceramente", "olha", "escuta", "neste vídeo", "nesse vídeo", "eu queria", "vou mostrar",
                    "você sabia", "já pensou", "isso é", "existe", "tem um", "tem uma", "vamos"]
hs.IMPERATIVES |= {"pare", "copie", "salve", "use", "faça", "mande", "envie", "teste", "comece", "evite", "nunca",
                   "sempre", "não", "veja", "anota", "guarda", "manda", "confira", "mostre", "cobre"}
hs.DEALBREAKERS += [
    (re.compile(r"(?i)^\s*(?:para|pare) de rolar"), "Abre com \"pare de rolar\". Pedir atenção prova que você ainda não a ganhou."),
    (re.compile(r"(?i)\b(?:neste|nesse|no vídeo de hoje|no reel de hoje)\b.*\b(?:vídeo|reel)\b|vou te mostrar"), "Preâmbulo de vídeo. Corte e abra no conteúdo."),
    (re.compile(r"(?i)^\s*(?:oi|olá|e aí|fala),?\s"), "Saudação. Ninguém veio ao feed para ser cumprimentado."),
]

def check_address(text):
    low = text.lower()
    w = [x.lower().strip("'’") for x in hs.words(text)]
    if re.search(r"\b(você|vocês|seu|sua|seus|suas|te|teu|tua|cê)\b", low):
        return 100.0, "fala com quem assiste"
    if w and w[0] in hs.IMPERATIVES:
        return 90.0, f"abre no imperativo (\"{w[0]}\")"
    first = {"perdi", "fiz", "cobrei", "aprendi", "comecei", "ganhei", "errei", "atendi", "criei", "parei", "descobri", "vi", "tive", "troquei", "mandei"}
    if re.search(r"\b(eu|meu|minha|nós|nosso|nossa|a gente)\b", low) or (w and w[0] in first):
        return 70.0, "primeira pessoa, sem falar com quem assiste"
    return 35.0, "terceira pessoa, ninguém na sala"
hs.check_address = check_address

if __name__ == "__main__":
    hs.main()
