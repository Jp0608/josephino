import { NextResponse } from "next/server";
import { getCtx } from "@/server/auth";
import { readTenantPhoto } from "@/server/photos";
import { fileResponse } from "@/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!ctx?.tenantId) return new NextResponse("Não autorizado", { status: 401 });
  try {
    const f = await readTenantPhoto(ctx, id);
    return fileResponse(f.buf, f.mime);
  } catch {
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
