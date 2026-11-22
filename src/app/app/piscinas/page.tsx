import Link from "next/link";
import { Waves, Plus, Search } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { listPools } from "@/server/customers";
import { Card, PageHeader, LinkButton, EmptyState, Badge } from "@/components/ui";
import { POOL_USAGE } from "@/lib/domain/catalog";
import { dateShort, daysBetween } from "@/lib/format";

export const metadata = { title: "Piscinas" };

export default async function Pools({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx("customers.read");
  const { q } = await searchParams;
  const rows = await listPools(ctx, { q });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Piscinas"
        subtitle={`${rows.filter((r) => r.pool.active).length} ativas`}
        actions={can(ctx.role, "pools.write") && <LinkButton href="/app/piscinas/nova"><Plus className="size-4" /> Nova piscina</LinkButton>}
      />
      <form className="relative mb-4" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input name="q" defaultValue={q} placeholder="Buscar por nome, código ou cliente" className="input pl-9" aria-label="Buscar piscinas" />
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Waves className="size-5" />} title={q ? "Nada encontrado" : "Nenhuma piscina cadastrada"} text="Cada piscina tem um prontuário técnico com todo o histórico de visitas, medições e produtos." action={!q && can(ctx.role, "pools.write") ? <LinkButton href="/app/piscinas/nova">Cadastrar piscina</LinkButton> : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ pool: p, customerName, lastVisit, outOfRange }) => {
              const days = lastVisit ? daysBetween(new Date(lastVisit), now) : null;
              const stale = p.active && (days == null || days > (p.frequencyDays ?? 7) * 2);
              return (
                <li key={p.id}>
                  <Link href={`/app/piscinas/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 md:px-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-[11px] font-bold text-primary">{p.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{customerName} · {p.name}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {POOL_USAGE[p.usage]}
                        {p.volumeLiters ? ` · ${p.volumeLiters.toLocaleString("pt-BR")} L` : ""}
                        {lastVisit ? ` · último atendimento ${dateShort(new Date(lastVisit))}` : " · nunca atendida"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {!p.active && <Badge>Inativa</Badge>}
                      {outOfRange > 0 && <Badge tone="warn">{outOfRange} fora da faixa</Badge>}
                      {stale && days != null && <Badge tone="danger">{days} dias sem visita</Badge>}
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
