import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createProduct, getProduct, recordMovement, updateProduct, listProducts, getInventoryInsights, movementDelta, productAlerts } from "@/server/inventory";
import { createCustomer, createPool } from "@/server/customers";
import { scheduleVisit, completeVisit } from "@/server/visits";
import { NotFoundError, ForbiddenError, UserError } from "@/server/errors";
import { addDays, isoDay, isoMonth } from "@/lib/format";
import { newTenant, addMember } from "./helpers";

describe("estoque", () => {
  let A: Awaited<ReturnType<typeof newTenant>>;
  let B: Awaited<ReturnType<typeof newTenant>>;

  beforeAll(async () => {
    A = await newTenant();
    B = await newTenant();
  });

  it("cadastro com estoque inicial gera movimentação de entrada", async () => {
    const p = await createProduct(A, { name: "Cloro granulado", unit: "kg", costCentsPerUnit: "25,90", initialQty: "10", minQty: "3", lot: "L1" });
    expect(p.stockQty).toBe(10);
    expect(p.costCentsPerUnit).toBe(2590);
    const d = await getProduct(A, p.id);
    expect(d.movements).toHaveLength(1);
    expect(d.movements[0].kind).toBe("entrada");
    expect(d.movements[0].balanceAfter).toBe(10);
  });

  it("movimentações atualizam o saldo e registram balance_after", async () => {
    const p = await createProduct(A, { name: "Redutor de pH", unit: "L", initialQty: 5 });
    const m1 = await recordMovement(A, p.id, { kind: "entrada", quantity: "2,5", lot: "NOVO", unitCostCents: "10,00" });
    expect(m1.quantity).toBe(2.5);
    expect(m1.balanceAfter).toBe(7.5);
    const m2 = await recordMovement(A, p.id, { kind: "saida", quantity: 1.25 });
    expect(m2.quantity).toBe(-1.25);
    expect(m2.balanceAfter).toBe(6.25);
    const m3 = await recordMovement(A, p.id, { kind: "perda", quantity: 0.25, note: "Embalagem furada" });
    expect(m3.balanceAfter).toBe(6);
    const m4 = await recordMovement(A, p.id, { kind: "devolucao", quantity: 1 });
    expect(m4.balanceAfter).toBe(7);
    const m5 = await recordMovement(A, p.id, { kind: "transferencia", quantity: 2, direction: "out", location: "Carro 2" });
    expect(m5.balanceAfter).toBe(5);
    // ajuste informa a contagem real: delta = contado − saldo
    const m6 = await recordMovement(A, p.id, { kind: "ajuste", quantity: "4,4", note: "Inventário mensal" });
    expect(m6.quantity).toBeCloseTo(-0.6, 3);
    expect(m6.balanceAfter).toBe(4.4);
    const d = await getProduct(A, p.id);
    expect(d.product.stockQty).toBe(4.4);
    // entrada com lote/custo atualiza a referência do produto
    expect(d.product.lot).toBe("NOVO");
    expect(d.product.costCentsPerUnit).toBe(1000);
    // soma das movimentações = saldo atual
    const sum = d.movements.reduce((s, m) => s + m.quantity, 0);
    expect(Math.round(sum * 1000) / 1000).toBe(4.4);
  });

  it("não deixa saída manual ultrapassar o saldo nem aceita consumo_visita manual", async () => {
    const p = await createProduct(A, { name: "Algicida", unit: "L", initialQty: 1 });
    await expect(recordMovement(A, p.id, { kind: "saida", quantity: 2 })).rejects.toBeInstanceOf(UserError);
    await expect(recordMovement(A, p.id, { kind: "consumo_visita" as never, quantity: 1 })).rejects.toThrow();
    await expect(recordMovement(A, p.id, { kind: "saida", quantity: 0 })).rejects.toThrow();
    expect((await getProduct(A, p.id)).product.stockQty).toBe(1);
  });

  it("movimentações concorrentes não perdem atualização", async () => {
    const p = await createProduct(A, { name: "Clarificante", unit: "L", initialQty: 0 });
    await Promise.all(Array.from({ length: 8 }, () => recordMovement(A, p.id, { kind: "entrada", quantity: 1 })));
    const d = await getProduct(A, p.id);
    expect(d.product.stockQty).toBe(8);
    expect(d.movements.map((m) => m.balanceAfter).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("delta por tipo", () => {
    expect(movementDelta("entrada", 2, 10)).toBe(2);
    expect(movementDelta("saida", 2, 10)).toBe(-2);
    expect(movementDelta("transferencia", 2, 10, "in")).toBe(2);
    expect(movementDelta("ajuste", 7, 10)).toBe(-3);
  });

  it("alertas: baixo, vencendo, vencido e sem lote", () => {
    const today = "2026-11-22";
    const base = { active: true, lot: "X", minQty: null as number | null, expiresOn: null as string | null, stockQty: 5 };
    expect(productAlerts({ ...base, minQty: 5 }, today)).toContain("low");
    expect(productAlerts({ ...base, expiresOn: "2026-12-10" }, today)).toContain("expiring");
    expect(productAlerts({ ...base, expiresOn: "2026-11-01" }, today)).toContain("expired");
    expect(productAlerts({ ...base, lot: null }, today)).toContain("no_lot");
    expect(productAlerts({ ...base }, today)).toEqual([]);
  });

  it("lista filtra por alerta", async () => {
    const C = await newTenant();
    await createProduct(C, { name: "Baixo", initialQty: 1, minQty: 2, lot: "a" });
    await createProduct(C, { name: "Ok", initialQty: 10, minQty: 2, lot: "b" });
    const low = await listProducts(C, { filter: "baixo" });
    expect(low.rows.map((r) => r.name)).toEqual(["Baixo"]);
    expect(low.counts.low).toBe(1);
  });

  it("permissões: técnico lê mas não movimenta", async () => {
    const tech = await addMember(A.tenantId, "technician");
    const p = await createProduct(A, { name: "Barrilha", initialQty: 3 });
    await expect(getProduct(tech, p.id)).resolves.toBeTruthy();
    await expect(recordMovement(tech, p.id, { kind: "saida", quantity: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createProduct(tech, { name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    const fin = await addMember(A.tenantId, "finance");
    await expect(listProducts(fin)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("outra empresa não abre, edita nem movimenta produto pelo id", async () => {
    const p = await createProduct(A, { name: "Segredo da A", initialQty: 4 });
    await expect(getProduct(B, p.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProduct(B, p.id, { name: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordMovement(B, p.id, { kind: "saida", quantity: 1 })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getProduct(A, p.id)).product.stockQty).toBe(4);
    expect((await listProducts(B, { q: "Segredo" })).rows).toHaveLength(0);
  });

  it("consumo em visita aparece no histórico e nos indicadores do mês", async () => {
    const T = await newTenant();
    const prod = await createProduct(T, { name: "Cloro estabilizado", unit: "kg", costCentsPerUnit: 3000, initialQty: 10, lot: "L9" });
    const cust = await createCustomer(T, { name: "Cliente Insight" });
    const pool = await createPool(T, { customerId: cust.id, name: "Piscina" });
    const r = await scheduleVisit(T, { poolId: pool.id, date: addDays(isoDay(), 1), time: "09:00" });
    if (!r.ok) throw new Error("agendamento falhou");
    const chemId = randomUUID();
    await completeVisit(T, r.firstVisitId, {
      confirmDateTime: true,
      consumeStockFor: [chemId],
      draft: {
        baseVersion: 1,
        procedures: [{ procKey: "aspiracao", done: true }],
        chemicals: [{ id: chemId, productId: prod.id, productName: prod.name, quantity: 0.5, unit: "kg" }],
      },
    });
    const d = await getProduct(T, prod.id);
    expect(d.product.stockQty).toBe(9.5);
    const consumo = d.movements.find((m) => m.kind === "consumo_visita");
    expect(consumo?.visitId).toBe(r.firstVisitId);
    expect(consumo?.customerName).toBe("Cliente Insight");
    const ins = await getInventoryInsights(T, isoMonth());
    expect(ins.totals.completedVisits).toBe(1);
    expect(ins.totals.chemicalCostCents).toBe(1500);
    expect(ins.totals.costPerVisitCents).toBe(1500);
    expect(ins.topProducts[0].name).toBe("Cloro estabilizado");
    expect(ins.perCustomer[0]).toMatchObject({ name: "Cliente Insight", costCents: 1500, visits: 1 });
  });
});
