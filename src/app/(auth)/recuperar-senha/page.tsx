import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold text-ink">Recuperar senha</h1>
      <p className="mb-7 mt-1 text-sm text-muted">Informe o e-mail da sua conta para receber o link de redefinição.</p>
      <ActionForm action={forgotAction} className="flex flex-col gap-4" resetOnSuccess>
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <SubmitButton size="lg" pendingText="Enviando…">Enviar link</SubmitButton>
      </ActionForm>
      <Link href="/entrar" className="mt-5 text-center text-sm font-medium text-muted hover:text-ink">Voltar para o login</Link>
    </>
  );
}
