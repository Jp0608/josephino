import "server-only";
import { and, asc, desc, eq, gte, lt, inArray, sql, ne, isNull, or, lte } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@/db";
import {
  visits,
  pools,
  customers,
  users,
  recurrences,
  visitChecklist,
  measurements,
  visitProcedures,
  chemicalApplications,
  parameterDefinitions,
  products,
  photos,
  inventoryMovements,
  invoices,
  technicalReports,
  VISIT_STATUSES,
  type VisitStatus,
} from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError, UserError, ForbiddenError } from "./errors";
import { can } from "./permissions";
import { occurrences, overlaps } from "@/lib/domain/recurrence";
import { rangeStatus } from "@/lib/domain/ranges";
import { CHECKLIST, PROCEDURES, OPEN_VISIT_STATUSES } from "@/lib/domain/catalog";
import { addDays, dayStart, isoDay, localDateTime } from "@/lib/format";
import { buildAndStoreReport } from "./reports";
import { customerAddress } from "./customers";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;
const HORIZON_DAYS = 56; // recorrências geram visitas para as próximas 8 semanas

/* ───────────────────────────── Agenda ───────────────────────────── */

export async function listAgenda(ctx: C, from: string, to: string, opts: { assignee?: string | null } = {}) {
  return withTenant(ctx.tenantId, async (tx) => {
    await extendRecurrences(tx, ctx.tenantId);
    const conds = [eq(visits.tenantId, ctx.tenantId), gte(visits.scheduledStart, dayStart(from)), lt(visits.scheduledStart, dayStart(addDays(to, 1)))];
    // Técnico só vê a própria agenda — aplicado no servidor, não só na interface.
    if (!can(ctx.role, "agenda.view_all")) conds.push(eq(visits.assignedUserId, ctx.userId));
    else if (opts.assignee === "none") conds.push(isNull(visits.assignedUserId));
    else if (opts.assignee) conds.push(eq(visits.assignedUserId, opts.assignee));
    const rows = await tx
      .select({
        v: visits,
        poolName: pools.name,
        poolCode: pools.code,
        poolUsage: pools.usage,
        poolAddress: pools.address,
        volumeLiters: pools.volumeLiters,
        customerName: customers.name,
        customerPhone: customers.whatsapp,
        street: customers.street,
        number: customers.number,
        complement: customers.complement,
        district: customers.district,
        city: customers.city,
        state: customers.state,
        techName: users.name,
        reportToken: technicalReports.publicToken,
      })
      .from(visits)
      .innerJoin(pools, and(eq(pools.tenantId, visits.tenantId), eq(pools.id, visits.poolId)))
      .innerJoin(customers, and(eq(customers.tenantId, visits.tenantId), eq(customers.id, visits.customerId)))
      .leftJoin(users, eq(users.id, visits.assignedUserId))
      .leftJoin(technicalReports, and(eq(technicalReports.tenantId, visits.tenantId), eq(technicalReports.visitId, visits.id)))
      .where(and(...conds))
      .orderBy(asc(visits.scheduledStart));
    return rows.map((r) => ({
      ...r.v,
      poolName: r.poolName,
      poolCode: r.poolCode,
      poolUsage: r.poolUsage,
      volumeLiters: r.volumeLiters,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      address: r.poolAddress || customerAddress(r),
      techName: r.techName,
      reportToken: r.reportToken,
    }));
  });
}

