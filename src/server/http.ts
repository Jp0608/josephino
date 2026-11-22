import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UserError, NotFoundError, ForbiddenError } from "./errors";

/** Resposta JSON padronizada para rotas de API (usadas pelo modo offline e uploads). */
export async function api<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json({ ok: true, data: await fn() });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    if (e instanceof UserError) return NextResponse.json({ ok: false, error: e.message }, { status: 422 });
    if (e instanceof ZodError) return NextResponse.json({ ok: false, error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 422 });
    console.error("[api]", e);
    return NextResponse.json({ ok: false, error: "Erro inesperado. Tente de novo." }, { status: 500 });
  }
}

export function fileResponse(buf: Buffer, mime: string, cache = "private, max-age=3600") {
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": mime, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
