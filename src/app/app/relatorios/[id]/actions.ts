"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run } from "@/server/action";
import { revokeReportLink } from "@/server/reports";
import type { ActionResult } from "@/lib/action-types";

export async function rotateLinkAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("customers.write");
    await revokeReportLink(ctx, id);
    revalidatePath(`/app/relatorios/${id}`);
    return { ok: true, message: "Novo link gerado. O link anterior deixou de funcionar." };
  });
}
