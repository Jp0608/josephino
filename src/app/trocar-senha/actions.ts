"use server";
import { getCtx } from "@/server/auth";
import { run } from "@/server/action";
import { changeOwnPassword } from "@/server/team";
import type { ActionResult } from "@/lib/action-types";

export async function changePasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await getCtx();
    if (!ctx) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    await changeOwnPassword(ctx.userId, ctx.sessionId, String(fd.get("password") || ""), String(fd.get("confirm") || ""));
    return { ok: true, message: "Senha alterada.", redirect: ctx.tenantId ? "/app" : "/admin" };
  });
}
