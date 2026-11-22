import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { systemDb, withTenant, type Tx } from "@/db";
import { leads, leadActivities, proposals, memberships, users, tenants, customers, LEAD_STAGES, type LeadStage } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { ForbiddenError, NotFoundError, UserError } from "./errors";
import { can } from "./permissions";
import { newToken } from "./crypto";
import { createCustomer } from "./customers";
import { LEAD_STAGE_LABEL } from "@/lib/domain/catalog";
import { dayStart, isoDay, localDateTime, parseMoneyToCents, money } from "@/lib/format";

type C = Pick<Ctx, "tenantId" | "userId" | "role" | "plan">;

export const OPEN_STAGES: LeadStage[] = ["new", "contacted", "qualified", "quote_sent", "negotiation"];
export const ACTIVITY_KINDS = { note: "Anotação", call: "Ligação", whatsapp: "WhatsApp", email: "E-mail", visit: "Visita / vistoria" } as const;
export const ACTIVITY_LABEL: Record<string, string> = { ...ACTIVITY_KINDS, stage: "Etapa" };
export const LEAD_SOURCES: Record<string, string> = {
  indicacao: "Indicação",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  google: "Google",
  site: "Site",
  porta: "Placa / visita na rua",
  condominio: "Condomínio atendido",
  outro: "Outro",
};
const WINDOW_DAYS = 90;

/** Permissão + recurso do plano. Vale para todas as funções internas do CRM. */
function assertCrm(ctx: C) {
  if (!can(ctx.role, "crm.use")) throw new ForbiddenError();
  if (!ctx.plan?.features.includes("crm")) throw new ForbiddenError("O CRM comercial não faz parte do seu plano. Veja as opções em Plano e assinatura.");
}

const opt = (max = 200) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const dayStr = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida");

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do contato").max(160),
  phone: opt(40),
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  city: opt(120),
  source: opt(60),
  estimatedMonthly: z
    .string()
    .optional()
    .transform((v, c) => {
      if (!v || !v.trim()) return null;
      const cents = parseMoneyToCents(v);
      if (cents == null || cents < 0) {
        c.addIssue({ code: "custom", message: "Valor inválido. Use, por exemplo, 350,00" });
        return z.NEVER;
      }
      return cents;
    }),
  ownerUserId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Responsável inválido"),
  nextFollowUp: dayStr,
  notes: z.string().trim().max(5000).optional().transform((v) => v || null),
});

async function assertMember(tx: Tx, tenantId: string, userId: string | null) {
  if (!userId) return;
  const [m] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), eq(memberships.active, true)))
    .limit(1);
  if (!m) throw new UserError("Responsável não encontrado na equipe.");
}

const followUpAt = (day: string | null) => (day ? localDateTime(day, "09:00") : null);

/* ───────────────────────────── Leitura ───────────────────────────── */

export async function listTeamOptions(ctx: C) {
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.active, true)))
      .orderBy(asc(users.name)),
  );
}

export async function getCrmMetrics(ctx: C, now = new Date()) {
  assertCrm(ctx);
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString();
  const todayStart = dayStart(isoDay(now)).toISOString();
  return withTenant(ctx.tenantId, async (tx) => {
    const [r] = await tx
      .select({
        open: sql<number>`count(*) filter (where ${leads.stage} not in ('won','lost'))::int`,
        won: sql<number>`count(*) filter (where ${leads.stage} = 'won' and ${leads.stageChangedAt} >= ${since}::timestamptz)::int`,
        lost: sql<number>`count(*) filter (where ${leads.stage} = 'lost' and ${leads.stageChangedAt} >= ${since}::timestamptz)::int`,
        pipeline: sql<number>`coalesce(sum(${leads.estimatedMonthlyCents}) filter (where ${leads.stage} not in ('won','lost')), 0)::int`,
        overdue: sql<number>`count(*) filter (where ${leads.stage} not in ('won','lost') and ${leads.nextFollowUpAt} < ${todayStart}::timestamptz)::int`,
      })
      .from(leads)
      .where(eq(leads.tenantId, ctx.tenantId));
    const decided = r.won + r.lost;
    return { ...r, conversionRate: decided ? r.won / decided : null, windowDays: WINDOW_DAYS };
  });
}

