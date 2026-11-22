import "server-only";
import { ZodError } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ActionResult } from "@/lib/action-types";
import { UserError } from "./errors";

/** Converte erros em mensagens seguras para o usuário. Erros inesperados são registrados no servidor. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  let result: ActionResult<T>;
  try {
    result = await fn();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) {
        const k = i.path.join(".");
        if (!fieldErrors[k]) fieldErrors[k] = i.message;
      }
      return { ok: false, error: e.issues[0]?.message || "Confira os campos.", fieldErrors };
    }
    const pg = e as { code?: string; constraint_name?: string };
    if (pg?.code === "23505") return { ok: false, error: "Esse registro já existe (duplicado)." };
    if (pg?.code === "23503") return { ok: false, error: "Registro relacionado não encontrado." };
    console.error("[action]", e);
    return { ok: false, error: "Não foi possível concluir. Tente de novo em instantes." };
  }
  // Navegação pós-sucesso feita pelo servidor (confiável); a mensagem segue num cookie de leitura única.
  if (result.ok && result.redirect) {
    if (result.message) {
      (await cookies()).set("ondaro_flash", encodeURIComponent(result.message), { path: "/", maxAge: 30, sameSite: "lax" });
    }
    redirect(result.redirect);
  }
  return result;
}

/** FormData → objeto simples (checkbox "on" vira true; campos repetidos viram array com sufixo []). */
export function formObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] = (out[key] as unknown[]) ?? []) as unknown[];
      (out[key] as unknown[]).push(val);
    } else out[k] = val === "on" ? true : val;
  }
  return out;
}
