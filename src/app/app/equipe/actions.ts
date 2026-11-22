"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run } from "@/server/action";
import { createMember, updateMember, setMemberActive, resetMemberPassword } from "@/server/team";
import type { ActionResult } from "@/lib/action-types";

export type CreatedMember = { name: string; email: string; tempPassword: string | null; existingUser: boolean };

export async function createMemberAction(_: ActionResult | null, fd: FormData): Promise<ActionResult<CreatedMember>> {
  return run(async () => {
    const ctx = await actionCtx("team.manage");
    const r = await createMember(ctx, {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      role: String(fd.get("role") || "") as never,
      jobTitle: String(fd.get("jobTitle") || ""),
    });
    revalidatePath("/app/equipe");
    return {
      ok: true,
      message: r.existingUser ? `${r.name} foi adicionado(a) à equipe.` : "Acesso criado.",
      data: { name: r.name, email: r.email, tempPassword: r.tempPassword, existingUser: r.existingUser },
    };
  });
}

export async function updateMemberAction(membershipId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("team.manage");
    await updateMember(ctx, membershipId, { role: String(fd.get("role") || ""), jobTitle: String(fd.get("jobTitle") || "") });
    revalidatePath("/app/equipe");
    return { ok: true, message: "Alterações salvas." };
  });
}

export async function setMemberActiveAction(membershipId: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("team.manage");
    await setMemberActive(ctx, membershipId, active);
    revalidatePath("/app/equipe");
    return { ok: true, message: active ? "Acesso reativado." : "Acesso desativado. O histórico da pessoa foi mantido." };
  });
}

export async function resetPasswordAction(membershipId: string): Promise<ActionResult<{ password: string }>> {
  return run(async () => {
    const ctx = await actionCtx("team.manage");
    const password = await resetMemberPassword(ctx, membershipId);
    revalidatePath("/app/equipe");
    return { ok: true, data: { password } };
  });
}
