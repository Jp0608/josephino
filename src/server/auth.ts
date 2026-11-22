import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql, desc } from "drizzle-orm";
import { systemDb } from "@/db";
import { users, sessions, memberships, tenants, plans, authAttempts, passwordResets, type Role } from "@/db/schema";
import { newToken, sha256 } from "./crypto";
import { can, type Permission } from "./permissions";
import { ForbiddenError, UserError } from "./errors";

export const SESSION_COOKIE = "ondaro_sid";
const SESSION_DAYS = 30;

export type Subscription = {
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "trial_expired";
  trialDaysLeft: number | null;
  /** Escrita bloqueada (teste vencido, suspensa, cancelada). Leitura e exportação continuam. */
  readOnly: boolean;
  /** Acesso totalmente bloqueado (suspensão administrativa). */
  blocked: boolean;
};

export type Ctx = {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  membershipId: string;
  tenantId: string;
  tenant: typeof tenants.$inferSelect;
  plan: typeof plans.$inferSelect | null;
  subscription: Subscription;
  isPlatformAdmin: boolean;
};

export function platformAdmins() {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function computeSubscription(t: { status: string; trialEndsAt: Date | null }, now = new Date()): Subscription {
  if (t.status === "suspended") return { status: "suspended", trialDaysLeft: null, readOnly: true, blocked: true };
  if (t.status === "cancelled") return { status: "cancelled", trialDaysLeft: null, readOnly: true, blocked: false };
  if (t.status === "trialing") {
    const ms = (t.trialEndsAt?.getTime() ?? 0) - now.getTime();
    if (ms <= 0) return { status: "trial_expired", trialDaysLeft: 0, readOnly: true, blocked: false };
    return { status: "trialing", trialDaysLeft: Math.ceil(ms / 86400000), readOnly: false, blocked: false };
  }
  // past_due: bloqueio gradual — continua operando, com aviso, até a suspensão.
  return { status: t.status as Subscription["status"], trialDaysLeft: null, readOnly: false, blocked: false };
}

/* ───────────── rate limiting (persistido no banco: vale para todas as instâncias) ───────────── */

export async function rateLimit(key: string, max: number, windowMin: number) {
  const db = systemDb();
  const since = new Date(Date.now() - windowMin * 60000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(authAttempts)
    .where(and(eq(authAttempts.key, key), gt(authAttempts.createdAt, since)));
  if (n >= max) throw new UserError("Muitas tentativas. Aguarde alguns minutos e tente de novo.", "rate_limited");
  await db.insert(authAttempts).values({ key });
}

async function clientInfo() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local",
    ua: (h.get("user-agent") || "").slice(0, 300),
  };
}

/* ───────────── senha ───────────── */

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export function validatePassword(pw: string) {
  if (pw.length < 8) throw new UserError("A senha precisa ter pelo menos 8 caracteres.");
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw new UserError("Use letras e números na senha.");
}

/* ───────────── sessão ───────────── */

export async function createSession(userId: string, tenantId: string | null) {
  const token = newToken(32);
  const { ip, ua } = await clientInfo();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await systemDb().insert(sessions).values({ tokenHash: sha256(token), userId, tenantId, ip, userAgent: ua, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await systemDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function login(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await clientInfo();
  await rateLimit(`login:${email}`, 8, 15);
  await rateLimit(`login-ip:${ip}`, 30, 15);
  const db = systemDb();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Compara mesmo sem usuário para não revelar quais e-mails existem pelo tempo de resposta.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? "$2b$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!u || !ok) throw new UserError("E-mail ou senha incorretos.");
  const [m] = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(and(eq(memberships.userId, u.id), eq(memberships.active, true)))
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  if (!m && !platformAdmins().includes(email)) throw new UserError("Seu acesso foi desativado. Fale com o responsável da empresa.");
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await createSession(u.id, m?.tenantId ?? null);
  return { userId: u.id, tenantId: m?.tenantId ?? null };
}

/** Lê a sessão do cookie e monta o contexto. Uma consulta por requisição (cache do React). */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = systemDb();
  const now = new Date();
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  const isPlatformAdmin = platformAdmins().includes(row.u.email);
  if (!row.s.tenantId) {
    if (!isPlatformAdmin) return null;
    return {
      sessionId: row.s.id, userId: row.u.id, name: row.u.name, email: row.u.email, role: "owner", membershipId: "",
      tenantId: "", tenant: null as never, plan: null,
      subscription: { status: "active", trialDaysLeft: null, readOnly: true, blocked: false }, isPlatformAdmin,
    };
  }
  const [m] = await db
    .select({ m: memberships, t: tenants, p: plans })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(and(eq(memberships.userId, row.u.id), eq(memberships.tenantId, row.s.tenantId), eq(memberships.active, true)))
    .limit(1);
  if (!m) return null; // acesso revogado: a sessão deixa de valer na hora
  if (now.getTime() - row.s.lastSeenAt.getTime() > 5 * 60000) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.s.id));
  }
  return {
    sessionId: row.s.id,
    userId: row.u.id,
    name: row.u.name,
    email: row.u.email,
    role: m.m.role,
    membershipId: m.m.id,
    tenantId: m.t.id,
    tenant: m.t,
    plan: m.p,
    subscription: computeSubscription(m.t, now),
    isPlatformAdmin,
  };
});

/** Exige login (e, opcionalmente, uma permissão). Para páginas: redireciona. */
export async function requireCtx(perm?: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.tenantId) redirect("/admin");
  if (ctx.subscription.blocked) redirect("/conta-suspensa");
  if (perm && !can(ctx.role, perm)) redirect("/app?sem-permissao=1");
  return ctx;
}

/** Para ações/APIs: lança erro em vez de redirecionar. `write` respeita o modo somente-leitura. */
export async function actionCtx(perm?: Permission, opts: { write?: boolean } = { write: true }): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx || !ctx.tenantId) throw new ForbiddenError("Sua sessão expirou. Entre novamente.");
  if (ctx.subscription.blocked) throw new ForbiddenError("Conta suspensa.");
  if (opts.write !== false && ctx.subscription.readOnly)
    throw new ForbiddenError("Seu período de teste terminou. Escolha um plano para voltar a registrar dados — nada foi apagado.");
  if (perm && !can(ctx.role, perm)) throw new ForbiddenError();
  return ctx;
}

export function hasFeature(ctx: Pick<Ctx, "plan">, feature: string) {
  return !!ctx.plan?.features.includes(feature);
}

/* ───────────── recuperação de senha ───────────── */

export async function createPasswordReset(emailRaw: string): Promise<{ token: string; userId: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  await rateLimit(`reset:${email}`, 3, 30);
  const db = systemDb();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) return null;
  const token = newToken(32);
  await db.insert(passwordResets).values({ userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60000) });
  return { token, userId: u.id };
}

export async function consumePasswordReset(token: string, newPassword: string) {
  validatePassword(newPassword);
  const db = systemDb();
  const [r] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!r) throw new UserError("Link inválido ou expirado. Peça um novo.");
  await db.transaction(async (tx) => {
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
    await tx.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, r.userId));
    // Troca de senha derruba todas as sessões abertas.
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, r.userId), isNull(sessions.revokedAt)));
  });
}
