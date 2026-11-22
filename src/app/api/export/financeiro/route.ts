import { actionCtx, hasFeature } from "@/server/auth";
import { exportFinanceCsv } from "@/server/finance";
import { UserError } from "@/server/errors";
import { parseMonth } from "@/server/fields";

/** GET /api/export/financeiro?month=AAAA-MM&tipo=receber|pagar — CSV da empresa logada. */
export async function GET(req: Request) {
  try {
    // Exportação é leitura: continua liberada no modo somente-leitura (teste vencido).
    const ctx = await actionCtx("finance.read", { write: false });
    if (!hasFeature(ctx, "finance")) return new Response("Módulo financeiro não incluído no plano.", { status: 403 });
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo") === "pagar" ? "pagar" : "receber";
    const month = parseMonth(url.searchParams.get("month"));
    const { filename, body } = await exportFinanceCsv(ctx, tipo, month);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return new Response(e.message, { status: e.code === "forbidden" ? 403 : 400 });
    console.error("[export financeiro]", e);
    return new Response("Não foi possível exportar.", { status: 500 });
  }
}
