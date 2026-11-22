import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { memberships, sessions, users, visits } from "@/db/schema";
import { createMember, updateMember, setMemberActive, listMembers, listAudit, changeOwnPassword, resetMemberPassword, tempPassword } from "@/server/team";
import { validatePassword } from "@/server/auth";
import { createCustomer, createPool } from "@/server/customers";
import { scheduleVisit } from "@/server/visits";
import { ForbiddenError, UserError } from "@/server/errors";
import { newTenant, systemDb } from "./helpers";
import { addDays, isoDay } from "@/lib/format";

async function ownerMembership(tenantId: string, userId: string) {
  const [m] = await systemDb().select().from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)));
  return m;
}

describe("Equipe", () => {
  let A: Awaited<ReturnType<typeof newTenant>>;

  beforeAll(async () => {
    A = await newTenant("pro"); // maxUsers = 3
  });

  it("senha provisória sempre passa na validação", () => {
    for (let i = 0; i < 50; i++) expect(() => validatePassword(tempPassword())).not.toThrow();
  });

  it("cria usuário com senha provisória (troca obrigatória) e respeita maxUsers do plano", async () => {
    const r = await createMember(A, { name: "Téc Um", email: `tec1-${Date.now()}@test.dev`, role: "technician", jobTitle: "Técnico" });
    expect(r.tempPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    const [u] = await systemDb().select().from(users).where(eq(users.email, r.email));
    expect(u.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(r.tempPassword!, u.passwordHash)).toBe(true);

    await createMember(A, { name: "Téc Dois", email: `tec2-${Date.now()}@test.dev`, role: "technician" });
    await expect(createMember(A, { name: "Téc Três", email: `tec3-${Date.now()}@test.dev`, role: "technician" })).rejects.toThrow(/\/app\/plano/);
    // Duplicado
    await expect(createMember({ ...A, plan: { ...A.plan, maxUsers: null } }, { name: "Téc Um", email: r.email, role: "technician" })).rejects.toThrow(/já faz parte/);
  });

  it("não rebaixa o último proprietário; só proprietário atribui proprietário", async () => {
    const own = await ownerMembership(A.tenantId, A.userId);
    await expect(updateMember(A, own.id, { role: "admin" })).rejects.toThrow(/pelo menos um proprietário/);
    await expect(setMemberActive({ ...A, userId: "00000000-0000-0000-0000-000000000000" }, own.id, false)).rejects.toThrow(/pelo menos um proprietário/);
    const admin = { ...A, role: "admin" as const };
    const list = await listMembers(A);
    const tech = list.find((m) => m.role === "technician")!;
    await expect(updateMember(admin, tech.membershipId, { role: "owner" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createMember({ ...admin, plan: { ...A.plan, maxUsers: null } }, { name: "Dono Novo", email: `o-${Date.now()}@test.dev`, role: "owner" })).rejects.toBeInstanceOf(ForbiddenError);
    // Com outro proprietário, o primeiro pode mudar de papel.
    const res = await updateMember(A, tech.membershipId, { role: "owner" });
    expect(res.role).toBe("owner");
    const back = await updateMember(A, tech.membershipId, { role: "technician", jobTitle: "Técnico líder" });
    expect(back.role).toBe("technician");
    expect(back.jobTitle).toBe("Técnico líder");
  });

  it("membro desativado perde acesso na hora, sessões revogadas e histórico preservado", async () => {
    const list = await listMembers(A);
    const tech = list.find((m) => m.role === "technician" && m.active)!;
    const cust = await createCustomer(A, { name: "Cliente da Equipe" });
    const pool = await createPool(A, { customerId: cust.id, name: "Piscina" });
    const r = await scheduleVisit(A, { poolId: pool.id, date: addDays(isoDay(), 1), time: "09:00", assignedUserId: tech.userId });
    if (!r.ok) throw new Error("agenda");
    await systemDb().insert(sessions).values({ tokenHash: `t-${Date.now()}`, userId: tech.userId, tenantId: A.tenantId, expiresAt: new Date(Date.now() + 86400000) });

    await expect(setMemberActive(A, (await ownerMembership(A.tenantId, A.userId)).id, false)).rejects.toThrow(/próprio acesso/);
    await setMemberActive(A, tech.membershipId, false);

    // A mesma condição que getCtx exige (vínculo ativo) deixa de valer.
    const [active] = await systemDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, tech.userId), eq(memberships.tenantId, A.tenantId), eq(memberships.active, true)));
    expect(active).toBeUndefined();
    const open = await systemDb().select().from(sessions).where(and(eq(sessions.userId, tech.userId), isNull(sessions.revokedAt)));
    expect(open).toHaveLength(0);
    const [v] = await systemDb().select().from(visits).where(eq(visits.id, r.firstVisitId));
    expect(v.assignedUserId).toBe(tech.userId);

    // Com vaga livre, reativa; plano cheio bloqueia reativação.
    await createMember(A, { name: "Vendas", email: `s-${Date.now()}@test.dev`, role: "sales" });
    await expect(setMemberActive(A, tech.membershipId, true)).rejects.toThrow(/plano/);
  });

  it("produtividade do mês: concluídas, taxa e minutos médios", async () => {
    const T = await newTenant("business");
    const m = await createMember(T, { name: "Técnico Produtivo", email: `p-${Date.now()}@test.dev`, role: "technician" });
    const cust = await createCustomer(T, { name: "Cliente P" });
    const pool = await createPool(T, { customerId: cust.id, name: "Piscina P" });
    const now = new Date();
    const started = new Date(now.getTime() - 50 * 60000);
    const r = await scheduleVisit(T, { poolId: pool.id, date: isoDay(), time: "00:05", assignedUserId: m.membership.userId });
    if (!r.ok) throw new Error("agenda");
    await systemDb().update(visits).set({ status: "completed", startedAt: started, completedAt: new Date(started.getTime() + 45 * 60000), scheduledStart: started }).where(eq(visits.id, r.firstVisitId));
    const list = await listMembers(T, now);
    const row = list.find((x) => x.userId === m.membership.userId)!;
    expect(row.completed).toBe(1);
    expect(row.avgMin).toBe(45);
    expect(row.completionRate).toBe(1);
  });

  it("troca de senha obrigatória limpa a flag; redefinição gera nova provisória", async () => {
    const T = await newTenant("business");
    const m = await createMember(T, { name: "Troca Senha", email: `ts-${Date.now()}@test.dev`, role: "manager" });
    await expect(changeOwnPassword(m.membership.userId, "00000000-0000-0000-0000-000000000000", "curta", "curta")).rejects.toBeInstanceOf(UserError);
    await changeOwnPassword(m.membership.userId, "00000000-0000-0000-0000-000000000000", "novaSenha123", "novaSenha123");
    const [u] = await systemDb().select().from(users).where(eq(users.id, m.membership.userId));
    expect(u.mustChangePassword).toBe(false);
    const pw = await resetMemberPassword(T, m.membership.id);
    const [u2] = await systemDb().select().from(users).where(eq(users.id, m.membership.userId));
    expect(u2.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(pw, u2.passwordHash)).toBe(true);
    const log = await listAudit(T);
    expect(log.some((l) => l.action === "member.password_reset")).toBe(true);
    await expect(listAudit({ ...T, role: "technician" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
