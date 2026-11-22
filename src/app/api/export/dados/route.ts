import { NextResponse } from "next/server";
import { getCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { exportTenantData } from "@/server/billing";
import { isoDay } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Portabilidade de dados (LGPD): JSON com os dados operacionais da empresa logada. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx || !ctx.tenantId) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (ctx.subscription.blocked) return NextResponse.json({ error: "Conta suspensa." }, { status: 403 });
  if (!can(ctx.role, "billing.manage")) return NextResponse.json({ error: "Você não tem permissão para exportar os dados." }, { status: 403 });
  const data = await exportTenantData(ctx);
  const body = JSON.stringify(
    {
      format: "ondaro-export-v1",
      exportedAt: new Date().toISOString(),
      company: { id: ctx.tenantId, name: ctx.tenant.name, slug: ctx.tenant.slug },
      exportedBy: ctx.email,
      notes: "Valores monetários em centavos (BRL). Datas em ISO 8601 (UTC). Links públicos (tokens) não são exportados.",
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      ...data,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ondaro-${ctx.tenant.slug}-${isoDay()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
