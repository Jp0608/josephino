import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";
import type { servicePlans } from "@/db/schema";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const cents = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export function PlanForm({ action, p, submit }: { action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>; p?: typeof servicePlans.$inferSelect; submit: string }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Plano</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nome do plano" required className="md:col-span-2">
            <Input name="name" defaultValue={p?.name} placeholder="Ex.: Semanal completo" required />
            <FieldError name="name" />
          </Field>
          <Field label="Preço mensal (R$)" required>
            <Input name="priceCents" inputMode="decimal" defaultValue={cents(p?.priceCents)} placeholder="0,00" required />
            <FieldError name="priceCents" />
          </Field>
          <Field label="Frequência">
            <Select name="intervalWeeks" defaultValue={String(p?.intervalWeeks ?? 1)} options={{ "1": "Semanal", "2": "Quinzenal", "4": "A cada 4 semanas" }} />
            <FieldError name="intervalWeeks" />
          </Field>
          <Field label="Visitas por mês" hint="Informativo, aparece no contrato.">
            <Input name="visitsPerMonth" type="number" min={1} max={31} defaultValue={p?.visitsPerMonth ?? ""} />
            <FieldError name="visitsPerMonth" />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Dias sugeridos</span>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((l, d) => (
                <label key={d} className="grid h-9 min-w-10 cursor-pointer place-items-center rounded-lg border border-line px-1.5 text-[12px] font-semibold text-ink-2 has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary">
                  <input type="checkbox" name="weekdays[]" value={d} defaultChecked={p?.weekdays?.includes(d)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">O que está incluído</h2>
        <div className="grid gap-4">
          <Field label="Serviços incluídos">
            <Textarea name="includedServices" defaultValue={p?.includedServices ?? ""} placeholder="Ex.: Aspiração, escovação, peneiração, análise da água e relatório após cada visita." />
          </Field>
          <Field label="Serviços extras (cobrados à parte)">
            <Textarea name="extras" defaultValue={p?.extras ?? ""} placeholder="Ex.: Recuperação de água verde, troca de areia do filtro." />
          </Field>
          <Field label="Condições" hint="Texto-base para os contratos criados a partir deste plano.">
            <Textarea name="conditions" defaultValue={p?.conditions ?? ""} rows={5} />
          </Field>
        </div>
      </Card>
      <div className="sticky bottom-20 z-10 flex justify-end md:static">
        <SubmitButton size="lg" className="w-full md:w-auto">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