/** Quadro: leads abertos + fechados/perdidos dos últimos 90 dias. */
export async function listBoard(ctx: C, now = new Date()) {
  assertCrm(ctx);
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: leads.id,
        name: leads.name,
        city: leads.city,
        source: leads.source,
        phone: leads.phone,
        stage: leads.stage,
        estimatedMonthlyCents: leads.estimatedMonthlyCents,
        nextFollowUpAt: leads.nextFollowUpAt,
        stageChangedAt: leads.stageChangedAt,
        ownerUserId: leads.ownerUserId,
        convertedCustomerId: leads.convertedCustomerId,
        ownerName: users.name,
      })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.ownerUserId))
      .where(and(eq(leads.tenantId, ctx.tenantId), or(inArray(leads.stage, OPEN_STAGES), gte(leads.stageChangedAt, since))))
      .orderBy(asc(leads.position), desc(leads.stageChangedAt))
      .limit(1000);
    return rows;
  });
}

export async function getLead(ctx: C, id: string) {
  assertCrm(ctx);
  return withTenant(ctx.tenantId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, id))).limit(1);
    if (!lead) throw new NotFoundError("Lead não encontrado.");
    const activities = await tx
      .select({ a: leadActivities, userName: users.name })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.userId))
      .where(and(eq(leadActivities.tenantId, ctx.tenantId), eq(leadActivities.leadId, id)))
      .orderBy(desc(leadActivities.createdAt))
      .limit(200);
    const props = await tx
      .select()
      .from(proposals)
      .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.leadId, id)))
      .orderBy(desc(proposals.createdAt));
    const [owner] = lead.ownerUserId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, lead.ownerUserId)).limit(1) : [];
    const [customer] = lead.convertedCustomerId
      ? await tx
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, lead.convertedCustomerId)))
          .limit(1)
      : [];
    return {
      lead,
      ownerName: owner?.name ?? null,
      customer: customer ?? null,
      activities: activities.map((r) => ({ ...r.a, userName: r.userName })),
      proposals: props,
    };
  });
}

/* ───────────────────────────── Escrita ───────────────────────────── */

export async function createLead(ctx: C, input: z.input<typeof leadSchema>) {
  assertCrm(ctx);
  const d = leadSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    await assertMember(tx, ctx.tenantId, d.ownerUserId);
    const [row] = await tx
      .insert(leads)
      .values({
        tenantId: ctx.tenantId,
        name: d.name,
        phone: d.phone,
        email: d.email,
        city: d.city,
        source: d.source,
        estimatedMonthlyCents: d.estimatedMonthly,
        ownerUserId: d.ownerUserId,
        nextFollowUpAt: followUpAt(d.nextFollowUp),
        notes: d.notes,
        stage: "new",
      })
      .returning();
    await tx.insert(leadActivities).values({ tenantId: ctx.tenantId, leadId: row.id, kind: "stage", note: `Lead cadastrado em “${LEAD_STAGE_LABEL.new}”.`, userId: ctx.userId });
    await audit(tx, ctx, "lead.create", "lead", row.id, { name: row.name });
    return row;
  });
}

export async function updateLead(ctx: C, id: string, input: z.input<typeof leadSchema>) {
  assertCrm(ctx);
  const d = leadSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    await assertMember(tx, ctx.tenantId, d.ownerUserId);
    const [row] = await tx
      .update(leads)
      .set({
        name: d.name,
        phone: d.phone,
        email: d.email,
        city: d.city,
        source: d.source,
        estimatedMonthlyCents: d.estimatedMonthly,
        ownerUserId: d.ownerUserId,
        nextFollowUpAt: followUpAt(d.nextFollowUp),
        notes: d.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Lead não encontrado.");
    await audit(tx, ctx, "lead.update", "lead", id);
    return row;
  });
}

