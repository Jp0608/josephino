import Link from "next/link";
import Image from "next/image";
import { asc, eq, and } from "drizzle-orm";
import { CalendarDays, FileText, Droplets, FlaskConical, Wallet, Users, ShieldCheck, WifiOff, Check, Sparkles, Clock } from "lucide-react";
import { systemDb } from "@/db";
import { plans } from "@/db/schema";
import { OndaroLogo } from "@/components/Brand";
import { btnClass, cx } from "@/components/ui";
import { money } from "@/lib/format";
import { TRIAL_DAYS } from "@/server/signup";
import { FEATURE_LABEL, UPCOMING_FEATURES } from "@/server/plan-features";

export const dynamic = "force-dynamic";

/** Telas reais do Ondaro (capturadas do próprio app com dados de demonstração). */
const PHONE_STEPS = [
  { img: "inicio", n: "01", t: "Seu dia aberto no celular", d: "Próximo atendimento, endereço com Maps e Waze e o que exige atenção — antes de sair de casa." },
  { img: "agua", n: "02", t: "Mediu, registrou", d: "pH, cloro e alcalinidade com a faixa da sua empresa ao lado. Fora da faixa? O sistema avisa na hora." },
  { img: "fotos", n: "03", t: "Antes e depois", d: "Fotos tiradas ali mesmo, reduzidas para economizar dados. Sem sinal, ficam guardadas e sobem depois." },
  { img: "finalizado", n: "04", t: "Finalizou, o relatório está pronto", d: "Estoque baixado, histórico atualizado e a mensagem pronta para o WhatsApp do cliente." },
  { img: "relatorio", n: "05", t: "Relatório com a sua marca", d: "Parâmetros, serviços, produtos, fotos e recomendações num documento que o cliente entende." },
  { img: "portal", n: "06", t: "O cliente acompanha", d: "Portal com próximas visitas, evolução da água e todos os relatórios — sem ver nada interno." },
];

const FEATURES = [
  { icon: CalendarDays, t: "Agenda e recorrências", d: "Toda terça e sexta às 8h? As visitas são criadas sozinhas, com aviso de conflito e sem duplicar." },
  { icon: Droplets, t: "Prontuário de cada piscina", d: "Histórico permanente de visitas, medições e produtos, gráfico da água e QR code na casa de máquinas." },
  { icon: FileText, t: "Relatório profissional", d: "Gerado ao finalizar, com link privado e registro de ciência do cliente." },
  { icon: FlaskConical, t: "Estoque de químicos", d: "Baixa ao finalizar a visita, alertas de mínimo e validade, custo químico por cliente." },
  { icon: Wallet, t: "Financeiro e contratos", d: "Mensalidades geradas pelo contrato, contas a receber e a pagar, inadimplência e lucro estimado." },
  { icon: Users, t: "Equipe e CRM", d: "Cada técnico vê só a própria agenda. Funil de vendas com propostas aprovadas por link." },
  { icon: ShieldCheck, t: "Dados protegidos", d: "Cada empresa isolada no banco de dados. O cliente nunca vê anotações internas." },
  { icon: WifiOff, t: "Funciona sem sinal", d: "O atendimento fica salvo no aparelho e sincroniza quando a conexão voltar." },
];

function Phone({ img, alt, priority, className = "" }: { img: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={cx("relative mx-auto w-full max-w-[280px] rounded-[40px] bg-abyss-950 p-[9px] shadow-[0_30px_70px_-25px_rgba(4,26,40,.55)] ring-1 ring-white/10", className)}>
      <div className="absolute left-1/2 top-[14px] z-10 h-[18px] w-[86px] -translate-x-1/2 rounded-full bg-abyss-950" aria-hidden />
      <div className="relative aspect-[390/844] overflow-hidden rounded-[32px] bg-bg">
        <Image src={`/landing/${img}.webp`} alt={alt} fill sizes="280px" className="object-cover object-top" priority={priority} />
      </div>
    </div>
  );
}

