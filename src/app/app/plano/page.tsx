import { Check, Download, Lock, Receipt, Sparkles, Users, Waves, Info } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { getBillingOverview, limitBlockers, planForFeatureLabel, BILLING_EVENT_LABEL } from "@/server/billing";
import { featureLabel } from "@/server/plan-features";
import { Card, CardHeader, PageHeader, Badge, EmptyState, Notice, cx, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { date, dateTime, money } from "@/lib/format";
import { NAV } from "@/lib/nav";
import { requestPlanAction } from "./actions";

export const metadata = { title: "Plano e assinatura" };

const STATUS: Record<string, [string, Tone]> = {
  trialing: ["Teste grátis", "info"],
  active: ["Ativa", "ok"],
  past_due: ["Pagamento pendente", "warn"],
  trial_expired: ["Teste encerrado", "danger"],
  cancelled: ["Cancelada", "danger"],
  suspended: ["Suspensa", "danger"],
};

function Meter({ icon, label, used, max }: { icon: React.ReactNode; label: string; used: number; max: number | null }) {
  const ratio = max ? Math.min(1, used / max) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-semibold text-ink-2">{icon} {label}</span>
        <span className="tabular font-bold text-ink">
          {used}
          <span className="font-semibold text-muted"> / {max ?? "ilimitado"}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={cx("h-full rounded-full", ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warn" : "bg-primary")} style={{ width: max ? `${Math.max(2, ratio * 100)}%` : "100%", opacity: max ? 1 : 0.25 }} />
      </div>
    </div>
  );
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ recurso?: string }> }) {
  const ctx = await requireCtx("billing.manage");
  const sp = await searchParams;
  const o = await getBillingOverview(ctx);
  const s = ctx.subscription;
  const current = ctx.plan;
  const recurso = sp.recurso?.slice(0, 60);
  const featurePlan = recurso ? await planForFeatureLabel(ctx, recurso) : null;
  const recursoFeature = recurso ? NAV.find((n) => n.label === recurso)?.feature : undefined;
  const alreadyIncluded = !!recursoFeature && !!current?.features.includes(recursoFeature);
  const [statusLabel, statusTone] = STATUS[s.status] ?? [s.status, "neutral"];
  const lastRequest = o.events.find((e) => e.kind === "plan_change_requested");
  const paidActive = s.status === "active" || s.status === "past_due";
  const allFeatures = [...new Set(o.catalog.flatMap((p) => p.features))];

  return (
    <>
      <PageHeader title="Plano e assinatura" subtitle="Plano atual, uso, limites e histórico de cobrança." />

      {recurso && alreadyIncluded && (
        <div className="mb-5">
          <Notice tone="ok" title={`${recurso} já está incluído no seu plano ${current?.name}`}>Se o acesso aparece bloqueado, sua função na equipe pode não ter permissão para essa área.</Notice>
        </div>
      )}
      {recurso && !alreadyIncluded && (
        <div className="mb-5">
          <Notice tone="brand" title={featurePlan ? `${recurso} está disponível a partir do plano ${featurePlan.name}` : `${recurso} não está incluído no seu plano`}>
            {featurePlan ? `Mude para o ${featurePlan.name} para liberar este recurso. Seus dados atuais continuam como estão.` : "Fale com a equipe Ondaro para saber como liberar este recurso."}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-abyss-900 to-abyss-700 p-5 text-white md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-bold uppercase tracking-wide text-raia-300">Plano atual</p>
              <Badge tone={statusTone}>{statusLabel}</Badge>
            </div>
            <p className="mt-1 font-display text-[28px] font-extrabold">{current?.name ?? "Sem plano"}</p>
            {current && <p className="text-sm text-raia-100/80">{current.priceCents > 0 ? `${money(current.priceCents)} por mês` : "Valor sob consulta"} · {current.description}</p>}
            <p className="mt-3 text-sm text-raia-100/90">
              {s.status === "trialing" && ctx.tenant.trialEndsAt
                ? `Teste grátis: ${s.trialDaysLeft} dia${s.trialDaysLeft === 1 ? "" : "s"} restante${s.trialDaysLeft === 1 ? "" : "s"} (até ${date(ctx.tenant.trialEndsAt)}).`
                : s.status === "trial_expired"
                  ? "O teste terminou. Seus dados estão guardados; para voltar a registrar, solicite a assinatura de um plano."
                  : s.status === "past_due"
                    ? "Há uma pendência de pagamento. O acesso continua por enquanto."
                    : s.status === "cancelled"
                      ? "Assinatura cancelada. Os dados continuam disponíveis para consulta e exportação."
                      : ctx.tenant.currentPeriodEnd
                        ? `Período atual até ${date(ctx.tenant.currentPeriodEnd)}.`
                        : "Assinatura ativa."}
            </p>
          </div>
          <div className="flex flex-col gap-4 p-5 md:p-6">
            <Meter icon={<Users className="size-4" />} label="Usuários ativos" used={o.usage.users} max={current?.maxUsers ?? null} />
            <Meter icon={<Waves className="size-4" />} label="Piscinas ativas" used={o.usage.pools} max={current?.maxPools ?? null} />
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <p className="flex items-center gap-2 text-[15px] font-bold text-ink"><Info className="size-[18px] text-muted" /> Como funciona a cobrança</p>
          <p className="mt-2 text-sm text-muted">
            {o.gatewayConfigured
              ? "Ao solicitar um plano, a equipe Ondaro envia o link de pagamento e confirma a ativação."
              : "O pagamento on-line ainda não está conectado nesta instalação. Ao escolher um plano, registramos a sua solicitação; a equipe Ondaro envia as instruções de pagamento e confirma a ativação após o pagamento. Nada é cobrado automaticamente."}
          </p>
          {lastRequest && (
            <div className="mt-4 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info">
              Última solicitação: plano <b>{o.catalog.find((p) => p.code === lastRequest.planCode)?.name ?? lastRequest.planCode}</b> em {dateTime(lastRequest.createdAt)} — aguardando confirmação.
            </div>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-extrabold text-ink">Planos</h2>
      {o.catalog.length === 0 ? (
        <Card><EmptyState title="Nenhum plano disponível no momento" text="Fale com a equipe Ondaro." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {o.catalog.map((p) => {
            const isCurrent = current?.id === p.id;
            const blockers = limitBlockers(o.usage, p);
            const highlight = featurePlan?.id === p.id;
            const upgrade = !current || p.priceCents > current.priceCents || (p.priceCents === 0 && current.priceCents > 0);
            const label = isCurrent ? (paidActive ? null : `Assinar o ${p.name}`) : p.priceCents === 0 ? "Falar com a equipe" : `Mudar para ${p.name}`;
            return (
              <Card key={p.id} className={cx("flex flex-col p-5", (isCurrent || highlight) && "border-primary ring-1 ring-primary/40")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-[18px] font-extrabold text-ink">{p.name}</p>
                  {isCurrent ? <Badge tone="brand">Atual</Badge> : highlight ? <Badge tone="info"><Sparkles className="size-3" /> Libera {recurso}</Badge> : null}
                </div>
                <p className="mt-0.5 min-h-[2.5em] text-[13px] text-muted">{p.description}</p>
                <p className="mt-3 font-display text-[26px] font-extrabold tabular text-ink">
                  {p.priceCents > 0 ? (
                    <>
                      {money(p.priceCents)}
                      <span className="text-[13px] font-semibold text-muted">/mês</span>
                    </>
                  ) : (
                    <span className="text-[20px]">Sob consulta</span>
                  )}
                </p>
                <p className="mt-2 text-[13px] text-ink-2">
                  {p.maxUsers == null ? "Usuários ilimitados" : `Até ${p.maxUsers} usuário${p.maxUsers === 1 ? "" : "s"}`} · {p.maxPools == null ? "piscinas ilimitadas" : `até ${p.maxPools} piscinas`}
                </p>
                <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-[13px]">
                  {allFeatures.map((f) => {
                    const has = p.features.includes(f);
                    return (
                      <li key={f} className={cx("flex items-start gap-2", has ? "text-ink-2" : "text-muted/70 line-through")}>
                        {has ? <Check className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <Lock className="mt-0.5 size-3.5 shrink-0" />}
                        {featureLabel(f)}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4">
                  {label == null ? (
                    <p className="text-center text-[13px] font-semibold text-muted">Seu plano</p>
                  ) : blockers.length ? (
                    <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn">Para mudar para este plano, reduza o uso: {blockers.join("; ")}.</p>
                  ) : (
                    <ActionButton
                      action={requestPlanAction.bind(null, p.code)}
                      variant={upgrade || isCurrent ? "primary" : "secondary"}
                      size="md"
                      className="w-full"
                      confirm={`Registrar solicitação do plano ${p.name}${p.priceCents > 0 ? ` (${money(p.priceCents)}/mês)` : ""}? A ativação acontece após a confirmação do pagamento pela equipe Ondaro.`}
                    >
                      {label}
                    </ActionButton>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Histórico de cobrança" icon={<Receipt className="size-[18px]" />} subtitle="Eventos da assinatura desta empresa." />
          {o.events.length === 0 ? (
            <EmptyState title="Sem eventos ainda" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {o.events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 md:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {BILLING_EVENT_LABEL[e.kind] ?? e.kind}
                      {e.planCode ? ` · ${o.catalog.find((p) => p.code === e.planCode)?.name ?? e.planCode}` : ""}
                    </p>
                    <p className="text-[12px] text-muted">
                      {dateTime(e.createdAt)}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  {e.amountCents != null && e.amountCents > 0 && <span className="shrink-0 text-sm font-semibold tabular text-ink">{money(e.amountCents)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="self-start p-5 md:p-6">
          <p className="flex items-center gap-2 text-[15px] font-bold text-ink"><Download className="size-[18px] text-muted" /> Exportar dados da empresa</p>
          <p className="mt-2 text-sm text-muted">
            Arquivo JSON com clientes, piscinas, visitas, medições, relatórios emitidos (metadados) e cobranças. Portabilidade garantida pela LGPD — disponível também com o teste encerrado.
          </p>
          <a href="/api/export/dados" download className="mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2">
            <Download className="size-4" /> Baixar JSON
          </a>
        </Card>
      </div>
    </>
  );
}
