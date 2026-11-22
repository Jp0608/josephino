"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run } from "@/server/action";
import { scheduleVisit, rescheduleVisit, setVisitStatus, stopRecurrence, type ScheduleResult } from "@/server/visits";
import { parseMoneyToCents } from "@/lib/format";
import type { ActionResult } from "@/lib/action-types";
import type { VisitStatus } from "@/db/schema";

export type ScheduleInput = {
  poolId: string;
  date: string;
  time: string;
  durationMin: number;
  assignedUserId?: string;
  serviceType: string;
  priority: string;
  instructions?: string;
  price?: string;
  repeat: "none" | "weekly" | "biweekly" | "monthly";
  weekdays: number[];
  endsOn?: string;
  force?: boolean;
};

export async function scheduleAction(input: ScheduleInput): Promise<ActionResult<ScheduleResult>> {
  return run<ScheduleResult>(async () => {
    const ctx = await actionCtx("agenda.write");
    const r = await scheduleVisit(ctx, { ...input, priority: input.priority as "normal", priceCents: parseMoneyToCents(input.price) });
    if (!r.ok) return { ok: true, data: r };
    revalidatePath("/app/agenda");
    return {
      ok: true,
      data: r,
      message: r.created > 1 ? `${r.created} visitas criadas pela recorrência.` : "Visita agendada.",
      redirect: `/app/agenda?data=${input.date}`,
    };
  });
}

export async function statusAction(id: string, status: VisitStatus, reason?: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("visits.execute");
    await setVisitStatus(ctx, id, status, reason);
    revalidatePath(`/app/visitas/${id}`);
    revalidatePath("/app/agenda");
    return { ok: true, message: "Status atualizado." };
  });
}

export async function rescheduleAction(id: string, input: { date: string; time: string; assignedUserId?: string; force?: boolean }): Promise<ActionResult<ScheduleResult>> {
  return run<ScheduleResult>(async () => {
    const ctx = await actionCtx("agenda.write");
    const r = await rescheduleVisit(ctx, id, input);
    if (!r.ok) return { ok: true, data: r };
    revalidatePath(`/app/visitas/${id}`);
    return { ok: true, data: r, message: "Visita remarcada." };
  });
}

export async function stopRecurrenceAction(recurrenceId: string, fromDay: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("agenda.write");
    const n = await stopRecurrence(ctx, recurrenceId, fromDay);
    revalidatePath("/app/agenda");
    return { ok: true, message: `Recorrência encerrada. ${n} visita(s) futura(s) cancelada(s).` };
  });
}
