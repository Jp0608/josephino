import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { listServiceRequests } from "@/server/settings";
import { Card, PageHeader, EmptyState, Badge, LinkButton, cx } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { dateTime } from "@/lib/format";
import { requestStatusAction } from "./actions";

export const metadata = { title: "Solicitações" };
const ST: Record<string, string> = { open: "Abertas", scheduled: "Agendadas", done: "Resolvidas", dismissed: "Descartadas", all: "Todas" };
const KIND: Record<string, string> = { visita_extra: "Visita adicional", problema: "Problema informado", outro: "Outro" };

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireCtx("agenda.write");
  const sp = await searchParams;
  const status = sp.status && sp.status in ST ? sp.status : "open";
  const rows = await listServiceRequests(ctx, status);
  return (
    <>
      <PageHeader title="Solicitações dos clientes" subtitle="Pedidos feitos pelo portal do cliente." />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {Object.entries(ST).map(([k, l]) => (
          <Link key={k} href={`?status=${k}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold", k === status ? "bg-primary-soft text-primary" : "text-muted")}>{l}</Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="Nenhuma solicitação" text="Quando um cliente pedir uma visita ou informar um problema pelo portal, aparece aqui." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ r, customerName, poolName }) => (
              <li key={r.id} className="px-4 py-4 md:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold"><Link href={`/app/clientes/${r.customerId}`} className="hover:text-primary">{customerName}</Link>{poolName ? ` · ${poolName}` : ""}</p>
                    <p className="text-[12px] text-muted">{KIND[r.kind] ?? r.kind} · {dateTime(r.createdAt)}</p>
                  </div>
                  <Badge tone={r.status === "open" ? "warn" : r.status === "done" ? "ok" : "neutral"}>{ST[r.status] ?? r.status}</Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{r.message}</p>
                {r.status === "open" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <LinkButton href={r.poolId ? `/app/agenda/nova?piscina=${r.poolId}` : `/app/agenda/nova?cliente=${r.customerId}`} size="sm">Agendar visita</LinkButton>
                    <ActionButton action={requestStatusAction.bind(null, r.id, "scheduled")}>Marcar como agendada</ActionButton>
                    <ActionButton action={requestStatusAction.bind(null, r.id, "done")}>Resolvida</ActionButton>
                    <ActionButton action={requestStatusAction.bind(null, r.id, "dismissed")} variant="ghost">Descartar</ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
