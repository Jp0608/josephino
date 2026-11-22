import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";
import type { leads } from "@/db/schema";
import { LEAD_SOURCES } from "@/server/crm";
import { isoDay } from "@/lib/format";

export function LeadForm({
  action,
  lead,
  members,
  submit,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  lead?: typeof leads.$inferSelect;
  members: { id: string; name: string }[];
  submit: string;
}) {
  const followUp = lead?.nextFollowUpAt ? isoDay(lead.nextFollowUpAt) : "";
  const value = lead?.estimatedMonthlyCents != null ? (lead.estimatedMonthlyCents / 100).toFixed(2).replace(".", ",") : "";
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Contato</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do contato ou do imóvel" required className="md:col-span-2">
            <Input name="name" defaultValue={lead?.name} required placeholder="Ex.: Condomínio Jardim das Águas" />
            <FieldError name="name" />
          </Field>
          <Field label="WhatsApp / telefone">
            <Input name="phone" type="tel" inputMode="tel" defaultValue={lead?.phone ?? ""} placeholder="(11) 99999-9999" />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" inputMode="email" defaultValue={lead?.email ?? ""} />
            <FieldError name="email" />
          </Field>
          <Field label="Cidade">
            <Input name="city" defaultValue={lead?.city ?? ""} />
          </Field>
          <Field label="Origem">
            <Select name="source" defaultValue={lead?.source ?? ""} placeholder="Selecione" options={LEAD_SOURCES} />
          </Field>
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Negociação</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Valor mensal estimado (R$)" hint="Entra no valor do funil.">
            <Input name="estimatedMonthly" inputMode="decimal" defaultValue={value} placeholder="350,00" />
            <FieldError name="estimatedMonthly" />
          </Field>
          <Field label="Responsável">
            <Select name="ownerUserId" defaultValue={lead?.ownerUserId ?? ""} placeholder="Ninguém" options={members.map((m) => [m.id, m.name] as [string, string])} />
            <FieldError name="ownerUserId" />
          </Field>
          <Field label="Próximo follow-up">
            <Input name="nextFollowUp" type="date" defaultValue={followUp} />
            <FieldError name="nextFollowUp" />
          </Field>
          <Field label="Observações" className="md:col-span-3">
            <Textarea name="notes" rows={4} defaultValue={lead?.notes ?? ""} placeholder="Tamanho da piscina, frequência desejada, quem decide…" />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <SubmitButton size="lg">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
