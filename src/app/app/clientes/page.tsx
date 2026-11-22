import Link from "next/link";
import { Users, Search, Plus, Phone } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { listCustomers, customerAddress } from "@/server/customers";
import { Card, PageHeader, LinkButton, EmptyState, Badge, cx } from "@/components/ui";
import { dateShort, money } from "@/lib/format";

export const metadata = { title: "Clientes" };

const STATUS = { all: "Todos", active: "Ativos", paused: "Pausados", inactive: "Inativos" } as const;

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await requireCtx("customers.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUS ? sp.status : "active";
  const res = await listCustomers(ctx, { q: sp.q, status, page: Number(sp.page) || 1 });
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { q: sp.q, status, ...o };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, String(v));
    return `?${p}`;
  };
  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${res.total} ${res.total === 1 ? "cliente" : "clientes"}${status !== "all" ? ` ${STATUS[status as keyof typeof STATUS].toLowerCase().replace(/s$/, res.total === 1 ? "" : "s")}` : ""}`}
        actions={can(ctx.role, "customers.write") && <LinkButton href="/app/clientes/novo"><Plus className="size-4" /> Novo cliente</LinkButton>}
      />
      <form className="mb-4 flex flex-col gap-2 md:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nome, telefone, endereço ou código da piscina" className="input pl-9" aria-label="Buscar clientes" />
          <input type="hidden" name="status" value={status} />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {Object.entries(STATUS).map(([k, l]) => (
            <Link key={k} href={qs({ status: k, page: undefined })} className={cx("rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap", status === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
              {l}
            </Link>
          ))}
        </div>
      </form>
      <Card>
        {res.rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={sp.q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
            text={sp.q ? "Tente outro termo de busca." : "Cadastre o primeiro cliente e as piscinas que você atende."}
            action={!sp.q && can(ctx.role, "customers.write") ? <LinkButton href="/app/clientes/novo">Cadastrar cliente</LinkButton> : undefined}
          />
        ) : (
          <ul className="divide-y divide-line">
            {res.rows.map((c) => (
              <li key={c.id}>
                <Link href={`/app/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2 md:px-5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-[13px] font-bold text-primary">
                    {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                      {c.name}
                      {c.status !== "active" && <Badge>{c.status === "paused" ? "Pausado" : "Inativo"}</Badge>}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {c.poolCount} piscina{c.poolCount === 1 ? "" : "s"}
                      {customerAddress(c) ? ` · ${customerAddress(c)}` : ""}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right text-[12px] text-muted sm:block">
                    {c.nextVisit ? <p>Próxima: <span className="font-semibold text-ink">{dateShort(c.nextVisit)}</span></p> : <p className="text-warn">Sem visita futura</p>}
                    {c.lastVisit && <p>Última: {dateShort(c.lastVisit)}</p>}
                  </div>
                  {c.overdueCents > 0 && can(ctx.role, "finance.read") && <Badge tone="danger">{money(c.overdueCents)} atrasado</Badge>}
                  {(c.whatsapp || c.phone) && <Phone className="hidden size-4 text-muted md:block" aria-label="Tem telefone" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {res.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {res.page > 1 && <Link href={qs({ page: res.page - 1 })} className="font-semibold text-primary">← Anterior</Link>}
          <span className="text-muted">Página {res.page} de {res.pages}</span>
          {res.page < res.pages && <Link href={qs({ page: res.page + 1 })} className="font-semibold text-primary">Próxima →</Link>}
        </div>
      )}
    </>
  );
}
