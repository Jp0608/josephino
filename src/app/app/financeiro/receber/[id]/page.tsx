import Link from "next/link";
import { BadgeCheck, MessageCircle, Receipt, ShieldCheck } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getInvoice, INVOICE_VIEW_LABEL, type InvoiceView } from "@/server/finance";
import { notFoundGuard } from "@/server/guards";
import { ActionForm, SubmitButton, FieldError, ActionButton } from "@/components/client";
import { Card, CardHeader, PageHeader, Badge, KeyValue, Field, Input, Select, type Tone } from "@/components/ui";
import { INVOICE_KIND, PAYMENT_METHODS } from "@/lib/domain/catalog";
import { date, dateTime, isoDay, money, waLink } from "@/lib/format";
import { FeatureLocked } from "../../../estoque/_locked";
import { centsToInput } from "../../../estoque/ProductForm";
import { recordPaymentAction, cancelInvoiceAction } from "../../actions";

const VIEW_TONE: Record<InvoiceView, Tone> = { open: "warn", overdue: "danger", paid: "ok", cancelled: "neutral" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("finance.read");
  if (!hasFeature(ctx, "finance"))
    return <FeatureLocked title="Financeiro" feature="Financeiro" text="Contas a receber fazem parte dos planos com o módulo financeiro." canManageBilling={can(ctx.role, "billing.manage")} />;
  const inv = await notFoundGuard(() => getInvoice(ctx, id));
  const phone = inv.customerWhatsapp;
  const canWrite = can(ctx.role, "finance.write");
  const today = isoDay();
  const reminder = `Olá, ${inv.customerName.split(" ")[0]}! Tudo bem? Passando para lembrar do pagamento de ${money(inv.amountCents)} referente a "${inv.description}", com vencimento em ${date(inv.dueOn)}. Se já pagou, por favor desconsidere. Obrigado! — ${ctx.tenant.name}`;

  return (
    <>
      <PageHeader
        title={money(inv.amountCents)}
        subtitle={`${INVOICE_KIND[inv.kind] ?? inv.kind} · ${inv.customerName}`}
        back={{ href: `/app/financeiro?mes=${inv.dueOn.slice(0, 7)}`, label: "Financeiro" }}
        actions={
          <>
            {(inv.view === "open" || inv.view === "overdue") && phone && (
              <a href={waLink(phone, reminder)} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">
                <MessageCircle className="size-4" /> Lembrete no WhatsApp
              </a>
            )}
            {canWrite && (inv.view === "open" || inv.view === "overdue") && (
              <ActionButton action={cancelInvoiceAction.bind(null, id)} confirm="Cancelar este lançamento? Ele deixa de contar como valor a receber." variant="ghost" size="md">
                Cancelar lançamento
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Badge tone={VIEW_TONE[inv.view]} dot>{INVOICE_VIEW_LABEL[inv.view]}</Badge>
              {inv.contractId && <Badge tone="brand">Mensalidade de contrato</Badge>}
            </div>
            <KeyValue
              items={[
                ["Cliente", <Link key="c" href={`/app/clientes/${inv.customerId}`} className="text-primary">{inv.customerName}</Link>],
                ["Descrição", inv.description],
                ["Vencimento", date(inv.dueOn)],
                ["Competência", inv.competence],
                ["Pago em", inv.paidAt ? date(inv.paidAt) : null],
                ["Lançado em", dateTime(inv.createdAt)],
                ...(inv.contractId ? ([["Contrato", <Link key="ct" href={`/app/contratos/${inv.contractId}`} className="text-primary">ver contrato</Link>]] as [string, React.ReactNode][]) : []),
                ...(inv.visitId ? ([["Visita", <Link key="v" href={`/app/visitas/${inv.visitId}`} className="text-primary">ver visita</Link>]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Pagamentos registrados" icon={<Receipt className="size-[18px]" />} />
            {inv.payments.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-muted">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3 md:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {PAYMENT_METHODS[p.method] ?? p.method} · {date(p.paidAt)}
                      </p>
                      <p className="text-[12px] text-muted">
                        {p.source === "gateway" ? "Confirmado pelo provedor de pagamento" : `Registro manual${p.recordedByName ? ` por ${p.recordedByName}` : ""} em ${dateTime(p.createdAt)}`}
                      </p>
                      {p.note && <p className="mt-0.5 text-[13px] text-ink-2">{p.note}</p>}
                    </div>
                    <span className="shrink-0 font-display font-bold tabular">{money(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {canWrite && (inv.view === "open" || inv.view === "overdue") ? (
            <Card>
              <CardHeader title="Registrar pagamento" subtitle="Confirme somente depois de verificar o recebimento" icon={<BadgeCheck className="size-[18px]" />} />
              <div className="border-t border-line p-4 md:p-5">
                <ActionForm action={recordPaymentAction.bind(null, id)} className="flex flex-col gap-4">
                  <Field label="Forma de pagamento" required>
                    <Select name="method" defaultValue="pix" options={PAYMENT_METHODS} />
                    <FieldError name="method" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Data do pagamento" required>
                      <Input name="paidOn" type="date" defaultValue={today} max={today} required />
                      <FieldError name="paidOn" />
                    </Field>
                    <Field label="Valor recebido (R$)" required>
                      <Input name="amountCents" inputMode="decimal" defaultValue={centsToInput(inv.amountCents)} required />
                      <FieldError name="amountCents" />
                    </Field>
                  </div>
                  <Field label="Observação" hint="Ex.: comprovante recebido pelo WhatsApp, desconto concedido.">
                    <Input name="note" />
                  </Field>
                  <SubmitButton className="w-full" pendingText="Registrando…">Confirmar pagamento recebido</SubmitButton>
                </ActionForm>
                <p className="mt-3 flex items-start gap-2 text-[12px] text-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" /> O registro fica no histórico com seu nome, data e forma de pagamento, e quita o lançamento.
                </p>
              </div>
            </Card>
          ) : inv.view === "paid" ? (
            <Card className="p-4 md:p-5">
              <p className="flex items-center gap-2 text-[15px] font-bold text-ok">
                <BadgeCheck className="size-5" /> Lançamento quitado
              </p>
              <p className="mt-1 text-sm text-muted">Pago em {date(inv.paidAt)}.</p>
            </Card>
          ) : inv.view === "cancelled" ? (
            <Card className="p-4 md:p-5">
              <p className="text-[15px] font-bold text-ink-2">Lançamento cancelado</p>
              <p className="mt-1 text-sm text-muted">Não conta como valor a receber.</p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
