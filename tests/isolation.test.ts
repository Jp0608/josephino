import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { customers, pools, visits } from "@/db/schema";
import { createCustomer, createPool, getCustomer, listCustomers, updateCustomer } from "@/server/customers";
import { getPool } from "@/server/pools";
import { scheduleVisit, getVisitWorkspace, listAgenda } from "@/server/visits";
import { NotFoundError } from "@/server/errors";
import { newTenant, addMember, systemDb } from "./helpers";
import { isoDay, addDays } from "@/lib/format";

/**
 * Isolamento entre empresas: a empresa B nunca lê, altera ou referencia dados da empresa A —
 * nem pelos serviços, nem por SQL direto sob o papel ondaro_app (RLS), nem por chave estrangeira.
 */
describe("isolamento multi-tenant", () => {
  let A: Awaited<ReturnType<typeof newTenant>>;
  let B: Awaited<ReturnType<typeof newTenant>>;
  let custA: { id: string };
  let poolA: { id: string };
  let visitA: string;

  beforeAll(async () => {
    A = await newTenant();
    B = await newTenant();
    custA = await createCustomer(A, { name: "Cliente Secreto da A", whatsapp: "11999990000" });
    poolA = await createPool(A, { customerId: custA.id, name: "Piscina A", lengthM: 8, widthM: 4, depthMinM: 1.2, depthMaxM: 1.6 });
    const r = await scheduleVisit(A, { poolId: poolA.id, date: addDays(isoDay(), 1), time: "09:00" });
    if (!r.ok) throw new Error("falha ao agendar");
    visitA = r.firstVisitId;
  });

  it("listagem de B não mostra clientes de A", async () => {
    const res = await listCustomers(B, { q: "Secreto", status: "all" });
    expect(res.total).toBe(0);
  });

  it("B não abre cliente, piscina nem visita de A pelo id", async () => {
    await expect(getCustomer(B, custA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPool(B, poolA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getVisitWorkspace(B, visitA)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("B não altera cliente de A", async () => {
    await expect(updateCustomer(B, custA.id, { name: "Hackeado" })).rejects.toBeInstanceOf(NotFoundError);
    const again = await getCustomer(A, custA.id);
    expect(again.customer.name).toBe("Cliente Secreto da A");
  });

  it("B não cadastra piscina no cliente de A", async () => {
    await expect(createPool(B, { customerId: custA.id, name: "Intrusa" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("B não agenda visita na piscina de A", async () => {
    await expect(scheduleVisit(B, { poolId: poolA.id, date: addDays(isoDay(), 2), time: "10:00" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("RLS: SQL sem filtro, sob a empresa B, não enxerga linhas de A", async () => {
    const rows = await withTenant(B.tenantId, (tx) => tx.select().from(customers));
    expect(rows.find((r) => r.id === custA.id)).toBeUndefined();
    const vs = await withTenant(B.tenantId, (tx) => tx.select().from(visits));
    expect(vs).toHaveLength(0);
  });

  it("RLS: B não consegue inserir linha marcada com o tenant de A", async () => {
    await expect(
      withTenant(B.tenantId, (tx) => tx.insert(customers).values({ tenantId: A.tenantId, name: "Injetado" })),
    ).rejects.toThrow();
  });

  it("RLS: UPDATE/DELETE sem filtro sob B não afeta A", async () => {
    await withTenant(B.tenantId, (tx) => tx.update(customers).set({ name: "x" }));
    await withTenant(B.tenantId, (tx) => tx.delete(pools));
    const a = await getCustomer(A, custA.id);
    expect(a.customer.name).toBe("Cliente Secreto da A");
    expect(a.pools).toHaveLength(1);
  });

  it("FK composta: banco recusa piscina de B ligada a cliente de A (mesmo sem RLS)", async () => {
    const err = await systemDb()
      .execute(sql`insert into pools (tenant_id, customer_id, name, code) values (${B.tenantId}, ${custA.id}, 'x', 'X1')`)
      .then(() => null, (e) => e);
    expect((err?.cause ?? err)?.constraint_name).toBe("pools_customer_fk");
  });

  it("sem tenant definido, o papel da aplicação não lê nada", async () => {
    const rows = await systemDb().transaction(async (tx) => {
      await tx.execute(sql`set local role ondaro_app`);
      return tx.execute(sql`select count(*)::int as n from customers`);
    });
    expect((rows as unknown as { n: number }[])[0].n).toBe(0);
  });

  it("técnico só vê a própria agenda", async () => {
    const tech = await addMember(A.tenantId, "technician");
    const from = isoDay();
    const to = addDays(from, 7);
    expect(await listAgenda(tech, from, to)).toHaveLength(0);
    await expect(getVisitWorkspace(tech, visitA)).rejects.toBeInstanceOf(NotFoundError);
    const r = await scheduleVisit(A, { poolId: poolA.id, date: addDays(isoDay(), 3), time: "14:00", assignedUserId: tech.userId });
    expect(r.ok).toBe(true);
    const mine = await listAgenda(tech, from, to);
    expect(mine).toHaveLength(1);
  });
});
