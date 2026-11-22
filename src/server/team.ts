import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { systemDb, withTenant, type Tx } from "@/db";
import { users, memberships, auditLogs, sessions, ROLES, type Role } from "@/db/schema";
import type { Ctx } from "./auth";
import { hashPassword, validatePassword } from "./auth";
import { audit } from "./audit";
import { ForbiddenError, NotFoundError, UserError } from "./errors";
import { can, ROLE_LABEL } from "./permissions";
import { isoMonth, TZ_OFFSET } from "@/lib/format";

type C = Pick<Ctx, "tenantId" | "userId" | "role" | "plan">;

function assertManage(ctx: C) {
  if (!can(ctx.role, "team.manage")) throw new ForbiddenError();
}

/** Senha provisória legível (sem 0/O/1/l), sempre com letras e números. */
export function tempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 10) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function monthBounds(now = new Date()) {
  const m = isoMonth(now);
  const start = new Date(`${m}-01T00:00:00${TZ_OFFSET}`);
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { start, end: new Date(`${next}-01T00:00:00${TZ_OFFSET}`), label: m };
}

/** Lista da equipe + produtividade do mês corrente (visitas atribuídas a cada pessoa). */
export async function listMembers(ctx: C, now = new Date()) {
  assertManage(ctx);
  const b = monthBounds(now);
  const start = b.start.toISOString();
  const end = b.end.toISOString();
  const nowIso = now.toISOString();
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({
        membershipId: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        jobTitle: memberships.jobTitle,
        active: memberships.active,
        createdAt: memberships.createdAt,
        lastLoginAt: users.lastLoginAt,
        mustChangePassword: users.mustChangePassword,
        completed: sql<number>`(select count(*)::int from visits v where v.tenant_id = ${memberships.tenantId} and v.assigned_user_id = ${memberships.userId} and v.status = 'completed' and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz)`,
        due: sql<number>`(select count(*)::int from visits v where v.tenant_id = ${memberships.tenantId} and v.assigned_user_id = ${memberships.userId} and v.scheduled_start >= ${start}::timestamptz and v.scheduled_start < least(${end}::timestamptz, ${nowIso}::timestamptz) and v.status not in ('cancelled','rescheduled'))`,
        dueDone: sql<number>`(select count(*)::int from visits v where v.tenant_id = ${memberships.tenantId} and v.assigned_user_id = ${memberships.userId} and v.scheduled_start >= ${start}::timestamptz and v.scheduled_start < least(${end}::timestamptz, ${nowIso}::timestamptz) and v.status = 'completed')`,
        avgMin: sql<number | null>`(select round(avg(extract(epoch from (v.completed_at - v.started_at)) / 60))::int from visits v where v.tenant_id = ${memberships.tenantId} and v.assigned_user_id = ${memberships.userId} and v.status = 'completed' and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz and v.started_at is not null and v.completed_at > v.started_at)`,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, ctx.tenantId))
      .orderBy(desc(memberships.active), asc(users.name));
    return rows.map((r) => ({ ...r, completionRate: r.due ? r.dueDone / r.due : null }));
  });
}

async function activeCount(tx: Tx, tenantId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.active, true)));
  return n;
}

function limitMessage(max: number) {
  return `Seu plano permite ${max} usuário${max === 1 ? "" : "s"} ativo${max === 1 ? "" : "s"}. Desative alguém ou faça upgrade em Plano e assinatura (/app/plano).`;
}

async function assertSeat(tx: Tx, ctx: C) {
  const max = ctx.plan?.maxUsers;
  if (max == null) return;
  if ((await activeCount(tx, ctx.tenantId)) >= max) throw new UserError(limitMessage(max));
}

export const memberSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(ROLES, { error: "Escolha o papel" }),
  jobTitle: z.string().trim().max(80).optional().transform((v) => v || null),
});

/**
 * Cadastra alguém na equipe. Se o e-mail ainda não existe, cria o usuário com senha provisória
 * (mostrada uma única vez ao responsável) e troca obrigatória no primeiro acesso.
 * Usuário + vínculo são gravados numa transação só; o vínculo é inserido sob RLS da empresa.
 */
