import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold text-ink">Entrar</h1>
      <p className="mb-7 mt-1 text-sm text-muted">Acesse a operação da sua empresa.</p>
      <ActionForm action={loginAction} className="flex flex-col gap-4">
        <Field label="E-mail">
          <Input name="email" type="email" autoComplete="email" required inputMode="email" />
        </Field>
        <Field label="Senha">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton size="lg" pendingText="Entrando…">Entrar</SubmitButton>
      </ActionForm>
      <div className="mt-5 flex justify-between text-sm">
        <Link href="/recuperar-senha" className="font-medium text-muted hover:text-ink">Esqueci a senha</Link>
        <Link href="/criar-conta" className="font-semibold text-primary">Criar conta grátis</Link>
      </div>
    </>
  );
}
