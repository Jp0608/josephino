"use server";
import { actionCtx } from "@/server/auth";
import { run } from "@/server/action";
import { deleteVisitPhoto } from "@/server/photos";
import { logManualSend } from "@/server/reports";
import type { ActionResult } from "@/lib/action-types";

export async function deletePhotoAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("visits.execute");
    await deleteVisitPhoto(ctx, id);
    return { ok: true };
  });
}

export async function logShareAction(reportId: string, channel: "whatsapp" | "email" | "link" = "whatsapp"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("reports.read");
    await logManualSend(ctx, reportId, channel);
    return { ok: true };
  });
}
