import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { products, inventoryMovements, visits, customers, users } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError, UserError } from "./errors";
import { addDays, isoDay } from "@/lib/format";
import { PRODUCT_CATEGORIES, UNITS } from "@/lib/domain/catalog";
import { assertCan, decimal, monthRange, optDecimal, optIsoDate, optMoneyCents, optText, parseMonth, reqText } from "./fields";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

/* ───────────────────────────── Produtos ───────────────────────────── */

export const productSchema = z.object({
  name: reqText("Informe o nome do produto"),
  brand: optText(120),
  manufacturer: optText(160),
  category: z.string().refine((v) => v in PRODUCT_CATEGORIES, "Categoria inválida").default("outro"),
  activeIngredient: optText(160),
  concentration: optText(120),
  unit: z.string().refine((v) => UNITS.includes(v), "Unidade inválida").default("kg"),
  supplier: optText(160),
  costCentsPerUnit: optMoneyCents,
  minQty: optDecimal.refine((v) => v == null || v >= 0, "O mínimo não pode ser negativo"),
  lot: optText(60),
  expiresOn: optIsoDate,
  storageLocation: optText(160),
  safetyNotes: optText(4000),
});

export const createProductSchema = productSchema.extend({
  initialQty: optDecimal.refine((v) => v == null || v >= 0, "O estoque inicial não pode ser negativo"),
});

export type ProductAlert = "low" | "expiring" | "expired" | "no_lot" | "negative";
export const PRODUCT_ALERT_LABEL: Record<ProductAlert, string> = {
  low: "Estoque baixo",
  expiring: "Vence em até 30 dias",
  expired: "Vencido",
  no_lot: "Sem lote informado",
  negative: "Saldo negativo",
};

export function productAlerts(p: Pick<typeof products.$inferSelect, "stockQty" | "minQty" | "expiresOn" | "lot" | "active">, today = isoDay()): ProductAlert[] {
  if (!p.active) return [];
  const out: ProductAlert[] = [];
  if (p.stockQty < 0) out.push("negative");
  else if (p.minQty != null && p.stockQty <= p.minQty) out.push("low");
  if (p.expiresOn && p.stockQty > 0) {
    if (p.expiresOn < today) out.push("expired");
    else if (p.expiresOn <= addDays(today, 30)) out.push("expiring");
  }
  if (!p.lot && p.stockQty > 0) out.push("no_lot");
  return out;
}

export const PRODUCT_FILTERS = {
  ativos: "Ativos",
  alertas: "Com alerta",
  baixo: "Estoque baixo",
  validade: "Validade",
  sem_lote: "Sem lote",
  inativos: "Inativos",
} as const;
export type ProductFilter = keyof typeof PRODUCT_FILTERS;

export async function listProducts(ctx: C, opts: { q?: string; filter?: string } = {}) {
  assertCan(ctx, "inventory.read");
  const filter: ProductFilter = opts.filter && opts.filter in PRODUCT_FILTERS ? (opts.filter as ProductFilter) : "ativos";
  const today = isoDay();
  return withTenant(ctx.tenantId, async (tx) => {
    const conds = [eq(products.tenantId, ctx.tenantId), eq(products.active, filter !== "inativos")];
    const q = opts.q?.trim();
    if (q) {
      const like = `%${q}%`;
      conds.push(or(ilike(products.name, like), ilike(products.brand, like), ilike(products.manufacturer, like), ilike(products.activeIngredient, like), ilike(products.supplier, like))!);
    }
    const rows = await tx.select().from(products).where(and(...conds)).orderBy(asc(products.name));
    const all = rows.map((p) => ({ ...p, alerts: productAlerts(p, today) }));
    const counts = {
      total: all.length,
      low: all.filter((p) => p.alerts.includes("low") || p.alerts.includes("negative")).length,
      expiring: all.filter((p) => p.alerts.includes("expiring")).length,
      expired: all.filter((p) => p.alerts.includes("expired")).length,
      noLot: all.filter((p) => p.alerts.includes("no_lot")).length,
      stockValueCents: all.reduce((s, p) => s + (p.costCentsPerUnit != null && p.stockQty > 0 ? Math.round(p.costCentsPerUnit * p.stockQty) : 0), 0),
    };
    const shown = all.filter((p) => {
      switch (filter) {
        case "alertas":
          return p.alerts.length > 0;
        case "baixo":
          return p.alerts.includes("low") || p.alerts.includes("negative");
        case "validade":
          return p.alerts.includes("expiring") || p.alerts.includes("expired");
        case "sem_lote":
          return p.alerts.includes("no_lot");
        default:
          return true;
      }
    });
    return { filter, rows: shown, counts };
  });
}

