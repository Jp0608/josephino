import Link from "next/link";
import { CalendarDays, Navigation, Play, AlertTriangle, Info, CircleAlert, ChevronRight, CheckCircle2, Sparkles } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { getDashboard } from "@/server/dashboard";
import { listAgenda } from "@/server/visits";
import { can } from "@/server/permissions";
import { Card, CardHeader, Stat, Badge, EmptyState, LinkButton, cx } from "@/components/ui";
import { VisitStatusBadge } from "@/components/VisitBits";
import { isoDay, longDay, money, time, mapsLink, wazeLink } from "@/lib/format";
import { POOL_USAGE, OPEN_VISIT_STATUSES } from "@/lib/domain/catalog";

export const metadata = { title: "Início" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ "sem-permissao"?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const today = isoDay();
  const [d, agenda] = await Promise.all([getDashboard(ctx), listAgenda(ctx, today, today)]);
  const k = d.kpis;
  const firstName = ctx.name.split(" ")[0];
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const next = agenda.find((v) => OPEN_VISIT_STATUSES.includes(v.status));
  const isEmpty = k.pools === 0;

  return (
    <div className="animate-[var(--animate-fade-up)]">
      {sp["sem-permissao"] && (
        <div className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm font-medium text-warn">Você não tem acesso àquela área. Fale com o responsável da empresa.</div>
      )}
      <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted first-letter:uppercase">{longDay(new Date())}</p>
          <h1 className="text-[24px] font-extrabold text-ink md:text-[28px]">
            {hello}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {k.visitsToday === 0
              ? "Nenhuma visita para hoje."
              : `${k.visitsToday} visita${k.visitsToday > 1 ? "s" : ""} hoje · ${k.doneToday} concluída${k.doneToday === 1 ? "" : "s"} · ${k.pendingToday} pendente${k.pendingToday === 1 ? "" : "s"}`}
            {k.overdue > 0 && <span className="font-semibold text-danger"> · {k.overdue} atrasada{k.overdue > 1 ? "s" : ""}</span>}
          </p>
        </div>
      </div>

      {isEmpty && can(ctx.role, "customers.write") && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex flex-col gap-4 bg-gradient-to-br from-abyss-900 to-abyss-700 p-5 text-white md:flex-row md:items-center md:justify-between md:p-6">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-semibold text-raia-300"><Sparkles className="size-4" /> Primeiros passos</p>
              <p className="mt-1 font-display text-xl font-extrabold">Cadastre seu primeiro cliente e a piscina dele</p>
              <p className="mt-1 text-sm text-raia-100/80">Em 3 minutos você agenda a primeira visita e vê o relatório que o cliente vai receber.</p>
            </div>
            <LinkButton href="/app/boas-vindas" variant="secondary" size="lg" className="border-0">Começar configuração</LinkButton>
          </div>
        </Card>
      )}

      {next && (
        <Card className="mb-6 border-primary/30">
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-[15px] font-extrabold text-primary tabular">{time(next.scheduledStart)}</div>
              <div className="min-w-0">
                <p className="text-[12px] font-bold uppercase tracking-wide text-primary">Próximo atendimento</p>
                <p className="truncate text-[16px] font-bold text-ink">{next.customerName}</p>
                <p className="truncate text-sm text-muted">
                  {next.poolName} · {POOL_USAGE[next.poolUsage] ?? next.poolUsage}
                  {next.volumeLiters ? ` · ${(next.volumeLiters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil L` : ""}
                </p>
                {next.address && <p className="truncate text-sm text-muted">{next.address}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {next.address && (
                <a href={mapsLink(next.address)} target="_blank" rel="noopener" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line-strong px-4 text-sm font-semibold text-ink md:flex-none">
                  <Navigation className="size-4" /> Navegar
                </a>
              )}
              {can(ctx.role, "visits.execute") && (
                <LinkButton href={`/app/visitas/${next.id}`} size="lg" className="flex-1 md:flex-none">
                  <Play className="size-4" /> {next.status === "in_progress" ? "Continuar" : "Iniciar atendimento"}
                </LinkButton>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visitas hoje" value={k.visitsToday} hint={`${k.doneToday} concluídas`} href="/app/agenda" />
        <Stat label="Atrasadas" value={k.overdue} tone={k.overdue ? "danger" : undefined} hint="não concluídas em dias anteriores" href="/app/agenda?filtro=atrasadas" />
        {can(ctx.role, "customers.read") ? (
          <>
            <Stat label="Clientes ativos" value={k.activeCustomers} hint={`${k.pools} piscinas`} href="/app/clientes" />
            <Stat label="Concluídas no mês" value={k.doneMonth} hint={`${k.activeContracts} contratos ativos`} />
          </>
        ) : (
          <Stat label="Concluídas no mês" value={k.doneMonth} />
        )}
      </div>

      {d.finance && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Receita do mês" value={money(d.finance.billedMonth)} hint="lançamentos com vencimento no mês" href="/app/financeiro" />
          <Stat label="Recebido no mês" value={money(d.finance.receivedMonth)} tone="ok" hint="pagamentos registrados" href="/app/financeiro" />
          <Stat label="A receber no mês" value={money(d.finance.openMonth)} href="/app/financeiro" />
          <Stat
            label="Em atraso"
            value={money(d.finance.overdueCents)}
            tone={d.finance.overdueCents ? "danger" : undefined}
            hint={`${d.finance.overdueCustomers} cliente${d.finance.overdueCustomers === 1 ? "" : "s"} inadimplente${d.finance.overdueCustomers === 1 ? "" : "s"}`}
            href="/app/financeiro?status=atrasado"
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="Agenda de hoje"
            subtitle={agenda.length ? `${agenda.length} visita${agenda.length > 1 ? "s" : ""}` : undefined}
            icon={<CalendarDays className="size-[18px]" />}
            action={<Link href="/app/agenda" className="text-[13px] font-semibold text-primary">Ver agenda</Link>}
          />
          {agenda.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-5" />}
              title="Dia livre"
              text="Nenhuma visita agendada para hoje."
              action={can(ctx.role, "agenda.write") ? <LinkButton href="/app/agenda/nova" size="sm">Agendar visita</LinkButton> : undefined}
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {agenda.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                  <span className="w-12 shrink-0 font-display text-[15px] font-bold tabular text-ink">{time(v.scheduledStart)}</span>
                  <Link href={`/app/visitas/${v.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{v.customerName}</p>
                    <p className="truncate text-[13px] text-muted">
                      {v.poolName} · {POOL_USAGE[v.poolUsage] ?? v.poolUsage}
                      {v.techName ? ` · ${v.techName}` : " · sem responsável"}
                    </p>
                    {v.address && <p className="truncate text-[12px] text-muted">{v.address}</p>}
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <VisitStatusBadge status={v.status} />
                    {v.address && OPEN_VISIT_STATUSES.includes(v.status) && (
                      <span className="flex gap-2 text-[12px] font-semibold">
                        <a href={mapsLink(v.address)} target="_blank" rel="noopener" className="text-primary">Maps</a>
                        <a href={wazeLink(v.address)} target="_blank" rel="noopener" className="text-primary">Waze</a>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Exige atenção" subtitle={d.alerts.length ? `${d.alerts.length} ponto${d.alerts.length > 1 ? "s" : ""}` : undefined} icon={<AlertTriangle className="size-[18px]" />} />
            {d.alerts.length === 0 ? (
              <div className="flex items-center gap-2 border-t border-line px-5 py-5 text-sm text-ok">
                <CheckCircle2 className="size-4" /> Nada pendente. Operação em dia.
              </div>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.alerts.slice(0, 9).map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2 md:px-5">
                      {a.tone === "danger" ? (
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                      ) : a.tone === "warn" ? (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                      ) : (
                        <Info className="mt-0.5 size-4 shrink-0 text-info" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
                        <span className="block text-[13px] text-muted">{a.detail}</span>
                      </span>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {d.team.length > 0 && (
            <Card>
              <CardHeader title="Equipe no mês" subtitle="visitas concluídas / previstas até hoje" />
              <ul className="divide-y divide-line border-t border-line">
                {d.team.map((t) => {
                  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
                  return (
                    <li key={t.name} className="px-4 py-3 md:px-5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-ink">{t.name}</span>
                        <span className="tabular text-muted">
                          {t.done}/{t.total}
                          {t.avg_min != null && ` · ${t.avg_min} min/visita`}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className={cx("h-full rounded-full", pct >= 90 ? "bg-ok" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {k.lowStock > 0 && (
            <Link href="/app/estoque">
              <Badge tone="warn">{k.lowStock} produto(s) com estoque baixo</Badge>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
