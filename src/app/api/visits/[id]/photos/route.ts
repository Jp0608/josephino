import { actionCtx } from "@/server/auth";
import { api } from "@/server/http";
import { addVisitPhoto } from "@/server/photos";
import { UserError } from "@/server/errors";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async () => {
    const ctx = await actionCtx("visits.execute");
    const fd = await req.formData();
    const f = fd.get("file");
    if (!(f instanceof Blob)) throw new UserError("Envie uma imagem.");
    const row = await addVisitPhoto(ctx, id, Buffer.from(await f.arrayBuffer()), String(fd.get("kind") || "other"), (fd.get("caption") as string) || null);
    return { id: row.id, kind: row.kind, caption: row.caption };
  });
}
