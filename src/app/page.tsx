import Link from "next/link";
import { asc, eq, and } from "drizzle-orm";
import { CalendarDays, Smartphone, FileText, Droplets, FlaskConical, Wallet, Users, ShieldCheck, WifiOff, Check } from "lucide-react";
import { systemDb } from "@/db";
import { plans } from "@/db/schema";
import { OndaroLogo } from "@/components/Brand";
import { btnClass } from "@/components/ui";
import { money } from "@/lib/format";
import { TRIAL_DAYS } from "@/server/signup";
import { FEATURE_LABEL } from "@/server/plan-features";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: CalendarDays, t: "Agenda e recorrências", d: "Toda terça e sexta às 8h? O Ondaro cria as visitas sozinho, avisa conflito de horário e evita visita duplicada." },
  { icon: Smartphone, t: "Atendimento pelo celular", d: "Inspeção, medições, serviços, produtos e fotos num fluxo só — e continua funcionando sem sinal dentro da casa do cliente." },
  { icon: FileText, t: "Relatório profissional", d: "Ao finalizar, o relatório com a sua marca fica pronto, com link privado para o cliente. Você envia pelo WhatsApp em um toque." },
  { icon: Droplets, t: "Prontuário de cada piscina", d: "Histórico permanente de visitas, medições e produtos, gráfico da água e QR code na casa de máquinas." },
  { icon: FlaskConical, t: "Estoque de químicos", d: "Baixa no estoque ao finalizar a visita, alertas de mínimo e validade, custo químico por cliente." },
  { icon: Wallet, t: "Financeiro e contratos", d: "Mensalidades geradas pelo contrato, contas a receber e a pagar, inadimplência e lucro estimado." },
  { icon: Users, t: "Equipe e CRM", d: "Cada técnico vê só a própria agenda. Funil de vendas com propostas aprovadas pelo cliente por link." },
  { icon: ShieldCheck, t: "Dados protegidos", d: "Cada empresa isolada no banco de dados. O cliente nunca vê anotações internas." },
];

