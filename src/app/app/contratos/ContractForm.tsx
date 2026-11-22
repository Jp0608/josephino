"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";
import { PAYMENT_METHODS } from "@/lib/domain/catalog";
import type { ScheduleConflictData } from "./actions";
import { ScheduleFields, ScheduleForm, type TeamOption } from "./ScheduleForm";

type Plan = { id: string; name: string; priceCents: number; weekdays: number[] | null; intervalWeeks: number; includedServices: string | null; extras: string | null; conditions: string | null };
type Contract = {
  customerId: string; poolId: string | null; servicePlanId: string | null; title: string; monthlyCents: number; billingDay: number; paymentMethod: string | null;
  startsOn: string; endsOn: string | null; adjustmentRule: string | null; conditions: string | null; status: string;
};

const cents = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

function planConditions(p: Plan) {
  return [p.includedServices && `Serviços incluídos: ${p.includedServices}`, p.extras && `Serviços extras (cobrados à parte): ${p.extras}`, p.conditions].filter(Boolean).join("\n\n");
}

export function ContractForm({
  action,
  scheduleAction,
  customers,
  pools,
  plans,
  team,
  canSchedule,
  initial,
  defaults,
  today,
  submit,
}: {
  action: (p: ActionResult<ScheduleConflictData> | null, fd: FormData) => Promise<ActionResult<unknown>>;
  scheduleAction?: (contractId: string, p: ActionResult<ScheduleConflictData> | null, fd: FormData) => Promise<ActionResult<ScheduleConflictData>>;
  customers: { id: string; name: string }[];
  pools: { id: string; name: string; code: string; customerId: string }[];
  plans: Plan[];
  team: TeamOption[];
  canSchedule: boolean;
  initial?: Contract;
  defaults?: { customerId?: string; planId?: string };
  today: string;
  submit: string;
}) {
  const isNew = !initial;
  const startPlan = plans.find((p) => p.id === (initial?.servicePlanId ?? defaults?.planId));
  const [customerId, setCustomerId] = useState(initial?.customerId ?? (customers.some((c) => c.id === defaults?.customerId) ? defaults!.customerId! : ""));
  const custPools = useMemo(() => pools.filter((p) => p.customerId === customerId), [pools, customerId]);
  const [poolId, setPoolId] = useState(initial?.poolId ?? "");
  const [planId, setPlanId] = useState(startPlan?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? (startPlan ? `Manutenção — ${startPlan.name}` : ""));
  const [monthly, setMonthly] = useState(initial ? cents(initial.monthlyCents) : startPlan ? cents(startPlan.priceCents) : "");
  const [conditions, setConditions] = useState(initial?.conditions ?? (startPlan ? planConditions(startPlan) : ""));
  const [schedule, setSchedule] = useState(false);
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? today);
  const [scheduleKey, setScheduleKey] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>(startPlan?.weekdays ?? []);
  const [repeat, setRepeat] = useState(startPlan ? (startPlan.intervalWeeks === 2 ? "biweekly" : startPlan.intervalWeeks === 4 ? "monthly" : "weekly") : "weekly");
  const [pending, setPending] = useState<ScheduleConflictData | null>(null);

  const effectivePool = custPools.some((p) => p.id === poolId) ? poolId : custPools.length === 1 ? custPools[0].id : "";

  function pickPlan(id: string) {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    // Preenche a partir do modelo; o usuário pode ajustar tudo antes de salvar.
    setMonthly(cents(p.priceCents));
    if (!title || title.startsWith("Manutenção — ")) setTitle(`Manutenção — ${p.name}`);
    setConditions(planConditions(p));
    setWeekdays(p.weekdays ?? []);
    setRepeat(p.intervalWeeks === 2 ? "biweekly" : p.intervalWeeks === 4 ? "monthly" : "weekly");
    setScheduleKey((k) => k + 1);
  }

  // Contrato salvo, mas a agenda tem conflitos: mostra o formulário da agenda com a decisão pendente.
  if (pending && scheduleAction) {
    const s = pending.schedule as Record<string, string | string[] | undefined>;
    return (
      <Card className="p-4 md:p-5">
        <h2 className="text-[15px] font-bold">Contrato salvo — falta confirmar a agenda</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          O contrato foi criado. Revise os conflitos da agenda recorrente ou{" "}
          <Link href={`/app/contratos/${pending.contractId}`} className="font-semibold text-primary">
            agende depois
          </Link>
          .
        </p>
        <ScheduleForm
          action={scheduleAction.bind(null, pending.contractId)}
          team={team}
          initialConflicts={pending}
          defaults={{
            repeat: s.repeat as string,
            weekdays: ((s.weekdays as string[]) ?? []).map(Number),
            time: s.time as string,
            firstDate: s.firstDate as string,
            durationMin: s.durationMin as string,
            assignedUserId: s.assignedUserId as string,
          }}
        />
      </Card>
    );
  }

  return (
    <ActionForm
      action={action as (p: ActionResult | null, fd: FormData) => Promise<ActionResult>}
      onDone={(r) => {
        const d = r.ok ? (r.data as ScheduleConflictData | undefined) : undefined;
        if (d?.contractId) setPending(d);
      }}
      className="flex flex-col gap-5"
    >
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Cliente e plano</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cliente" required>
            <Select name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Escolha o cliente" options={customers.map((c) => [c.id, c.name] as [string, string])} required />
            <FieldError name="customerId" />
          </Field>
          <Field label="Piscina" hint={customerId && !custPools.length ? "Este cliente não tem piscina ativa cadastrada." : "Necessária para criar a agenda recorrente."}>
            <Select
              name="poolId"
              value={effectivePool}
              onChange={(e) => setPoolId(e.target.value)}
              placeholder={custPools.length ? "Todas / não especificar" : "—"}
              options={custPools.map((p) => [p.id, `${p.code} · ${p.name}`] as [string, string])}
              disabled={!custPools.length}
            />
            <FieldError name="poolId" />
          </Field>
          <Field label="Plano de serviço (modelo)" hint={plans.length ? "Preenche valor e condições; você pode ajustar." : "Nenhum plano cadastrado — contrato personalizado."} className="md:col-span-2">
            <Select name="servicePlanId" value={planId} onChange={(e) => pickPlan(e.target.value)} placeholder="Personalizado (sem plano)" options={plans.map((p) => [p.id, `${p.name} — ${(p.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês`] as [string, string])} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Condições comerciais</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Título do contrato" required className="md:col-span-3">
            <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Manutenção semanal da piscina" required />
            <FieldError name="title" />
          </Field>
          <Field label="Valor mensal (R$)" required>
            <Input name="monthlyCents" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0,00" required />
            <FieldError name="monthlyCents" />
          </Field>
          <Field label="Dia de vencimento" required hint="Meses mais curtos usam o último dia.">
            <Input name="billingDay" type="number" min={1} max={31} defaultValue={initial?.billingDay ?? 10} required />
            <FieldError name="billingDay" />
          </Field>
          <Field label="Forma de pagamento">
            <Select name="paymentMethod" defaultValue={initial?.paymentMethod ?? "pix"} placeholder="—" options={PAYMENT_METHODS} />
          </Field>
          <Field label="Início" required>
            <Input name="startsOn" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
            <FieldError name="startsOn" />
          </Field>
          <Field label="Término" hint="Vazio = prazo indeterminado.">
            <Input name="endsOn" type="date" defaultValue={initial?.endsOn ?? ""} />
            <FieldError name="endsOn" />
          </Field>
          <Field label="Situação">
            <Select name="status" defaultValue={initial?.status ?? "active"} options={{ draft: "Rascunho", active: "Ativo", paused: "Pausado", ended: "Encerrado", cancelled: "Cancelado" }} />
          </Field>
          <Field label="Regra de reajuste" className="md:col-span-3" hint="Ex.: Reajuste anual pelo IPCA na data de aniversário do contrato.">
            <Input name="adjustmentRule" defaultValue={initial?.adjustmentRule ?? ""} />
          </Field>
          <Field label="Cláusulas e condições" className="md:col-span-3" hint="Aparecem no contrato para impressão. Revise com seu jurídico.">
            <Textarea name="conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} rows={8} />
          </Field>
        </div>
      </Card>

      {isNew && canSchedule && (
        <Card className="p-4 md:p-5">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="createSchedule" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <span className="flex items-center gap-2 text-[15px] font-bold">
                <CalendarClock className="size-[18px] text-muted" /> Criar a agenda recorrente de visitas
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">Gera as visitas das próximas 8 semanas na agenda e continua gerando automaticamente. Conflitos de horário são mostrados antes de agendar.</span>
            </span>
          </label>
          <div className={cx("mt-4 border-t border-line pt-4", !schedule && "hidden")}>
            {!effectivePool && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] font-medium text-warn">Escolha a piscina do contrato para criar a agenda.</p>}
            <ScheduleFields key={scheduleKey} team={team} defaults={{ weekdays, repeat, firstDate: startsOn > today ? startsOn : today }} />
          </div>
        </Card>
      )}

      <div className="sticky bottom-20 z-10 flex justify-end md:static">
        <SubmitButton size="lg" className="w-full md:w-auto">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
