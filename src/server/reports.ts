import "server-only";
import { and, asc, desc, eq, sql, isNull } from "drizzle-orm";
import { systemDb, withTenant, type Tx } from "@/db";
import {
  tenants,
  visits,
  pools,
  customers,
  users,
  measurements,
  visitChecklist,
  visitProcedures,
  chemicalApplications,
  photos,
  technicalReports,
  messageLogs,
} from "@/db/schema";
import type { Ctx } from "./auth";
import { newToken } from "./crypto";
import { customerAddress } from "./customers";
import { NotFoundError, UserError } from "./errors";
import { audit } from "./audit";
import { SERVICE_TYPES, POOL_USAGE } from "@/lib/domain/catalog";
import { date, time, waLink } from "@/lib/format";
import { whatsappConfigured, sendWhatsAppText } from "./integrations";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

export type ReportSnapshot = {
  version: 1;
  protocol: string;
  issuedAt: string;
  company: { name: string; legalName: string | null; document: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; brandColor: string; hasLogo: boolean; footer: string | null };
  customer: { name: string; address: string };
  pool: { name: string; code: string; usage: string; volumeLiters: number | null; volumeIsEstimated: boolean };
  visit: { scheduledStart: string; startedAt: string | null; completedAt: string; serviceType: string; technician: string | null };
  measurements: { label: string; value: number | null; unit: string; rangeMin: number | null; rangeMax: number | null; status: string; method: string | null; measuredAt: string }[];
  inspection: { label: string; state: string; comment: string | null }[];
  procedures: { label: string; notes: string | null; doneAt: string | null }[];
  products: { name: string; purpose: string | null; quantity: number; unit: string; lot: string | null }[];
  photos: { id: string; kind: string; caption: string | null }[];
  findings: string | null;
  actionsTaken: string | null;
  followUp: string | null;
  recommendations: string | null;
  safetyNote: string | null;
  nextVisit: string | null;
  responsible: { name: string | null };
};

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3100").replace(/\/$/, "");
}

export function reportMessage(s: Pick<ReportSnapshot, "company" | "customer" | "pool" | "visit">, url: string) {
  const first = s.customer.name.split(" ")[0];
  return `Olá, ${first}! Aqui é da ${s.company.name}. O atendimento da ${s.pool.name} foi concluído em ${date(s.visit.completedAt)} às ${time(s.visit.completedAt)}. Relatório técnico completo: ${url}`;
}

