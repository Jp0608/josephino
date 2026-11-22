import { requireCtx } from "@/server/auth";
import { listPools } from "@/server/customers";
import { listTeamOptions } from "@/server/pools";
import { PageHeader, Card, EmptyState, LinkButton } from "@/components/ui";
import { isoDay } from "@/lib/format";
import { ScheduleForm } from "../ScheduleForm";

export const metadata = { title: "Agendar visita" };

export default async function NewVisit({ searchParams }: { searchParams: Promise<{ piscina?: string; cliente?: string; data?: string; tec?: string }> }) {
  const ctx = await requireCtx("agenda.write");
  const sp = await searchParams;
  const [pools, team] = await Promise.all([listPools(ctx), listTeamOptions(ctx)]);
  const opts = pools.filter((p) => p.pool.active).map((p) => ({ id: p.pool.id, customerId: p.pool.customerId, label: `${p.customerName} — ${p.pool.name} (${p.pool.code})` }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Agendar visita" back={{ href: "/app/agenda", label: "Agenda" }} />
      {opts.length === 0 ? (
        <Card><EmptyState title="Nenhuma piscina ativa" text="Cadastre um cliente e a piscina dele para começar a agendar." action={<LinkButton href="/app/clientes/novo">Novo cliente</LinkButton>} /></Card>
      ) : (
        <ScheduleForm pools={opts} team={team.filter((t) => t.role !== "sales" && t.role !== "finance")} defaults={{ poolId: sp.piscina, customerId: sp.cliente, date: sp.data ?? isoDay(), assignee: sp.tec }} />
      )}
    </div>
  );
}
