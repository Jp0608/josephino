import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCtx } from "@/server/auth";
import { OndaroLogo } from "@/components/Brand";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Criar nova senha" };
export const dynamic = "force-dynamic";

/** Fora de /app de propósito: o layout de /app redireciona para cá enquanto a senha for provisória. */
export default async function ChangePassword() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.mustChangePassword) redirect(ctx.tenantId ? "/app" : "/admin");
  return (
    <div className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center px-5 py-10">
      <OndaroLogo size={26} />
      <div className="mt-8 grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary">
        <KeyRound className="size-5" />
      </div>
      <h1 className="mt-4 text-[24px] font-extrabold text-ink">Crie sua senha</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Olá, {ctx.name.split(" ")[0]}! Você entrou com uma senha provisória{ctx.tenant ? ` criada pela ${ctx.tenant.name}` : ""}. Escolha uma senha só sua para continuar.
      </p>
      <ActionForm action={changePasswordAction} className="flex flex-col gap-4">
        <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Repita a nova senha">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <SubmitButton size="lg" pendingText="Salvando…">Salvar e continuar</SubmitButton>
      </ActionForm>
      <form action="/api/auth/logout" method="post" className="mt-5">
        <button className="text-sm font-medium text-muted hover:text-ink">Sair</button>
      </form>
    </div>
  );
}
