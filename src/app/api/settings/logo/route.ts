import { actionCtx } from "@/server/auth";
import { api } from "@/server/http";
import { setTenantLogo } from "@/server/photos";
import { UserError } from "@/server/errors";

export async function POST(req: Request) {
  return api(async () => {
    const ctx = await actionCtx("settings.manage");
    const f = (await req.formData()).get("file");
    if (!(f instanceof Blob)) throw new UserError("Envie uma imagem.");
    await setTenantLogo(ctx, Buffer.from(await f.arrayBuffer()));
    return { ok: true };
  });
}
