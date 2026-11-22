import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { POOL_USAGE, LINING, DISINFECTION } from "@/lib/domain/catalog";
import type { ActionResult } from "@/lib/action-types";
import type { pools } from "@/db/schema";
import { Dimensions } from "./Dimensions";

export function PoolForm({
  action,
  p,
  customers,
  customerId,
  submit,
  offerSchedule,
}: {
  action: (s: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  p?: typeof pools.$inferSelect;
  customers: { id: string; name: string }[];
  customerId?: string;
  submit: string;
  offerSchedule?: boolean;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Identificação</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Cliente" required className="md:col-span-3">
            <Select name="customerId" defaultValue={p?.customerId ?? customerId ?? ""} placeholder="Escolha o cliente" options={customers.map((c) => [c.id, c.name] as [string, string])} />
            <FieldError name="customerId" />
          </Field>
          <Field label="Nome da piscina" required hint="Ex.: Piscina adulta, Infantil, Aquecida">
            <Input name="name" defaultValue={p?.name ?? "Piscina principal"} />
            <FieldError name="name" />
          </Field>
          <Field label="Código" hint="Gerado automaticamente se vazio (P001…). Vai no QR code.">
            <Input name="code" defaultValue={p?.code ?? ""} maxLength={20} />
          </Field>
          <Field label="Uso">
            <Select name="usage" defaultValue={p?.usage ?? "residencial"} options={POOL_USAGE} />
          </Field>
          <Field label="Endereço da piscina" hint="Só se for diferente do endereço do cliente." className="md:col-span-3">
            <Input name="address" defaultValue={p?.address ?? ""} />
          </Field>
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Medidas e volume</h2>
        <Dimensions p={p} />
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Construção e equipamentos</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Revestimento">
            <Select name="lining" defaultValue={p?.lining ?? ""} placeholder="—" options={LINING} />
          </Field>
          <Field label="Tipo de desinfecção">
            <Select name="disinfection" defaultValue={p?.disinfection ?? ""} placeholder="—" options={DISINFECTION} />
          </Field>
          <Field label="Aquecimento">
            <Select name="heating" defaultValue={p?.heating ?? ""} placeholder="Sem aquecimento" options={{ solar: "Solar", trocador: "Trocador de calor", eletrico: "Elétrico", gas: "Gás", outro: "Outro" }} />
          </Field>
          <Field label="Filtragem">
            <Input name="filtration" defaultValue={p?.filtration ?? ""} placeholder="Ex.: filtro de areia 50 cm" />
          </Field>
          <Field label="Bomba">
            <Input name="pump" defaultValue={p?.pump ?? ""} placeholder="Marca / modelo" />
          </Field>
          <Field label="Potência / especificação">
            <Input name="pumpSpec" defaultValue={p?.pumpSpec ?? ""} placeholder="Ex.: 1/2 CV monofásica" />
          </Field>
          <Field label="Frequência recomendada (dias)" hint="Usada nos alertas de piscina sem atendimento.">
            <Input name="frequencyDays" inputMode="numeric" defaultValue={p?.frequencyDays ?? ""} placeholder="7" />
          </Field>
          <Field label="Observações técnicas" className="md:col-span-2">
            <Textarea name="technicalNotes" defaultValue={p?.technicalNotes ?? ""} />
          </Field>
        </div>
      </Card>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        {offerSchedule && (
          <button name="next" value="schedule" className="h-12 rounded-[10px] border border-line-strong bg-surface px-5 text-sm font-semibold text-ink md:h-10">
            Salvar e agendar visita
          </button>
        )}
        <SubmitButton size="lg">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
