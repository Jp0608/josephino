import { NextResponse } from "next/server";
import { getPortal } from "@/server/settings";
import { readLogo } from "@/server/photos";
import { fileResponse } from "@/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const p = await getPortal(token);
    if (!p) throw new Error();
    const f = await readLogo(p.tenantId);
    return fileResponse(f.buf, f.mime, "private, max-age=3600");
  } catch {
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