export default async function Home() {
  const rows = await systemDb().select().from(plans).where(and(eq(plans.public, true), eq(plans.active, true))).orderBy(asc(plans.sortOrder));
  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <OndaroLogo size={26} />
          <nav className="flex items-center gap-2">
            <a href="#precos" className="hidden px-3 text-sm font-semibold text-ink-2 sm:block">Preços</a>
            <Link href="/entrar" className="px-3 text-sm font-semibold text-ink-2">Entrar</Link>
            <Link href="/criar-conta" className={btnClass("primary", "md")}>Teste grátis</Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-abyss-900 text-white">
        <svg className="absolute inset-x-0 bottom-0 w-full opacity-70" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
          <path d="M0 220 C 240 170, 420 270, 720 220 S 1200 170, 1440 210 V320 H0Z" fill="#0A4F73" />
          <path d="M0 260 C 260 230, 460 300, 760 262 S 1220 230, 1440 262 V320 H0Z" fill="#0B6E99" opacity=".7" />
        </svg>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-28 pt-16 md:grid-cols-[1.1fr_.9fr] md:pt-24">
          <div className="animate-[var(--animate-fade-up)]">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-raia-300">Para piscineiros e empresas de manutenção</p>
            <h1 className="font-display text-[38px] font-extrabold leading-[1.05] tracking-tight md:text-[56px]">
              Sua operação de piscinas inteira, <span className="text-raia-300">no celular.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-raia-100/85">
              Agenda, atendimento técnico, parâmetros da água, relatório com a sua marca, estoque, financeiro e equipe — numa plataforma só, do piscineiro autônomo à empresa com dezenas de técnicos.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/criar-conta" className={btnClass("primary", "lg", "bg-raia-400 text-abyss-950")}>Começar {TRIAL_DAYS} dias grátis</Link>
              <a href="#como" className={btnClass("secondary", "lg", "border-white/30 bg-transparent text-white hover:bg-white/10")}>Ver como funciona</a>
            </div>
            <p className="mt-4 text-[13px] text-raia-100/70">Sem cartão de crédito. Seus dados continuam seus.</p>
          </div>
          <div className="relative mx-auto w-full max-w-[320px]">
            <div className="rounded-[34px] border-[10px] border-abyss-950 bg-bg p-3 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-primary">3/8 · Água</p>
              <div className="mt-2 flex flex-col gap-2">
                {[["pH", "7,4", "ok"], ["Cloro livre", "1,8 mg/L", "ok"], ["Alcalinidade", "62 mg/L", "low"], ["Temperatura", "27 °C", "na"]].map(([l, v, s]) => (
                  <div key={l} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5">
                    <span className="text-[13px] font-semibold">{l}</span>
                    <span className={`text-[14px] font-bold tabular ${s === "ok" ? "text-ok" : s === "low" ? "text-warn" : "text-ink"}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-primary px-3 py-3 text-center text-[13px] font-bold text-primary-ink">Continuar</div>
              <p className="mt-2 text-center text-[10px] text-muted">Ilustração da tela de medição</p>
            </div>
          </div>
        </div>
      </section>

      <section id="como" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-2xl text-[30px] font-extrabold leading-tight md:text-[38px]">Do agendamento ao relatório no WhatsApp do cliente.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {["Agende a visita (ou a recorrência)", "Abra a visita no celular e registre tudo", "Finalize: estoque e histórico se atualizam", "O cliente recebe o relatório e acompanha pelo portal"].map((t, i) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <span className="font-display text-[28px] font-extrabold text-primary">0{i + 1}</span>
              <p className="mt-2 font-semibold">{t}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.t} className="rounded-2xl border border-line bg-surface p-5">
              <f.icon className="size-6 text-primary" />
              <p className="mt-3 font-bold">{f.t}</p>
              <p className="mt-1 text-sm text-muted">{f.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted"><WifiOff className="size-4" /> Sem sinal no quintal do cliente? O atendimento fica salvo no aparelho e sincroniza quando a conexão voltar.</p>
      </section>

      <section id="precos" className="border-y border-line bg-surface-2/60">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-[30px] font-extrabold md:text-[38px]">Planos</h2>
          <p className="mt-2 text-muted">{TRIAL_DAYS} dias grátis em qualquer plano. Histórico e segurança nunca são limitados.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {rows.map((p) => (
              <div key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-6 ${p.code === "pro" ? "border-primary shadow-[var(--shadow-pop)]" : "border-line"}`}>
                <p className="font-display text-xl font-extrabold">{p.name}</p>
                <p className="text-sm text-muted">{p.description}</p>
                <p className="mt-4 font-display text-[30px] font-extrabold tabular">{p.priceCents > 0 ? money(p.priceCents) : "Sob consulta"}{p.priceCents > 0 && <span className="text-sm font-semibold text-muted">/mês</span>}</p>
                <p className="mt-1 text-[13px] text-muted">{p.maxUsers ? `${p.maxUsers} usuário${p.maxUsers > 1 ? "s" : ""}` : "Usuários ilimitados"} · {p.maxPools ? `até ${p.maxPools} piscinas` : "piscinas ilimitadas"}</p>
                <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-sm">
                  {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok" />{FEATURE_LABEL[f] ?? f}</li>)}
                </ul>
                <Link href={p.priceCents > 0 ? `/criar-conta?plano=${p.code}` : "/criar-conta?plano=business"} className={btnClass(p.code === "pro" ? "primary" : "secondary", "lg", "mt-6")}>{p.priceCents > 0 ? "Começar teste grátis" : "Falar com a equipe"}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <OndaroLogo size={20} />
        <div className="flex gap-4"><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade (LGPD)</Link><Link href="/entrar">Entrar</Link></div>
      </footer>
    </div>
  );
}
