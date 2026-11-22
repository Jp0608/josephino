"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Field, Input, Select, btnClass, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";
import type { ScheduleConflictData } from "./actions";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export type TeamOption = { id: string; name: string };
export type ScheduleDefaults = { repeat?: string; weekdays?: number[]; time?: string; firstDate?: string; durationMin?: number | string; assignedUserId?: string };

/** Campos da agenda recorrente (repassados ao agendamento da agenda). */
export function ScheduleFields({ team, defaults = {} }: { team: TeamOption[]; defaults?: ScheduleDefaults }) {
  const [days, setDays] = useState<number[]>(defaults.weekdays ?? []);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Frequência">
        <Select name="repeat" defaultValue={defaults.repeat ?? "weekly"} options={{ weekly: "Toda semana", biweekly: "A cada 15 dias", monthly: "A cada 4 semanas" }} />
        <FieldError name="repeat" />
      </Field>
      <Field label="Primeira visita a partir de">
        <Input name="firstDate" type="date" defaultValue={defaults.firstDate} required />
        <FieldError name="firstDate" />
      </Field>
      <Field label="Horário">
        <Input name="time" type="time" defaultValue={defaults.time ?? "08:00"} required />
        <FieldError name="time" />
      </Field>
      <div className="md:col-span-3">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Dias da semana</span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((l, d) => {
            const on = days.includes(d);
            return (
              <label key={d} className={cx("grid h-10 min-w-12 cursor-pointer place-items-center rounded-lg border px-2 text-[13px] font-semibold transition", on ? "border-primary bg-primary-soft text-primary" : "border-line text-ink-2 hover:bg-surface-2")}>
                <input type="checkbox" name="weekdays[]" value={d} checked={on} onChange={() => setDays((x) => (on ? x.filter((y) => y !== d) : [...x, d]))} className="sr-only" />
                {l}
              </label>
            );
          })}
        </div>
        <FieldError name="weekdays" />
      </div>
      <Field label="Duração (min)">
        <Input name="durationMin" type="number" min={10} max={600} step={5} defaultValue={defaults.durationMin ?? 60} />
      </Field>
      <Field label="Responsável" className="md:col-span-2">
        <Select name="assignedUserId" defaultValue={defaults.assignedUserId ?? ""} placeholder="Sem responsável definido" options={team.map((t) => [t.id, t.name] as [string, string])} />
      </Field>
    </div>
  );
}

function ForceButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="force" value="on" disabled={pending} className={btnClass("primary", "md")}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      Agendar mesmo assim
    </button>
  );
}

export function ConflictList({ data }: { data: Pick<ScheduleConflictData, "conflicts" | "duplicates"> }) {
  const fmt = (d: Date | string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div role="alert" className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle className="size-4" /> A agenda tem conflitos — nada foi agendado ainda
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px]">
        {data.duplicates.slice(0, 6).map((d, i) => (
          <li key={`d${i}`}>Já existe visita para esta piscina em {fmt(d.when)}</li>
        ))}
        {data.conflicts.slice(0, 6).map((c, i) => (
          <li key={`c${i}`}>
            Responsável já tem visita em {fmt(c.when)} — {c.customerName} ({c.poolName})
          </li>
        ))}
      </ul>
      {data.duplicates.length + data.conflicts.length > 12 && <p className="mt-1 text-[12px]">…e outros {data.duplicates.length + data.conflicts.length - 12}.</p>}
      <p className="mt-2 text-[13px]">Ajuste o dia, o horário ou o responsável — ou agende mesmo assim.</p>
    </div>
  );
}

/** Formulário de agenda recorrente de um contrato já salvo, com tratamento de conflitos. */
export function ScheduleForm({
  action,
  team,
  defaults,
  initialConflicts,
}: {
  action: (p: ActionResult<ScheduleConflictData> | null, fd: FormData) => Promise<ActionResult<ScheduleConflictData>>;
  team: TeamOption[];
  defaults?: ScheduleDefaults;
  initialConflicts?: Pick<ScheduleConflictData, "conflicts" | "duplicates"> | null;
}) {
  const [conflicts, setConflicts] = useState(initialConflicts ?? null);
  return (
    <ActionForm
      action={action as (p: ActionResult | null, fd: FormData) => Promise<ActionResult>}
      onDone={(r) => {
        const d = r.ok ? (r.data as ScheduleConflictData | undefined) : undefined;
        setConflicts(d?.conflicts || d?.duplicates ? d : null);
      }}
      className="flex flex-col gap-4"
    >
      <ScheduleFields team={team} defaults={defaults} />
      {conflicts && <ConflictList data={conflicts} />}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        {conflicts ? (
          <>
            <SubmitButton variant="secondary" pendingText="Verificando…">Verificar de novo</SubmitButton>
            <ForceButton />
          </>
        ) : (
          <SubmitButton pendingText="Agendando…">Criar agenda recorrente</SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}
