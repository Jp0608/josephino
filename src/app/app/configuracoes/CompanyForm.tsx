import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { tenants } from "@/db/schema";
import { companyAction } from "./actions";

const UF = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export function CompanyForm({ t, next, compact }: { t: typeof tenants.$inferSelect; next?: string; compact?: boolean }) {
  return (
    <ActionForm action={companyAction} className="grid gap-4 md:grid-cols-2">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Nome da empresa" required>
        <Input name="name" defaultValue={t.name} />
        <FieldError name="name" />
      </Field>
      <Field label="Razão social"><Input name="legalName" defaultValue={t.legalName ?? ""} /></Field>
      <Field label="CNPJ / CPF" hint="Aparece no relatório técnico."><Input name="document" defaultValue={t.document ?? ""} inputMode="numeric" /></Field>
      <Field label="E-mail"><Input name="email" type="email" defaultValue={t.email ?? ""} /><FieldError name="email" /></Field>
      <Field label="Telefone"><Input name="phone" type="tel" defaultValue={t.phone ?? ""} /></Field>
      <Field label="WhatsApp"><Input name="whatsapp" type="tel" defaultValue={t.whatsapp ?? ""} /></Field>
      <Field label="Endereço" className="md:col-span-2"><Input name="address" defaultValue={t.address ?? ""} /></Field>
      <Field label="Cidade"><Input name="city" defaultValue={t.city ?? ""} /></Field>
      <Field label="UF"><Select name="state" defaultValue={t.state ?? ""} placeholder="—" options={UF.map((u) => [u, u] as [string, string])} /></Field>
      <Field label="Tipo de operação">
        <Select name="operationType" defaultValue={t.operationType ?? ""} placeholder="—" options={{ autonomo: "Trabalho sozinho", empresa_pequena: "Empresa pequena (2 a 5 pessoas)", empresa: "Empresa com equipes" }} />
      </Field>
      <Field label="Quantas pessoas na equipe?">
        <Select name="teamSize" defaultValue={t.teamSize ?? ""} placeholder="—" options={{ "1": "Só eu", "2-5": "2 a 5", "6-15": "6 a 15", "16-50": "16 a 50", "50+": "Mais de 50" }} />
      </Field>
      <Field label="Frequência padrão de manutenção (dias)" hint="Sugestão ao cadastrar novas piscinas.">
        <Input name="defaultFrequencyDays" inputMode="numeric" defaultValue={t.defaultFrequencyDays ?? ""} placeholder="7" />
      </Field>
      {!compact && (
        <>
          <Field label="Cor da marca" hint="Usada no cabeçalho do relatório e do portal.">
            <input name="brandColor" type="color" defaultValue={t.brandColor} className="h-11 w-24 cursor-pointer rounded-lg border border-line-strong bg-surface p-1" />
          </Field>
          <Field label="Rodapé do relatório" hint="Ex.: CREA/CRQ do responsável técnico, se houver, ou condições de atendimento." className="md:col-span-2">
            <Textarea name="reportFooter" defaultValue={t.reportFooter ?? ""} className="min-h-16" />
          </Field>
        </>
      )}
      <div className="md:col-span-2 flex justify-end">
        <SubmitButton size="lg">{next ? "Salvar e continuar" : "Salvar dados da empresa"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
