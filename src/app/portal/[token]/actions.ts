"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { rateLimit } from "@/server/auth";
import { createPortalRequest } from "@/server/settings";
import type { ActionResult } from "@/lib/action-types";

export async function portalRequestAction(token: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
    await rateLimit(`portal:${ip}`, 6, 30);
    await createPortalRequest(token, { poolId: (fd.get("poolId") as string) || null, kind: String(fd.get("kind") || "outro"), message: String(fd.get("message") || "") });
    revalidatePath(`/portal/${token}`);
    return { ok: true, message: "Pedido enviado. A empresa vai entrar em contato." };
  });
}
