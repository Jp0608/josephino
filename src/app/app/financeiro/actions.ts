"use server";
import { revalidatePath } from "next/cache";
import { actionCtx, hasFeature } from "@/server/auth";
import { run, formObject } from "@/server/action";
import { ForbiddenError } from "@/server/errors";
import { createInvoice, recordPayment, cancelInvoice, createExpense, markExpensePaid, cancelExpense } from "@/server/finance";
import { money } from "@/lib/format";
import type { ActionResult } from "@/lib/action-types";

async function ctxFor() {
  const ctx = await actionCtx("finance.write");
  if (!hasFeature(ctx, "finance")) throw new ForbiddenError("O módulo financeiro não está incluído no seu plano.");
  return ctx;
}

function done() {
  revalidatePath("/app/financeiro");
  revalidatePath("/app");
}

export async function createInvoiceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    const inv = await createInvoice(ctx, formObject(fd) as never);
    done();
    return { ok: true, message: `Cobrança de ${money(inv.amountCents)} lançada.`, redirect: `/app/financeiro/receber/${inv.id}` };
  });
}

/** Registro autorizado de pagamento (única forma de quitar um lançamento). */
export async function recordPaymentAction(invoiceId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    const p = await recordPayment(ctx, invoiceId, formObject(fd) as never);
    done();
    revalidatePath(`/app/financeiro/receber/${invoiceId}`);
    return { ok: true, message: `Pagamento de ${money(p.amountCents)} registrado. Lançamento quitado.` };
  });
}

export async function cancelInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await cancelInvoice(ctx, invoiceId);
    done();
    revalidatePath(`/app/financeiro/receber/${invoiceId}`);
    return { ok: true, message: "Lançamento cancelado." };
  });
}

export async function createExpenseAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    const o = formObject(fd);
    const e = await createExpense(ctx, { ...o, paidNow: o.paidNow === true } as never);
    done();
    return { ok: true, message: e.status === "paid" ? "Despesa lançada como paga." : "Despesa lançada em contas a pagar.", redirect: `/app/financeiro?aba=pagar&mes=${e.dueOn.slice(0, 7)}` };
  });
}

export async function markExpensePaidAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await markExpensePaid(ctx, id, String(fd.get("paidOn") || "") || undefined);
    done();
    return { ok: true, message: "Despesa marcada como paga." };
  });
}

export async function cancelExpenseAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await ctxFor();
    await cancelExpense(ctx, id);
    done();
    return { ok: true, message: "Despesa cancelada." };
  });
}
