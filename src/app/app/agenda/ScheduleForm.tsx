"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Textarea, btnClass, cx } from "@/components/ui";
import { useToast } from "@/components/client";
import { SERVICE_TYPES } from "@/lib/domain/catalog";
import { WEEKDAY_SHORT } from "@/lib/domain/recurrence";
import type { ScheduleResult } from "@/server/visits";
import { scheduleAction, type ScheduleInput } from "./actions";

type PoolOpt = { id: string; label: string; customerId: string };

export function ScheduleForm({ pools, team, defaults }: { pools: PoolOpt[]; team: { userId: string; name: string }[]; defaults: { poolId?: string; customerId?: string; date: string; assignee?: string } }) {
  const router = useRouter();
  const toast = useToast();
  const filtered = defaults.customerId ? pools.filter((p) => p.customerId === defaults.customerId) : pools;
  const [f, setF] = useState<ScheduleInput>({
    poolId: defaults.poolId ?? (filtered.length === 1 ? filtered[0].id : ""),
    date: defaults.date,
    time: "08:00",
    durationMin: 60,
    assignedUserId: defaults.assignee ?? (team.length === 1 ? team[0].userId : ""),
    serviceType: "manutencao",
    priority: "normal",
    instructions: "",
    price: "",
    repeat: "none",
    weekdays: [],
    endsOn: "",
  });
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<Extract<ScheduleResult, { ok: false }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ScheduleInput>(k: K, v: ScheduleInput[K]) => {
    setConflict(null);
    setF((x) => ({ ...x, [k]: v }));
  };
  const dow = useMemo(() => new Date(`${f.date}T12:00:00Z`).getUTCDay(), [f.date]);
  const days = f.weekdays.length ? f.weekdays : [dow];

  async function submit(force = false) {
    setError(null);
    if (!f.poolId) return setError("Escolha a piscina.");
    setPending(true);
    try {
      const r = await scheduleAction({ ...f, weekdays: f.repeat === "none" ? [] : days, force });
      if (!r) return; // sucesso: o servidor já redirecionou para a agenda
      if (!r.ok) return setError(r.error);
      if (r.data && !r.data.ok) return setConflict(r.data);
      if (r.message) toast({ tone: "ok", text: r.message });
      router.push(r.redirect ?? "/app/agenda");
      router.refresh();
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setPending(false);
    }
  }

  const fmt = (d: Date | string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="flex flex-col gap-5"
    >
      {error && <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</div>}
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Onde</h2>
        <Field label="Cliente e piscina" required>
          <Select value={f.poolId} onChange={(e) => set("poolId", e.target.value)} placeholder="Escolha a piscina" options={filtered.map((p) => [p.id, p.label] as [string, string])} />
        </Field>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Quando</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Data" required><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Horário" required><Input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} step={300} /></Field>
          <Field label="Duração estimada">
            <Select value={String(f.durationMin)} onChange={(e) => set("durationMin", Number(e.target.value))} options={[["30", "30 min"], ["45", "45 min"], ["60", "1 h"], ["90", "1h30"], ["120", "2 h"], ["180", "3 h"], ["240", "4 h"]]} />
          </Field>
        </div>
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Repetir</p>
          <div className="flex flex-wrap gap-1.5">
            {([["none", "Não repete"], ["weekly", "Toda semana"], ["biweekly", "A cada 15 dias"], ["monthly", "A cada 4 semanas"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set("repeat", k)} className={cx("h-9 rounded-full border px-3.5 text-[13px] font-semibold", f.repeat === k ? "border-primary bg-primary-soft text-primary" : "border-line-strong text-ink-2")}>
                {l}
              </button>
            ))}
          </div>
          {f.repeat !== "none" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
              <div>
                <p className="mb-2 text-[13px] font-semibold text-ink-2">Dias da semana</p>
                <div className="flex gap-1.5">
                  {WEEKDAY_SHORT.map((l, i) => {
                    const on = days.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set("weekdays", on ? days.filter((d) => d !== i) : [...days, i])}
                        className={cx("size-10 rounded-xl text-[12px] font-bold", on ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink-2")}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-muted">Ex.: terça e sexta às {f.time}. O sistema cria as visitas das próximas 8 semanas e continua gerando automaticamente.</p>
              </div>
              <Field label="Termina em (opcional)"><Input type="date" value={f.endsOn} onChange={(e) => set("endsOn", e.target.value)} /></Field>
            </div>
          )}
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-[15px] font-bold">Serviço</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Responsável">
            <Select value={f.assignedUserId} onChange={(e) => set("assignedUserId", e.target.value)} placeholder="Sem responsável" options={team.map((t) => [t.userId, t.name] as [string, string])} />
          </Field>
          <Field label="Tipo de serviço"><Select value={f.serviceType} onChange={(e) => set("serviceType", e.target.value)} options={SERVICE_TYPES} /></Field>
          <Field label="Prioridade"><Select value={f.priority} onChange={(e) => set("priority", e.target.value)} options={{ baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" }} /></Field>
          {f.repeat === "none" && (
            <Field label="Valor do serviço avulso (R$)" hint="Opcional. Ao concluir, gera a conta a receber." className="sm:col-span-1">
              <Input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0,00" />
            </Field>
          )}
          <Field label="Instruções para o técnico" className={f.repeat === "none" ? "sm:col-span-2" : "sm:col-span-3"}>
            <Textarea value={f.instructions} onChange={(e) => set("instructions", e.target.value)} className="min-h-16" placeholder="Portão lateral, falar com o zelador…" />
          </Field>
        </div>
      </Card>

      {conflict && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm text-warn">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="size-4" /> Atenção antes de agendar</p>
          <ul className="mt-2 list-disc pl-5">
            {conflict.duplicates.slice(0, 5).map((d, i) => <li key={`d${i}`}>Esta piscina já tem visita em aberto em {fmt(d.when)}.</li>)}
            {conflict.conflicts.slice(0, 5).map((c, i) => <li key={`c${i}`}>O responsável já atende {c.customerName} ({c.poolName}) em {fmt(c.when)}.</li>)}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => submit(true)} className={btnClass("secondary", "sm")}>Agendar mesmo assim</button>
            <button type="button" onClick={() => setConflict(null)} className={btnClass("ghost", "sm")}>Ajustar horário</button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btnClass("primary", "lg", "w-full sm:w-auto")}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {f.repeat === "none" ? "Agendar visita" : "Criar recorrência"}
        </button>
      </div>
    </form>
  );
}