/** Gera as visitas futuras das recorrências ativas até o horizonte. Idempotente (índice único por recorrência+horário). */
export async function extendRecurrences(tx: Tx, tenantId: string, until = addDays(isoDay(), HORIZON_DAYS)) {
  const recs = await tx
    .select()
    .from(recurrences)
    .where(and(eq(recurrences.tenantId, tenantId), eq(recurrences.active, true), or(isNull(recurrences.generatedUntil), lt(recurrences.generatedUntil, until))));
  for (const r of recs) {
    const from = r.generatedUntil ? addDays(r.generatedUntil, 1) : r.startsOn;
    const days = occurrences({ weekdays: r.weekdays, intervalWeeks: r.intervalWeeks, startsOn: r.startsOn, endsOn: r.endsOn }, from, until);
    if (days.length) {
      await tx
        .insert(visits)
        .values(
          days.map((d) => ({
            tenantId,
            customerId: r.customerId,
            poolId: r.poolId,
            assignedUserId: r.assignedUserId,
            recurrenceId: r.id,
            serviceType: r.serviceType,
            scheduledStart: localDateTime(d, r.startTime),
            durationMin: r.durationMin,
          })),
        )
        .onConflictDoNothing();
    }
    await tx.update(recurrences).set({ generatedUntil: until }).where(eq(recurrences.id, r.id));
  }
}

export const scheduleSchema = z.object({
  poolId: z.string().uuid("Escolha a piscina"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido"),
  durationMin: z.coerce.number().int().min(10).max(600).default(60),
  assignedUserId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  serviceType: z.string().default("manutencao"),
  priority: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  instructions: z.string().trim().max(2000).optional().transform((v) => v || null),
  priceCents: z.number().int().min(0).nullable().optional(),
  // recorrência
  repeat: z.enum(["none", "weekly", "biweekly", "monthly"]).default("none"),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  endsOn: z.string().optional().transform((v) => v || null),
  force: z.boolean().default(false), // agendar mesmo com conflito
});

export type ScheduleResult =
  | { ok: true; created: number; firstVisitId: string; recurrenceId?: string }
  | { ok: false; conflicts: { when: Date; customerName: string; poolName: string }[]; duplicates: { when: Date }[] };

/** Detecta choque de horário do mesmo técnico e visita duplicada da mesma piscina no mesmo dia. */
async function findConflicts(tx: Tx, tenantId: string, slots: { start: Date; durationMin: number }[], assignee: string | null, poolId: string) {
  if (!slots.length) return { conflicts: [], duplicates: [] };
  const min = new Date(Math.min(...slots.map((s) => s.start.getTime())) - 12 * 3600000);
  const max = new Date(Math.max(...slots.map((s) => s.start.getTime())) + 12 * 3600000);
  const open = await tx
    .select({ v: visits, customerName: customers.name, poolName: pools.name })
    .from(visits)
    .innerJoin(pools, and(eq(pools.tenantId, visits.tenantId), eq(pools.id, visits.poolId)))
    .innerJoin(customers, and(eq(customers.tenantId, visits.tenantId), eq(customers.id, visits.customerId)))
    .where(
      and(
        eq(visits.tenantId, tenantId),
        inArray(visits.status, OPEN_VISIT_STATUSES),
        gte(visits.scheduledStart, min),
        lte(visits.scheduledStart, max),
        assignee ? or(eq(visits.assignedUserId, assignee), eq(visits.poolId, poolId)) : eq(visits.poolId, poolId),
      ),
    );
  const conflicts: { when: Date; customerName: string; poolName: string }[] = [];
  const duplicates: { when: Date }[] = [];
  for (const s of slots) {
    for (const o of open) {
      if (o.v.poolId === poolId && isoDay(o.v.scheduledStart) === isoDay(s.start)) duplicates.push({ when: o.v.scheduledStart });
      else if (assignee && o.v.assignedUserId === assignee && overlaps(s.start, s.durationMin, o.v.scheduledStart, o.v.durationMin))
        conflicts.push({ when: o.v.scheduledStart, customerName: o.customerName, poolName: o.poolName });
    }
  }
  return { conflicts, duplicates };
}

export async function scheduleVisit(ctx: C, input: z.input<typeof scheduleSchema>): Promise<ScheduleResult> {
  const d = scheduleSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [pool] = await tx.select().from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, d.poolId))).limit(1);
    if (!pool) throw new NotFoundError("Piscina não encontrada.");
    const assignee = d.assignedUserId ?? null;
    if (d.repeat === "none") {
      const start = localDateTime(d.date, d.time);
      const { conflicts, duplicates } = await findConflicts(tx, ctx.tenantId, [{ start, durationMin: d.durationMin }], assignee, pool.id);
      if ((conflicts.length || duplicates.length) && !d.force) return { ok: false, conflicts, duplicates };
      const [v] = await tx
        .insert(visits)
        .values({
          tenantId: ctx.tenantId,
          customerId: pool.customerId,
          poolId: pool.id,
          assignedUserId: assignee,
          serviceType: d.serviceType,
          priority: d.priority,
          instructions: d.instructions,
          scheduledStart: start,
          durationMin: d.durationMin,
          priceCents: d.priceCents ?? null,
        })
        .returning();
      await audit(tx, ctx, "visit.schedule", "visit", v.id, { start: start.toISOString(), assignee });
      return { ok: true, created: 1, firstVisitId: v.id };
    }
    const weekdays = d.weekdays.length ? [...new Set(d.weekdays)] : [new Date(`${d.date}T12:00:00Z`).getUTCDay()];
    const intervalWeeks = d.repeat === "weekly" ? 1 : d.repeat === "biweekly" ? 2 : 4;
    const until = addDays(isoDay(), HORIZON_DAYS);
    const days = occurrences({ weekdays, intervalWeeks, startsOn: d.date, endsOn: d.endsOn }, d.date, until);
    if (!days.length) throw new UserError("Nenhuma data cai dentro dessa recorrência. Confira os dias da semana e a data de término.");
    const slots = days.map((day) => ({ start: localDateTime(day, d.time), durationMin: d.durationMin }));
    const { conflicts, duplicates } = await findConflicts(tx, ctx.tenantId, slots, assignee, pool.id);
    if ((conflicts.length || duplicates.length) && !d.force) return { ok: false, conflicts, duplicates };
    const [rec] = await tx
      .insert(recurrences)
      .values({
        tenantId: ctx.tenantId,
        poolId: pool.id,
        customerId: pool.customerId,
        assignedUserId: assignee,
        serviceType: d.serviceType,
        weekdays,
        intervalWeeks,
        startTime: d.time,
        durationMin: d.durationMin,
        startsOn: d.date,
        endsOn: d.endsOn,
        generatedUntil: until,
      })
      .returning();
    const created = await tx
      .insert(visits)
      .values(
        slots.map((s) => ({
          tenantId: ctx.tenantId,
          customerId: pool.customerId,
          poolId: pool.id,
          assignedUserId: assignee,
          recurrenceId: rec.id,
          serviceType: d.serviceType,
          priority: d.priority,
          instructions: d.instructions,
          scheduledStart: s.start,
          durationMin: d.durationMin,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: visits.id });
    await audit(tx, ctx, "recurrence.create", "recurrence", rec.id, { weekdays, intervalWeeks, time: d.time, visits: created.length });
    return { ok: true, created: created.length, firstVisitId: created[0]?.id, recurrenceId: rec.id };
  });
}

