"use server";
import { redirect } from "next/navigation";
import { run, formObject } from "@/server/action";
import { login, createSession, createPasswordReset, consumePasswordReset } from "@/server/auth";
import { createAccount } from "@/server/signup";
import { appUrl } from "@/server/reports";
import { sendEmail, emailConfigured } from "@/server/integrations";
import type { ActionResult } from "@/lib/action-types";

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await run(async () => {
    const res = await login(String(fd.get("email") || ""), String(fd.get("password") || ""));
    return { ok: true, redirect: res.tenantId ? "/app" : "/admin" };
  });
  if (r.ok) redirect(r.redirect!);
  return r;
}

export async function signupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await run(async () => {
    const o = formObject(fd);
    const { tenant, user } = await createAccount({
      companyName: String(o.companyName || ""),
      name: String(o.name || ""),
      email: String(o.email || ""),
      phone: String(o.phone || ""),
      password: String(o.password || ""),
      planCode: (String(o.plan || "pro") as "starter" | "pro" | "business"),
      acceptTerms: o.acceptTerms === true ? true : (false as unknown as true),
    });
    await createSession(user.id, tenant.id);
    return { ok: true };
  });
  if (r.ok) redirect("/app/boas-vindas");
  return r;
}

export async function forgotAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const res = await createPasswordReset(String(fd.get("email") || ""));
    if (res) {
      const link = `${appUrl()}/redefinir-senha/${res.token}`;
      if (emailConfigured()) {
        await sendEmail(String(fd.get("email")), "Redefinir sua senha do Ondaro", `<p>Para criar uma nova senha, acesse:</p><p><a href="${link}">${link}</a></p><p>O link vale por 1 hora.</p>`);
      } else {
        // Sem provedor de e-mail configurado: registra no log do servidor (ambiente de desenvolvimento).
        console.info(`[reset-senha] link gerado (e-mail não configurado): ${link}`);
      }
    }
    // Mesma resposta exista ou não a conta (não revela e-mails cadastrados).
    return {
      ok: true,
      message: emailConfigured()
        ? "Se houver uma conta com este e-mail, enviamos um link para redefinir a senha."
        : "Pedido registrado. O envio de e-mails ainda não está configurado nesta instalação — peça ao administrador o link de redefinição.",
    };
  });
}

export async function resetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const pw = String(fd.get("password") || "");
    if (pw !== String(fd.get("confirm") || "")) return { ok: false, error: "As senhas não conferem." };
    await consumePasswordReset(String(fd.get("token") || ""), pw);
    return { ok: true, message: "Senha alterada. Entre com a nova senha.", redirect: "/entrar" };
  });
}
