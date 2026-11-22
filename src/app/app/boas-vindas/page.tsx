import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { onboardingProgress } from "@/server/settings";
import { Card, PageHeader, cx } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { CompanyForm } from "../configuracoes/CompanyForm";
import { LogoUpload } from "../configuracoes/LogoUpload";
import { finishOnboardingAction } from "../configuracoes/actions";

export const metadata = { title: "Primeiros passos" };

export default async function Welcome() {
  const ctx = await requireCtx();
  if (!can(ctx.role, "settings.manage")) return <p className="text-sm text-muted">O responsável pela empresa faz a configuração inicial.</p>;
  const p = await onboardingProgress(ctx);
  const steps: { done: boolean; title: string; text: string; href?: string; cta?: string }[] = [
    { done: p.company, title: "Dados da empresa", text: "Telefone, WhatsApp, cidade e tipo de operação." },
    { done: p.logo, title: "Logo", text: "Vai no cabeçalho dos relatórios e do portal do cliente." },
    { done: p.customers > 0, title: "Primeiro cliente", text: "Nome, WhatsApp e endereço de atendimento.", href: "/app/clientes/novo", cta: "Cadastrar cliente" },
    { done: p.pools > 0, title: "Primeira piscina", text: "Medidas, volume, equipamentos e frequência de manutenção.", href: p.firstCustomerId ? `/app/piscinas/nova?cliente=${p.firstCustomerId}` : "/app/piscinas/nova", cta: "Cadastrar piscina" },
    { done: p.visits > 0, title: "Primeiro agendamento", text: "Uma visita ou uma recorrência (ex.: toda terça e sexta às 8h).", href: p.firstPoolId ? `/app/agenda/nova?piscina=${p.firstPoolId}` : "/app/agenda/nova", cta: "Agendar" },
    { done: p.ranges, title: "Faixas de referência da água", text: "As faixas que sua empresa adota para cada parâmetro.", href: "/app/configuracoes/parametros", cta: "Configurar" },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Boas-vindas, ${ctx.name.split(" ")[0]}`} subtitle={`${done} de ${steps.length} passos concluídos. Leva poucos minutos e dá para continuar depois.`} />
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card className={cx("p-4 md:p-5", s === next && "border-primary/40")}>
              <div className="flex items-start gap-3">
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold", s.done ? "bg-ok text-white" : "bg-surface-2 text-ink-2")}>{s.done ? <Check className="size-4" /> : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">{s.title}</p>
                  <p className="text-[13px] text-muted">{s.text}</p>
                  {s === next && i === 0 && <div className="mt-4"><CompanyForm t={p.tenant} next="/app/boas-vindas" compact /></div>}
                  {s === next && i === 1 && <div className="mt-4 flex flex-wrap items-center gap-3"><LogoUpload hasLogo={false} /><Link href="/app/configuracoes" className="text-[13px] font-semibold text-muted">Pular por agora</Link></div>}
                </div>
                {s.href && !s.done && (
                  <Link href={s.href} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary">{s.cta} <ChevronRight className="size-4" /></Link>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex justify-end">
        <ActionButton action={finishOnboardingAction} variant={done === steps.length ? "primary" : "ghost"} size="md">
          {done === steps.length ? "Ir para o painel" : "Continuar depois"}
        </ActionButton>
      </div>
    </div>
  );
}