const TRANSITIONS: Partial<Record<VisitStatus, VisitStatus[]>> = {
  scheduled: ["confirmed", "on_the_way", "in_progress", "not_done", "cancelled", "rescheduled"],
  confirmed: ["scheduled", "on_the_way", "in_progress", "not_done", "cancelled", "rescheduled"],
  on_the_way: ["in_progress", "not_done", "scheduled"],
  in_progress: ["waiting_info", "not_done"],
  waiting_info: ["in_progress", "not_done"],
  not_done: ["scheduled"],
  cancelled: ["scheduled"],
};

async function loadVisitFor(tx: Tx, ctx: C, id: string) {
  const [v] = await tx.select().from(visits).where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.id, id))).limit(1);
  if (!v) throw new NotFoundError("Visita não encontrada.");
  if (!can(ctx.role, "agenda.view_all") && v.assignedUserId !== ctx.userId) throw new NotFoundError("Visita não encontrada.");
  return v;
}

export async function setVisitStatus(ctx: C, id: string, status: VisitStatus, reason?: string) {
  if (!VISIT_STATUSES.includes(status)) throw new UserError("Status inválido.");
  return withTenant(ctx.tenantId, async (tx) => {
    const v = await loadVisitFor(tx, ctx, id);
    if (v.status === status) return v;
    if (status === "completed") throw new UserError("Use “Finalizar atendimento” para concluir a visita.");
    if (!TRANSITIONS[v.status]?.includes(status)) throw new UserError("Essa mudança de status não é permitida para esta visita.");
    if (["cancelled", "rescheduled"].includes(status) && !can(ctx.role, "agenda.write")) throw new ForbiddenError();
    const [row] = await tx
      .update(visits)
      .set({
        status,
        notDoneReason: status === "not_done" ? reason || null : v.notDoneReason,
        startedAt: status === "in_progress" && !v.startedAt ? new Date() : v.startedAt,
        updatedAt: new Date(),
        version: v.version + 1,
      })
      .where(eq(visits.id, id))
      .returning();
    await audit(tx, ctx, "visit.status", "visit", id, { from: v.status, to: status, reason });
    return row;
  });
}

