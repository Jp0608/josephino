"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run, formObject } from "@/server/action";
import { createCustomer, updateCustomer, rotatePortalToken } from "@/server/customers";
import type { ActionResult } from "@/lib/action-types";

function toInput(fd: FormData) {
  const o = formObject(fd) as Record<string, string | boolean>;
  return { ...o, whatsappConsent: o.whatsappConsent === true } as never;
}

export async function createCustomerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("customers.write");
    const c = await createCustomer(ctx, toInput(fd));
    revalidatePath("/app/clientes");
    const next = fd.get("next") === "pool" ? `/app/piscinas/nova?cliente=${c.id}` : `/app/clientes/${c.id}`;
    return { ok: true, message: "Cliente cadastrado.", redirect: next };
  });
}

export async function updateCustomerAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("customers.write");
    await updateCustomer(ctx, id, toInput(fd));
    revalidatePath(`/app/clientes/${id}`);
    return { ok: true, message: "Alterações salvas.", redirect: `/app/clientes/${id}` };
  });
}

export async function portalLinkAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("customers.write");
    await rotatePortalToken(ctx, id);
    revalidatePath(`/app/clientes/${id}`);
    return { ok: true, message: "Novo link do portal gerado. O link anterior deixou de funcionar." };
  });
}
