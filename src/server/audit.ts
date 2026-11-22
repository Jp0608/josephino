import type { Tx } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(
  tx: Tx,
  ctx: { tenantId: string; userId: string | null },
  action: string,
  entity: string,
  entityId: string | null,
  data?: Record<string, unknown>,
) {
  await tx.insert(auditLogs).values({ tenantId: ctx.tenantId, userId: ctx.userId, action, entity, entityId, data: data ?? null });
}
