import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { pools, customers, poolEquipment, visits, measurements, technicalReports, photos, chemicalApplications, parameterDefinitions, memberships, users } from "@/db/schema";
import type { Ctx } from "./auth";
import { audit } from "./audit";
import { NotFoundError } from "./errors";
import { can } from "./permissions";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

/** Técnico só abre piscinas que tem (ou teve) visita atribuída a ele. */
async function assertTechnicianAccess(tx: Parameters<Parameters<typeof withTenant>[1]>[0], ctx: C, poolId: string) {
  if (can(ctx.role, "agenda.view_all")) return;
  const [v] = await tx
    .select({ id: visits.id })
    .from(visits)
    .where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.poolId, poolId), eq(visits.assignedUserId, ctx.userId)))
    .limit(1);
  if (!v) throw new NotFoundError("Piscina não encontrada.");
}

export async function getPool(ctx: C, id: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select({ pool: pools, customer: customers })
      .from(pools)
      .innerJoin(customers, and(eq(customers.tenantId, pools.tenantId), eq(customers.id, pools.customerId)))
      .where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, id)))
      .limit(1);
    if (!row) throw new NotFoundError("Piscina não encontrada.");
    await assertTechnicianAccess(tx, ctx, id);
    const equipment = await tx.select().from(poolEquipment).where(and(eq(poolEquipment.tenantId, ctx.tenantId), eq(poolEquipment.poolId, id))).orderBy(asc(poolEquipment.kind));
    const visitRows = await tx
      .select({ v: visits, techName: users.name })
      .from(visits)
      .leftJoin(users, eq(users.id, visits.assignedUserId))
      .where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.poolId, id)))
      .orderBy(desc(visits.scheduledStart))
      .limit(60);
    const visitIds = visitRows.map((r) => r.v.id);
    const meas = await tx
      .select()
      .from(measurements)
      .where(and(eq(measurements.tenantId, ctx.tenantId), eq(measurements.poolId, id)))
      .orderBy(asc(measurements.measuredAt));
    const chems = visitIds.length
      ? await tx.select().from(chemicalApplications).where(and(eq(chemicalApplications.tenantId, ctx.tenantId), inArray(chemicalApplications.visitId, visitIds)))
      : [];
    const reports = await tx
      .select({ id: technicalReports.id, protocol: technicalReports.protocol, publicToken: technicalReports.publicToken, createdAt: technicalReports.createdAt, visitId: technicalReports.visitId })
      .from(technicalReports)
      .where(and(eq(technicalReports.tenantId, ctx.tenantId), eq(technicalReports.poolId, id)))
      .orderBy(desc(technicalReports.createdAt));
    const photoRows = await tx
      .select()
      .from(photos)
      .where(and(eq(photos.tenantId, ctx.tenantId), eq(photos.poolId, id)))
      .orderBy(desc(photos.createdAt))
      .limit(24);
    const params = await tx.select().from(parameterDefinitions).where(and(eq(parameterDefinitions.tenantId, ctx.tenantId), eq(parameterDefinitions.active, true))).orderBy(asc(parameterDefinitions.sortOrder));
    return {
      pool: row.pool,
      customer: can(ctx.role, "customers.internal_notes") ? row.customer : { ...row.customer, internalNotes: null },
      equipment,
      visits: visitRows.map((r) => ({ ...r.v, techName: r.techName })),
      measurements: meas,
      chemicals: chems,
      reports,
      photos: photoRows,
      params,
    };
  });
}

const optDate = z.string().trim().optional().transform((v) => (v ? v : null));
export const equipmentSchema = z.object({
  kind: z.string().trim().min(1),
  brand: z.string().trim().max(120).optional().transform((v) => v || null),
  model: z.string().trim().max(120).optional().transform((v) => v || null),
  serial: z.string().trim().max(120).optional().transform((v) => v || null),
  installedOn: optDate,
  warrantyUntil: optDate,
  nextServiceOn: optDate,
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function addEquipment(ctx: C, poolId: string, input: z.input<typeof equipmentSchema>) {
  const d = equipmentSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [p] = await tx.select({ id: pools.id }).from(pools).where(and(eq(pools.tenantId, ctx.tenantId), eq(pools.id, poolId))).limit(1);
    if (!p) throw new NotFoundError();
    const [row] = await tx.insert(poolEquipment).values({ ...d, tenantId: ctx.tenantId, poolId }).returning();
    await audit(tx, ctx, "equipment.create", "pool_equipment", row.id, { poolId, kind: d.kind });
    return row;
  });
}

export async function removeEquipment(ctx: C, id: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    await tx.update(poolEquipment).set({ active: false }).where(and(eq(poolEquipment.tenantId, ctx.tenantId), eq(poolEquipment.id, id)));
    await audit(tx, ctx, "equipment.deactivate", "pool_equipment", id);
  });
}

export async function listTeamOptions(ctx: C) {
  return withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({ userId: users.id, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.active, true)))
      .orderBy(asc(users.name)),
  );
}