async function moveInTx(tx: Tx, ctx: C, id: string, stage: LeadStage, lostReason: string | null) {
  const [prev] = await tx.select().from(leads).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, id))).limit(1).for("update");
  if (!prev) throw new NotFoundError("Lead não encontrado.");
  if (prev.stage === stage) return { lead: prev, changed: false };
  const now = new Date();
  const [row] = await tx
    .update(leads)
    .set({ stage, stageChangedAt: now, lostReason: stage === "lost" ? lostReason : null, updatedAt: now })
    .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, id)))
    .returning();
  const note =
    `${LEAD_STAGE_LABEL[prev.stage]} → ${LEAD_STAGE_LABEL[stage]}` + (stage === "lost" && lostReason ? `. Motivo: ${lostReason}` : "");
  await tx.insert(leadActivities).values({ tenantId: ctx.tenantId, leadId: id, kind: "stage", note, userId: ctx.userId });
  await audit(tx, ctx, "lead.stage", "lead", id, { from: prev.stage, to: stage, ...(lostReason ? { lostReason } : {}) });
  return { lead: row, changed: true };
}

/** Muda a etapa do funil. Toda mudança grava uma atividade "stage" e atualiza stage_changed_at. */
export async function moveLead(ctx: C, id: string, stageRaw: string, lostReasonRaw?: string | null) {
  assertCrm(ctx);
  const stage = z.enum(LEAD_STAGES, { error: "Etapa inválida" }).parse(stageRaw);
  const lostReason = (lostReasonRaw ?? "").trim().slice(0, 500) || null;
  if (stage === "lost" && (!lostReason || lostReason.length < 3)) throw new UserError("Informe o motivo da perda (ex.: preço, fechou com outro, desistiu).");
  return withTenant(ctx.tenantId, (tx) => moveInTx(tx, ctx, id, stage, lostReason));
}

export const activitySchema = z.object({
  kind: z.enum(Object.keys(ACTIVITY_KINDS) as [keyof typeof ACTIVITY_KINDS, ...(keyof typeof ACTIVITY_KINDS)[]], { error: "Tipo inválido" }),
  note: z.string().trim().min(2, "Descreva o que aconteceu").max(3000),
  nextFollowUp: dayStr,
});

export async function addActivity(ctx: C, leadId: string, input: z.input<typeof activitySchema>) {
  assertCrm(ctx);
  const d = activitySchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, leadId))).limit(1);
    if (!lead) throw new NotFoundError("Lead não encontrado.");
    const [row] = await tx.insert(leadActivities).values({ tenantId: ctx.tenantId, leadId, kind: d.kind, note: d.note, userId: ctx.userId }).returning();
    await tx
      .update(leads)
      .set({ updatedAt: new Date(), ...(d.nextFollowUp ? { nextFollowUpAt: followUpAt(d.nextFollowUp) } : {}) })
      .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, leadId)));
    return row;
  });
}

/* ───────────────────────────── Orçamentos ───────────────────────────── */

export const proposalSchema = z.object({
  title: z.string().trim().min(3, "Dê um título ao orçamento").max(160),
  items: z.string().trim().min(3, "Descreva os itens e serviços").max(8000),
  total: z.string().transform((v, c) => {
    const cents = parseMoneyToCents(v);
    if (cents == null || cents <= 0) {
      c.addIssue({ code: "custom", message: "Informe o valor total (ex.: 450,00)" });
      return z.NEVER;
    }
    return cents;
  }),
  recurring: z.boolean().default(false),
  validUntil: dayStr,
});

export function proposalPublicState(p: Pick<typeof proposals.$inferSelect, "status" | "acceptedAt" | "validUntil">, today = isoDay()) {
  if (p.acceptedAt || p.status === "accepted") return "accepted" as const;
  if (p.status === "rejected") return "rejected" as const;
  if (p.validUntil && p.validUntil < today) return "expired" as const;
  return "open" as const;
}

