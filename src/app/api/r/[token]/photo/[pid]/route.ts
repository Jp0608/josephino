import { NextResponse } from "next/server";
import { getPublicReport } from "@/server/reports";
import { readReportPhoto } from "@/server/photos";
import { fileResponse } from "@/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ token: string; pid: string }> }) {
  const { token, pid } = await params;
  try {
    const pub = await getPublicReport(token);
    if (!pub) throw new Error();
    const f = await readReportPhoto(pub.tenantId, pub.snapshot.photos.map((p) => p.id), pid);
    return fileResponse(f.buf, f.mime, "private, max-age=86400");
  } catch {
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
