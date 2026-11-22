import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Pencil, FileText, History, UserPlus, Phone, StickyNote, Mail, MapPin, ArrowRightLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getLead, proposalPublicState, ACTIVITY_KINDS, ACTIVITY_LABEL, LEAD_SOURCES } from "@/server/crm";
import { notFoundGuard } from "@/server/guards";
import { appUrl } from "@/server/reports";
import { Card, CardHeader, PageHeader, LinkButton, Badge, EmptyState, KeyValue, Field, Input, Select, Textarea, Notice, type Tone } from "@/components/ui";
import { ActionForm, ActionButton, CopyButton, FieldError, SubmitButton } from "@/components/client";
import { LEAD_STAGE_LABEL } from "@/lib/domain/catalog";
import { LEAD_STAGES, type LeadStage, type proposals } from "@/db/schema";
import { addDays, date, dateTime, isoDay, money, waLink } from "@/lib/format";
import type { ActionResult } from "@/lib/action-types";
import { StageMover } from "../crm-client";
import { addActivityAction, convertLeadAction, createProposalAction, moveLeadAction, rejectProposalAction, updateProposalAction } from "../actions";

export const metadata = { title: "Lead" };

const PROPOSAL_STATE: Record<string, [string, Tone]> = {
  open: ["Aguardando aceite", "info"],
  accepted: ["Aceito", "ok"],
  rejected: ["Recusado", "danger"],
  expired: ["Vencido", "warn"],
};
const ACT_ICON: Record<string, typeof Phone> = { note: StickyNote, call: Phone, whatsapp: MessageCircle, email: Mail, visit: MapPin, stage: ArrowRightLeft };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("crm.use");
  if (!hasFeature(ctx, "crm")) redirect(`/app/plano?recurso=${encodeURIComponent("CRM comercial")}`);
  const d = await notFoundGuard(() => getLead(ctx, id));
  const l = d.lead;
  const first = l.name.split(" ")[0];
  const stages = LEAD_STAGES.map((s) => [s, LEAD_STAGE_LABEL[s]] as [LeadStage, string]);
  const readOnly = ctx.subscription.readOnly;
  const today = isoDay();
  const followDay = l.nextFollowUpAt ? isoDay(l.nextFollowUpAt) : null;
  const overdue = !!followDay && followDay < today && l.stage !== "won" && l.stage !== "lost";
  const accepted = d.proposals.find((p) => p.acceptedAt);
  const canConvert = l.stage === "won" && !l.convertedCustomerId && can(ctx.role, "customers.write") && !readOnly;

  return (
    <>
      <PageHeader
        title={l.name}
        subtitle={[l.city, l.source ? LEAD_SOURCES[l.source] ?? l.source : null, `na etapa há ${Math.max(0, Math.floor((Date.now() - l.stageChangedAt.getTime()) / 86400000))} dia(s)`].filter(Boolean).join(" · ")}
        back={{ href: "/app/crm", label: "CRM comercial" }}
        actions={
          <>
            {l.phone && (
              <a href={waLink(l.phone, `Olá, ${first}! Aqui é da ${ctx.tenant.name}.`)} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            {!readOnly && <LinkButton href={`/app/crm/${id}/editar`} variant="secondary"><Pencil className="size-4" /> Editar</LinkButton>}
            {canConvert && (
              <ActionButton action={convertLeadAction.bind(null, id)} variant="primary" size="md" confirm={`Cadastrar “${l.name}” como cliente?`}>
                <UserPlus className="size-4" /> Converter em cliente
              </ActionButton>
            )}
          </>
        }
      />

      {d.customer && (
        <div className="mb-4">
          <Notice tone="ok" title="Lead convertido em cliente" action={<LinkButton href={`/app/clientes/${d.customer.id}`} size="sm" variant="secondary">Abrir cliente</LinkButton>}>
            {d.customer.name} já está na sua carteira de clientes.
          </Notice>
        </div>
      )}
      {accepted && l.stage !== "won" && l.stage !== "lost" && !readOnly && (
        <div className="mb-4">
          <Notice
            tone="ok"
            title="O cliente aceitou um orçamento"
            action={<ActionButton action={moveLeadAction.bind(null, id, "won", undefined)} variant="primary">Marcar como fechado</ActionButton>}
          >
            “{accepted.title}” foi aceito em {dateTime(accepted.acceptedAt)} por {accepted.acceptedName}.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Etapa do funil" subtitle={l.stage === "lost" && l.lostReason ? `Motivo da perda: ${l.lostReason}` : `Desde ${dateTime(l.stageChangedAt)}`} />
            <div className="px-4 pb-4 md:px-5">
              {readOnly ? <Badge tone="brand">{LEAD_STAGE_LABEL[l.stage]}</Badge> : <StageMover leadId={id} leadName={l.name} stage={l.stage} stages={stages} />}
            </div>
          </Card>
          <Card className="p-4 md:p-5">
            <h2 className="mb-4 text-[15px] font-bold">Dados do contato</h2>
            <KeyValue
              items={[
                ["Telefone / WhatsApp", l.phone],
                ["E-mail", l.email],
                ["Cidade", l.city],
                ["Origem", l.source ? LEAD_SOURCES[l.source] ?? l.source : null],
                ["Responsável", d.ownerName],
                ["Valor mensal estimado", l.estimatedMonthlyCents != null ? money(l.estimatedMonthlyCents) : null],
                ["Próximo follow-up", followDay ? <span className={overdue ? "font-semibold text-danger" : undefined}>{date(followDay)}{overdue ? " (atrasado)" : ""}</span> : null],
                ["Cadastrado em", date(l.createdAt)],
              ]}
            />
            {l.notes && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-[12px] font-semibold text-muted">Observações</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{l.notes}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Orçamentos" icon={<FileText className="size-[18px]" />} subtitle="O cliente abre o link, confere e aceita digitando o nome." />
            {d.proposals.length === 0 ? (
              <EmptyState title="Nenhum orçamento" text="Crie o orçamento abaixo e envie o link pelo WhatsApp." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.proposals.map((p) => (
                  <ProposalRow key={p.id} p={p} leadId={id} leadPhone={l.phone} first={first} readOnly={readOnly} today={today} />
                ))}
              </ul>
            )}
            {!readOnly && (
              <details className="border-t border-line px-4 py-3 md:px-5" open={d.proposals.length === 0}>
                <summary className="cursor-pointer text-sm font-semibold text-primary">+ Novo orçamento</summary>
                <div className="mt-3">
                  <ProposalForm action={createProposalAction.bind(null, id)} submit="Criar orçamento" />
                </div>
              </details>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Histórico" icon={<History className="size-[18px]" />} subtitle="Ligações, mensagens, anotações e mudanças de etapa." />
          {!readOnly && (
            <div className="border-t border-line px-4 py-4 md:px-5">
              <ActionForm action={addActivityAction.bind(null, id)} resetOnSuccess className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                  <Field label="Tipo">
                    <Select name="kind" defaultValue="note" options={ACTIVITY_KINDS} />
                  </Field>
                  <Field label="Próximo follow-up" hint="Opcional: atualiza a data de retorno.">
                    <Input name="nextFollowUp" type="date" min={today} />
                  </Field>
                </div>
                <Field label="O que aconteceu?">
                  <Textarea name="note" rows={3} placeholder="Ex.: Ligou pedindo visita para avaliar a piscina no sábado." required />
                  <FieldError name="note" />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton size="sm">Registrar</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
          {d.activities.length === 0 ? (
            <EmptyState title="Sem registros ainda" />
          ) : (
            <ol className="border-t border-line px-4 py-4 md:px-5">
              {d.activities.map((a, i) => {
                const I = ACT_ICON[a.kind] ?? StickyNote;
                return (
                  <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < d.activities.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-line" aria-hidden />}
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${a.kind === "stage" ? "bg-surface-2 text-muted" : "bg-primary-soft text-primary"}`}>
                      <I className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-muted">
                        <span className="font-semibold text-ink-2">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span> · {dateTime(a.createdAt)} · {a.userName ?? "Cliente (link público)"}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{a.note}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

function ProposalForm({ action, p, submit }: { action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>; p?: typeof proposals.$inferSelect; submit: string }) {
  return (
    <ActionForm action={action} resetOnSuccess={!p} className="flex flex-col gap-3">
      <Field label="Título" required>
        <Input name="title" defaultValue={p?.title} placeholder="Manutenção semanal — piscina 40 m³" required />
        <FieldError name="title" />
      </Field>
      <Field label="Itens e condições" required hint="Um item por linha: serviços, frequência, produtos inclusos, forma de pagamento.">
        <Textarea name="items" rows={5} defaultValue={p?.items} required />
        <FieldError name="items" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor total (R$)" required>
          <Input name="total" inputMode="decimal" defaultValue={p ? (p.totalCents / 100).toFixed(2).replace(".", ",") : ""} placeholder="450,00" required />
          <FieldError name="total" />
        </Field>
        <Field label="Válido até">
          <Input name="validUntil" type="date" min={isoDay()} defaultValue={p?.validUntil ?? addDays(isoDay(), 15)} />
          <FieldError name="validUntil" />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-[13px] text-ink-2">
        <input type="checkbox" name="recurring" defaultChecked={p ? p.recurring : true} className="size-4 accent-[var(--primary)]" />
        Valor mensal recorrente (contrato de manutenção)
      </label>
      <div className="flex justify-end">
        <SubmitButton size="sm">{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ProposalRow({ p, leadId, leadPhone, first, readOnly, today }: { p: typeof proposals.$inferSelect; leadId: string; leadPhone: string | null; first: string; readOnly: boolean; today: string }) {
  const state = proposalPublicState(p, today);
  const [label, tone] = PROPOSAL_STATE[state];
  const url = p.publicToken ? `${appUrl()}/orcamento/${p.publicToken}` : null;
  return (
    <li className="px-4 py-3.5 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
          <p className="text-[13px] text-muted">
            {money(p.totalCents)}
            {p.recurring ? "/mês" : ""} · versão {p.version}
            {p.validUntil ? ` · válido até ${date(p.validUntil)}` : ""}
          </p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      {state === "accepted" && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-ok-soft px-3 py-2 text-[12px] text-ok">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            Aceite eletrônico em {dateTime(p.acceptedAt)} por <b>{p.acceptedName}</b> · IP {p.acceptedIp} · versão {p.version}
          </span>
        </div>
      )}
      {url && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <CopyButton text={url} />
          {leadPhone && state === "open" && (
            <a
              href={waLink(leadPhone, `Olá, ${first}! Segue o orçamento “${p.title}”. Você pode conferir e aprovar por este link: ${url}`)}
              target="_blank"
              rel="noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold"
            >
              <MessageCircle className="size-4" /> Enviar por WhatsApp
            </a>
          )}
          <Link href={`/orcamento/${p.publicToken}`} target="_blank" className="inline-flex h-8 items-center gap-1.5 px-2 text-[13px] font-semibold text-primary">
            <ExternalLink className="size-4" /> Ver como cliente
          </Link>
          {!readOnly && state !== "accepted" && state !== "rejected" && (
            <ActionButton action={rejectProposalAction.bind(null, p.id, leadId)} variant="ghost" confirm="Marcar este orçamento como recusado? O link deixará de aceitar aprovação.">
              Marcar como recusado
            </ActionButton>
          )}
        </div>
      )}
      {!readOnly && state !== "accepted" && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-muted hover:text-ink">Editar (gera nova versão)</summary>
          <div className="mt-3">
            <ProposalForm action={updateProposalAction.bind(null, p.id, leadId)} p={p} submit="Salvar nova versão" />
          </div>
        </details>
      )}
    </li>
  );
}
