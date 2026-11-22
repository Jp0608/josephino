import { ShieldAlert } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { listParameters } from "@/server/settings";
import { Card, PageHeader, Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client";
import { ParamsEditor } from "./ParamsEditor";
import { addParamAction } from "../actions";

export const metadata = { title: "Parâmetros da água" };

export default async function Params() {
  const ctx = await requireCtx("settings.manage");
  const rows = await listParameters(ctx);
  const s = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Parâmetros da água" subtitle="Faixas de referência usadas para indicar se uma medição está dentro, abaixo ou acima." back={{ href: "/app/configuracoes", label: "Configurações" }} />
      <div className="mb-5 flex gap-2.5 rounded-xl border border-warn/30 bg-warn-soft p-3.5 text-[13px] text-warn">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          O Ondaro <b>não define limites técnicos</b>. Informe as faixas que a sua empresa adota, com a fonte (norma técnica vigente, orientação do fabricante do equipamento/produto ou do seu responsável técnico).
          Faixas podem variar conforme o uso (residencial, coletiva, aquecida, salina). Mudanças valem para medições futuras — as já registradas guardam a faixa da época.
        </p>
      </div>
      <ParamsEditor
        initial={rows.map((r) => ({ id: r.id, label: r.label, unit: r.unit, rangeMin: s(r.rangeMin), rangeMax: s(r.rangeMax), referenceSource: r.referenceSource ?? "", active: r.active }))}
      />
      <Card className="mt-6 p-4 md:p-5">
        <h2 className="mb-3 text-[15px] font-bold">Adicionar parâmetro</h2>
        <ActionForm action={addParamAction} className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end" resetOnSuccess>
          <Field label="Nome"><Input name="label" placeholder="Ex.: Fosfato" /></Field>
          <Field label="Unidade"><Input name="unit" placeholder="mg/L" /></Field>
          <SubmitButton>Adicionar</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
