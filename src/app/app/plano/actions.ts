"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run } from "@/server/action";
import { requestPlanChange } from "@/server/billing";
import type { ActionResult } from "@/lib/action-types";

/** Permitido mesmo em modo somente-leitura (teste vencido): é assim que a empresa volta a operar. */
export async function requestPlanAction(planCode: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("billing.manage", { write: false });
    const r = await requestPlanChange(ctx, planCode);
    revalidatePath("/app/plano");
    return {
      ok: true,
      message: r.duplicate
        ? `Já existe uma solicitação recente para o plano ${r.plan.name}. A equipe Ondaro confirma a ativação após o pagamento.`
        : "Solicitação registrada. A equipe Ondaro confirma a ativação após o pagamento.",
    };
  });
}
