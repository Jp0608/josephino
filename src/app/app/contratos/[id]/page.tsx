import Link from "next/link";
import { Pencil, Printer, CalendarClock, Receipt, FileText } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getContract, getContractFormOptions, CONTRACT_STATUS } from "@/server/contracts";
import { invoiceView, INVOICE_VIEW_LABEL } from "@/server/finance";
import { notFoundGuard } from "@/server/guards";
import { Card, CardHeader, PageHeader, LinkButton, Badge, KeyValue, EmptyState, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { describeRule } from "@/lib/domain/recurrence";
import { PAYMENT_METHODS } from "@/lib/domain/catalog";
import { addDays, date, isoDay, money } from "@/lib/format";
import { FeatureLocked } from "../../estoque/_locked";
import { ScheduleForm } from "../ScheduleForm";
import { scheduleContractAction, setContractStatusAction } from "../actions";

const STATUS_TONE: Record<string, Tone> = { active: "ok", draft: "neutral", paused: "warn", ended: "neutral", cancelled: "danger" };
const VIEW_TONE: Record<string, Tone> = { open: "warn", overdue: "danger", paid: "ok", cancelled: "neutral" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return <FeatureLocked title="Contrato" feature="Contratos e planos" text="Contratos recorrentes fazem parte dos planos com o módulo de contratos." canManageBilling={can(ctx.role, "billing.manage")} />;
  const d = await notFoundGuard(() => getContract(ctx, id));
  const ct = d.contract;
  const canSchedule = can(ctx.role, "agenda.write");
  const canFinance = can(ctx.role, "finance.read") && hasFeature(ctx, "finance");
  const team = canSchedule ? (await getContractFormOptions(ctx)).team : [];
  const today = isoDay();
  const endingSoon = ct.status === "active" && !!ct.endsOn && ct.endsOn <= addDays(today, 30);
  const activeRecs = d.recurrences.filter((r) => r.active);

  const transitions: [string, string, string?][] =
    ct.status === "active"
      ? [["paused", "Pausar"], ["ended", "Encerrar", "Encerrar o contrato? Novas mensalidades deixam de ser geradas."]]
      : ct.status === "draft"
        ? [["active", "Ativar"], ["cancelled", "Cancelar", "Cancelar este rascunho?"]]
        : ct.status === "paused"
          ? [["active", "Reativar"], ["ended", "Encerrar", "Encerrar o contrato?"]]
          : [["active", "Reativar"]];

  return (
    <>
      <PageHeader
        title={ct.title}
        subtitle={
          <>
            <Link href={`/app/clientes/${d.customer.id}`} className="font-semibold text-primary">{d.customer.name}</Link>
            {d.pool ? ` · ${d.pool.name}` : ""}
          </>
        }
        back={{ href: "/app/contratos", label: "Contratos" }}
        actions={
          <>
            <LinkButton href={`/app/contratos/${id}/imprimir`} variant="secondary">
              <Printer className="size-4" /> Imprimir
            </LinkButton>
            <LinkButton href={`/app/contratos/${id}/editar`} variant="secondary">
              <Pencil className="size-4" /> Editar
            </LinkButton>
          </>
        }
      />

      {endingSoon && (
        <div className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
          {ct.endsOn! < today ? `O prazo deste contrato terminou em ${date(ct.endsOn)}.` : `Este contrato termina em ${date(ct.endsOn)}.`} Renove (edite a data de término) ou encerre.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-[28px] font-extrabold leading-none tabular">
                  {money(ct.monthlyCents)}
                  <span className="text-[14px] font-medium text-muted">/mês</span>
                </p>
                <p className="mt-1 text-[13px] text-muted">Vencimento todo dia {ct.billingDay}{ct.paymentMethod ? ` · ${PAYMENT_METHODS[ct.paymentMethod] ?? ct.paymentMethod}` : ""}</p>
              </div>
              <Badge tone={STATUS_TONE[ct.status] ?? "neutral"} dot>{CONTRACT_STATUS[ct.status] ?? ct.status}</Badge>
            </div>
            <KeyValue
              items={[
                ["Início", date(ct.startsOn)],
                ["Término", ct.endsOn ? date(ct.endsOn) : "Prazo indeterminado"],
                ["Plano", d.plan?.name ?? "Personalizado"],
                ["Piscina", d.pool ? `${d.pool.code} · ${d.pool.name}` : "Não especificada"],
                ["Reajuste", ct.adjustmentRule],
                ["Última mensalidade gerada", ct.lastInvoicedMonth ? ct.lastInvoicedMonth.split("-").reverse().join("/") : null],
              ]}
            />
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              {transitions.map(([s, l, confirm]) => (
                <ActionButton key={s} action={setContractStatusAction.bind(null, id, s)} confirm={confirm} variant={s === "active" ? "soft" : "secondary"}>
                  {l}
                </ActionButton>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Cláusulas e condições" icon={<FileText className="size-[18px]" />} />
            <div className="border-t border-line px-4 py-4 md:px-5">
              {ct.conditions ? <p className="whitespace-pre-wrap text-sm text-ink-2">{ct.conditions}</p> : <p className="text-sm text-muted">Nenhuma cláusula escrita. Edite o contrato para incluir as condições que vão no documento impresso.</p>}
            </div>
          </Card>

          {canFinance && (
            <Card>
              <CardHeader title="Mensalidades" subtitle="Geradas na página de Contratos, uma por mês" icon={<Receipt className="size-[18px]" />} />
              {d.invoices.length === 0 ? (
                <p className="border-t border-line px-5 py-4 text-sm text-muted">Nenhuma mensalidade gerada ainda.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {d.invoices.map((i) => {
                    const v = invoiceView(i, today);
                    return (
                      <li key={i.id}>
                        <Link href={`/app/financeiro/receber/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2 md:px-5">
                          <span>
                            <span className="block font-semibold">{i.competence ? i.competence.split("-").reverse().join("/") : i.description}</span>
                            <span className="block text-[12px] text-muted">vence {date(i.dueOn)}</span>
                          </span>
                          <span className="text-right">
                            <span className="block font-semibold tabular">{money(i.amountCents)}</span>
                            <Badge tone={VIEW_TONE[v]}>{INVOICE_VIEW_LABEL[v]}</Badge>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Agenda recorrente" icon={<CalendarClock className="size-[18px]" />} subtitle={activeRecs.length ? "Visitas geradas automaticamente" : "Nenhuma agenda ligada a este contrato"} />
            {d.recurrences.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {d.recurrences.map((r) => (
                  <li key={r.id} className="px-4 py-3 text-sm md:px-5">
                    <p className="font-semibold">{describeRule(r, r.startTime)}</p>
                    <p className="text-[12px] text-muted">
                      desde {date(r.startsOn)}
                      {r.endsOn ? ` até ${date(r.endsOn)}` : ""} · {r.techName ?? "sem responsável"}
                      {!r.active && " · encerrada"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {activeRecs.length > 0 && (
              <div className="border-t border-line px-4 py-3 text-[13px] md:px-5">
                <Link href="/app/agenda" className="font-semibold text-primary">Ver na agenda →</Link>
              </div>
            )}
            {activeRecs.length === 0 && (
              <div className="border-t border-line p-4 md:p-5">
                {!d.pool ? (
                  <EmptyState title="Sem piscina vinculada" text="Edite o contrato e escolha a piscina para criar a agenda recorrente." />
                ) : !canSchedule ? (
                  <p className="text-sm text-muted">Você não tem permissão para agendar visitas.</p>
                ) : ct.status !== "active" ? (
                  <p className="text-sm text-muted">Ative o contrato para criar a agenda.</p>
                ) : (
                  <ScheduleForm
                    action={scheduleContractAction.bind(null, id)}
                    team={team}
                    defaults={{
                      firstDate: ct.startsOn > today ? ct.startsOn : today,
                      weekdays: d.plan?.weekdays ?? [],
                      repeat: d.plan?.intervalWeeks === 2 ? "biweekly" : d.plan?.intervalWeeks === 4 ? "monthly" : "weekly",
                    }}
                  />
                )}
              </div>
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <h3 className="text-[15px] font-bold">Documento</h3>
            <p className="mt-1 text-[13px] text-muted">Gere a versão para impressão ou PDF com os dados da empresa, do cliente e as cláusulas acima.</p>
            <LinkButton href={`/app/contratos/${id}/imprimir`} variant="soft" size="sm" className="mt-3">
              <Printer className="size-4" /> Abrir para imprimir
            </LinkButton>
          </Card>
        </div>
      </div>
    </>
  );
}
