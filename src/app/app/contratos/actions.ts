"use server";
import { revalidatePath } from "next/cache";
import { actionCtx, hasFeature } from "@/server/auth";
import { run, formObject } from "@/server/action";
import { ForbiddenError, UserError } from "@/server/errors";
import { can } from "@/server/permissions";
import {
  createServicePlan, updateServicePlan, setServicePlanActive,
  createContract, updateContract, setContractStatus, scheduleContractVisits, generateMonthlyInvoices, CONTRACT_STATUS, contractScheduleSchema,
} from "@/server/contracts";
import type { ActionResult } from "@/lib/action-types";

export type ScheduleConflictData = {
  contractId: string;
  schedule: Record<string, unknown>;
  conflicts: { when: Date; customerName: string; poolName: string }[];
  duplicates: { when: Date }[];
};

async function ctxFor() {
  const ctx = await actionCtx("contracts.write");
  if (!hasFeature(ctx, "contracts")) throw new ForbiddenError("Contratos e planos não estão incluídos no seu plano.");
  return ctx;
}

const scheduleInput = (o: Record<string, unknown>) => ({
  repeat: o.repeat,
  weekdays: o.weekdays ?? [],
  time: o.time,
  firstDate: o.firstDate,
  durationMin: o.durationMin || undefined,
  assignedUserId: o.assignedUserId,
  force: o.force === true,
});

/* ───────── planos ───────── */

export async function createPlanAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await createServicePlan(ctx, formObject(fd) as never);
    revalidatePath("/app/contratos");
    return { ok: true, message: "Plano de serviço criado.", redirect: "/app/contratos#planos" };
  });
}

export async function updatePlanAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await updateServicePlan(ctx, id, formObject(fd) as never);
    revalidatePath("/app/contratos");
    return { ok: true, message: "Plano atualizado. Contratos existentes mantêm os valores combinados.", redirect: "/app/contratos#planos" };
  });
}

export async function setPlanActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await setServicePlanActive(ctx, id, active);
    revalidatePath("/app/contratos");
    return { ok: true, message: active ? "Plano reativado." : "Plano arquivado. Contratos existentes não mudam." };
  });
}

/* ───────── contratos ───────── */

export async function createContractAction(_: ActionResult<ScheduleConflictData> | null, fd: FormData): Promise<ActionResult<ScheduleConflictData>> {
  return run<ScheduleConflictData>(async () => {
    const ctx = await ctxFor();
    const o = formObject(fd);
    const wantsSchedule = o.createSchedule === true;
    if (wantsSchedule && !can(ctx.role, "agenda.write")) throw new ForbiddenError("Você não tem permissão para agendar visitas. Crie o contrato sem a agenda.");
    const schedule = scheduleInput(o);
    if (wantsSchedule) {
      // Valida a agenda antes de salvar o contrato: erro de preenchimento não deixa contrato pela metade.
      if (!o.poolId) throw new UserError("Escolha a piscina do contrato para criar a agenda recorrente.");
      contractScheduleSchema.parse(schedule);
    }
    const ct = await createContract(ctx, o as never);
    revalidatePath("/app/contratos");
    if (!wantsSchedule) return { ok: true, message: "Contrato criado.", redirect: `/app/contratos/${ct.id}` };
    try {
      const res = await scheduleContractVisits(ctx, ct.id, schedule as never);
      if (res.ok) return { ok: true, message: `Contrato criado e ${res.created} visita${res.created === 1 ? "" : "s"} agendada${res.created === 1 ? "" : "s"}.`, redirect: `/app/contratos/${ct.id}` };
      // Contrato salvo; a agenda tem conflitos e volta para o usuário decidir.
      return { ok: true, message: "Contrato criado. A agenda tem conflitos — revise abaixo.", data: { contractId: ct.id, schedule, conflicts: res.conflicts, duplicates: res.duplicates } };
    } catch (e) {
      if (!(e instanceof UserError)) console.error("[contract schedule]", e);
      const msg = e instanceof UserError ? e.message : "Não foi possível criar a agenda.";
      return { ok: true, message: `Contrato criado, mas a agenda não foi criada: ${msg} Crie a agenda na página do contrato.`, redirect: `/app/contratos/${ct.id}` };
    }
  });
}

export async function scheduleContractAction(contractId: string, _: ActionResult<ScheduleConflictData> | null, fd: FormData): Promise<ActionResult<ScheduleConflictData>> {
  return run<ScheduleConflictData>(async () => {
    const ctx = await ctxFor();
    const schedule = scheduleInput(formObject(fd));
    const res = await scheduleContractVisits(ctx, contractId, schedule as never);
    revalidatePath(`/app/contratos/${contractId}`);
    if (res.ok) return { ok: true, message: `${res.created} visita${res.created === 1 ? "" : "s"} agendada${res.created === 1 ? "" : "s"}.`, redirect: `/app/contratos/${contractId}` };
    return { ok: true, data: { contractId, schedule, conflicts: res.conflicts, duplicates: res.duplicates } };
  });
}

export async function updateContractAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await updateContract(ctx, id, formObject(fd) as never);
    revalidatePath("/app/contratos");
    revalidatePath(`/app/contratos/${id}`);
    return { ok: true, message: "Contrato atualizado.", redirect: `/app/contratos/${id}` };
  });
}

export async function setContractStatusAction(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await setContractStatus(ctx, id, status);
    revalidatePath("/app/contratos");
    revalidatePath(`/app/contratos/${id}`);
    return { ok: true, message: `Contrato marcado como ${CONTRACT_STATUS[status]?.toLowerCase() ?? status}.` };
  });
}

export async function generateInvoicesAction(month: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    const r = await generateMonthlyInvoices(ctx, month);
    revalidatePath("/app/contratos");
    revalidatePath("/app/financeiro");
    revalidatePath("/app");
    if (!r.eligible) return { ok: true, message: `Nenhum contrato ativo vigente em ${r.label}.` };
    if (!r.created) return { ok: true, message: `As mensalidades de ${r.label} já tinham sido geradas. Nada foi duplicado.` };
    return { ok: true, message: `${r.created} mensalidade${r.created === 1 ? "" : "s"} de ${r.label} gerada${r.created === 1 ? "" : "s"}${r.eligible > r.created ? ` (${r.eligible - r.created} já existia${r.eligible - r.created === 1 ? "" : "m"})` : ""}.` };
  });
}
