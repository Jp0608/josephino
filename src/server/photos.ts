import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { photos, visits, tenants } from "@/db/schema";
import type { Ctx } from "./auth";
import { can } from "./permissions";
import { saveImage, readFileByKey, deleteFileByKey } from "./storage";
import { NotFoundError, UserError } from "./errors";
import { audit } from "./audit";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

async function visitFor(ctx: C, visitId: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [v] = await tx.select().from(visits).where(and(eq(visits.tenantId, ctx.tenantId), eq(visits.id, visitId)));
    if (!v || (!can(ctx.role, "agenda.view_all") && v.assignedUserId !== ctx.userId)) throw new NotFoundError("Visita não encontrada.");
    return v;
  });
}

export async function addVisitPhoto(ctx: C, visitId: string, buf: Buffer, kind: string, caption: string | null) {
  const v = await visitFor(ctx, visitId);
  if (v.status === "completed") throw new UserError("Visita finalizada: o relatório já foi emitido com as fotos daquele momento.");
  const k = ["before", "after", "problem", "other"].includes(kind) ? kind : "other";
  const file = await saveImage(ctx.tenantId, buf);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .insert(photos)
      .values({ tenantId: ctx.tenantId, visitId, poolId: v.poolId, kind: k, storageKey: file.key, mime: file.mime, sizeBytes: file.size, caption: caption?.slice(0, 200) || null, uploadedBy: ctx.userId })
      .returning();
    await audit(tx, ctx, "photo.add", "photo", row.id, { visitId, kind: k });
    return row;
  });
}

export async function deleteVisitPhoto(ctx: C, photoId: string) {
  const row = await withTenant(ctx.tenantId, async (tx) => {
    const [p] = await tx.select().from(photos).where(and(eq(photos.tenantId, ctx.tenantId), eq(photos.id, photoId)));
    if (!p) throw new NotFoundError();
    return p;
  });
  if (row.visitId) {
    const v = await visitFor(ctx, row.visitId);
    if (v.status === "completed") throw new UserError("Foto de visita finalizada não pode ser apagada (faz parte do relatório emitido).");
  }
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.delete(photos).where(eq(photos.id, photoId));
    await audit(tx, ctx, "photo.delete", "photo", photoId);
  });
  await deleteFileByKey(row.storageKey);
}

export async function readTenantPhoto(ctx: C, photoId: string) {
  const p = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.select().from(photos).where(and(eq(photos.tenantId, ctx.tenantId), eq(photos.id, photoId)));
    return row;
  });
  if (!p) throw new NotFoundError();
  if (!can(ctx.role, "agenda.view_all") && p.visitId) await visitFor(ctx, p.visitId);
  return { buf: await readFileByKey(p.storageKey), mime: p.mime };
}

/** Foto pública: só se fizer parte do relatório daquele token. */
export async function readReportPhoto(tenantId: string, allowedIds: string[], photoId: string) {
  if (!allowedIds.includes(photoId)) throw new NotFoundError();
  const p = await withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(photos).where(and(eq(photos.tenantId, tenantId), eq(photos.id, photoId)));
    return row;
  });
  if (!p) throw new NotFoundError();
  return { buf: await readFileByKey(p.storageKey), mime: p.mime };
}

export async function setTenantLogo(ctx: C, buf: Buffer) {
  const file = await saveImage(ctx.tenantId, buf);
  const old = await withTenant(ctx.tenantId, async (tx) => {
    const [t] = await tx.select({ logoKey: tenants.logoKey }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    await tx.update(tenants).set({ logoKey: file.key, updatedAt: new Date() }).where(eq(tenants.id, ctx.tenantId));
    await audit(tx, ctx, "tenant.logo", "tenant", ctx.tenantId);
    return t?.logoKey;
  });
  if (old) await deleteFileByKey(old);
}

export async function readLogo(tenantId: string) {
  const key = await withTenant(tenantId, async (tx) => {
    const [t] = await tx.select({ logoKey: tenants.logoKey }).from(tenants).where(eq(tenants.id, tenantId));
    return t?.logoKey;
  });
  if (!key) throw new NotFoundError();
  const buf = await readFileByKey(key);
  const mime = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return { buf, mime };
}
