"use server";
import { revalidatePath } from "next/cache";
import { actionCtx, hasFeature } from "@/server/auth";
import { run, formObject } from "@/server/action";
import { ForbiddenError } from "@/server/errors";
import type { Permission } from "@/server/permissions";
import { createProduct, updateProduct, setProductActive, recordMovement } from "@/server/inventory";
import { MOVEMENT_KIND } from "@/lib/domain/catalog";
import type { ActionResult } from "@/lib/action-types";

async function ctxFor(perm: Permission) {
  const ctx = await actionCtx(perm);
  if (!hasFeature(ctx, "inventory")) throw new ForbiddenError("O controle de estoque não está incluído no seu plano.");
  return ctx;
}

export async function createProductAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor("inventory.write");
    const p = await createProduct(ctx, formObject(fd) as never);
    revalidatePath("/app/estoque");
    return { ok: true, message: "Produto cadastrado.", redirect: `/app/estoque/${p.id}` };
  });
}

export async function updateProductAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor("inventory.write");
    await updateProduct(ctx, id, formObject(fd) as never);
    revalidatePath(`/app/estoque/${id}`);
    return { ok: true, message: "Alterações salvas.", redirect: `/app/estoque/${id}` };
  });
}

export async function setProductActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor("inventory.write");
    await setProductActive(ctx, id, active);
    revalidatePath("/app/estoque");
    revalidatePath(`/app/estoque/${id}`);
    return { ok: true, message: active ? "Produto reativado." : "Produto desativado. O histórico foi mantido." };
  });
}

export async function recordMovementAction(productId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor("inventory.write");
    const m = await recordMovement(ctx, productId, formObject(fd) as never);
    revalidatePath("/app/estoque");
    revalidatePath(`/app/estoque/${productId}`);
    return { ok: true, message: `${MOVEMENT_KIND[m.kind] ?? "Movimentação"} registrada. Novo saldo: ${m.balanceAfter.toLocaleString("pt-BR")}.` };
  });
}
