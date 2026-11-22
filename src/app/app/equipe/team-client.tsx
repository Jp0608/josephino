"use client";
import { useState } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { ActionForm, CopyButton, FieldError, SubmitButton, useToast } from "@/components/client";
import { Field, Input, Select, btnClass } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";
import { createMemberAction, resetPasswordAction, updateMemberAction, type CreatedMember } from "./actions";

function PasswordOnce({ who, email, password, onClose }: { who: string; email: string; password: string; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn-soft p-4 text-ink" role="status">
      <p className="flex items-center gap-2 text-sm font-bold text-warn">
        <ShieldAlert className="size-4" /> Senha provisória — aparece só agora
      </p>
      <p className="mt-1 text-[13px] text-ink-2">
        Entregue a {who} ({email}). No primeiro acesso em <b>/entrar</b>, o Ondaro pede uma senha nova.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[16px] font-bold tracking-wider text-ink">{password}</code>
        <CopyButton text={password} label="Copiar senha" />
        <button type="button" onClick={onClose} className={btnClass("ghost", "sm")}>Já anotei</button>
      </div>
    </div>
  );
}

export function InviteForm({ roles, disabledReason }: { roles: [string, string][]; disabledReason?: string | null }) {
  const [created, setCreated] = useState<CreatedMember | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {created?.tempPassword && <PasswordOnce who={created.name} email={created.email} password={created.tempPassword} onClose={() => setCreated(null)} />}
      {created && !created.tempPassword && (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info">
          {created.email} já tinha conta no Ondaro: a pessoa entra com a senha que já usa.
        </p>
      )}
      {disabledReason ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{disabledReason}</p>
      ) : (
        <ActionForm
          action={createMemberAction as (p: ActionResult | null, fd: FormData) => Promise<ActionResult>}
          resetOnSuccess
          onDone={(r) => r.ok && setCreated((r.data as CreatedMember) ?? null)}
          className="grid gap-3 md:grid-cols-2"
        >
          <Field label="Nome" required>
            <Input name="name" required autoComplete="off" />
            <FieldError name="name" />
          </Field>
          <Field label="E-mail" required>
            <Input name="email" type="email" inputMode="email" required autoComplete="off" />
            <FieldError name="email" />
          </Field>
          <Field label="Papel" required hint="Define o que a pessoa vê e pode fazer.">
            <Select name="role" defaultValue="technician" options={roles} />
            <FieldError name="role" />
          </Field>
          <Field label="Cargo / função" hint="Opcional. Ex.: Técnico de campo">
            <Input name="jobTitle" />
          </Field>
          <div className="flex justify-end md:col-span-2">
            <SubmitButton pendingText="Criando acesso…">Criar acesso</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

export function MemberEditor({ membershipId, role, jobTitle, roles }: { membershipId: string; role: string; jobTitle: string | null; roles: [string, string][] }) {
  return (
    <ActionForm action={updateMemberAction.bind(null, membershipId)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Papel" className="sm:w-44">
        <Select name="role" defaultValue={role} options={roles} className="h-9" />
      </Field>
      <Field label="Cargo" className="sm:flex-1">
        <Input name="jobTitle" defaultValue={jobTitle ?? ""} className="h-9" />
      </Field>
      <SubmitButton size="sm" variant="secondary">Salvar</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordButton({ membershipId, name, email }: { membershipId: string; name: string; email: string }) {
  const [pending, setPending] = useState(false);
  const [pw, setPw] = useState<string | null>(null);
  const toast = useToast();
  if (pw) return <PasswordOnce who={name} email={email} password={pw} onClose={() => setPw(null)} />;
  return (
    <button
      type="button"
      disabled={pending}
      className={btnClass("ghost", "sm")}
      onClick={async () => {
        if (!window.confirm(`Gerar nova senha provisória para ${name}? A senha atual deixa de funcionar e as sessões abertas são encerradas.`)) return;
        setPending(true);
        try {
          const r = await resetPasswordAction(membershipId);
          if (r.ok && r.data) setPw(r.data.password);
          else if (!r.ok) toast({ tone: "error", text: r.error });
        } catch {
          toast({ tone: "error", text: "Sem conexão. Tente de novo." });
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Nova senha provisória
    </button>
  );
}