export const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  assignedUserId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  force: z.boolean().default(false),
});

export async function rescheduleVisit(ctx: C, id: string, input: z.input<typeof rescheduleSchema>): Promise<ScheduleResult> {
  const d = rescheduleSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const v = await loadVisitFor(tx, ctx, id);
    if (!OPEN_VISIT_STATUSES.includes(v.status)) throw new UserError("Só dá para remarcar visitas em aberto.");
    const start = localDateTime(d.date, d.time);
    const assignee = d.assignedUserId ?? v.assignedUserId;
    const { conflicts, duplicates } = await findConflicts(tx, ctx.tenantId, [{ start, durationMin: v.durationMin }], assignee, v.poolId);
    const realDup = duplicates.filter((x) => x.when.getTime() !== v.scheduledStart.getTime());
    const realConf = conflicts; // a própria visita não entra: horário muda
    if ((realConf.length || realDup.length) && !d.force) return { ok: false, conflicts: realConf, duplicates: realDup };
    await tx
      .update(visits)
      .set({ scheduledStart: start, assignedUserId: assignee, status: v.status === "confirmed" ? "scheduled" : v.status, updatedAt: new Date(), version: v.version + 1 })
      .where(eq(visits.id, id));
    await audit(tx, ctx, "visit.reschedule", "visit", id, { from: v.scheduledStart.toISOString(), to: start.toISOString() });
    return { ok: true, created: 0, firstVisitId: id };
  });
}

export async function stopRecurrence(ctx: C, recurrenceId: string, fromDay: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    await tx.update(recurrences).set({ active: false, endsOn: addDays(fromDay, -1) }).where(and(eq(recurrences.tenantId, ctx.tenantId), eq(recurrences.id, recurrenceId)));
    const removed = await tx
      .update(visits)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(visits.tenantId, ctx.tenantId),
          eq(visits.recurrenceId, recurrenceId),
          gte(visits.scheduledStart, dayStart(fromDay)),
          inArray(visits.status, ["scheduled", "confirmed"]),
        ),
      )
      .returning({ id: visits.id });
    await audit(tx, ctx, "recurrence.stop", "recurrence", recurrenceId, { from: fromDay, cancelled: removed.length });
    return removed.length;
  });
}

/* ───────────────────────────── Execução da visita ───────────────────────────── */

