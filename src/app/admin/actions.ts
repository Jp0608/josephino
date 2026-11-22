"use server";
import { revalidatePath } from "next/cache";
import { run, formObject } from "@/server/action";
import { platformActor, adminChangePlan, adminSetStatus, adminExtendTrial, adminReactivate, updatePlan, createPlan } from "@/server/platform";
import type { ActionResult } from "@/lib/action-types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function changePlanAction(tenantId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await platformActor();
    await adminChangePlan(actor, tenantId, s(fd, "planCode"), s(fd, "note"));
    revalidatePath(`/admin/empresas/${tenantId}`);
    return { ok: true, message: "Plano alterado." };
  });
}

export async function setStatusAction(tenantId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await platformActor();
    await adminSetStatus(actor, tenantId, s(fd, "status"), s(fd, "reason"));
    revalidatePath(`/admin/empresas/${tenantId}`);
    return { ok: true, message: "Situação atualizada." };
  });
}

export async function extendTrialAction(tenantId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await platformActor();
    const until = await adminExtendTrial(actor, tenantId, s(fd, "days"));
    revalidatePath(`/admin/empresas/${tenantId}`);
    return { ok: true, message: `Teste prorrogado até ${until.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` };
  });
}

export async function reactivateAction(tenantId: string): Promise<ActionResult> {
  return run(async () => {
    const actor = await platformActor();
    await adminReactivate(actor, tenantId);
    revalidatePath(`/admin/empresas/${tenantId}`);
    return { ok: true, message: "Empresa reativada." };
  });
}

function planInput(fd: FormData) {
  const o = formObject(fd);
  return {
    name: s(fd, "name"),
    description: s(fd, "description"),
    price: s(fd, "price"),
    maxUsers: s(fd, "maxUsers"),
    maxPools: s(fd, "maxPools"),
    features: (o.features as string[] | undefined) ?? [],
    sortOrder: s(fd, "sortOrder") || "0",
    public: o.public === true,
    active: o.active === true,
  };
}

export async function updatePlanAction(planId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await platformActor();
    const p = await updatePlan(actor, planId, planInput(fd));
    revalidatePath("/admin/planos");
    return { ok: true, message: `Plano ${p.name} salvo. As mudanças já valem para as empresas.` };
  });
}

export async function createPlanAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await platformActor();
    const p = await createPlan(actor, s(fd, "code"), planInput(fd));
    revalidatePath("/admin/planos");
    return { ok: true, message: `Plano ${p.name} criado.` };
  });
}