export async function createMember(ctx: C, input: z.input<typeof memberSchema>) {
  assertManage(ctx);
  const d = memberSchema.parse(input);
  if (d.role === "owner" && ctx.role !== "owner") throw new ForbiddenError("Só um proprietário pode cadastrar outro proprietário.");
  const db = systemDb();
  const [existing] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, d.email)).limit(1);
  const password = existing ? null : tempPassword();
  const passwordHash = password ? await hashPassword(password) : null;

  return db.transaction(async (tx) => {
    // Serializa cadastros da mesma empresa: o limite do plano não estoura com cliques simultâneos.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"team:" + ctx.tenantId}))`);
    let userId = existing?.id;
    if (!userId) {
      const [u] = await tx.insert(users).values({ email: d.email, name: d.name, passwordHash: passwordHash!, mustChangePassword: true }).returning({ id: users.id });
      userId = u.id;
    }
    // Daqui em diante, tudo sob o papel da aplicação e o tenant da empresa (RLS).
    await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    await tx.execute(sql`set local role ondaro_app`);
    const [dupe] = await tx
      .select({ id: memberships.id, active: memberships.active })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, userId)))
      .limit(1);
    if (dupe) throw new UserError(dupe.active ? "Essa pessoa já faz parte da equipe." : "Essa pessoa já fez parte da equipe e está desativada. Reative o acesso na lista.");
    await assertSeat(tx, ctx);
    const [m] = await tx.insert(memberships).values({ tenantId: ctx.tenantId, userId, role: d.role, jobTitle: d.jobTitle }).returning();
    await audit(tx, ctx, "member.create", "membership", m.id, { email: d.email, role: d.role, newUser: !existing });
    return { membership: m, tempPassword: password, existingUser: !!existing, name: existing?.name ?? d.name, email: d.email };
  });
}

async function getMembership(tx: Tx, ctx: C, membershipId: string) {
  const [m] = await tx.select().from(memberships).where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.id, membershipId))).limit(1).for("update");
  if (!m) throw new NotFoundError("Pessoa não encontrada na equipe.");
  return m;
}

async function activeOwners(tx: Tx, tenantId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner"), eq(memberships.active, true)));
  return n;
}

export async function updateMember(ctx: C, membershipId: string, input: { role: string; jobTitle?: string | null }) {
  assertManage(ctx);
  const role = z.enum(ROLES, { error: "Papel inválido" }).parse(input.role) as Role;
  const jobTitle = (input.jobTitle ?? "").trim().slice(0, 80) || null;
  return withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"team:" + ctx.tenantId}))`);
    const m = await getMembership(tx, ctx, membershipId);
    if ((m.role === "owner" || role === "owner") && ctx.role !== "owner" && m.role !== role)
      throw new ForbiddenError("Só um proprietário pode dar ou retirar o papel de proprietário.");
    if (m.role === "owner" && role !== "owner" && m.active && (await activeOwners(tx, ctx.tenantId)) <= 1)
      throw new UserError("A empresa precisa de pelo menos um proprietário ativo. Promova outra pessoa antes de mudar este papel.");
    const [row] = await tx
      .update(memberships)
      .set({ role, jobTitle, updatedAt: new Date() })
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.id, membershipId)))
      .returning();
    if (m.role !== role) await audit(tx, ctx, "member.role", "membership", membershipId, { from: m.role, to: role });
    else if (m.jobTitle !== jobTitle) await audit(tx, ctx, "member.update", "membership", membershipId, { jobTitle });
    return row;
  });
}

/**
 * Desativa/reativa o acesso. Nada é apagado: visitas e registros continuam ligados à pessoa.
 * A sessão deixa de valer na hora (getCtx exige vínculo ativo) e as sessões abertas são revogadas.
 */
export async function setMemberActive(ctx: C, membershipId: string, active: boolean) {
  assertManage(ctx);
  const res = await withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"team:" + ctx.tenantId}))`);
    const m = await getMembership(tx, ctx, membershipId);
    if (m.active === active) return m;
    if (!active) {
      if (m.userId === ctx.userId) throw new UserError("Você não pode desativar o seu próprio acesso.");
      if (m.role === "owner" && ctx.role !== "owner") throw new ForbiddenError("Só um proprietário pode desativar outro proprietário.");
      if (m.role === "owner" && (await activeOwners(tx, ctx.tenantId)) <= 1) throw new UserError("A empresa precisa de pelo menos um proprietário ativo.");
    } else {
      await assertSeat(tx, ctx);
    }
    const [row] = await tx
      .update(memberships)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.id, membershipId)))
      .returning();
    await audit(tx, ctx, active ? "member.reactivate" : "member.deactivate", "membership", membershipId);
    return row;
  });
  if (!active) {
    await systemDb()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, res.userId), eq(sessions.tenantId, ctx.tenantId), isNull(sessions.revokedAt)));
  }
  return res;
}

