import Link from "next/link";
import { UserPlus, Users, ScrollText, BarChart3 } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can, ROLE_LABEL } from "@/server/permissions";
import { listMembers } from "@/server/team";
import { ROLES } from "@/db/schema";
import { Card, CardHeader, PageHeader, LinkButton, Badge, EmptyState, Notice } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { dateShort, monthLabel } from "@/lib/format";
import { InviteForm, MemberEditor, ResetPasswordButton } from "./team-client";
import { setMemberActiveAction } from "./actions";

export const metadata = { title: "Equipe" };

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function Team() {
  const ctx = await requireCtx("team.manage");
  const members = await listMembers(ctx);
  const active = members.filter((m) => m.active);
  const max = ctx.plan?.maxUsers ?? null;
  const full = max != null && active.length >= max;
  const roles = ROLES.filter((r) => r !== "owner" || ctx.role === "owner").map((r) => [r, ROLE_LABEL[r]] as [string, string]);
  const readOnly = ctx.subscription.readOnly;
  const month = monthLabel(new Date());

  return (
    <>
      <PageHeader
        title="Equipe"
        subtitle={`${active.length}${max != null ? ` de ${max}` : ""} usuário${active.length === 1 ? "" : "s"} ativo${active.length === 1 ? "" : "s"}${ctx.plan ? ` · plano ${ctx.plan.name}` : ""}`}
        actions={can(ctx.role, "audit.read") && <LinkButton href="/app/equipe/auditoria" variant="secondary"><ScrollText className="size-4" /> Trilha de auditoria</LinkButton>}
      />

      {full && !readOnly && (
        <div className="mb-4">
          <Notice tone="warn" title="Limite de usuários do plano atingido" action={<LinkButton href="/app/plano" size="sm" variant="secondary">Ver planos</LinkButton>}>
            O plano {ctx.plan?.name} permite {max} usuário{max === 1 ? "" : "s"} ativo{max === 1 ? "" : "s"}. Desative alguém ou faça upgrade para adicionar mais pessoas.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card className="self-start">
          <CardHeader title="Adicionar pessoa" icon={<UserPlus className="size-[18px]" />} subtitle="Criamos o acesso com uma senha provisória, trocada no primeiro login." />
          <div className="px-4 pb-5 md:px-5">
            <InviteForm
              roles={roles}
              disabledReason={readOnly ? "Seu período de teste terminou. Escolha um plano para voltar a cadastrar pessoas." : full ? "Limite de usuários do plano atingido." : null}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Pessoas" icon={<Users className="size-[18px]" />} subtitle="Desativar corta o acesso na hora e mantém todo o histórico (visitas, relatórios, registros)." />
          {members.length === 0 ? (
            <EmptyState title="Ninguém na equipe" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {members.map((m) => {
                const self = m.userId === ctx.userId;
                const canTouchOwner = m.role !== "owner" || ctx.role === "owner";
                return (
                  <li key={m.membershipId} className={m.active ? "" : "bg-surface-2/50"}>
                    <div className="flex items-center gap-3 px-4 py-3.5 md:px-5">
                      <div className={`grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold ${m.active ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"}`}>
                        {m.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
                          <span className="truncate">{m.name}{self ? " (você)" : ""}</span>
                          <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                          {!m.active && <Badge tone="danger">Desativado</Badge>}
                          {m.active && m.mustChangePassword && <Badge tone="warn">Aguardando 1º acesso</Badge>}
                        </p>
                        <p className="truncate text-[13px] text-muted">
                          {m.email}
                          {m.jobTitle ? ` · ${m.jobTitle}` : ""}
                          {m.lastLoginAt ? ` · último acesso ${dateShort(m.lastLoginAt)}` : " · nunca acessou"}
                        </p>
                      </div>
                    </div>
                    {!readOnly && canTouchOwner && (
                      <details className="px-4 pb-3 md:px-5">
                        <summary className="cursor-pointer text-[13px] font-semibold text-primary">Gerenciar acesso</summary>
                        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
                          <MemberEditor membershipId={m.membershipId} role={m.role} jobTitle={m.jobTitle} roles={m.role === "owner" && ctx.role !== "owner" ? [["owner", ROLE_LABEL.owner]] : roles} />
                          {!self && (
                            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                              {m.active ? (
                                <ActionButton action={setMemberActiveAction.bind(null, m.membershipId, false)} variant="ghost" confirm={`Desativar o acesso de ${m.name}? A pessoa sai do sistema imediatamente; o histórico é mantido.`}>
                                  Desativar acesso
                                </ActionButton>
                              ) : (
                                <ActionButton action={setMemberActiveAction.bind(null, m.membershipId, true)} variant="soft">
                                  Reativar acesso
                                </ActionButton>
                              )}
                              {m.active && <ResetPasswordButton membershipId={m.membershipId} name={m.name} email={m.email} />}
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Produtividade do mês" icon={<BarChart3 className="size-[18px]" />} subtitle={`${month[0].toUpperCase()}${month.slice(1)} · visitas atribuídas a cada pessoa`} />
        {members.every((m) => m.completed === 0 && m.due === 0) ? (
          <EmptyState title="Sem visitas atribuídas neste mês" text="Quando houver visitas com responsável definido na agenda, os números aparecem aqui." />
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 md:px-5">Pessoa</th>
                  <th className="px-3 py-2.5 text-right">Concluídas</th>
                  <th className="px-3 py-2.5 text-right" title="Concluídas ÷ visitas previstas até agora no mês (exceto canceladas e reagendadas)">Taxa de conclusão</th>
                  <th className="px-4 py-2.5 text-right md:px-5" title="Do início ao fim do atendimento">Tempo médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members
                  .filter((m) => m.completed > 0 || m.due > 0)
                  .map((m) => (
                    <tr key={m.membershipId}>
                      <td className="px-4 py-2.5 md:px-5">
                        <span className="font-semibold text-ink">{m.name}</span>
                        {!m.active && <span className="ml-2 text-[12px] text-muted">(desativado)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">{m.completed}</td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {pct(m.completionRate)} <span className="text-[12px] text-muted">({m.dueDone}/{m.due})</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular md:px-5">{m.avgMin == null ? "—" : `${m.avgMin} min`}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[12px] text-muted">
        Papéis e permissões: o proprietário gerencia tudo, inclusive assinatura; técnicos veem só a própria agenda. <Link href="/app/plano" className="font-semibold text-primary">Plano e assinatura</Link>
      </p>
    </>
  );
}