export async function getVisitWorkspace(ctx: C, id: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const v = await loadVisitFor(tx, ctx, id);
    const [pool] = await tx.select().from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, v.poolId)));
    const [cust] = await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, v.customerId)));
    const [tech] = v.assignedUserId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, v.assignedUserId)) : [];
    const params = await tx
      .select()
      .from(parameterDefinitions)
      .where(and(eq(parameterDefinitions.tenantId, ctx.tenantId), eq(parameterDefinitions.active, true)))
      .orderBy(asc(parameterDefinitions.sortOrder));
    const [prev] = await tx
      .select()
      .from(visits)
      .where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.poolId, v.poolId), eq(visits.status, "completed"), ne(visits.id, v.id)))
      .orderBy(desc(visits.completedAt))
      .limit(1);
    const prevMeasurements = prev
      ? await tx.select().from(measurements).where(and(eq(measurements.tenantId, ctx.tenantId), eq(measurements.visitId, prev.id)))
      : [];
    const prevChemicals = prev
      ? await tx.select().from(chemicalApplications).where(and(eq(chemicalApplications.tenantId, ctx.tenantId), eq(chemicalApplications.visitId, prev.id)))
      : [];
    const checklist = await tx.select().from(visitChecklist).where(and(eq(visitChecklist.tenantId, ctx.tenantId), eq(visitChecklist.visitId, id)));
    const meas = await tx.select().from(measurements).where(and(eq(measurements.tenantId, ctx.tenantId), eq(measurements.visitId, id)));
    const procs = await tx.select().from(visitProcedures).where(and(eq(visitProcedures.tenantId, ctx.tenantId), eq(visitProcedures.visitId, id)));
    const chems = await tx.select().from(chemicalApplications).where(and(eq(chemicalApplications.tenantId, ctx.tenantId), eq(chemicalApplications.visitId, id)));
    const photoRows = await tx.select().from(photos).where(and(eq(photos.tenantId, ctx.tenantId), eq(photos.visitId, id))).orderBy(asc(photos.createdAt));
    const productRows = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, ctx.tenantId), eq(products.active, true)))
      .orderBy(asc(products.name));
    const [report] = await tx
      .select({ id: technicalReports.id, publicToken: technicalReports.publicToken, protocol: technicalReports.protocol })
      .from(technicalReports)
      .where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.visitId, id)));
    return {
      visit: { ...v, internalNotes: v.internalNotes },
      pool,
      customer: {
        id: cust.id,
        name: cust.name,
        whatsapp: cust.whatsapp || cust.phone,
        email: cust.email,
        contactName: cust.contactName,
        address: pool.address || customerAddress(cust),
        whatsappConsent: cust.whatsappConsent,
      },
      techName: tech?.name ?? null,
      params: params.filter((p) => !p.appliesTo || p.appliesTo === pool.disinfection),
      previous: prev
        ? {
            id: prev.id,
            completedAt: prev.completedAt,
            recommendations: prev.recommendations,
            followUp: prev.followUp,
            findings: prev.findings,
            measurements: prevMeasurements,
            chemicals: prevChemicals,
          }
        : null,
      draft: { checklist, measurements: meas, procedures: procs, chemicals: chems },
      photos: photoRows,
      products: productRows,
      report: report ?? null,
    };
  });
}

const numOrNull = z.union([z.number(), z.null()]).optional().transform((v) => (v == null || Number.isNaN(v) ? null : v));
export const draftSchema = z.object({
  baseVersion: z.number().int(),
  checklist: z.array(z.object({ itemKey: z.string().max(60), state: z.enum(["ok", "attention", "problem", "not_checked"]), comment: z.string().max(1000).nullable().optional() })).max(60).default([]),
  measurements: z
    .array(
      z.object({
        parameterKey: z.string().max(60),
        value: numOrNull,
        method: z.string().max(40).nullable().optional(),
        instrument: z.string().max(120).nullable().optional(),
        measuredAt: z.string().datetime().nullable().optional(),
      }),
    )
    .max(40)
    .default([]),
  procedures: z.array(z.object({ procKey: z.string().max(60), done: z.boolean(), doneAt: z.string().datetime().nullable().optional(), notes: z.string().max(1000).nullable().optional() })).max(60).default([]),
  chemicals: z
    .array(
      z.object({
        id: z.string().uuid(), // gerado no aparelho: reenvio offline não duplica
        productId: z.string().uuid().nullable().optional(),
        productName: z.string().trim().min(1).max(160),
        quantity: z.number().positive("Quantidade precisa ser maior que zero"),
        unit: z.string().max(10),
        lot: z.string().max(60).nullable().optional(),
        purpose: z.string().max(200).nullable().optional(),
        appliedAt: z.string().datetime().nullable().optional(),
      }),
    )
    .max(40)
    .default([]),
  notes: z
    .object({
      findings: z.string().max(5000).nullable().optional(),
      actionsTaken: z.string().max(5000).nullable().optional(),
      followUp: z.string().max(5000).nullable().optional(),
      recommendations: z.string().max(5000).nullable().optional(),
      internalNotes: z.string().max(5000).nullable().optional(),
      poolSafetyNote: z.string().max(2000).nullable().optional(),
      nextVisitSuggestion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("").transform(() => null)),
    })
    .default({}),
});
export type DraftInput = z.input<typeof draftSchema>;