export async function createProposal(ctx: C, leadId: string, input: z.input<typeof proposalSchema>) {
  assertCrm(ctx);
  const d = proposalSchema.parse(input);
  if (d.validUntil && d.validUntil < isoDay()) throw new UserError("A validade não pode estar no passado.");
  return withTenant(ctx.tenantId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, leadId))).limit(1);
    if (!lead) throw new NotFoundError("Lead não encontrado.");
    const [row] = await tx
      .insert(proposals)
      .values({
        tenantId: ctx.tenantId,
        leadId,
        customerId: lead.convertedCustomerId,
        title: d.title,
        items: d.items,
        totalCents: d.total,
        recurring: d.recurring,
        validUntil: d.validUntil,
        status: "sent",
        publicToken: newToken(24),
        createdBy: ctx.userId,
      })
      .returning();
    await tx.insert(leadActivities).values({
      tenantId: ctx.tenantId,
      leadId,
      kind: "note",
      note: `Orçamento criado: “${row.title}” — ${money(row.totalCents)}${row.recurring ? "/mês" : ""}.`,
      userId: ctx.userId,
    });
    // Leads ainda no começo do funil passam para "Orçamento enviado".
    if (["new", "contacted", "qualified"].includes(lead.stage)) await moveInTx(tx, ctx, leadId, "quote_sent", null);
    await audit(tx, ctx, "proposal.create", "proposal", row.id, { leadId, totalCents: row.totalCents });
    return row;
  });
}

/** Alterar um orçamento ainda não aceito gera nova versão (o aceite registra a versão vista pelo cliente). */
export async function updateProposal(ctx: C, id: string, input: z.input<typeof proposalSchema>) {
  assertCrm(ctx);
  const d = proposalSchema.parse(input);
  if (d.validUntil && d.validUntil < isoDay()) throw new UserError("A validade não pode estar no passado.");
  return withTenant(ctx.tenantId, async (tx) => {
    const [prev] = await tx.select().from(proposals).where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id))).limit(1).for("update");
    if (!prev) throw new NotFoundError("Orçamento não encontrado.");
    if (prev.acceptedAt) throw new UserError("Este orçamento já foi aceito pelo cliente e não pode ser alterado. Crie um novo.");
    const [row] = await tx
      .update(proposals)
      .set({ title: d.title, items: d.items, totalCents: d.total, recurring: d.recurring, validUntil: d.validUntil, status: "sent", version: prev.version + 1, updatedAt: new Date() })
      .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id)))
      .returning();
    if (prev.leadId)
      await tx.insert(leadActivities).values({ tenantId: ctx.tenantId, leadId: prev.leadId, kind: "note", note: `Orçamento “${row.title}” atualizado (versão ${row.version}).`, userId: ctx.userId });
    await audit(tx, ctx, "proposal.update", "proposal", id, { version: row.version });
    return row;
  });
}

/** O cliente avisou que não quer: o link público deixa de aceitar. */
export async function markProposalRejected(ctx: C, id: string) {
  assertCrm(ctx);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .update(proposals)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id), isNull(proposals.acceptedAt)))
      .returning();
    if (!row) throw new UserError("Orçamento não encontrado ou já aceito.");
    if (row.leadId) await tx.insert(leadActivities).values({ tenantId: ctx.tenantId, leadId: row.leadId, kind: "note", note: `Orçamento “${row.title}” marcado como recusado.`, userId: ctx.userId });
    await audit(tx, ctx, "proposal.reject", "proposal", id);
    return row;
  });
}

/* ───────────── Página pública do orçamento (sem login) ───────────── */

export async function getPublicProposal(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [hit] = await systemDb()
    .select({ id: proposals.id, tenantId: proposals.tenantId })
    .from(proposals)
    .where(eq(proposals.publicToken, token))
    .limit(1);
  if (!hit) return null;
  return withTenant(hit.tenantId, async (tx) => {
    const [p] = await tx.select().from(proposals).where(and(eq(proposals.tenantId, hit.tenantId), eq(proposals.id, hit.id))).limit(1);
    if (!p) return null;
    const [t] = await tx
      .select({
        name: tenants.name,
        legalName: tenants.legalName,
        document: tenants.document,
        phone: tenants.phone,
        whatsapp: tenants.whatsapp,
        email: tenants.email,
        city: tenants.city,
        state: tenants.state,
        logoKey: tenants.logoKey,
        brandColor: tenants.brandColor,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.id, hit.tenantId));
    const [lead] = p.leadId ? await tx.select({ name: leads.name }).from(leads).where(and(eq(leads.tenantId, hit.tenantId), eq(leads.id, p.leadId))).limit(1) : [];
    return { proposal: p, tenant: t, tenantId: hit.tenantId, clientName: lead?.name ?? null, state: proposalPublicState(p) };
  });
}

