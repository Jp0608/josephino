"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { rateLimit } from "@/server/auth";
import { acceptProposal } from "@/server/crm";
import type { ActionResult } from "@/lib/action-types";

export async function acceptProposalAction(token: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "não identificado";
    const userAgent = (h.get("user-agent") || "").slice(0, 400);
    if (fd.get("confirm") !== "on") return { ok: false, error: "Marque a confirmação para registrar o aceite." };
    await rateLimit(`proposal-accept:${ip}`, 20, 15);
    await acceptProposal(token, { name: String(fd.get("name") || ""), version: Number(fd.get("version")), ip, userAgent });
    revalidatePath(`/orcamento/${token}`);
    return { ok: true, message: "Aceite registrado. A empresa já vê o aceite no sistema dela." };
  });
}