/**
 * Salva o rascunho completo da visita (autosave e sincronização offline).
 * Substitui o estado do rascunho pelo enviado. Se outro aparelho salvou depois da versão base,
 * devolve conflito para o técnico decidir — nunca sobrescreve em silêncio.
 */
export async function saveDraft(ctx: C, id: string, input: DraftInput, opts: { overwrite?: boolean } = {}) {
  const d = draftSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const v = await loadVisitFor(tx, ctx, id);
    if (v.status === "completed") throw new UserError("Esta visita já foi finalizada. O relatório emitido não pode ser alterado.");
    if (!["in_progress", "waiting_info"].includes(v.status)) {
      if (!OPEN_VISIT_STATUSES.includes(v.status)) throw new UserError("Esta visita não está em aberto.");
    }
    if (d.baseVersion < v.version && !opts.overwrite) {
      return { ok: false as const, conflict: true, serverVersion: v.version };
    }
    await writeDraft(tx, ctx, v, d);
    const [row] = await tx
      .update(visits)
      .set({
        findings: d.notes.findings ?? null,
        actionsTaken: d.notes.actionsTaken ?? null,
        followUp: d.notes.followUp ?? null,
        recommendations: d.notes.recommendations ?? null,
        internalNotes: d.notes.internalNotes ?? null,
        poolSafetyNote: d.notes.poolSafetyNote ?? null,
        nextVisitSuggestion: d.notes.nextVisitSuggestion ?? null,
        status: ["scheduled", "confirmed", "on_the_way"].includes(v.status) ? "in_progress" : v.status,
        startedAt: v.startedAt ?? new Date(),
        version: v.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(visits.id, id))
      .returning({ version: visits.version });
    return { ok: true as const, version: row.version };
  });
}

