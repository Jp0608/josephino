import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { PRODUCT_CATEGORIES, UNITS } from "@/lib/domain/catalog";
import type { ActionResult } from "@/lib/action-types";
import type { products } from "@/db/schema";

export const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
export const qtyToInput = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function ProductForm({
  action,
  p,
  submit,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  p?: typeof products.$inferSelect;
  submit: string;
}) {
  const isNew = !p;
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Produto</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do produto" required className="md:col-span-2">
            <Input name="name" defaultValue={p?.name} required placeholder="Ex.: Cloro granulado 65%" />
            <FieldError name="name" />
          </Field>
          <Field label="Categoria">
            <Select name="category" defaultValue={p?.category ?? "desinfetante"} options={PRODUCT_CATEGORIES} />
          </Field>
          <Field label="Unidade de controle" hint="Como o estoque é contado e baixado nas visitas.">
            <Select name="unit" defaultValue={p?.unit ?? "kg"} options={UNITS.map((u) => [u, u] as [string, string])} />
          </Field>
          <Field label="Marca">
            <Input name="brand" defaultValue={p?.brand ?? ""} />
          </Field>
          <Field label="Fabricante">
            <Input name="manufacturer" defaultValue={p?.manufacturer ?? ""} />
          </Field>
          <Field label="Princípio ativo" hint="Como declarado no rótulo.">
            <Input name="activeIngredient" defaultValue={p?.activeIngredient ?? ""} />
          </Field>
          <Field label="Concentração" hint="Como declarada no rótulo, ex.: 65% cloro ativo.">
            <Input name="concentration" defaultValue={p?.concentration ?? ""} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Compra e estoque</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Fornecedor">
            <Input name="supplier" defaultValue={p?.supplier ?? ""} />
          </Field>
          <Field label="Custo por unidade (R$)" hint="Usado para calcular o custo químico por visita.">
            <Input name="costCentsPerUnit" inputMode="decimal" defaultValue={centsToInput(p?.costCentsPerUnit)} placeholder="0,00" />
            <FieldError name="costCentsPerUnit" />
          </Field>
          <Field label="Estoque mínimo" hint="Abaixo disso o produto aparece com alerta.">
            <Input name="minQty" inputMode="decimal" defaultValue={qtyToInput(p?.minQty)} />
            <FieldError name="minQty" />
          </Field>
          {isNew && (
            <Field label="Estoque inicial" hint="Registrado como entrada no histórico.">
              <Input name="initialQty" inputMode="decimal" placeholder="0" />
              <FieldError name="initialQty" />
            </Field>
          )}
          <Field label="Lote">
            <Input name="lot" defaultValue={p?.lot ?? ""} />
          </Field>
          <Field label="Validade">
            <Input name="expiresOn" type="date" defaultValue={p?.expiresOn ?? ""} />
            <FieldError name="expiresOn" />
          </Field>
          <Field label="Local de armazenamento" className={isNew ? "" : "md:col-span-3"}>
            <Input name="storageLocation" defaultValue={p?.storageLocation ?? ""} placeholder="Ex.: Depósito, prateleira 2" />
          </Field>
        </div>
        {!isNew && <p className="mt-3 text-[12px] text-muted">O saldo só muda por movimentação registrada — use “Registrar movimentação” na página do produto.</p>}
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="mb-1 text-[15px] font-bold">Cuidados de segurança do fabricante</h2>
        <p className="mb-3 text-[13px] text-muted">
          Transcreva as orientações de armazenamento, compatibilidade e EPI que constam no rótulo ou na FISPQ. O Ondaro não sugere dosagens — siga sempre o fabricante e o responsável técnico.
        </p>
        <Textarea name="safetyNotes" defaultValue={p?.safetyNotes ?? ""} rows={4} placeholder="Ex.: Não misturar com ácidos. Manter em local seco e ventilado. Usar luvas e óculos." />
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end md:static">
        <SubmitButton size="lg" className="w-full md:w-auto">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
