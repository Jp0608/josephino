import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";
import type { customers } from "@/db/schema";

const UF = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export function CustomerForm({
  action,
  c,
  submit,
  showInternal,
  offerPoolNext,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  c?: typeof customers.$inferSelect;
  submit: string;
  showInternal: boolean;
  offerPoolNext?: boolean;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Identificação</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tipo">
            <Select name="kind" defaultValue={c?.kind ?? "pf"} options={{ pf: "Pessoa física", pj: "Empresa / condomínio" }} />
          </Field>
          <Field label="Nome completo ou razão social" required>
            <Input name="name" defaultValue={c?.name} required />
            <FieldError name="name" />
          </Field>
          <Field label="CPF / CNPJ" hint="Opcional. Necessário para contratos e cobranças formais.">
            <Input name="document" defaultValue={c?.document ?? ""} inputMode="numeric" />
          </Field>
          <Field label="Responsável pelo imóvel" hint="Síndico, zelador, caseiro…">
            <Input name="contactName" defaultValue={c?.contactName ?? ""} />
          </Field>
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Contato</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="WhatsApp">
            <Input name="whatsapp" type="tel" inputMode="tel" defaultValue={c?.whatsapp ?? ""} placeholder="(11) 99999-9999" />
          </Field>
          <Field label="Telefone">
            <Input name="phone" type="tel" inputMode="tel" defaultValue={c?.phone ?? ""} />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" inputMode="email" defaultValue={c?.email ?? ""} />
            <FieldError name="email" />
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-2.5 text-[13px] text-ink-2">
          <input type="checkbox" name="whatsappConsent" defaultChecked={c?.whatsappConsent} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>O cliente autorizou receber avisos e relatórios por WhatsApp (registramos a data do consentimento — LGPD).</span>
        </label>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Endereço de atendimento</h2>
        <div className="grid gap-4 md:grid-cols-6">
          <Field label="CEP" className="md:col-span-2">
            <Input name="zip" defaultValue={c?.zip ?? ""} inputMode="numeric" />
          </Field>
          <Field label="Rua" className="md:col-span-3">
            <Input name="street" defaultValue={c?.street ?? ""} />
          </Field>
          <Field label="Número" className="md:col-span-1">
            <Input name="number" defaultValue={c?.number ?? ""} />
          </Field>
          <Field label="Complemento" className="md:col-span-2">
            <Input name="complement" defaultValue={c?.complement ?? ""} />
          </Field>
          <Field label="Bairro" className="md:col-span-2">
            <Input name="district" defaultValue={c?.district ?? ""} />
          </Field>
          <Field label="Cidade" className="md:col-span-1">
            <Input name="city" defaultValue={c?.city ?? ""} />
          </Field>
          <Field label="UF" className="md:col-span-1">
            <Select name="state" defaultValue={c?.state ?? ""} placeholder="—" options={UF.map((u) => [u, u] as [string, string])} />
          </Field>
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Relacionamento</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Status">
            <Select name="status" defaultValue={c?.status ?? "active"} options={{ active: "Ativo", paused: "Pausado", inactive: "Inativo" }} />
          </Field>
          <Field label="Origem do cliente">
            <Select
              name="source"
              defaultValue={c?.source ?? ""}
              placeholder="—"
              options={{ indicacao: "Indicação", instagram: "Instagram", google: "Google", whatsapp: "WhatsApp", condominio: "Condomínio", outro: "Outro" }}
            />
          </Field>
          <Field label="Cliente desde">
            <Input name="startedAt" type="date" defaultValue={c?.startedAt ?? ""} />
          </Field>
        </div>
        {showInternal && (
          <Field label="Observações internas" hint="Visível só para a equipe. Nunca aparece no portal nem nos relatórios." className="mt-4">
            <Textarea name="internalNotes" defaultValue={c?.internalNotes ?? ""} />
          </Field>
        )}
      </Card>
      <div className="sticky bottom-20 z-10 flex flex-col-reverse gap-2 md:static md:flex-row md:justify-end">
        {offerPoolNext && (
          <button name="next" value="pool" className="h-12 rounded-[10px] border border-line-strong bg-surface px-5 text-sm font-semibold text-ink md:h-10">
            Salvar e cadastrar piscina
          </button>
        )}
        <SubmitButton size="lg">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
