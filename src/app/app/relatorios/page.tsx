import Link from "next/link";
import { FileText } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { listReports } from "@/server/reports";
import { Card, PageHeader, EmptyState, Badge } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Relatórios" };

const SEND: Record<string, { t: string; tone: "ok" | "warn" | "neutral" | "danger" | "info" }> = {
  sent: { t: "Enviado (WhatsApp oficial)", tone: "ok" },
  delivered: { t: "Entregue", tone: "ok" },
  manual: { t: "Compartilhado pelo profissional", tone: "info" },
  queued: { t: "Na fila de envio", tone: "neutral" },
  pending_integration: { t: "Aguardando envio", tone: "warn" },
  failed: { t: "Falha no envio", tone: "danger" },
};

export default async function Reports({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireCtx("reports.read");
  const sp = await searchParams;
  const rows = await listReports(ctx, { page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Relatórios técnicos" subtitle="Gerados automaticamente ao finalizar cada visita." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="Nenhum relatório ainda" text="Finalize um atendimento para gerar o primeiro relatório profissional." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const st = SEND[r.sentStatus ?? ""] ?? null;
              return (
                <li key={r.id}>
                  <Link href={`/app/relatorios/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 md:px-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><FileText className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.customerName} · {r.poolName}</span>
                      <span className="block text-[13px] text-muted">{r.protocol} · {dateTime(r.createdAt)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {st && <Badge tone={st.tone}>{st.t}</Badge>}
                      <span className="text-[12px] text-muted">{r.viewCount ? `visto ${r.viewCount}×` : "não visualizado"}{r.acknowledgedAt ? " · ciência ok" : ""}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
