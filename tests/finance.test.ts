import { describe, it, expect, beforeAll } from "vitest";
import { createCustomer } from "@/server/customers";
import {
  createInvoice, recordPayment, cancelInvoice, listInvoices, getInvoice, getFinanceSummary,
  createExpense, markExpensePaid, cancelExpense, listExpenses, exportFinanceCsv,
} from "@/server/finance";
import { NotFoundError, ForbiddenError, UserError } from "@/server/errors";
import { addDays, isoDay, isoMonth } from "@/lib/format";
import { shiftMonth } from "@/server/fields";
import { newTenant, addMember } from "./helpers";

describe("financeiro", () => {
  let A: Awaited<ReturnType<typeof newTenant>>;
  let B: Awaited<ReturnType<typeof newTenant>>;
  let cust: { id: string };
  const today = isoDay();
  const month = isoMonth();

  beforeAll(async () => {
    A = await newTenant();
    B = await newTenant();
    cust = await createCustomer(A, { name: "Condomínio Azul", whatsapp: "11988887777" });
  });

  it("cria cobrança manual e registra pagamento autorizado", async () => {
    const inv = await createInvoice(A, { customerId: cust.id, kind: "avulso", description: "Limpeza pesada", amountCents: "350,00", dueOn: today });
    expect(inv.amountCents).toBe(35000);
    expect(inv.status).toBe("open");
    const pay = await recordPayment(A, inv.id, { method: "pix", paidOn: today, amountCents: "350,00" });
    expect(pay.source).toBe("manual");
    expect(pay.recordedBy).toBe(A.userId);
    const d = await getInvoice(A, inv.id);
    expect(d.status).toBe("paid");
    expect(d.paidAt).toBeTruthy();
    expect(d.payments).toHaveLength(1);
    // não paga duas vezes
    await expect(recordPayment(A, inv.id, { method: "pix", paidOn: today, amountCents: 35000 })).rejects.toBeInstanceOf(UserError);
    // pago não cancela
    await expect(cancelInvoice(A, inv.id)).rejects.toBeInstanceOf(UserError);
  });

  it("pagamento só com finance.write", async () => {
    const inv = await createInvoice(A, { customerId: cust.id, description: "Produto", amountCents: 1000, dueOn: today });
    const sales = await addMember(A.tenantId, "sales");
    const supervisor = await addMember(A.tenantId, "supervisor");
    await expect(recordPayment(sales, inv.id, { method: "pix", paidOn: today, amountCents: 1000 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(recordPayment(supervisor, inv.id, { method: "pix", paidOn: today, amountCents: 1000 })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getInvoice(A, inv.id)).status).toBe("open");
    const fin = await addMember(A.tenantId, "finance");
    await recordPayment(fin, inv.id, { method: "dinheiro", paidOn: today, amountCents: 1000 });
    expect((await getInvoice(A, inv.id)).status).toBe("paid");
  });

  it("técnico não acessa nada do financeiro", async () => {
    const tech = await addMember(A.tenantId, "technician");
    await expect(listInvoices(tech)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getFinanceSummary(tech)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listExpenses(tech)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportFinanceCsv(tech, "receber")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createInvoice(tech, { customerId: cust.id, description: "x", amountCents: 1, dueOn: today })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("valida pagamento: data futura e valor zero recusados", async () => {
    const inv = await createInvoice(A, { customerId: cust.id, description: "Teste", amountCents: 500, dueOn: today });
    await expect(recordPayment(A, inv.id, { method: "pix", paidOn: addDays(today, 2), amountCents: 500 })).rejects.toBeInstanceOf(UserError);
    await expect(recordPayment(A, inv.id, { method: "pix", paidOn: today, amountCents: 0 })).rejects.toThrow();
    await expect(recordPayment(A, inv.id, { method: "cheque", paidOn: today, amountCents: 500 })).rejects.toThrow();
    await cancelInvoice(A, inv.id, "lançado errado");
    await expect(recordPayment(A, inv.id, { method: "pix", paidOn: today, amountCents: 500 })).rejects.toBeInstanceOf(UserError);
  });

  it("filtro atrasado lista vencidos de qualquer mês", async () => {
    const C = await newTenant();
    const c = await createCustomer(C, { name: "Devedor" });
    const old = await createInvoice(C, { customerId: c.id, description: "Antiga", amountCents: 2000, dueOn: `${shiftMonth(month, -2)}-05` });
    await createInvoice(C, { customerId: c.id, description: "Futura", amountCents: 3000, dueOn: addDays(today, 40) });
    const late = await listInvoices(C, { status: "atrasado" });
    expect(late.rows.map((r) => r.id)).toEqual([old.id]);
    expect(late.rows[0].view).toBe("overdue");
    const s = await getFinanceSummary(C);
    expect(s.overdueCents).toBe(2000);
    expect(s.overdueCustomers).toBe(1);
  });

  it("resumo do mês: recebido, despesas e lucro estimado (caixa)", async () => {
    const C = await newTenant();
    const c = await createCustomer(C, { name: "Cliente Margem" });
    const i1 = await createInvoice(C, { customerId: c.id, description: "Mensal", amountCents: 50000, dueOn: today });
    await createInvoice(C, { customerId: c.id, description: "Aberta", amountCents: 20000, dueOn: `${month}-28` });
    await recordPayment(C, i1.id, { method: "pix", paidOn: today, amountCents: 48000 }); // pago com desconto
    const e1 = await createExpense(C, { category: "combustivel", description: "Gasolina", amountCents: "120,00", dueOn: today });
    await createExpense(C, { category: "produtos", description: "Cloro", amountCents: 9000, dueOn: today, paidNow: true });
    const e3 = await createExpense(C, { category: "outro", description: "Cancelar", amountCents: 100, dueOn: today });
    await cancelExpense(C, e3.id);
    let s = await getFinanceSummary(C, month);
    expect(s.billedCents).toBe(70000);
    expect(s.receivedCents).toBe(48000);
    expect(s.expensesPaidCents).toBe(9000);
    expect(s.expensesOpenCents).toBe(12000);
    expect(s.estimatedProfitCents).toBe(39000);
    await markExpensePaid(C, e1.id);
    s = await getFinanceSummary(C, month);
    expect(s.expensesPaidCents).toBe(21000);
    expect(s.estimatedProfitCents).toBe(27000);
    expect(s.cashflow).toHaveLength(6);
    expect(s.cashflow[5]).toMatchObject({ month, receivedCents: 48000, paidCents: 21000 });
    expect(s.margin[0]).toMatchObject({ name: "Cliente Margem", receivedCents: 48000, chemicalCents: 0 });
    const csv = await exportFinanceCsv(C, "receber", month);
    expect(csv.body).toContain("Cliente Margem");
    expect(csv.body).toContain("480,00");
    const csv2 = await exportFinanceCsv(C, "pagar", month);
    expect(csv2.body).toContain("Gasolina");
  });

  it("outra empresa não vê, paga nem cancela cobrança pelo id", async () => {
    const inv = await createInvoice(A, { customerId: cust.id, description: "Da A", amountCents: 7000, dueOn: today });
    await expect(getInvoice(B, inv.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordPayment(B, inv.id, { method: "pix", paidOn: today, amountCents: 7000 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelInvoice(B, inv.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createInvoice(B, { customerId: cust.id, description: "x", amountCents: 1, dueOn: today })).rejects.toBeInstanceOf(NotFoundError);
    expect((await listInvoices(B, { month })).rows).toHaveLength(0);
    expect((await getInvoice(A, inv.id)).status).toBe("open");
  });
});
