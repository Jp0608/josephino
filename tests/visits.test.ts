import { describe, it, expect } from "vitest";
import { createCustomer, createPool } from "@/server/customers";
import { scheduleVisit, saveDraft, completeVisit, getVisitWorkspace } from "@/server/visits";
import { newTenant } from "./helpers";
import { isoDay } from "@/lib/format";

const draft = (v: number) => ({
  baseVersion: v,
  checklist: [{ itemKey: "agua_transparente", state: "ok" as const }],
  measurements: [{ parameterKey: "ph", value: 7.4 }],
  procedures: [{ procKey: "aspiracao", done: true }],
});

describe("atendimento", () => {
  it("salvamentos simultâneos do mesmo atendimento não geram erro nem duplicam", async () => {
    const A = await newTenant();
    const c = await createCustomer(A, { name: "Cliente Concorrente" });
    const p = await createPool(A, { customerId: c.id, name: "Piscina" });
    const r = await scheduleVisit(A, { poolId: p.id, date: isoDay(), time: "09:00" });
    if (!r.ok) throw new Error("agendamento");
    const results = await Promise.all([saveDraft(A, r.firstVisitId, draft(1)), saveDraft(A, r.firstVisitId, draft(1)), saveDraft(A, r.firstVisitId, draft(1))]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.filter((x) => !x.ok && x.conflict)).toHaveLength(2);
    const w = await getVisitWorkspace(A, r.firstVisitId);
    expect(w.draft.checklist).toHaveLength(1);
    expect(w.draft.measurements).toHaveLength(1);
  });

  it("finalizar duas vezes gera um único relatório", async () => {
    const A = await newTenant();
    const c = await createCustomer(A, { name: "Cliente Dupla Finalização" });
    const p = await createPool(A, { customerId: c.id, name: "Piscina" });
    const r = await scheduleVisit(A, { poolId: p.id, date: isoDay(), time: "10:00" });
    if (!r.ok) throw new Error("agendamento");
    const body = { draft: draft(1), consumeStockFor: [], confirmDateTime: true };
    const [a, b] = await Promise.all([completeVisit(A, r.firstVisitId, body), completeVisit(A, r.firstVisitId, body)]);
    expect(a.protocol).toBe(b.protocol);
    expect([a.alreadyCompleted, b.alreadyCompleted].filter(Boolean)).toHaveLength(1);
  });
});
