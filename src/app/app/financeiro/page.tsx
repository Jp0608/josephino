import Link from "next/link";
import { Plus, Download, Wallet, Receipt, TrendingUp, MessageCircle, PlugZap, ChevronRight, Users } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getFinanceSummary, listInvoices, listExpenses, INVOICE_FILTERS, EXPENSE_FILTERS, INVOICE_VIEW_LABEL, type InvoiceView } from "@/server/finance";
import { paymentGatewayConfigured } from "@/server/integrations";
import { monthName, monthTitle, parseMonth } from "@/server/fields";
import { Card, CardHeader, PageHeader, LinkButton, EmptyState, Badge, Stat, Notice, cx, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { EXPENSE_CATEGORIES, INVOICE_KIND } from "@/lib/domain/catalog";
import { date, isoDay, money, waLink } from "@/lib/format";
import { FeatureLocked } from "../estoque/_locked";
import { MonthNav } from "../estoque/_month";
import { cancelExpenseAction } from "./actions";
import { PayExpenseForm } from "./PayExpenseForm";

export const metadata = { title: "Financeiro" };

const VIEW_TONE: Record<InvoiceView, Tone> = { open: "warn", overdue: "danger", paid: "ok", cancelled: "neutral" };
const TABS = { receber: "Contas a receber", pagar: "Contas a pagar", margem: "Margem por cliente", cobranca: "Cobrança e Pix" } as const;
type Tab = keyof typeof TABS;

type SP = { mes?: string; status?: string; aba?: string };

export default async function Finance({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx("finance.read");
  if (!hasFeature(ctx, "finance"))
    return (
      <FeatureLocked
        title="Financeiro"
        feature="Financeiro"
        text="Contas a receber e a pagar, registro de pagamentos, fluxo de caixa e margem por cliente fazem parte dos planos com o módulo financeiro."
        canManageBilling={can(ctx.role, "billing.manage")}
      />
    );
  const sp = await searchParams;
  const month = parseMonth(sp.mes);
  // O link do painel (?status=atrasado) abre direto as contas a receber atrasadas.
  const tab: Tab = sp.aba && sp.aba in TABS ? (sp.aba as Tab) : "receber";
  const canWrite = can(ctx.role, "finance.write");
  const href = (o: Partial<SP>) => {
    const p = new URLSearchParams();
    const all: SP = { mes: month, aba: tab, status: sp.status, ...o };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/app/financeiro?${p}`;
  };

  const [s, inv, exp, overdueList] = await Promise.all([
    getFinanceSummary(ctx, month),
    tab === "receber" ? listInvoices(ctx, { month, status: sp.status }) : null,
    tab === "pagar" ? listExpenses(ctx, { month, status: sp.status }) : null,
    tab === "cobranca" ? listInvoices(ctx, { status: "atrasado" }) : null,
  ]);
  const flowMax = Math.max(1, ...s.cashflow.flatMap((f) => [f.receivedCents, f.paidCents]));
  const flowEmpty = s.cashflow.every((f) => !f.receivedCents && !f.paidCents);
  const gateway = paymentGatewayConfigured();

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle="Contas a receber e a pagar, recebimentos e fluxo de caixa"
        actions={
          <>
            <MonthNav month={month} href={(m) => href({ mes: m })} />
            {canWrite && (
              <>
                <LinkButton href="/app/financeiro/nova" >
                  <Plus className="size-4" /> Cobrança
                </LinkButton>
                <LinkButton href="/app/financeiro/despesas/nova" variant="secondary">
                  <Plus className="size-4" /> Despesa
                </LinkButton>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Faturado no mês" value={money(s.billedCents)} hint={`${s.billedCount} lançamento${s.billedCount === 1 ? "" : "s"} com vencimento no mês`} />
        <Stat label="Recebido no mês" value={money(s.receivedCents)} tone="ok" hint={`${s.receivedCount} pagamento${s.receivedCount === 1 ? "" : "s"} registrado${s.receivedCount === 1 ? "" : "s"}`} />
        <Stat label="A receber no mês" value={money(s.openMonthCents)} hint="em aberto, vencimento no mês" href={href({ aba: "receber", status: "aberto" })} />
        <Stat
          label="Em atraso"
          value={money(s.overdueCents)}
          tone={s.overdueCents ? "danger" : undefined}
          hint={`${s.overdueCount} conta${s.overdueCount === 1 ? "" : "s"} · ${s.overdueCustomers} cliente${s.overdueCustomers === 1 ? "" : "s"} (todos os meses)`}
          href={href({ aba: "receber", status: "atrasado" })}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Despesas pagas" value={money(s.expensesPaidCents)} hint="pagas dentro do mês" href={href({ aba: "pagar", status: "pago" })} />
        <Stat label="A pagar no mês" value={money(s.expensesOpenCents)} tone={s.expensesOverdueCents ? "warn" : undefined} hint={s.expensesOverdueCents ? `${money(s.expensesOverdueCents)} já vencidas` : "despesas em aberto"} href={href({ aba: "pagar", status: "aberto" })} />
        <div className="col-span-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Lucro estimado (caixa)</p>
          <p className={cx("mt-1 font-display text-[26px] font-extrabold leading-none tabular", s.estimatedProfitCents < 0 ? "text-danger" : "text-ink")}>{money(s.estimatedProfitCents)}</p>
          <p className="mt-1.5 text-[12px] text-muted">Recebido no mês − despesas pagas no mês. Não considera impostos, depreciação nem valores a receber.</p>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Fluxo de caixa" subtitle="Recebimentos e despesas pagas — últimos 6 meses" icon={<TrendingUp className="size-[18px]" />} />
        {flowEmpty ? (
          <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">Nenhum pagamento recebido ou despesa paga nos últimos 6 meses.</p>
        ) : (
          <div className="border-t border-line px-4 pb-4 pt-5 md:px-5">
            <div className="flex h-44 items-end gap-2 md:gap-4" role="img" aria-label="Gráfico de barras do fluxo de caixa">
              {s.cashflow.map((f) => (
                <div key={f.month} className="flex h-full flex-1 flex-col justify-end">
                  <div className="flex flex-1 items-end justify-center gap-1">
                    <div className="w-1/2 max-w-7 rounded-t-md bg-ok" style={{ height: `${(f.receivedCents / flowMax) * 100}%`, minHeight: f.receivedCents ? 3 : 0 }} title={`Recebido: ${money(f.receivedCents)}`} />
                    <div className="w-1/2 max-w-7 rounded-t-md bg-line-strong" style={{ height: `${(f.paidCents / flowMax) * 100}%`, minHeight: f.paidCents ? 3 : 0 }} title={`Despesas: ${money(f.paidCents)}`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2 border-t border-line pt-2 md:gap-4">
              {s.cashflow.map((f) => (
                <Link key={f.month} href={href({ mes: f.month })} className={cx("flex-1 rounded-md py-1 text-center", f.month === month ? "bg-primary-soft" : "hover:bg-surface-2")}>
                  <span className="block text-[12px] font-semibold capitalize text-ink-2">{monthName(f.month).slice(0, 3)}</span>
                  <span className={cx("block text-[11px] tabular", f.netCents < 0 ? "text-danger" : "text-muted")}>{compact(f.netCents)}</span>
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ok" /> Recebido</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-line-strong" /> Despesas pagas</span>
              <span>Valor abaixo do mês = saldo (recebido − pago)</span>
            </div>
          </div>
        )}
      </Card>

      <div className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {(Object.keys(TABS) as Tab[]).map((k) => (
          <Link
            key={k}
            href={href({ aba: k, status: undefined })}
            className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink")}
          >
            {TABS[k]}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {inv && (
          <>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
                {Object.entries(INVOICE_FILTERS).map(([k, l]) => (
                  <Link key={k} href={href({ status: k })} className={cx("rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap", inv.status === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
                    {l}
                  </Link>
                ))}
              </div>
              <a href={`/api/export/financeiro?month=${month}&tipo=receber`} className="inline-flex h-9 items-center gap-2 self-start rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">
                <Download className="size-4" /> Exportar CSV do mês
              </a>
            </div>
            {inv.status === "atrasado" && <p className="mb-3 text-[13px] text-muted">Todas as contas vencidas e não pagas, de qualquer mês.</p>}
            <Card>
              {inv.rows.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="size-5" />}
                  title={inv.status === "atrasado" ? "Nenhuma conta atrasada" : "Nenhum lançamento neste filtro"}
                  text={inv.status === "atrasado" ? "Todos os clientes estão em dia." : "Mensalidades são geradas em Contratos. Cobranças avulsas podem ser lançadas aqui."}
                  action={canWrite && inv.status !== "atrasado" ? <LinkButton href="/app/financeiro/nova" size="sm">Lançar cobrança</LinkButton> : undefined}
                />
              ) : (
                <>
                  <ul className="divide-y divide-line">
                    {inv.rows.map((i) => (
                      <li key={i.id}>
                        <Link href={`/app/financeiro/receber/${i.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 md:px-5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{i.customerName}</p>
                            <p className="truncate text-[13px] text-muted">
                              {INVOICE_KIND[i.kind] ?? i.kind} · {i.description}
                            </p>
                            <p className="text-[12px] text-muted">
                              vence {date(i.dueOn)}
                              {i.paidAt ? ` · pago em ${date(i.paidAt)}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cx("font-display text-[15px] font-bold tabular", i.view === "cancelled" && "text-muted line-through")}>{money(i.amountCents)}</p>
                            <Badge tone={VIEW_TONE[i.view]}>{INVOICE_VIEW_LABEL[i.view]}</Badge>
                          </div>
                          <ChevronRight className="hidden size-4 shrink-0 text-muted md:block" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-sm md:px-5">
                    <span className="text-muted">{inv.rows.length} lançamento{inv.rows.length > 1 ? "s" : ""}</span>
                    <span className="font-semibold tabular">Total (sem cancelados): {money(inv.totalCents)}</span>
                  </div>
                </>
              )}
            </Card>
          </>
        )}

        {exp && (
          <>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
                {Object.entries(EXPENSE_FILTERS).map(([k, l]) => (
                  <Link key={k} href={href({ status: k })} className={cx("rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap", exp.status === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
                    {l}
                  </Link>
                ))}
              </div>
              <a href={`/api/export/financeiro?month=${month}&tipo=pagar`} className="inline-flex h-9 items-center gap-2 self-start rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">
                <Download className="size-4" /> Exportar CSV do mês
              </a>
            </div>
            <Card>
              {exp.rows.length === 0 ? (
                <EmptyState
                  icon={<Wallet className="size-5" />}
                  title="Nenhuma despesa neste filtro"
                  text="Lance combustível, produtos, manutenção de veículos e demais custos para ver o lucro estimado do mês."
                  action={canWrite ? <LinkButton href="/app/financeiro/despesas/nova" size="sm">Lançar despesa</LinkButton> : undefined}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {exp.rows.map((e) => (
                    <li key={e.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3 md:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{e.description}</p>
                        <p className="truncate text-[13px] text-muted">
                          {EXPENSE_CATEGORIES[e.category] ?? e.category}
                          {e.supplier ? ` · ${e.supplier}` : ""} · vence {date(e.dueOn)}
                          {e.paidAt ? ` · paga em ${date(e.paidAt)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <div className="text-left md:text-right">
                          <p className={cx("font-display text-[15px] font-bold tabular", e.view === "cancelled" && "text-muted line-through")}>{money(e.amountCents)}</p>
                          <Badge tone={VIEW_TONE[e.view]}>{e.view === "paid" ? "Paga" : e.view === "cancelled" ? "Cancelada" : e.view === "overdue" ? "Vencida" : "A pagar"}</Badge>
                        </div>
                        {canWrite && e.status === "open" && (
                          <div className="flex items-center gap-1.5">
                            <PayExpenseForm id={e.id} today={isoDay()} />
                            <ActionButton action={cancelExpenseAction.bind(null, e.id)} confirm="Cancelar esta despesa?" variant="ghost">
                              Cancelar
                            </ActionButton>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        {tab === "margem" && (
          <Card>
            <CardHeader
              title="Margem por cliente (estimativa)"
              subtitle={`Recebido do cliente em ${monthName(month)} − custo químico das visitas concluídas no mês`}
              icon={<Users className="size-[18px]" />}
            />
            {s.margin.length === 0 ? (
              <EmptyState title="Sem dados no mês" text="A margem aparece quando há pagamentos registrados ou produtos com custo aplicados em visitas." />
            ) : (
              <>
                <div className="hidden grid-cols-[1fr_120px_120px_120px] gap-3 border-y border-line px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted md:grid">
                  <span>Cliente</span>
                  <span className="text-right">Recebido</span>
                  <span className="text-right">Custo químico</span>
                  <span className="text-right">Margem</span>
                </div>
                <ul className="divide-y divide-line border-t border-line md:border-t-0">
                  {s.margin.map((m) => (
                    <li key={m.customerId} className="px-4 py-3 md:grid md:grid-cols-[1fr_120px_120px_120px] md:items-center md:gap-3 md:px-5">
                      <Link href={`/app/clientes/${m.customerId}`} className="block truncate text-sm font-semibold text-ink hover:text-primary">
                        {m.name}
                        <span className="block text-[12px] font-normal text-muted">{m.visits} visita{m.visits === 1 ? "" : "s"} concluída{m.visits === 1 ? "" : "s"}</span>
                      </Link>
                      <div className="mt-1.5 flex justify-between text-[13px] md:contents">
                        <span className="tabular md:text-right"><span className="text-muted md:hidden">Recebido </span>{money(m.receivedCents)}</span>
                        <span className="tabular text-muted md:text-right"><span className="md:hidden">Químicos </span>{money(m.chemicalCents)}</span>
                        <span className={cx("font-bold tabular md:text-right", m.marginCents < 0 ? "text-danger" : "text-ink")}>{money(m.marginCents)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line px-4 py-3 text-[12px] text-muted md:px-5">
                  Estimativa: não inclui mão de obra, deslocamento nem impostos. O custo químico usa o custo por unidade cadastrado no estoque quando o produto foi aplicado.
                </p>
              </>
            )}
          </Card>
        )}

        {overdueList && (
          <div className="flex flex-col gap-4">
            <Notice tone={gateway ? "ok" : "warn"} title={gateway ? "Gateway de pagamento configurado" : "Cobrança automática e Pix não conectados"}>
              {gateway
                ? "A chave do gateway está configurada no servidor, mas a emissão automática de Pix/boleto ainda não está disponível nesta versão. Os pagamentos continuam sendo registrados manualmente."
                : "Nenhum gateway de pagamento está conectado: o Ondaro não gera Pix, boleto nem confirma pagamentos sozinho. Quando o cliente pagar, registre o pagamento no lançamento — só usuários com permissão financeira conseguem fazer isso."}
            </Notice>
            <Card>
              <CardHeader title="Lembretes de pagamento" subtitle="Contas vencidas e não pagas" icon={<MessageCircle className="size-[18px]" />} />
              {overdueList.rows.length === 0 ? (
                <EmptyState title="Nenhuma conta atrasada" text="Todos os clientes estão em dia." />
              ) : (
                <>
                  <ul className="divide-y divide-line border-t border-line">
                    {overdueList.rows.map((i) => {
                      const text = `Olá, ${i.customerName.split(" ")[0]}! Tudo bem? Passando para lembrar do pagamento de ${money(i.amountCents)} referente a "${i.description}", com vencimento em ${date(i.dueOn)}. Se já pagou, por favor desconsidere. Obrigado! — ${ctx.tenant.name}`;
                      return (
                        <li key={i.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                          <Link href={`/app/financeiro/receber/${i.id}`} className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{i.customerName}</p>
                            <p className="truncate text-[13px] text-muted">
                              {money(i.amountCents)} · venceu em {date(i.dueOn)}
                            </p>
                          </Link>
                          {i.customerWhatsapp ? (
                            <a href={waLink(i.customerWhatsapp, text)} target="_blank" rel="noopener" className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-line-strong px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">
                              <MessageCircle className="size-4" /> Abrir lembrete no WhatsApp
                            </a>
                          ) : (
                            <span className="text-[12px] text-muted">Cliente sem WhatsApp/telefone cadastrado</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="border-t border-line px-4 py-3 text-[12px] text-muted md:px-5">
                    O botão abre o seu WhatsApp com a mensagem pronta — o envio é feito por você e o Ondaro não confirma a entrega.
                  </p>
                </>
              )}
            </Card>
            <div className="flex items-start gap-2 text-[12px] text-muted">
              <PlugZap className="mt-0.5 size-4 shrink-0" /> Integração de pagamento é configurada pelo administrador da plataforma (chave do gateway no servidor).
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function compact(cents: number) {
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : ""}R$ ${s}`;
}