export async function getProduct(ctx: C, id: string) {
  assertCan(ctx, "inventory.read");
  return withTenant(ctx.tenantId, async (tx) => {
    const [p] = await tx.select().from(products).where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, id))).limit(1);
    if (!p) throw new NotFoundError("Produto não encontrado.");
    const movs = await tx
      .select({
        m: inventoryMovements,
        userName: users.name,
        visitStart: visits.scheduledStart,
        customerName: customers.name,
      })
      .from(inventoryMovements)
      .leftJoin(users, eq(users.id, inventoryMovements.userId))
      .leftJoin(visits, and(eq(visits.tenantId, inventoryMovements.tenantId), eq(visits.id, inventoryMovements.visitId)))
      .leftJoin(customers, and(eq(customers.tenantId, visits.tenantId), eq(customers.id, visits.customerId)))
      .where(and(eq(inventoryMovements.tenantId, ctx.tenantId), eq(inventoryMovements.productId, id)))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(200);
    return {
      product: { ...p, alerts: productAlerts(p) },
      movements: movs.map((r) => ({ ...r.m, userName: r.userName, visitStart: r.visitStart, customerName: r.customerName })),
    };
  });
}

export async function createProduct(ctx: C, input: z.input<typeof createProductSchema>) {
  assertCan(ctx, "inventory.write");
  const d = createProductSchema.parse(input);
  const { initialQty, ...data } = d;
  return withTenant(ctx.tenantId, async (tx) => {
    const qty = initialQty ?? 0;
    const [row] = await tx
      .insert(products)
      .values({ ...data, tenantId: ctx.tenantId, stockQty: qty })
      .returning();
    if (qty > 0) {
      await tx.insert(inventoryMovements).values({
        tenantId: ctx.tenantId,
        productId: row.id,
        kind: "entrada",
        quantity: qty,
        balanceAfter: qty,
        unitCostCents: data.costCentsPerUnit,
        lot: data.lot,
        expiresOn: data.expiresOn,
        location: data.storageLocation,
        userId: ctx.userId,
        note: "Estoque inicial no cadastro",
      });
    }
    await audit(tx, ctx, "product.create", "product", row.id, { name: row.name, initialQty: qty });
    return row;
  });
}

export async function updateProduct(ctx: C, id: string, input: z.input<typeof productSchema>) {
  assertCan(ctx, "inventory.write");
  const d = productSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    // stock_qty nunca é editado aqui: só muda por movimentação registrada.
    const [row] = await tx
      .update(products)
      .set({ ...d, updatedAt: new Date() })
      .where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Produto não encontrado.");
    await audit(tx, ctx, "product.update", "product", id, { name: row.name });
    return row;
  });
}

export async function setProductActive(ctx: C, id: string, active: boolean) {
  assertCan(ctx, "inventory.write");
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .update(products)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, id)))
      .returning({ id: products.id });
    if (!row) throw new NotFoundError("Produto não encontrado.");
    await audit(tx, ctx, active ? "product.activate" : "product.deactivate", "product", id);
  });
}

/* ───────────────────────────── Movimentações ───────────────────────────── */

/** Tipos que o usuário registra à mão. consumo_visita só nasce na finalização da visita. */
export const MANUAL_MOVEMENTS = ["entrada", "saida", "ajuste", "perda", "devolucao", "transferencia"] as const;
export type ManualMovement = (typeof MANUAL_MOVEMENTS)[number];

