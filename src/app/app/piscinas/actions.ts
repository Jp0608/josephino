"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run, formObject } from "@/server/action";
import { createPool, updatePool, setPoolActive } from "@/server/customers";
import { addEquipment, removeEquipment } from "@/server/pools";
import type { ActionResult } from "@/lib/action-types";

export async function createPoolAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("pools.write");
    const p = await createPool(ctx, formObject(fd) as never);
    revalidatePath("/app/piscinas");
    const next = fd.get("next") === "schedule" ? `/app/agenda/nova?piscina=${p.id}` : `/app/piscinas/${p.id}`;
    return { ok: true, message: `Piscina ${p.code} cadastrada.`, redirect: next };
  });
}

export async function updatePoolAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("pools.write");
    await updatePool(ctx, id, formObject(fd) as never);
    revalidatePath(`/app/piscinas/${id}`);
    return { ok: true, message: "Piscina atualizada.", redirect: `/app/piscinas/${id}` };
  });
}

export async function togglePoolAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("pools.write");
    await setPoolActive(ctx, id, active);
    return { ok: true, message: active ? "Piscina reativada." : "Piscina desativada. O histórico foi mantido." };
  });
}

export async function addEquipmentAction(poolId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("pools.write");
    await addEquipment(ctx, poolId, formObject(fd) as never);
    revalidatePath(`/app/piscinas/${poolId}`);
    return { ok: true, message: "Equipamento cadastrado." };
  });
}

export async function removeEquipmentAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("pools.write");
    await removeEquipment(ctx, id);
    return { ok: true, message: "Equipamento removido da lista ativa." };
  });
}