async function writeDraft(tx: Tx, ctx: C, v: typeof visits.$inferSelect, d: z.infer<typeof draftSchema>) {
  const [pool] = await tx.select({ disinfection: pools.disinfection }).from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, v.poolId)));
  // checklist
  await tx.delete(visitChecklist).where(and(eq(visitChecklist.tenantId, ctx.tenantId), eq(visitChecklist.visitId, v.id)));
  const ck = d.checklist.filter((c) => c.state !== "not_checked" || c.comment);
  if (ck.length) {
    const labels = new Map(CHECKLIST.map((c) => [c.key, c.label]));
    await tx.insert(visitChecklist).values(
      ck.map((c) => ({ tenantId: ctx.tenantId, visitId: v.id, itemKey: c.itemKey, label: labels.get(c.itemKey) ?? c.itemKey, state: c.state, comment: c.comment || null })),
    );
  }
  // medições: faixa copiada da configuração vigente (snapshot)
  await tx.delete(measurements).where(and(eq(measurements.tenantId, ctx.tenantId), eq(measurements.visitId, v.id)));
  const defs = await tx.select().from(parameterDefinitions).where(eq(parameterDefinitions.tenantId, ctx.tenantId));
  const defMap = new Map(defs.map((p) => [p.key, p]));
  const ms = d.measurements.filter((m) => m.value != null && defMap.has(m.parameterKey));
  if (ms.length) {
    await tx.insert(measurements).values(
      ms.map((m) => {
        const def = defMap.get(m.parameterKey)!;
        return {
          tenantId: ctx.tenantId,
          visitId: v.id,
          poolId: v.poolId,
          parameterKey: m.parameterKey,
          label: def.label,
          value: m.value,
          unit: def.unit,
          method: m.method || null,
          instrument: m.instrument || null,
          measuredAt: m.measuredAt ? new Date(m.measuredAt) : new Date(),
          measuredBy: ctx.userId,
          rangeMin: def.rangeMin,
          rangeMax: def.rangeMax,
          status: rangeStatus(m.value, def.rangeMin, def.rangeMax),
        };
      }),
    );
  }
  void pool;
  // procedimentos
  await tx.delete(visitProcedures).where(and(eq(visitProcedures.tenantId, ctx.tenantId), eq(visitProcedures.visitId, v.id)));
  const pr = d.procedures.filter((p) => p.done || p.notes);
  if (pr.length) {
    const labels = new Map(PROCEDURES.map((p) => [p.key, p.label]));
    await tx.insert(visitProcedures).values(
      pr.map((p) => ({
        tenantId: ctx.tenantId,
        visitId: v.id,
        procKey: p.procKey,
        label: labels.get(p.procKey) ?? p.procKey,
        done: p.done,
        doneAt: p.done ? (p.doneAt ? new Date(p.doneAt) : new Date()) : null,
        doneBy: p.done ? ctx.userId : null,
        notes: p.notes || null,
      })),
    );
  }
  // produtos aplicados (ids estáveis vindos do aparelho)
  await tx.delete(chemicalApplications).where(and(eq(chemicalApplications.tenantId, ctx.tenantId), eq(chemicalApplications.visitId, v.id)));
  if (d.chemicals.length) {
    const ids = d.chemicals.map((c) => c.productId).filter(Boolean) as string[];
    const prods = ids.length ? await tx.select().from(products).where(and(eq(products.tenantId, ctx.tenantId), inArray(products.id, ids))) : [];
    const pm = new Map(prods.map((p) => [p.id, p]));
    await tx.insert(chemicalApplications).values(
      d.chemicals.map((c) => {
        const p = c.productId ? pm.get(c.productId) : undefined;
        return {
          id: c.id,
          tenantId: ctx.tenantId,
          visitId: v.id,
          productId: p?.id ?? null,
          productName: p?.name ?? c.productName,
          manufacturer: p?.manufacturer ?? null,
          category: p?.category ?? null,
          activeIngredient: p?.activeIngredient ?? null,
          concentration: p?.concentration ?? null,
          quantity: c.quantity,
          unit: p?.unit ?? c.unit,
          lot: c.lot || p?.lot || null,
          purpose: c.purpose || null,
          appliedAt: c.appliedAt ? new Date(c.appliedAt) : new Date(),
          appliedBy: ctx.userId,
          costCents: p?.costCentsPerUnit != null ? Math.round(p.costCentsPerUnit * c.quantity) : null,
        };
      }),
    );
  }
}

export const completeSchema = z.object({
  draft: draftSchema,
  consumeStockFor: z.array(z.string().uuid()).default([]), // aplicações cuja baixa no estoque foi confirmada
  confirmDateTime: z.boolean().refine((v) => v, "Confirme a data e o horário do atendimento."),
});

/**
 * Finaliza a visita numa única transação:
 * salva o registro, baixa o estoque confirmado, gera a conta a receber do serviço avulso,
 * emite o relatório técnico (snapshot imutável) e prepara a mensagem ao cliente.
 */
