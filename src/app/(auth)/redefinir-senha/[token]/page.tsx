import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { resetAction } from "../../actions";

export const metadata = { title: "Nova senha" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-[26px] font-extrabold text-ink">Criar nova senha</h1>
      <p className="mb-7 mt-1 text-sm text-muted">Depois de salvar, todas as sessões abertas da conta são encerradas.</p>
      <ActionForm action={resetAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números.">
          <Input name="password" type="password" required autoComplete="new-password" />
        </Field>
        <Field label="Repita a nova senha">
          <Input name="confirm" type="password" required autoComplete="new-password" />
        </Field>
        <SubmitButton size="lg">Salvar nova senha</SubmitButton>
      </ActionForm>
    </>
  );
}
