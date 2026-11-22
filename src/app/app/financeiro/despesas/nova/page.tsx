import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, PageHeader } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/domain/catalog";
import { isoDay } from "@/lib/format";
import { FeatureLocked } from "../../../estoque/_locked";
import { createExpenseAction } from "../../actions";

export const metadata = { title: "Nova despesa" };

export default async function NewExpense() {
  const ctx = await requireCtx("finance.write");
  if (!hasFeature(ctx, "finance"))
    return <FeatureLocked title="Nova despesa" feature="Financeiro" text="Contas a pagar fazem parte dos planos com o módulo financeiro." canManageBilling={can(ctx.role, "billing.manage")} />;
  return (
    <>
      <PageHeader title="Nova despesa" subtitle="Conta a pagar da empresa" back={{ href: "/app/financeiro?aba=pagar", label: "Financeiro" }} />
      <ActionForm action={createExpenseAction} className="flex flex-col gap-5">
        <Card className="p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Descrição" required className="md:col-span-2">
              <Input name="description" placeholder="Ex.: Abastecimento do veículo 1" required />
              <FieldError name="description" />
            </Field>
            <Field label="Categoria" required>
              <Select name="category" defaultValue="" placeholder="Escolha" options={EXPENSE_CATEGORIES} required />
              <FieldError name="category" />
            </Field>
            <Field label="Fornecedor">
              <Input name="supplier" />
            </Field>
            <Field label="Valor (R$)" required>
              <Input name="amountCents" inputMode="decimal" placeholder="0,00" required />
              <FieldError name="amountCents" />
            </Field>
            <Field label="Vencimento" required>
              <Input name="dueOn" type="date" defaultValue={isoDay()} required />
              <FieldError name="dueOn" />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2.5 text-[13px] text-ink-2">
            <input type="checkbox" name="paidNow" className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>Já foi paga hoje</span>
          </label>
        </Card>
        <div className="sticky bottom-20 z-10 flex justify-end md:static">
          <SubmitButton size="lg" className="w-full md:w-auto">Lançar despesa</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