/**
 * Aceite eletrônico: registra nome digitado, data/hora, IP, navegador e versão do orçamento.
 * Não é assinatura digital qualificada (ICP-Brasil).
 */
export async function acceptProposal(token: string, input: { name: string; version: number; ip: string; userAgent: string }) {
  const name = (input.name || "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (name.length < 5 || name.split(" ").length < 2) throw new UserError("Digite seu nome completo (nome e sobrenome) para registrar o aceite.");
  const pub = await getPublicProposal(token);
  if (!pub) throw new NotFoundError("Orçamento não encontrado.");
  if (pub.tenant?.status === "suspended") throw new UserError("Este orçamento não está disponível no momento.");
  if (pub.state === "accepted") throw new UserError("Este orçamento já foi aceito.");
  if (pub.state === "rejected") throw new UserError("Este orçamento não está mais disponível. Fale com a empresa.");
  if (pub.state === "expired") throw new UserError("Este orçamento passou da validade. Peça uma versão atualizada à empresa.");
  if (Number(input.version) !== pub.proposal.version) throw new UserError("O orçamento foi atualizado enquanto você lia. Recarregue a página para ver a versão mais recente.");
  return withTenant(pub.tenantId, async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(proposals)
      .set({
        status: "accepted",
        acceptedAt: now,
        acceptedName: name,
        acceptedIp: input.ip.slice(0, 80),
        acceptedUserAgent: input.userAgent.slice(0, 400),
        updatedAt: now,
      })
      .where(and(eq(proposals.tenantId, pub.tenantId), eq(proposals.id, pub.proposal.id), isNull(proposals.acceptedAt), eq(proposals.version, pub.proposal.version)))
      .returning();
    if (!row) throw new UserError("Não foi possível registrar: o orçamento mudou ou já foi aceito. Recarregue a página.");
    if (row.leadId)
      await tx.insert(leadActivities).values({
        tenantId: pub.tenantId,
        leadId: row.leadId,
        kind: "note",
        note: `Cliente aceitou o orçamento “${row.title}” (versão ${row.version}) pelo link público. Nome digitado: ${name}.`,
        userId: null,
      });
    await audit(tx, { tenantId: pub.tenantId, userId: null }, "proposal.accept", "proposal", row.id, { name, ip: row.acceptedIp, version: row.version });
    return row;
  });
}

/* ───────────── Conversão em cliente ───────────── */

export async function convertLead(ctx: C, id: string) {
  assertCrm(ctx);
  if (!can(ctx.role, "customers.write")) throw new ForbiddenError("Você não tem permissão para cadastrar clientes.");
  // Trava a linha do lead enquanto o cliente é criado: dois cliques não geram dois clientes.
  return withTenant(ctx.tenantId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, id))).limit(1).for("update");
    if (!lead) throw new NotFoundError("Lead não encontrado.");
    if (lead.stage !== "won") throw new UserError("Só leads na etapa “Fechado” podem virar cliente.");
    if (lead.convertedCustomerId) throw new UserError("Este lead já foi convertido em cliente.");
    const customer = await createCustomer(ctx, {
      name: lead.name,
      phone: lead.phone ?? undefined,
      whatsapp: lead.phone ?? undefined,
      email: lead.email ?? undefined,
      city: lead.city ?? undefined,
      source: lead.source ? LEAD_SOURCES[lead.source] ?? lead.source : "CRM",
      internalNotes: lead.notes ?? undefined,
    });
    await tx.update(leads).set({ convertedCustomerId: customer.id, updatedAt: new Date() }).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, id)));
    await tx
      .update(proposals)
      .set({ customerId: customer.id, updatedAt: new Date() })
      .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.leadId, id)));
    await tx.insert(leadActivities).values({ tenantId: ctx.tenantId, leadId: id, kind: "note", note: `Convertido em cliente: ${customer.name}.`, userId: ctx.userId });
    await audit(tx, ctx, "lead.convert", "lead", id, { customerId: customer.id });
    return customer;
  });
}