export const movementSchema = z
  .object({
    kind: z.enum(MANUAL_MOVEMENTS, { error: "Escolha o tipo de movimentação" }),
    /** Para ajuste: a quantidade contada (novo saldo). Para os demais: a quantidade movimentada. */
    quantity: decimal("Informe a quantidade"),
    /** Só para transferência: in = recebida de outro local, out = enviada para outro local. */
    direction: z.enum(["in", "out"]).optional(),
    unitCostCents: optMoneyCents,
    lot: optText(60),
    expiresOn: optIsoDate,
    location: optText(160),
    note: optText(500),
  })
  .superRefine((d, c) => {
    if (d.kind === "ajuste") {
      if (d.quantity < 0) c.addIssue({ code: "custom", path: ["quantity"], message: "A contagem não pode ser negativa" });
    } else if (d.quantity <= 0) c.addIssue({ code: "custom", path: ["quantity"], message: "A quantidade precisa ser maior que zero" });
    if (d.kind === "transferencia" && !d.direction) c.addIssue({ code: "custom", path: ["direction"], message: "Informe se a transferência entra ou sai deste estoque" });
    if (d.kind === "transferencia" && !d.location) c.addIssue({ code: "custom", path: ["location"], message: "Informe o local de origem ou destino" });
    if (d.kind === "ajuste" && !d.note) c.addIssue({ code: "custom", path: ["note"], message: "Explique o motivo do ajuste" });
    if (d.kind === "perda" && !d.note) c.addIssue({ code: "custom", path: ["note"], message: "Descreva a perda (avaria, vencimento, vazamento…)" });
  });

/** Variação de saldo de uma movimentação manual (positivo entra, negativo sai). */
export function movementDelta(kind: ManualMovement, quantity: number, currentQty: number, direction?: "in" | "out") {
  switch (kind) {
    case "entrada":
    case "devolucao":
      return quantity;
    case "saida":
    case "perda":
      return -quantity;
    case "transferencia":
      return direction === "in" ? quantity : -quantity;
    case "ajuste":
      return Math.round((quantity - currentQty) * 1000) / 1000;
  }
}

/**
 * Registra uma movimentação e atualiza o saldo do produto na MESMA transação.
 * O produto é travado (SELECT … FOR UPDATE): duas movimentações simultâneas nunca leem o mesmo saldo.
 */
export async function recordMovement(ctx: C, productId: string, input: z.input<typeof movementSchema>) {
  assertCan(ctx, "inventory.write");
  const d = movementSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [p] = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, productId)))
      .for("update")
      .limit(1);
    if (!p) throw new NotFoundError("Produto não encontrado.");
    const delta = movementDelta(d.kind, d.quantity, p.stockQty, d.direction);
    if (d.kind === "ajuste" && delta === 0) throw new UserError("A contagem é igual ao saldo atual — nada a ajustar.");
    const balance = Math.round((p.stockQty + delta) * 1000) / 1000;
    if (delta < 0 && balance < 0)
      throw new UserError(`Quantidade maior que o saldo atual (${p.stockQty.toLocaleString("pt-BR")} ${p.unit}). Se a contagem física for diferente, registre um ajuste de inventário.`);

    const patch: Partial<typeof products.$inferInsert> = { stockQty: balance, updatedAt: new Date() };
    // Entrada de um lote novo passa a ser o lote/validade/custo de referência do produto.
    if (d.kind === "entrada") {
      if (d.lot) patch.lot = d.lot;
      if (d.expiresOn) patch.expiresOn = d.expiresOn;
      if (d.unitCostCents != null) patch.costCentsPerUnit = d.unitCostCents;
      if (d.location) patch.storageLocation = d.location;
    }
    await tx.update(products).set(patch).where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, productId)));
    const [mov] = await tx
      .insert(inventoryMovements)
      .values({
        tenantId: ctx.tenantId,
        productId,
        kind: d.kind,
        quantity: delta,
        balanceAfter: balance,
        unitCostCents: d.unitCostCents ?? p.costCentsPerUnit,
        lot: d.lot ?? (d.kind === "entrada" ? null : p.lot),
        expiresOn: d.expiresOn,
        location: d.location,
        userId: ctx.userId,
        note: d.note,
      })
      .returning();
    await audit(tx, ctx, "inventory.movement", "product", productId, { kind: d.kind, quantity: delta, balanceAfter: balance });
    return mov;
  });
}

/* ───────────────────────────── Indicadores ───────────────────────────── */

/**
 * Indicadores do mês, calculados das aplicações registradas em visitas concluídas
 * (chemical_applications) e das movimentações de estoque. Nada é estimado além do custo
 * unitário cadastrado no produto no momento da aplicação.
 */