export async function completeVisit(ctx: C, id: string, input: z.input<typeof completeSchema>) {
  const d = completeSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const v = await loadVisitFor(tx, ctx, id);
    if (v.status === "completed") {
      const [rep] = await tx.select().from(technicalReports).where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.visitId, id)));
      return { alreadyCompleted: true, reportId: rep?.id, publicToken: rep?.publicToken, protocol: rep?.protocol, warnings: [] as string[] };
    }
    if (!OPEN_VISIT_STATUSES.includes(v.status)) throw new UserError("Esta visita não está em aberto.");
    await writeDraft(tx, ctx, v, d.draft);

    const meas = await tx.select().from(measurements).where(and(eq(measurements.tenantId, ctx.tenantId), eq(measurements.visitId, id)));
    const procs = await tx.select().from(visitProcedures).where(and(eq(visitProcedures.tenantId, ctx.tenantId), eq(visitProcedures.visitId, id), eq(visitProcedures.done, true)));
    if (!meas.length && !procs.length)
      throw new UserError("Registre ao menos uma medição ou um procedimento executado antes de finalizar.");

    const warnings: string[] = [];
    // baixa de estoque somente do que o profissional confirmou
    const chems = await tx.select().from(chemicalApplications).where(and(eq(chemicalApplications.tenantId, ctx.tenantId), eq(chemicalApplications.visitId, id)));
    for (const c of chems) {
      if (!c.productId || !d.consumeStockFor.includes(c.id)) continue;
      const [p] = await tx
        .update(products)
        .set({ stockQty: sql`${products.stockQty} - ${c.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, c.productId)))
        .returning();
      if (!p) continue;
      if (p.stockQty < 0) warnings.push(`Estoque de ${p.name} ficou negativo (${p.stockQty} ${p.unit}). Confira o inventário.`);
      const [mov] = await tx
        .insert(inventoryMovements)
        .values({
          tenantId: ctx.tenantId,
          productId: p.id,
          kind: "consumo_visita",
          quantity: -c.quantity,
          balanceAfter: p.stockQty,
          unitCostCents: p.costCentsPerUnit,
          lot: c.lot,
          visitId: id,
          userId: ctx.userId,
          note: `Visita ${isoDay(v.scheduledStart)}`,
        })
        .returning({ id: inventoryMovements.id });
      await tx.update(chemicalApplications).set({ stockMovementId: mov.id }).where(eq(chemicalApplications.id, c.id));
    }

    const now = new Date();
    await tx
      .update(visits)
      .set({
        status: "completed",
        completedAt: now,
        completedBy: ctx.userId,
        startedAt: v.startedAt ?? now,
        findings: d.draft.notes.findings ?? null,
        actionsTaken: d.draft.notes.actionsTaken ?? null,
        followUp: d.draft.notes.followUp ?? null,
        recommendations: d.draft.notes.recommendations ?? null,
        internalNotes: d.draft.notes.internalNotes ?? null,
        poolSafetyNote: d.draft.notes.poolSafetyNote ?? null,
        nextVisitSuggestion: d.draft.notes.nextVisitSuggestion ?? null,
        version: v.version + 1,
        updatedAt: now,
      })
      .where(eq(visits.id, id));

    // serviço avulso com valor: lança a conta a receber (uma por visita — índice único)
    if (v.priceCents && v.priceCents > 0) {
      await tx
        .insert(invoices)
        .values({
          tenantId: ctx.tenantId,
          customerId: v.customerId,
          visitId: v.id,
          kind: "avulso",
          description: `Serviço avulso — visita de ${isoDay(v.scheduledStart).split("-").reverse().join("/")}`,
          amountCents: v.priceCents,
          dueOn: addDays(isoDay(now), 7),
        })
        .onConflictDoNothing();
    }

    const report = await buildAndStoreReport(tx, ctx, id);
    await audit(tx, ctx, "visit.complete", "visit", id, { reportId: report.id, stockMovements: d.consumeStockFor.length });
    return { alreadyCompleted: false, reportId: report.id, publicToken: report.publicToken, protocol: report.protocol, warnings };
  });
}
