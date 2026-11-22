"use server";
import { actionCtx } from "@/server/auth";
import { run } from "@/server/action";
import { setServiceRequestStatus } from "@/server/settings";
import type { ActionResult } from "@/lib/action-types";

export async function requestStatusAction(id: string, status: "scheduled" | "done" | "dismissed" | "open"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("agenda.write");
    await setServiceRequestStatus(ctx, id, status);
    return { ok: true, message: "Solicitação atualizada." };
  });
}
