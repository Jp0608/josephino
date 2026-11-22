import Link from "next/link";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { signupAction } from "../actions";
import { TRIAL_DAYS } from "@/server/signup";

export const metadata = { title: "Criar conta" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plano?: string }> }) {
  const { plano } = await searchParams;
  const plan = ["pro", "business"].includes(plano || "") ? plano : "pro";
  return (
    <>
      <h1 className="text-[26px] font-extrabold text-ink">Comece seu teste grátis</h1>
      <p className="mb-7 mt-1 text-sm text-muted">{TRIAL_DAYS} dias com todos os recursos do plano escolhido. Sem cartão de crédito.</p>
      <ActionForm action={signupAction} className="flex flex-col gap-4">
        <input type="hidden" name="plan" value={plan} />
        <Field label="Nome da empresa" hint="Pode ser seu nome, se você trabalha sozinho.">
          <Input name="companyName" required autoComplete="organization" />
          <FieldError name="companyName" />
        </Field>
        <Field label="Seu nome">
          <Input name="name" required autoComplete="name" />
          <FieldError name="name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail">
            <Input name="email" type="email" required autoComplete="email" inputMode="email" />
            <FieldError name="email" />
          </Field>
          <Field label="WhatsApp">
            <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(11) 99999-9999" />
          </Field>
        </div>
        <Field label="Senha" hint="Mínimo de 8 caracteres, com letras e números.">
          <Input name="password" type="password" required autoComplete="new-password" />
        </Field>
        <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>
            Li e aceito os <Link href="/termos" className="font-semibold text-primary" target="_blank">termos de uso</Link> e a{" "}
            <Link href="/privacidade" className="font-semibold text-primary" target="_blank">política de privacidade</Link>.
          </span>
        </label>
        <FieldError name="acceptTerms" />
        <SubmitButton size="lg" pendingText="Criando sua conta…">Criar conta</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-center text-sm text-muted">
        Já tem conta? <Link href="/entrar" className="font-semibold text-primary">Entrar</Link>
      </p>
    </>
  );
}