export async function getInventoryInsights(ctx: C, monthInput?: string) {
  assertCan(ctx, "inventory.read");
  const month = parseMonth(monthInput);
  const r = monthRange(month);
  return withTenant(ctx.tenantId, async (tx) => {
    const q = async <T,>(s: ReturnType<typeof sql>) => (await tx.execute(s)) as unknown as T[];
    const start = r.start.toISOString();
    const end = r.end.toISOString();

    const topProducts = await q<{ product_id: string | null; name: string; unit: string; qty: number; cost: number | null; visits: number; uncosted: number }>(sql`
      select ca.product_id, max(ca.product_name) as name, ca.unit,
        sum(ca.quantity)::float as qty,
        sum(ca.cost_cents)::int as cost,
        count(distinct ca.visit_id)::int as visits,
        count(*) filter (where ca.cost_cents is null)::int as uncosted
      from chemical_applications ca
      join visits v on v.tenant_id = ca.tenant_id and v.id = ca.visit_id
      where ca.tenant_id = ${ctx.tenantId} and v.status = 'completed'
        and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz
      group by ca.product_id, case when ca.product_id is null then lower(ca.product_name) else '' end, ca.unit
      order by count(distinct ca.visit_id) desc, sum(ca.quantity) desc
      limit 10`);

    const [tot] = await q<{ visits: number; visits_with_products: number; cost: number; uncosted: number }>(sql`
      select
        (select count(*)::int from visits v where v.tenant_id = ${ctx.tenantId} and v.status = 'completed'
           and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz) as visits,
        count(distinct ca.visit_id)::int as visits_with_products,
        coalesce(sum(ca.cost_cents), 0)::int as cost,
        count(*) filter (where ca.cost_cents is null)::int as uncosted
      from chemical_applications ca
      join visits v on v.tenant_id = ca.tenant_id and v.id = ca.visit_id
      where ca.tenant_id = ${ctx.tenantId} and v.status = 'completed'
        and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz`);

    const perCustomer = await q<{ customer_id: string; name: string; visits: number; cost: number }>(sql`
      select c.id as customer_id, c.name,
        count(distinct v.id)::int as visits,
        coalesce(sum(ca.cost_cents), 0)::int as cost
      from visits v
      join customers c on c.tenant_id = v.tenant_id and c.id = v.customer_id
      left join chemical_applications ca on ca.tenant_id = v.tenant_id and ca.visit_id = v.id
      where v.tenant_id = ${ctx.tenantId} and v.status = 'completed'
        and v.completed_at >= ${start}::timestamptz and v.completed_at < ${end}::timestamptz
      group by c.id, c.name
      having coalesce(sum(ca.cost_cents), 0) > 0
      order by cost desc
      limit 10`);

    const [mov] = await q<{ purchases: number; losses: number; consumed: number }>(sql`
      select
        coalesce(sum(quantity * coalesce(unit_cost_cents, 0)) filter (where kind = 'entrada'), 0)::int as purchases,
        coalesce(sum(-quantity * coalesce(unit_cost_cents, 0)) filter (where kind = 'perda'), 0)::int as losses,
        coalesce(sum(-quantity * coalesce(unit_cost_cents, 0)) filter (where kind = 'consumo_visita'), 0)::int as consumed
      from inventory_movements
      where tenant_id = ${ctx.tenantId} and created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz`);

    return {
      month,
      totals: {
        completedVisits: tot.visits,
        visitsWithProducts: tot.visits_with_products,
        chemicalCostCents: tot.cost,
        costPerVisitCents: tot.visits ? Math.round(tot.cost / tot.visits) : null,
        uncostedApplications: tot.uncosted,
        purchasesCents: mov.purchases,
        lossesCents: mov.losses,
        stockConsumedCents: mov.consumed,
      },
      topProducts: topProducts.map((t) => ({ productId: t.product_id, name: t.name, unit: t.unit, qty: t.qty, costCents: t.cost, visits: t.visits, uncosted: t.uncosted })),
      perCustomer: perCustomer.map((c) => ({ customerId: c.customer_id, name: c.name, visits: c.visits, costCents: c.cost, perVisitCents: c.visits ? Math.round(c.cost / c.visits) : 0 })),
    };
  });
}
