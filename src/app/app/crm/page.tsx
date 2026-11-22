import { redirect } from "next/navigation";
import { Plus, Target } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { getCrmMetrics, listBoard, LEAD_SOURCES } from "@/server/crm";
import { Card, PageHeader, LinkButton, Stat, EmptyState } from "@/components/ui";
import { LEAD_STAGE_LABEL } from "@/lib/domain/catalog";
import { LEAD_STAGES, type LeadStage } from "@/db/schema";
import { isoDay, money } from "@/lib/format";
import { Board, type BoardLead } from "./crm-client";

export const metadata = { title: "CRM comercial" };

export default async function Crm() {
  const ctx = await requireCtx("crm.use");
  if (!hasFeature(ctx, "crm")) redirect(`/app/plano?recurso=${encodeURIComponent("CRM comercial")}`);
  const [m, rows] = await Promise.all([getCrmMetrics(ctx), listBoard(ctx)]);
  const stages = LEAD_STAGES.map((s) => [s, LEAD_STAGE_LABEL[s]] as [LeadStage, string]);
  const leads: BoardLead[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    source: r.source ? LEAD_SOURCES[r.source] ?? r.source : null,
    stage: r.stage,
    estimatedMonthlyCents: r.estimatedMonthlyCents,
    nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
    stageChangedAt: r.stageChangedAt.toISOString(),
    ownerName: r.ownerName,
    converted: !!r.convertedCustomerId,
  }));
  const readOnly = ctx.subscription.readOnly;

  return (
    <>
      <PageHeader
        title="CRM comercial"
        subtitle="Funil de vendas: do primeiro contato ao contrato fechado."
        actions={!readOnly && <LinkButton href="/app/crm/novo"><Plus className="size-4" /> Novo lead</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Leads abertos" value={m.open} hint="fora de Fechado e Perdido" />
        <Stat
          label="Conversão"
          value={m.conversionRate == null ? "—" : `${Math.round(m.conversionRate * 100)}%`}
          hint={`${m.won} fechado${m.won === 1 ? "" : "s"} · ${m.lost} perdido${m.lost === 1 ? "" : "s"} em ${m.windowDays} dias`}
          tone={m.conversionRate != null && m.conversionRate >= 0.3 ? "ok" : undefined}
        />
        <Stat label="Valor no funil" value={money(m.pipeline)} hint="soma mensal estimada dos abertos" />
        <Stat label="Follow-ups atrasados" value={m.overdue} tone={m.overdue ? "danger" : undefined} hint="data de retorno já passou" />
      </div>
      {leads.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="size-5" />}
            title="Nenhum lead no funil"
            text="Cadastre quem pediu orçamento ou demonstrou interesse. Você acompanha cada etapa, envia orçamento por link e converte em cliente ao fechar."
            action={!readOnly && <LinkButton href="/app/crm/novo">Cadastrar primeiro lead</LinkButton>}
          />
        </Card>
      ) : (
        <>
          <Board leads={leads} stages={stages} today={isoDay()} />
          <p className="mt-2 text-[12px] text-muted">
            Fechados e perdidos aparecem por {m.windowDays} dias após a última mudança de etapa. No computador, arraste os cartões entre as colunas; no celular, use “Mover para”.
          </p>
        </>
      )}
    </>
  );
}