export default async function Home() {
  const rows = await systemDb().select().from(plans).where(and(eq(plans.public, true), eq(plans.active, true))).orderBy(asc(plans.sortOrder));
  const base = rows[0];
  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <OndaroLogo size={26} />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#celular" className="hidden px-3 text-sm font-semibold text-ink-2 md:block">Como funciona</a>
            <a href="#precos" className="hidden px-3 text-sm font-semibold text-ink-2 sm:block">Planos</a>
            <Link href="/entrar" className="px-3 text-sm font-semibold text-ink-2">Entrar</Link>
            <Link href="/criar-conta" className={btnClass("primary", "md")}>Teste grátis</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-abyss-900 text-white">
        <svg className="absolute inset-x-0 bottom-0 w-full opacity-70" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
          <path d="M0 220 C 240 170, 420 270, 720 220 S 1200 170, 1440 210 V320 H0Z" fill="#0A4F73" />
          <path d="M0 260 C 260 230, 460 300, 760 262 S 1220 230, 1440 262 V320 H0Z" fill="#0B6E99" opacity=".7" />
        </svg>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-14 md:grid-cols-[1.1fr_.9fr] md:pb-28 md:pt-20">
          <div className="animate-[var(--animate-fade-up)]">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-raia-300">Para piscineiros e empresas de manutenção</p>
            <h1 className="font-display text-[38px] font-extrabold leading-[1.05] tracking-tight md:text-[56px]">
              Sua operação de piscinas inteira, <span className="text-raia-300">no celular.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-raia-100/85">
              Agenda, atendimento técnico, parâmetros da água, relatório com a sua marca, estoque, financeiro e equipe — numa plataforma só.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/criar-conta" className={btnClass("primary", "lg", "bg-raia-400 text-abyss-950")}>Começar {TRIAL_DAYS} dias grátis</Link>
              <a href="#celular" className={btnClass("secondary", "lg", "border-white/30 bg-transparent text-white hover:bg-white/10")}>Ver no celular</a>
            </div>
            <p className="mt-4 text-[13px] text-raia-100/70">Sem cartão de crédito. Seus dados continuam seus.</p>
          </div>
          <div className="relative hidden h-[520px] sm:block">
            <div className="absolute left-0 top-12 w-[220px] -rotate-6">
              <Phone img="agua" alt="Tela de medição dos parâmetros da água no Ondaro" priority />
            </div>
            <div className="absolute right-0 top-0 w-[240px] rotate-3">
              <Phone img="inicio" alt="Tela inicial do Ondaro com o próximo atendimento" priority />
            </div>
          </div>
          <div className="sm:hidden">
            <Phone img="inicio" alt="Tela inicial do Ondaro com o próximo atendimento" priority className="max-w-[250px]" />
          </div>
        </div>
      </section>

      {/* Como funciona no celular */}
      <section id="celular" className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">Como funciona no celular</p>
        <h2 className="mt-2 max-w-2xl text-[30px] font-extrabold leading-tight md:text-[40px]">Do portão do cliente ao relatório no WhatsApp dele.</h2>
        <p className="mt-3 max-w-2xl text-muted">Estas são telas reais do Ondaro, com dados de demonstração. É exatamente o que você e seus técnicos vão usar.</p>
        <ol className="-mx-5 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-6 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          {PHONE_STEPS.map((s, i) => (
            <li key={s.img} className="w-[78%] shrink-0 snap-center sm:w-[46%] md:w-auto">
              <article className="flex h-full flex-col rounded-[28px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
                <div className="rounded-[22px] bg-gradient-to-b from-raia-50 to-primary-soft/60 px-4 pb-0 pt-5 dark:from-surface-2 dark:to-surface-2">
                  <Phone img={s.img} alt={s.t} priority={i < 2} className="max-w-[230px] translate-y-3" />
                </div>
                <div className="mt-6">
                  <span className="font-display text-[15px] font-extrabold text-primary">{s.n}</span>
                  <h3 className="mt-1 text-[18px] font-bold leading-snug">{s.t}</h3>
                  <p className="mt-1.5 text-sm text-muted">{s.d}</p>
                </div>
              </article>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-center text-[13px] text-muted md:hidden">Deslize para o lado →</p>
      </section>

      {/* Recursos */}
      <section className="border-y border-line bg-surface-2/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-2xl text-[30px] font-extrabold leading-tight md:text-[38px]">Tudo conectado: cada visita atualiza o resto da empresa.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.t} className="rounded-2xl border border-line bg-surface p-5">
                <f.icon className="size-6 text-primary" />
                <p className="mt-3 font-bold">{f.t}</p>
                <p className="mt-1 text-sm text-muted">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="precos" className="mx-auto max-w-5xl px-5 py-20">
        <div className="text-center">
          <h2 className="text-[30px] font-extrabold md:text-[40px]">Dois planos. Os dois completos.</h2>
          <p className="mt-2 text-muted">{TRIAL_DAYS} dias grátis em qualquer um. Histórico e segurança nunca são limitados.</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {rows.map((p, idx) => {
            const top = idx === rows.length - 1 && rows.length > 1;
            const inherited = top && base ? new Set(base.features) : new Set<string>();
            const ready = p.features.filter((f) => !UPCOMING_FEATURES.has(f) && !inherited.has(f));
            const soon = p.features.filter((f) => UPCOMING_FEATURES.has(f));
            return (
              <div
                key={p.id}
                className={cx(
                  "relative flex flex-col rounded-[28px] p-7",
                  top ? "bg-abyss-900 text-white shadow-[0_30px_70px_-30px_rgba(4,26,40,.8)]" : "border border-line bg-surface",
                )}
              >
                {top && (
                  <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-raia-400 px-3 py-1 text-[12px] font-bold text-abyss-950">
                    <Sparkles className="size-3.5" /> O mais completo
                  </span>
                )}
                <p className="font-display text-2xl font-extrabold">{p.name}</p>
                <p className={cx("mt-1 text-sm", top ? "text-raia-100/80" : "text-muted")}>{p.description}</p>
                <p className="mt-6 font-display text-[40px] font-extrabold leading-none tabular">
                  {money(p.priceCents)}
                  <span className={cx("text-base font-semibold", top ? "text-raia-100/70" : "text-muted")}>/mês</span>
                </p>
                <p className={cx("mt-2 text-[13px]", top ? "text-raia-100/80" : "text-muted")}>
                  {p.maxUsers ? `até ${p.maxUsers} usuários` : "usuários ilimitados"} · {p.maxPools ? `até ${p.maxPools} piscinas` : "piscinas ilimitadas"}
                </p>
                <div className={cx("my-6 h-px", top ? "bg-white/15" : "bg-line")} />
                {top && base && <p className="mb-3 text-sm font-bold text-raia-300">Tudo do {base.name}, mais:</p>}
                <ul className="flex flex-1 flex-col gap-2.5 text-[15px]">
                  {ready.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className={cx("mt-0.5 size-4 shrink-0", top ? "text-raia-300" : "text-ok")} />
                      {FEATURE_LABEL[f] ?? f}
                    </li>
                  ))}
                  {top && (
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-raia-300" />
                      Equipe de até {p.maxUsers ?? "∞"} pessoas com funções de gerente, supervisor, financeiro e comercial
                    </li>
                  )}
                </ul>
                {soon.length > 0 && (
                  <div className={cx("mt-5 rounded-2xl px-4 py-3 text-[13px]", top ? "bg-white/5 text-raia-100/80" : "bg-surface-2 text-muted")}>
                    <p className="flex items-center gap-1.5 font-semibold"><Clock className="size-3.5" /> Em desenvolvimento, incluso quando lançar:</p>
                    <p className="mt-1">{soon.map((f) => FEATURE_LABEL[f] ?? f).join(" · ")}</p>
                  </div>
                )}
                <Link
                  href={`/criar-conta?plano=${p.code}`}
                  className={btnClass(top ? "primary" : "secondary", "lg", cx("mt-7", top && "bg-raia-400 text-abyss-950"))}
                >
                  Começar teste grátis
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-line px-5 py-10 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <OndaroLogo size={20} />
        <div className="flex gap-4"><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade (LGPD)</Link><Link href="/entrar">Entrar</Link></div>
      </footer>
    </div>
  );
}
