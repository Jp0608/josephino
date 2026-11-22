import { listPlansAdmin } from "@/server/platform";
import { FEATURE_CODES, featureLabel } from "@/server/plan-features";
import { Card, Badge, Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import type { plans } from "@/db/schema";
import type { ActionResult } from "@/lib/action-types";
import { updatePlanAction, createPlanAction } from "../actions";

export const metadata = { title: "Planos" };

function PlanFields({ p }: { p?: typeof plans.$inferSelect }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nome" required>
          <Input name="name" defaultValue={p?.name} required />
          <FieldError name="name" />
        </Field>
        <Field label="Preço mensal (R$)" hint="0 = sob consulta">
          <Input name="price" inputMode="decimal" defaultValue={p ? (p.priceCents / 100).toFixed(2).replace(".", ",") : ""} required />
          <FieldError name="price" />
        </Field>
        <Field label="Máx. usuários" hint="Em branco = ilimitado">
          <Input name="maxUsers" inputMode="numeric" defaultValue={p?.maxUsers ?? ""} />
          <FieldError name="maxUsers" />
        </Field>
        <Field label="Máx. piscinas" hint="Em branco = ilimitado">
          <Input name="maxPools" inputMode="numeric" defaultValue={p?.maxPools ?? ""} />
          <FieldError name="maxPools" />
        </Field>
        <Field label="Descrição" className="sm:col-span-2 lg:col-span-3">
          <Input name="description" defaultValue={p?.description ?? ""} maxLength={300} />
        </Field>
        <Field label="Ordem de exibição">
          <Input name="sortOrder" type="number" min={0} max={999} defaultValue={p?.sortOrder ?? 0} />
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">Recursos incluídos</legend>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CODES.map((f) => (
            <label key={f} className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" name="features[]" value={f} defaultChecked={p?.features.includes(f)} className="size-4 accent-[var(--primary)]" />
              <span>{featureLabel(f)} <code className="text-[11px] text-muted">{f}</code></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <input type="checkbox" name="public" defaultChecked={p?.public ?? false} className="size-4 accent-[var(--primary)]" /> Público (aparece para as empresas)
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="size-4 accent-[var(--primary)]" /> Ativo
        </label>
      </div>
    </>
  );
}

export default async function PlansAdmin() {
  const rows = await listPlansAdmin();
  return (
    <>
      <h1 className="text-[24px] font-extrabold text-ink">Planos</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Preços, limites e recursos vêm daqui. Ao salvar, valem na hora para todas as empresas do plano — sem mudar código.</p>
      <div className="flex flex-col gap-5">
        {rows.map(({ plan: p, tenants }) => (
          <Card key={p.id} className="p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] font-bold text-ink">{p.name}</h2>
              <code className="text-[12px] text-muted">{p.code}</code>
              {!p.public && <Badge>Oculto</Badge>}
              {!p.active && <Badge tone="danger">Inativo</Badge>}
              <span className="ml-auto text-[12px] text-muted">{tenants} empresa{tenants === 1 ? "" : "s"} neste plano</span>
            </div>
            <ActionForm action={updatePlanAction.bind(null, p.id) as (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>}>
              <PlanFields p={p} />
              <div className="mt-3 flex justify-end"><SubmitButton size="sm">Salvar plano</SubmitButton></div>
            </ActionForm>
          </Card>
        ))}
        <Card className="p-4 md:p-5">
          <details>
            <summary className="cursor-pointer text-[15px] font-bold text-primary">+ Novo plano</summary>
            <ActionForm action={createPlanAction} resetOnSuccess className="mt-4">
              <Field label="Código (permanente)" hint="Letras minúsculas, números, - ou _. Ex.: pro_anual" className="mb-3 max-w-xs">
                <Input name="code" required />
                <FieldError name="code" />
              </Field>
              <PlanFields />
              <div className="mt-3 flex justify-end"><SubmitButton size="sm">Criar plano</SubmitButton></div>
            </ActionForm>
          </details>
        </Card>
      </div>
    </>
  );
}
