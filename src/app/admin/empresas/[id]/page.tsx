import { getTenantAdmin, listPlansAdmin, TENANT_STATUS_LABEL } from "@/server/platform";
import { BILLING_EVENT_LABEL } from "@/server/billing";
import { notFoundGuard } from "@/server/guards";
import { Card, CardHeader, Badge, EmptyState, Field, Input, Select, KeyValue, Notice } from "@/components/ui";
import { ActionForm, ActionButton, SubmitButton, FieldError } from "@/components/client";
import { date, dateTime, money } from "@/lib/format";
import { STATUS_TONE } from "../../status";
import { changePlanAction, setStatusAction, extendTrialAction, reactivateAction } from "../../actions";

export const metadata = { title: "Empresa" };

export default async function TenantAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await notFoundGuard(() => getTenantAdmin(id));
  const plans = await listPlansAdmin();
  const t = d.tenant;
  const eff = t.effectiveStatus.status;
  return (
    <>
      <a href="/admin/empresas" className="mb-1.5 inline-flex text-[13px] font-medium text-muted hover:text-ink">← Empresas</a>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-extrabold text-ink">{t.name}</h1>
        <Badge tone={STATUS_TONE[eff]}>{TENANT_STATUS_LABEL[eff]}</Badge>
        {t.isDemo && <Badge tone="warn">Demonstração</Badge>}
      </div>
      {t.status === "suspended" && t.suspendedReason && (
        <div className="mb-4">
          <Notice tone="danger" title="Suspensa">{t.suspendedReason}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="p-4 md:p-5">
          <h2 className="mb-4 text-[15px] font-bold">Resumo</h2>
          <KeyValue
            items={[
              ["Identificador", t.slug],
              ["Plano", t.planName ? `${t.planName} (${t.planPriceCents ? money(t.planPriceCents) + "/mês" : "sob consulta"})` : "Sem plano"],
              ["Criada em", date(t.createdAt)],
              ["Fim do teste", t.trialEndsAt ? dateTime(t.trialEndsAt) : null],
              ["Período atual até", t.currentPeriodEnd ? date(t.currentPeriodEnd) : null],
              ["Última atividade", t.lastActivity ? dateTime(t.lastActivity) : null],
              ["Usuários ativos", String(t.users)],
              ["Piscinas ativas", String(t.pools)],
              ["Clientes cadastrados", String(t.customers)],
              ["Visitas concluídas (30 dias)", String(t.visits30)],
              ["Relatórios emitidos", String(t.reports)],
            ]}
          />
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <h2 className="mb-3 text-[15px] font-bold">Plano</h2>
            <ActionForm action={changePlanAction.bind(null, id)} className="flex flex-col gap-3">
              <Field label="Novo plano">
                <Select name="planCode" defaultValue={t.planCode ?? ""} options={plans.map((p) => [p.plan.code, `${p.plan.name} — ${p.plan.priceCents ? money(p.plan.priceCents) : "sob consulta"}${p.plan.active ? "" : " (inativo)"}`] as [string, string])} />
              </Field>
              <Field label="Observação" hint="Ex.: pagamento confirmado via Pix em 20/11.">
                <Input name="note" maxLength={300} />
              </Field>
              <div className="flex justify-end"><SubmitButton size="sm">Alterar plano</SubmitButton></div>
            </ActionForm>
          </Card>

          <Card className="p-4 md:p-5">
            <h2 className="mb-3 text-[15px] font-bold">Situação</h2>
            <ActionForm action={setStatusAction.bind(null, id)} className="flex flex-col gap-3">
              <Field label="Definir como">
                <Select name="status" defaultValue={t.status === "trialing" ? "active" : t.status} options={{ active: "Ativa (pagamento em dia)", past_due: "Pagamento pendente", suspended: "Suspensa (bloqueia o acesso)", cancelled: "Cancelada (somente leitura)" }} />
              </Field>
              <Field label="Motivo" hint="Obrigatório para suspensão; aparece no histórico.">
                <Input name="reason" maxLength={500} />
                <FieldError name="reason" />
              </Field>
              <div className="flex justify-end"><SubmitButton size="sm">Salvar situação</SubmitButton></div>
            </ActionForm>
            {(t.status === "suspended" || t.status === "cancelled") && (
              <div className="mt-3 border-t border-line pt-3">
                <ActionButton action={reactivateAction.bind(null, id)} variant="soft" confirm={`Reativar ${t.name}? A empresa volta a ficar ativa.`}>Reativar empresa</ActionButton>
              </div>
            )}
          </Card>

          {t.status === "trialing" && (
            <Card className="p-4 md:p-5">
              <h2 className="mb-3 text-[15px] font-bold">Prorrogar teste</h2>
              <ActionForm action={extendTrialAction.bind(null, id)} className="flex items-end gap-2">
                <Field label="Dias a mais" className="w-32">
                  <Input name="days" type="number" min={1} max={90} defaultValue={7} inputMode="numeric" />
                </Field>
                <SubmitButton size="sm">Prorrogar</SubmitButton>
              </ActionForm>
              <p className="mt-2 text-[12px] text-muted">Conta a partir de hoje se o teste já venceu.</p>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Eventos de cobrança" />
          {d.events.length === 0 ? (
            <EmptyState title="Sem eventos" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d.events.map((e) => (
                <li key={e.id} className="px-4 py-2.5 md:px-5">
                  <p className="text-sm font-semibold text-ink">
                    {BILLING_EVENT_LABEL[e.kind] ?? e.kind}
                    {e.planCode ? ` · ${e.planCode}` : ""}
                    {e.amountCents ? ` · ${money(e.amountCents)}` : ""}
                  </p>
                  <p className="text-[12px] text-muted">{dateTime(e.createdAt)}{e.actor ? ` · ${e.actor}` : ""}{e.note ? ` · ${e.note}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Ações da administração" />
          {d.audit.length === 0 ? (
            <EmptyState title="Nenhuma ação registrada" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d.audit.map((a) => (
                <li key={a.id} className="px-4 py-2.5 md:px-5">
                  <p className="text-sm font-semibold text-ink">{a.action}</p>
                  <p className="text-[12px] text-muted">{dateTime(a.createdAt)} · {a.actorEmail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
