import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { listCustomerOptions } from "@/server/finance";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { INVOICE_KIND } from "@/lib/domain/catalog";
import { addDays, isoDay } from "@/lib/format";
import { FeatureLocked } from "../../estoque/_locked";
import { createInvoiceAction } from "../actions";

export const metadata = { title: "Nova cobrança" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const ctx = await requireCtx("finance.write");
  if (!hasFeature(ctx, "finance"))
    return <FeatureLocked title="Nova cobrança" feature="Financeiro" text="Contas a receber fazem parte dos planos com o módulo financeiro." canManageBilling={can(ctx.role, "billing.manage")} />;
  const sp = await searchParams;
  const custs = await listCustomerOptions(ctx);
  return (
    <>
      <PageHeader title="Nova cobrança" subtitle="Conta a receber avulsa. Mensalidades de contrato são geradas em Contratos." back={{ href: "/app/financeiro", label: "Financeiro" }} />
      {custs.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum cliente ativo" text="Cadastre o cliente antes de lançar uma cobrança." action={<LinkButton href="/app/clientes/novo">Cadastrar cliente</LinkButton>} />
        </Card>
      ) : (
        <ActionForm action={createInvoiceAction} className="flex flex-col gap-5">
          <Card className="p-4 md:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Cliente" required className="md:col-span-2">
                <Select name="customerId" defaultValue={custs.some((c) => c.id === sp.cliente) ? sp.cliente : ""} placeholder="Escolha o cliente" options={custs.map((c) => [c.id, c.status === "paused" ? `${c.name} (pausado)` : c.name] as [string, string])} required />
                <FieldError name="customerId" />
              </Field>
              <Field label="Tipo">
                <Select name="kind" defaultValue="avulso" options={INVOICE_KIND} />
              </Field>
              <Field label="Valor (R$)" required>
                <Input name="amountCents" inputMode="decimal" placeholder="0,00" required />
                <FieldError name="amountCents" />
              </Field>
              <Field label="Descrição" required className="md:col-span-2" hint="Aparece no lembrete de pagamento enviado ao cliente.">
                <Input name="description" placeholder="Ex.: Tratamento de recuperação — água verde" required />
                <FieldError name="description" />
              </Field>
              <Field label="Vencimento" required>
                <Input name="dueOn" type="date" defaultValue={addDays(isoDay(), 7)} required />
                <FieldError name="dueOn" />
              </Field>
              <Field label="Competência (opcional)" hint="Mês de referência, ex.: 2026-11.">
                <Input name="competence" type="month" />
                <FieldError name="competence" />
              </Field>
            </div>
          </Card>
          <div className="sticky bottom-20 z-10 flex justify-end md:static">
            <SubmitButton size="lg" className="w-full md:w-auto">Lançar cobrança</SubmitButton>
          </div>
        </ActionForm>
      )}
    </>
  );
}
