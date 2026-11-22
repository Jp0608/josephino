import Link from "next/link";
import { FileText, RotateCcw } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { getVisitWorkspace } from "@/server/visits";
import { listTeamOptions } from "@/server/pools";
import { notFoundGuard } from "@/server/guards";
import { Card, PageHeader, LinkButton, Badge } from "@/components/ui";
import { VisitStatusBadge } from "@/components/VisitBits";
import { ActionButton } from "@/components/client";
import { dateTime, isoDay, num } from "@/lib/format";
import { OPEN_VISIT_STATUSES, SERVICE_TYPES } from "@/lib/domain/catalog";
import { VisitFlow, type FlowProps } from "./VisitFlow";
import { VisitControls } from "./VisitControls";
import { statusAction } from "../../agenda/actions";

export const metadata = { title: "Atendimento" };

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("visits.execute");
  const w = await notFoundGuard(() => getVisitWorkspace(ctx, id));
  const v = w.visit;
  const open = OPEN_VISIT_STATUSES.includes(v.status);
  const team = can(ctx.role, "agenda.write") ? await listTeamOptions(ctx) : [];

  if (!open) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={w.customer.name} subtitle={`${w.pool.name} · ${dateTime(v.completedAt ?? v.scheduledStart)}`} back={{ href: "/app/agenda", label: "Agenda" }} />
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <VisitStatusBadge status={v.status} />
            <span className="text-sm text-muted">{SERVICE_TYPES[v.serviceType]}</span>
          </div>
          {v.status === "completed" ? (
            <>
              <p className="mt-4 text-sm text-ink-2">Atendimento finalizado{w.techName ? ` por ${w.techName}` : ""}. O registro faz parte do histórico permanente da piscina.</p>
              {w.draft.measurements.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {w.draft.measurements.map((m) => (
                    <Badge key={m.id} tone={m.status === "in_range" ? "ok" : m.status === "above" ? "danger" : m.status === "below" ? "warn" : "neutral"}>
                      {m.label}: {num(m.value)} {m.unit}
                    </Badge>
                  ))}
                </div>
              )}
              {w.report && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <LinkButton href={`/app/relatorios/${w.report.id}`}><FileText className="size-4" /> Relatório {w.report.protocol}</LinkButton>
                  <LinkButton href={`/app/piscinas/${w.pool.id}`} variant="secondary">Prontuário da piscina</LinkButton>
                </div>
              )}
            </>
          ) : (
            <>
              {v.notDoneReason && <p className="mt-4 text-sm text-danger">Motivo: {v.notDoneReason}</p>}
              {can(ctx.role, "agenda.write") && (
                <div className="mt-4">
                  <ActionButton action={statusAction.bind(null, id, "scheduled", undefined)} variant="secondary">
                    <RotateCcw className="size-4" /> Reabrir como agendada
                  </ActionButton>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    );
  }

  const initial: FlowProps["initial"] = {
    checklist: Object.fromEntries(w.draft.checklist.map((c) => [c.itemKey, { state: c.state as "ok", comment: c.comment ?? "" }])),
    measurements: Object.fromEntries(w.draft.measurements.map((m) => [m.parameterKey, m.value == null ? "" : String(m.value).replace(".", ",")])),
    method: w.draft.measurements[0]?.method ?? "",
    instrument: w.draft.measurements[0]?.instrument ?? "",
    procedures: Object.fromEntries(w.draft.procedures.map((p) => [p.procKey, { done: p.done, notes: p.notes ?? "" }])),
    chemicals: w.draft.chemicals.map((c) => ({
      id: c.id,
      productId: c.productId,
      productName: c.productName,
      quantity: String(c.quantity).replace(".", ","),
      unit: c.unit,
      lot: c.lot ?? "",
      purpose: c.purpose ?? "",
      consume: !!c.productId,
    })),
    notes: {
      findings: v.findings ?? "",
      actionsTaken: v.actionsTaken ?? "",
      followUp: v.followUp ?? "",
      recommendations: v.recommendations ?? "",
      internalNotes: v.internalNotes ?? "",
      poolSafetyNote: v.poolSafetyNote ?? "",
      nextVisitSuggestion: v.nextVisitSuggestion ?? "",
    },
  };

  return (
    <>
      <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between">
        <Link href="/app/agenda" className="text-[13px] font-medium text-muted">← Agenda</Link>
        <VisitStatusBadge status={v.status} />
      </div>
      <div className="mx-auto max-w-2xl">
        <VisitControls
          id={id}
          status={v.status}
          canReschedule={can(ctx.role, "agenda.write")}
          recurrenceId={v.recurrenceId}
          day={isoDay(v.scheduledStart)}
          team={team}
          assignee={v.assignedUserId}
        />
      </div>
      <VisitFlow
        visitId={id}
        version={v.version}
        status={v.status}
        header={{
          customer: w.customer.name,
          pool: w.pool.name,
          code: w.pool.code,
          address: w.customer.address || null,
          volume: w.pool.volumeLiters ? `${w.pool.volumeLiters.toLocaleString("pt-BR")} L${w.pool.volumeIsEstimated ? " (estimado)" : ""}` : null,
          instructions: v.instructions,
          scheduled: dateTime(v.scheduledStart),
          techName: w.techName,
        }}
        previous={
          w.previous
            ? {
                when: `Em ${dateTime(w.previous.completedAt)}`,
                measurements: w.previous.measurements.map((m) => ({ label: m.label, value: m.value, unit: m.unit, status: m.status })),
                chemicals: w.previous.chemicals.map((c) => `${c.productName} ${num(c.quantity, 3)} ${c.unit}`),
                recommendations: w.previous.recommendations,
                followUp: w.previous.followUp,
                findings: w.previous.findings,
              }
            : null
        }
        params={w.params.map((p) => ({ key: p.key, label: p.label, unit: p.unit, rangeMin: p.rangeMin, rangeMax: p.rangeMax }))}
        products={w.products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, stockQty: p.stockQty, lot: p.lot, category: p.category, safetyNotes: p.safetyNotes }))}
        initial={initial}
        photos={w.photos.map((p) => ({ id: p.id, kind: p.kind, caption: p.caption }))}
        customerPhone={w.customer.whatsapp}
        userName={ctx.name}
        canReschedule={can(ctx.role, "agenda.write")}
      />
    </>
  );
}
