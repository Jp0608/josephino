import { NextResponse } from "next/server";
import { getPublicReport } from "@/server/reports";
import { readLogo } from "@/server/photos";
import { fileResponse } from "@/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const pub = await getPublicReport(token);
    if (!pub) throw new Error();
    const f = await readLogo(pub.tenantId);
    return fileResponse(f.buf, f.mime, "private, max-age=3600");
  } catch {
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
