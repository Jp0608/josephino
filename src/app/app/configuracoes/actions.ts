"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run, formObject } from "@/server/action";
import { updateCompany, saveParameters, addParameter, finishOnboarding } from "@/server/settings";
import type { ActionResult } from "@/lib/action-types";

export async function companyAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("settings.manage");
    await updateCompany(ctx, formObject(fd) as never);
    revalidatePath("/app", "layout");
    const next = fd.get("next");
    return { ok: true, message: "Dados da empresa salvos.", redirect: typeof next === "string" && next.startsWith("/app") ? next : undefined };
  });
}

export async function paramsAction(rows: { id: string; label: string; unit: string; rangeMin: string; rangeMax: string; referenceSource: string; active: boolean }[]): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("settings.manage");
    await saveParameters(ctx, rows);
    revalidatePath("/app/configuracoes/parametros");
    return { ok: true, message: "Faixas de referência salvas." };
  });
}

export async function addParamAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("settings.manage");
    await addParameter(ctx, String(fd.get("label") || ""), String(fd.get("unit") || ""));
    return { ok: true, message: "Parâmetro adicionado." };
  });
}

export async function finishOnboardingAction(): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("settings.manage");
    await finishOnboarding(ctx);
    return { ok: true, redirect: "/app" };
  });
}
