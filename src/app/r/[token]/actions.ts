"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { acknowledgeReport } from "@/server/reports";
import { rateLimit } from "@/server/auth";
import type { ActionResult } from "@/lib/action-types";

export async function ackAction(token: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
    await rateLimit(`ack:${ip}`, 10, 10);
    await acknowledgeReport(token, String(fd.get("name") || ""), ip);
    revalidatePath(`/r/${token}`);
    return { ok: true, message: "Ciência registrada. Obrigado!" };
  });
}
