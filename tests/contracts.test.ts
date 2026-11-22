import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invoices, recurrences, visits } from "@/db/schema";
import { createCustomer, createPool } from "@/server/customers";
import {
  createServicePlan, listServicePlans, createContract, getContract, updateContract, setContractStatus,
  generateMonthlyInvoices, pendingMonthlyCount, scheduleContractVisits, listContracts,
} from "@/server/contracts";
import { scheduleVisit } from "@/server/visits";
import { NotFoundError, ForbiddenError, UserError } from "@/server/errors";
import { addDays, isoDay, isoMonth, weekdayOf } from "@/lib/format";
import { shiftMonth } from "@/server/fields";
import { newTenant, addMember } from "./helpers";

describe("contratos e planos", () => {
  let A: Awaited<ReturnType<typeof newTenant>>;
  let B: Awaited<ReturnType<typeof newTenant>>;
  let cust: { id: string };
  let pool: { id: string };
  const month = isoMonth();

  beforeAll(async () => {
    A = await newTenant();
    B = await newTenant();
    cust = await createCustomer(A, { name: "Casa da Praia" });
    pool = await createPool(A, { customerId: cust.id, name: "Piscina principal" });
  });

  it("cria plano de serviço e contrato", async () => {
    const plan = await createServicePlan(A, { name: "Semanal", weekdays: ["1", "4"], intervalWeeks: "1", visitsPerMonth: "8", priceCents: "450,00", includedServices: "Aspiração, escovação" });
    expect(plan.priceCents).toBe(45000);
    expect(plan.weekdays).toEqual([1, 4]);
    expect((await listServicePlans(A)).map((p) => p.id)).toContain(plan.id);
    const ct = await createContract(A, { customerId: cust.id, poolId: pool.id, servicePlanId: plan.id, title: "Manutenção semanal", monthlyCents: "450,00", billingDay: "31", startsOn: `${month}-01` });
    expect(ct.monthlyCents).toBe(45000);
    const d = await getContract(A, ct.id);
    expect(d.customer.name).toBe("Casa da Praia");
    expect(d.plan?.name).toBe("Semanal");
  });

  it("recusa piscina de outro cliente e término antes do início", async () => {
    const other = await createCustomer(A, { name: "Outro" });
    await expect(createContract(A, { customerId: other.id, poolId: pool.id, title: "x", monthlyCents: 100, billingDay: 5, startsOn: "2026-01-01" })).rejects.toBeInstanceOf(UserError);
    await expect(createContract(A, { customerId: cust.id, title: "x", monthlyCents: 100, billingDay: 5, startsOn: "2026-05-01", endsOn: "2026-04-01" })).rejects.toThrow();
  });

  it("geração de mensalidades é idempotente e respeita status, vigência e dia de cobrança", async () => {
    const T = await newTenant();
    const c1 = await createCustomer(T, { name: "C1" });
    const c2 = await createCustomer(T, { name: "C2" });
    const active = await createContract(T, { customerId: c1.id, title: "Ativo", monthlyCents: 30000, billingDay: 31, startsOn: "2026-01-10" });
    await createContract(T, { customerId: c2.id, title: "Ativo 2", monthlyCents: 20000, billingDay: 5, startsOn: "2026-01-01", endsOn: "2026-12-31" });
    const paused = await createContract(T, { customerId: c2.id, title: "Pausado", monthlyCents: 10000, billingDay: 5, startsOn: "2026-01-01" });
    await setContractStatus(T, paused.id, "paused");
    await createContract(T, { customerId: c2.id, title: "Futuro", monthlyCents: 10000, billingDay: 5, startsOn: "2027-06-01" });
    await createContract(T, { customerId: c2.id, title: "Encerrado antes", monthlyCents: 10000, billingDay: 5, startsOn: "2025-01-01", endsOn: "2025-12-31" });

    expect(await pendingMonthlyCount(T, "2026-02")).toBe(2);
    const first = await generateMonthlyInvoices(T, "2026-02");
    expect(first.created).toBe(2);
    expect(await pendingMonthlyCount(T, "2026-02")).toBe(0);
    const again = await generateMonthlyInvoices(T, "2026-02");
    expect(again.created).toBe(0);
    const rows = await withTenant(T.tenantId, (tx) => tx.select().from(invoices).where(eq(invoices.tenantId, T.tenantId)));
    expect(rows).toHaveLength(2);
    const inv = rows.find((r) => r.contractId === active.id)!;
    expect(inv.dueOn).toBe("2026-02-28"); // dia 31 limitado ao fim de fevereiro
    expect(inv.competence).toBe("2026-02");
    expect(inv.kind).toBe("mensalidade");
    // outra competência cria de novo
    expect((await generateMonthlyInvoices(T, "2026-03")).created).toBe(2);
    const d = await getContract(T, active.id);
    expect(d.contract.lastInvoicedMonth).toBe("2026-03");
    expect(d.invoices).toHaveLength(2);
  });

  it("geração simultânea não duplica", async () => {
    const T = await newTenant();
    const c = await createCustomer(T, { name: "Cliente C" });
    await createContract(T, { customerId: c.id, title: "X", monthlyCents: 1000, billingDay: 10, startsOn: "2026-01-01" });
    const res = await Promise.all([generateMonthlyInvoices(T, "2026-04"), generateMonthlyInvoices(T, "2026-04"), generateMonthlyInvoices(T, "2026-04")]);
    expect(res.reduce((s, r) => s + r.created, 0)).toBe(1);
  });

  it("permissões: técnico não acessa contratos; comercial não gera mensalidades", async () => {
    const tech = await addMember(A.tenantId, "technician");
    await expect(listContracts(tech)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createServicePlan(tech, { name: "x", priceCents: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    const sales = await addMember(A.tenantId, "sales");
    await expect(listContracts(sales)).resolves.toBeTruthy();
    await expect(generateMonthlyInvoices(sales, month)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("agenda recorrente do contrato: devolve conflitos e agenda com force", async () => {
    const T = await newTenant();
    const c = await createCustomer(T, { name: "Agenda" });
    const p = await createPool(T, { customerId: c.id, name: "P" });
    const first = addDays(isoDay(), 2);
    // visita avulsa já marcada na mesma piscina e dia → duplicidade
    const pre = await scheduleVisit(T, { poolId: p.id, date: first, time: "14:00" });
    expect(pre.ok).toBe(true);
    const ct = await createContract(T, { customerId: c.id, poolId: p.id, title: "Semanal", monthlyCents: 1000, billingDay: 10, startsOn: isoDay() });
    const sched = { repeat: "weekly" as const, weekdays: [String(weekdayOf(first))], time: "09:00", firstDate: first };
    const r1 = await scheduleContractVisits(T, ct.id, sched);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.duplicates.length).toBeGreaterThan(0);
    const none = await withTenant(T.tenantId, (tx) => tx.select().from(recurrences).where(eq(recurrences.tenantId, T.tenantId)));
    expect(none).toHaveLength(0);
    const r2 = await scheduleContractVisits(T, ct.id, { ...sched, force: true });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.created).toBeGreaterThan(1);
    const d = await getContract(T, ct.id);
    expect(d.recurrences).toHaveLength(1);
    const vs = await withTenant(T.tenantId, (tx) => tx.select().from(visits).where(and(eq(visits.tenantId, T.tenantId), eq(visits.recurrenceId, d.recurrences[0].id))));
    expect(vs.length).toBe(r2.ok ? r2.created : -1);
    // financeiro tem contracts.write mas não agenda.write
    const fin = await addMember(T.tenantId, "finance");
    await expect(scheduleContractVisits(fin, ct.id, sched)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("contrato sem piscina não cria agenda", async () => {
    const ct = await createContract(A, { customerId: cust.id, title: "Sem piscina", monthlyCents: 1000, billingDay: 10, startsOn: isoDay() });
    await expect(scheduleContractVisits(A, ct.id, { repeat: "weekly", weekdays: [1], time: "09:00", firstDate: isoDay() })).rejects.toBeInstanceOf(UserError);
  });

  it("outra empresa não abre, altera, agenda nem fatura contrato pelo id", async () => {
    const ct = await createContract(A, { customerId: cust.id, title: "Da A", monthlyCents: 9900, billingDay: 10, startsOn: "2026-01-01" });
    await expect(getContract(B, ct.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateContract(B, ct.id, { customerId: cust.id, title: "hack", monthlyCents: 1, billingDay: 1, startsOn: "2026-01-01" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setContractStatus(B, ct.id, "cancelled")).rejects.toBeInstanceOf(NotFoundError);
    await expect(scheduleContractVisits(B, ct.id, { repeat: "weekly", weekdays: [1], time: "09:00", firstDate: isoDay() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createContract(B, { customerId: cust.id, title: "x", monthlyCents: 1, billingDay: 1, startsOn: "2026-01-01" })).rejects.toBeInstanceOf(NotFoundError);
    const gen = await generateMonthlyInvoices(B, shiftMonth(month, 1));
    expect(gen.created).toBe(0);
    expect((await listContracts(B)).length).toBe(0);
    expect((await getContract(A, ct.id)).contract.status).toBe("active");
  });
});