/** Monta o snapshot do relatório e grava (dentro da transação de finalização). */
export async function buildAndStoreReport(tx: Tx, ctx: C, visitId: string) {
  const [existing] = await tx.select().from(technicalReports).where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.visitId, visitId)));
  if (existing) return existing;
  const [v] = await tx.select().from(visits).where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.id, visitId)));
  const [pool] = await tx.select().from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, v.poolId)));
  const [cust] = await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, v.customerId)));
  const responsibleId = v.completedBy ?? v.assignedUserId;
  const [resp] = responsibleId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, responsibleId)) : [];
  const [tech] = v.assignedUserId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, v.assignedUserId)) : [];
  const [t] = await tx.update(tenants).set({ reportSeq: sql`${tenants.reportSeq} + 1` }).where(eq(tenants.id, ctx.tenantId)).returning();
  const meas = await tx.select().from(measurements).where(and(eq(measurements.tenantId, ctx.tenantId), eq(measurements.visitId, visitId)));
  const ck = await tx.select().from(visitChecklist).where(and(eq(visitChecklist.tenantId, ctx.tenantId), eq(visitChecklist.visitId, visitId)));
  const procs = await tx
    .select()
    .from(visitProcedures)
    .where(and(eq(visitProcedures.tenantId, ctx.tenantId), eq(visitProcedures.visitId, visitId), eq(visitProcedures.done, true)))
    .orderBy(asc(visitProcedures.doneAt));
  const chems = await tx.select().from(chemicalApplications).where(and(eq(chemicalApplications.tenantId, ctx.tenantId), eq(chemicalApplications.visitId, visitId))).orderBy(asc(chemicalApplications.appliedAt));
  const ph = await tx
    .select()
    .from(photos)
    .where(and(eq(photos.tenantId, ctx.tenantId), eq(photos.visitId, visitId), eq(photos.showInReport, true)))
    .orderBy(asc(photos.createdAt));
  const issuedAt = new Date();
  const protocol = `REL-${issuedAt.getFullYear()}-${String(t.reportSeq).padStart(6, "0")}`;
  const snapshot: ReportSnapshot = {
    version: 1,
    protocol,
    issuedAt: issuedAt.toISOString(),
    company: {
      name: t.name,
      legalName: t.legalName,
      document: t.document,
      phone: t.phone,
      whatsapp: t.whatsapp,
      email: t.email,
      address: [t.address, [t.city, t.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ") || null,
      brandColor: t.brandColor,
      hasLogo: !!t.logoKey,
      footer: t.reportFooter,
    },
    customer: { name: cust.name, address: pool.address || customerAddress(cust) },
    pool: { name: pool.name, code: pool.code, usage: POOL_USAGE[pool.usage] ?? pool.usage, volumeLiters: pool.volumeLiters, volumeIsEstimated: pool.volumeIsEstimated },
    visit: {
      scheduledStart: v.scheduledStart.toISOString(),
      startedAt: v.startedAt?.toISOString() ?? null,
      completedAt: (v.completedAt ?? issuedAt).toISOString(),
      serviceType: SERVICE_TYPES[v.serviceType] ?? v.serviceType,
      technician: tech?.name ?? null,
    },
    measurements: meas.map((m) => ({
      label: m.label,
      value: m.value,
      unit: m.unit,
      rangeMin: m.rangeMin,
      rangeMax: m.rangeMax,
      status: m.status,
      method: m.method,
      measuredAt: m.measuredAt.toISOString(),
    })),
    inspection: ck.filter((c) => c.state !== "not_checked").map((c) => ({ label: c.label, state: c.state, comment: c.comment })),
    procedures: procs.map((p) => ({ label: p.label, notes: p.notes, doneAt: p.doneAt?.toISOString() ?? null })),
    products: chems.map((c) => ({ name: c.productName, purpose: c.purpose, quantity: c.quantity, unit: c.unit, lot: c.lot })),
    photos: ph.map((p) => ({ id: p.id, kind: p.kind, caption: p.caption })),
    findings: v.findings,
    actionsTaken: v.actionsTaken,
    followUp: v.followUp,
    recommendations: v.recommendations,
    safetyNote: v.poolSafetyNote,
    nextVisit: v.nextVisitSuggestion,
    responsible: { name: resp?.name ?? null },
  };
  // próxima visita agendada de fato tem prioridade sobre a sugestão
  const [next] = await tx
    .select({ s: visits.scheduledStart })
    .from(visits)
    .where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.poolId, v.poolId), sql`${visits.status} in ('scheduled','confirmed')`, sql`${visits.scheduledStart} > now()`))
    .orderBy(asc(visits.scheduledStart))
    .limit(1);
  if (next) snapshot.nextVisit = next.s.toISOString();

  const [rep] = await tx
    .insert(technicalReports)
    .values({ tenantId: ctx.tenantId, visitId, poolId: v.poolId, customerId: v.customerId, protocol, publicToken: newToken(24), snapshot })
    .returning();
  const url = `${appUrl()}/r/${rep.publicToken}`;
  const to = cust.whatsapp || cust.phone;
  // Mensagem preparada. Só é enviada automaticamente com a integração oficial conectada e consentimento do cliente.
  await tx.insert(messageLogs).values({
    tenantId: ctx.tenantId,
    channel: "whatsapp",
    toAddress: to,
    template: "report_ready",
    body: reportMessage(snapshot, url),
    status: whatsappConfigured() && cust.whatsappConsent && to ? "queued" : "pending_integration",
    customerId: cust.id,
    visitId,
    reportId: rep.id,
    createdBy: ctx.userId,
  });
  return rep;
}

/** Envia as mensagens "queued" pela API oficial. Status "sent" só com confirmação (id) do provedor. */
export async function flushQueuedMessages(tenantId: string) {
  if (!whatsappConfigured()) return { sent: 0 };
  const queued = await withTenant(tenantId, (tx) =>
    tx.select().from(messageLogs).where(and(eq(messageLogs.tenantId, tenantId), eq(messageLogs.status, "queued"))).limit(20),
  );
  let sent = 0;
  for (const m of queued) {
    const r = await sendWhatsAppText(m.toAddress || "", m.body);
    await withTenant(tenantId, (tx) =>
      tx
        .update(messageLogs)
        .set(r.ok ? { status: "sent", providerRef: r.id, sentAt: new Date(), error: null } : { status: "failed", error: r.error })
        .where(eq(messageLogs.id, m.id)),
    );
    if (r.ok) sent++;
  }
  return { sent };
}

export async function getReport(ctx: C, id: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [r] = await tx.select().from(technicalReports).where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.id, id)));
    if (!r) throw new NotFoundError("Relatório não encontrado.");
    const msgs = await tx.select().from(messageLogs).where(and(eq(messageLogs.tenantId, ctx.tenantId), eq(messageLogs.reportId, id))).orderBy(desc(messageLogs.createdAt));
    const [cust] = await tx.select({ whatsapp: customers.whatsapp, phone: customers.phone, email: customers.email, consent: customers.whatsappConsent }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.id, r.customerId)));
    const snap = r.snapshot as ReportSnapshot;
    const url = `${appUrl()}/r/${r.publicToken}`;
    const phone = cust?.whatsapp || cust?.phone || null;
    return { report: r, snapshot: snap, messages: msgs, url, phone, email: cust?.email ?? null, waUrl: phone ? waLink(phone, reportMessage(snap, url)) : null };
  });
}

