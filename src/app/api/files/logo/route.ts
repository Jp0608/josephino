import { NextResponse } from "next/server";
import { getCtx } from "@/server/auth";
import { readLogo } from "@/server/photos";
import { fileResponse } from "@/server/http";

export async function GET() {
  const ctx = await getCtx();
  if (!ctx?.tenantId) return new NextResponse("Não autorizado", { status: 401 });
  try {
    const f = await readLogo(ctx.tenantId);
    return fileResponse(f.buf, f.mime, "private, no-cache");
  } catch {
    return new NextResponse("Sem logo", { status: 404 });
  }
}
