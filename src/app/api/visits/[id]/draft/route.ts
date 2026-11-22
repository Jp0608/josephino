import { actionCtx } from "@/server/auth";
import { api } from "@/server/http";
import { saveDraft, completeVisit } from "@/server/visits";

/** Autosave/sincronização offline do rascunho e finalização. JSON para permitir reenvio pela fila do aparelho. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async () => {
    const ctx = await actionCtx("visits.execute");
    const body = await req.json();
    return saveDraft(ctx, id, body.draft, { overwrite: !!body.overwrite });
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async () => {
    const ctx = await actionCtx("visits.execute");
    const body = await req.json();
    return completeVisit(ctx, id, body);
  });
}