export async function listReports(ctx: C, opts: { page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: technicalReports.id,
        protocol: technicalReports.protocol,
        createdAt: technicalReports.createdAt,
        viewCount: technicalReports.viewCount,
        acknowledgedAt: technicalReports.acknowledgedAt,
        customerName: customers.name,
        poolName: pools.name,
        sentStatus: sql<string | null>`(select m.status from message_logs m where m.tenant_id = ${technicalReports.tenantId} and m.report_id = ${technicalReports.id} order by m.created_at desc limit 1)`,
      })
      .from(technicalReports)
      .innerJoin(customers, and(eq(customers.tenantId, technicalReports.tenantId), eq(customers.id, technicalReports.customerId)))
      .innerJoin(pools, and(eq(pools.tenantId, technicalReports.tenantId), eq(pools.id, technicalReports.poolId)))
      .where(eq(technicalReports.tenantId, ctx.tenantId))
      .orderBy(desc(technicalReports.createdAt))
      .limit(40)
      .offset((page - 1) * 40);
    return rows;
  });
}

/** Registra que o profissional enviou o link pelo próprio WhatsApp (não confirmamos entrega). */
export async function logManualSend(ctx: C, reportId: string, channel: "whatsapp" | "email" | "link") {
  return withTenant(ctx.tenantId, async (tx) => {
    const [r] = await tx.select().from(technicalReports).where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.id, reportId)));
    if (!r) throw new NotFoundError();
    const snap = r.snapshot as ReportSnapshot;
    const url = `${appUrl()}/r/${r.publicToken}`;
    await tx
      .update(messageLogs)
      .set({ status: "manual", sentAt: new Date() })
      .where(and(eq(messageLogs.tenantId, ctx.tenantId), eq(messageLogs.reportId, reportId), eq(messageLogs.status, "pending_integration")));
    await tx.insert(messageLogs).values({
      tenantId: ctx.tenantId,
      channel,
      template: "report_ready",
      body: reportMessage(snap, url),
      status: "manual",
      customerId: r.customerId,
      visitId: r.visitId,
      reportId,
      createdBy: ctx.userId,
      sentAt: new Date(),
    });
    await audit(tx, ctx, "report.share", "technical_report", reportId, { channel });
  });
}

export async function revokeReportLink(ctx: C, reportId: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const token = newToken(24);
    await tx.update(technicalReports).set({ publicToken: token }).where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.id, reportId)));
    await audit(tx, ctx, "report.rotate_link", "technical_report", reportId);
  });
}

/* ───────────── acesso público por token (sem login) ───────────── */

/** Resolve o token para a empresa com a conexão do sistema e depois lê já presa ao tenant. */
export async function getPublicReport(token: string, opts: { countView?: boolean } = {}) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [hit] = await systemDb()
    .select({ id: technicalReports.id, tenantId: technicalReports.tenantId })
    .from(technicalReports)
    .where(and(eq(technicalReports.publicToken, token), isNull(technicalReports.revokedAt)))
    .limit(1);
  if (!hit) return null;
  return withTenant(hit.tenantId, async (tx) => {
    const [r] = opts.countView
      ? await tx
          .update(technicalReports)
          .set({ viewCount: sql`${technicalReports.viewCount} + 1`, lastViewedAt: new Date() })
          .where(eq(technicalReports.id, hit.id))
          .returning()
      : await tx.select().from(technicalReports).where(eq(technicalReports.id, hit.id));
    const [t] = await tx.select({ logoKey: tenants.logoKey, slug: tenants.slug }).from(tenants).where(eq(tenants.id, hit.tenantId));
    return { report: r, snapshot: r.snapshot as ReportSnapshot, tenantId: hit.tenantId, logoKey: t?.logoKey ?? null };
  });
}

/** Aceite/ciência do cliente: registra nome, data, IP e versão — não é assinatura qualificada. */
export async function acknowledgeReport(token: string, name: string, ip: string) {
  const clean = name.trim().slice(0, 120);
  if (clean.length < 3) throw new UserError("Digite seu nome completo para registrar a ciência.");
  const pub = await getPublicReport(token);
  if (!pub) throw new NotFoundError();
  if (pub.report.acknowledgedAt) return;
  await withTenant(pub.tenantId, (tx) =>
    tx.update(technicalReports).set({ acknowledgedAt: new Date(), acknowledgedName: clean, acknowledgedIp: ip }).where(eq(technicalReports.id, pub.report.id)),
  );
}