/**
 * Nova senha provisória para alguém da equipe (sem e-mail configurado, é o caminho de recuperação).
 * Só para usuários que pertencem apenas a esta empresa — não mexemos em contas usadas em outras empresas.
 */
export async function resetMemberPassword(ctx: C, membershipId: string) {
  assertManage(ctx);
  const m = await withTenant(ctx.tenantId, async (tx) => {
    const row = await getMembership(tx, ctx, membershipId);
    if (row.userId === ctx.userId) throw new UserError("Para trocar a sua própria senha, use “Esqueci a senha” na tela de entrada.");
    if (row.role === "owner" && ctx.role !== "owner") throw new ForbiddenError("Só um proprietário pode redefinir a senha de outro proprietário.");
    return row;
  });
  const db = systemDb();
  const [other] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, m.userId), ne(memberships.tenantId, ctx.tenantId)))
    .limit(1);
  if (other) throw new UserError("Esta pessoa usa a mesma conta em outra empresa. Peça que ela use “Esqueci a senha”.");
  const password = tempPassword();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, m.userId));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, m.userId), isNull(sessions.revokedAt)));
  });
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, "member.password_reset", "membership", membershipId));
  return password;
}

/** Últimos registros da trilha de auditoria da empresa. */
export async function listAudit(ctx: C, limit = 100) {
  if (!can(ctx.role, "audit.read")) throw new ForbiddenError();
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, data: auditLogs.data, createdAt: auditLogs.createdAt, userName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(eq(auditLogs.tenantId, ctx.tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(500, limit)),
  );
}

/** Troca de senha do próprio usuário (obrigatória após senha provisória). Mantém só a sessão atual. */
export async function changeOwnPassword(userId: string, currentSessionId: string, password: string, confirm: string) {
  if (password !== confirm) throw new UserError("As senhas não conferem.");
  validatePassword(password);
  const db = systemDb();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, currentSessionId)));
  });
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "customer.create": "Cadastrou cliente",
  "customer.update": "Alterou cliente",
  "customer.portal_link": "Gerou link do portal",
  "pool.create": "Cadastrou piscina",
  "pool.update": "Alterou piscina",
  "pool.activate": "Reativou piscina",
  "pool.deactivate": "Desativou piscina",
  "lead.create": "Cadastrou lead",
  "lead.update": "Alterou lead",
  "lead.stage": "Mudou etapa do lead",
  "lead.convert": "Converteu lead em cliente",
  "proposal.create": "Criou orçamento",
  "proposal.update": "Alterou orçamento",
  "proposal.reject": "Marcou orçamento como recusado",
  "proposal.accept": "Orçamento aceito pelo cliente",
  "member.create": "Cadastrou pessoa na equipe",
  "member.role": "Mudou papel na equipe",
  "member.update": "Alterou dados da equipe",
  "member.deactivate": "Desativou acesso",
  "member.reactivate": "Reativou acesso",
  "member.password_reset": "Gerou senha provisória",
  "billing.plan_change_requested": "Solicitou mudança de plano",
  "data.export": "Exportou os dados da empresa",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  customer: "Cliente",
  pool: "Piscina",
  visit: "Visita",
  report: "Relatório",
  invoice: "Cobrança",
  lead: "Lead",
  proposal: "Orçamento",
  membership: "Equipe",
  tenant: "Empresa",
  product: "Produto",
  contract: "Contrato",
};

export { ROLE_LABEL };
