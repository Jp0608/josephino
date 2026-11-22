import Link from "next/link";
import { Plus, Repeat, FileSignature, CalendarClock, Receipt, Layers, ChevronRight } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { listContracts, listServicePlans, pendingMonthlyCount, CONTRACT_STATUS } from "@/server/contracts";
import { monthName, monthTitle, shiftMonth } from "@/server/fields";
import { Card, CardHeader, PageHeader, LinkButton, EmptyState, Badge, Stat, cx, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { describeRule } from "@/lib/domain/recurrence";
import { date, isoMonth, money } from "@/lib/format";
import { FeatureLocked } from "../estoque/_locked";
import { generateInvoicesAction, setPlanActiveAction } from "./actions";

export const metadata = { title: "Contratos e planos" };

const STATUS_TONE: Record<string, Tone> = { active: "ok", draft: "neutral", paused: "warn", ended: "neutral", cancelled: "danger" };
const FILTERS = { active: "Ativos", todos: "Todos", draft: "Rascunhos", paused: "Pausados", ended: "Encerrados", cancelled: "Cancelados" } as const;

export default async function Contracts({ searchParams }: { searchParams: Promise<{ status?: string; planos?: string }> }) {
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return (
      <FeatureLocked
        title="Contratos e planos"
        feature="Contratos e planos"
        text="Crie planos de manutenção, contratos com agenda recorrente, gere as mensalidades do mês com um clique e imprima o contrato com os dados da sua empresa."
        canManageBilling={can(ctx.role, "billing.manage")}
      />
    );
  const sp = await searchParams;
  const status = sp.status && sp.status in FILTERS ? sp.status : "active";
  const month = isoMonth();
  const nextMonth = shiftMonth(month, 1);
  const canInvoice = can(ctx.role, "finance.write");
  const [all, plans, pendingNow, pendingNext] = await Promise.all([
    listContracts(ctx),
    listServicePlans(ctx, { includeInactive: sp.planos === "todos" }),
    pendingMonthlyCount(ctx, month),
    pendingMonthlyCount(ctx, nextMonth),
  ]);
  const rows = status === "todos" ? all : all.filter((c) => c.status === status);
  const active = all.filter((c) => c.status === "active");
  const mrr = active.reduce((s, c) => s + c.monthlyCents, 0);
  const ending = active.filter((c) => c.endingSoon).sort((a, b) => (a.endsOn! < b.endsOn! ? -1 : 1));

  return (
    <>
      <PageHeader
        title="Contratos e planos"
        subtitle="Planos de manutenção, contratos recorrentes e mensalidades"
        actions={
          <>
            <LinkButton href="/app/contratos/planos/novo" variant="secondary">
              <Plus className="size-4" /> Plano
            </LinkButton>
            <LinkButton href="/app/contratos/novo">
              <Plus className="size-4" /> Novo contrato
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Contratos ativos" value={active.length} hint={`${all.length} no total`} />
        <Stat label="Receita recorrente" value={money(mrr)} hint="soma mensal dos ativos" />
        <Stat label="Vencem em 30 dias" value={ending.length} tone={ending.length ? "warn" : undefined} hint="contratos com término próximo" />
        <Stat label="Planos" value={plans.filter((p) => p.active).length} hint="modelos ativos" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Mensalidades" subtitle="Gera uma conta a receber por contrato ativo, com vencimento no dia de cobrança. Rodar de novo não duplica." icon={<Receipt className="size-[18px]" />} />
        <div className="grid gap-3 border-t border-line p-4 md:grid-cols-2 md:p-5">
          {[
            { m: month, pending: pendingNow },
            { m: nextMonth, pending: pendingNext },
          ].map(({ m, pending }) => (
            <div key={m} className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-ink">{monthTitle(m)}</p>
                <p className="text-[13px] text-muted">
                  {pending ? `${pending} contrato${pending === 1 ? "" : "s"} sem mensalidade gerada` : "Todas as mensalidades já foram geradas"}
                </p>
              </div>
              {canInvoice ? (
                <ActionButton action={generateInvoicesAction.bind(null, m)} variant={pending ? "primary" : "secondary"} size="md" confirm={pending ? `Gerar ${pending} mensalidade${pending === 1 ? "" : "s"} de ${monthName(m)}?` : undefined}>
                  Gerar mensalidades de {monthName(m).split(" ")[0]}
                </ActionButton>
              ) : (
                <span className="text-[12px] text-muted">Requer permissão financeira</span>
              )}
            </div>
          ))}
        </div>
        {can(ctx.role, "finance.read") && hasFeature(ctx, "finance") && (
          <div className="border-t border-line px-4 py-3 text-[13px] md:px-5">
            <Link href={`/app/financeiro?mes=${month}&aba=receber`} className="font-semibold text-primary">Ver contas a receber do mês →</Link>
          </div>
        )}
      </Card>

      {ending.length > 0 && (
        <Card className="mt-6 border-warn/40">
          <CardHeader title="Contratos terminando em até 30 dias" subtitle="Hora de renovar ou encerrar" icon={<CalendarClock className="size-[18px] text-warn" />} />
          <ul className="divide-y divide-line border-t border-line">
            {ending.map((c) => (
              <li key={c.id}>
                <Link href={`/app/contratos/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 md:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{c.customerName}</span>
                    <span className="block truncate text-[13px] text-muted">{c.title}</span>
                  </span>
                  <Badge tone={c.ended ? "danger" : "warn"}>{c.ended ? "Venceu" : "Termina"} em {date(c.endsOn)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[17px] font-bold">Contratos</h2>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {Object.entries(FILTERS).map(([k, l]) => (
            <Link key={k} href={`/app/contratos?status=${k}`} className={cx("rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap", status === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <Card className="mt-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileSignature className="size-5" />}
            title={all.length ? "Nenhum contrato neste filtro" : "Nenhum contrato ainda"}
            text={all.length ? "Escolha outro filtro." : "Crie o contrato de manutenção do cliente: valor, vencimento, cláusulas e, se quiser, a agenda recorrente de visitas."}
            action={!all.length ? <LinkButton href="/app/contratos/novo">Criar contrato</LinkButton> : undefined}
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/app/contratos/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2 md:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.customerName}</p>
                    <p className="truncate text-[13px] text-muted">
                      {c.title}
                      {c.poolName ? ` · ${c.poolName}` : ""}
                      {c.planName ? ` · ${c.planName}` : ""}
                    </p>
                    <p className="text-[12px] text-muted">
                      desde {date(c.startsOn)}
                      {c.endsOn ? ` até ${date(c.endsOn)}` : " · prazo indeterminado"} · vence dia {c.billingDay}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-[15px] font-bold tabular">{money(c.monthlyCents)}<span className="text-[12px] font-medium text-muted">/mês</span></p>
                    <Badge tone={c.endingSoon ? "warn" : STATUS_TONE[c.status] ?? "neutral"}>{c.endingSoon ? "Vence em breve" : CONTRACT_STATUS[c.status] ?? c.status}</Badge>
                  </div>
                  <ChevronRight className="hidden size-4 shrink-0 text-muted md:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div id="planos" className="mt-8 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <Layers className="size-[18px] text-muted" /> Planos de serviço
        </h2>
        <Link href={sp.planos === "todos" ? "/app/contratos#planos" : "/app/contratos?planos=todos#planos"} className="text-[13px] font-semibold text-primary">
          {sp.planos === "todos" ? "Só ativos" : "Mostrar arquivados"}
        </Link>
      </div>
      {plans.length === 0 ? (
        <Card className="mt-3">
          <EmptyState icon={<Repeat className="size-5" />} title="Nenhum plano de serviço" text="Planos são modelos (ex.: Semanal, Quinzenal) com preço e serviços incluídos. Agilizam a criação de contratos." action={<LinkButton href="/app/contratos/planos/novo" size="sm">Criar plano</LinkButton>} />
        </Card>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={cx("flex flex-col p-4", !p.active && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-bold">{p.name}</p>
                {!p.active && <Badge>Arquivado</Badge>}
              </div>
              <p className="mt-1 font-display text-[22px] font-extrabold tabular">
                {money(p.priceCents)}
                <span className="text-[13px] font-medium text-muted">/mês</span>
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {p.weekdays?.length ? describeRule({ weekdays: p.weekdays, intervalWeeks: p.intervalWeeks }) : p.intervalWeeks === 1 ? "Semanal" : p.intervalWeeks === 2 ? "Quinzenal" : `A cada ${p.intervalWeeks} semanas`}
                {p.visitsPerMonth ? ` · ${p.visitsPerMonth} visitas/mês` : ""}
              </p>
              {p.includedServices && <p className="mt-2 line-clamp-3 text-[13px] text-ink-2">{p.includedServices}</p>}
              <p className="mt-2 text-[12px] text-muted">{p.activeContracts} contrato{p.activeContracts === 1 ? "" : "s"} ativo{p.activeContracts === 1 ? "" : "s"}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {p.active && <LinkButton href={`/app/contratos/novo?plano=${p.id}`} size="sm" variant="soft">Usar em contrato</LinkButton>}
                <LinkButton href={`/app/contratos/planos/${p.id}`} size="sm" variant="ghost">Editar</LinkButton>
                <ActionButton action={setPlanActiveAction.bind(null, p.id, !p.active)} variant="ghost">
                  {p.active ? "Arquivar" : "Reativar"}
                </ActionButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
