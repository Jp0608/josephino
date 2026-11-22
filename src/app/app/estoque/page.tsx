import Link from "next/link";
import { FlaskConical, Plus, Search, BarChart3, ChevronRight } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { listProducts, PRODUCT_FILTERS, PRODUCT_ALERT_LABEL, type ProductAlert } from "@/server/inventory";
import { Card, PageHeader, LinkButton, EmptyState, Badge, Stat, cx, type Tone } from "@/components/ui";
import { PRODUCT_CATEGORIES } from "@/lib/domain/catalog";
import { date, money, num } from "@/lib/format";
import { FeatureLocked } from "./_locked";

export const metadata = { title: "Estoque" };

const ALERT_TONE: Record<ProductAlert, Tone> = { low: "warn", negative: "danger", expiring: "warn", expired: "danger", no_lot: "neutral" };

export default async function Inventory({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string }> }) {
  const ctx = await requireCtx("inventory.read");
  if (!hasFeature(ctx, "inventory"))
    return (
      <FeatureLocked
        title="Estoque"
        feature="Controle de estoque"
        text="Cadastre produtos químicos, registre entradas e perdas, receba alertas de estoque baixo e validade e acompanhe o custo químico por visita."
        canManageBilling={can(ctx.role, "billing.manage")}
      />
    );
  const sp = await searchParams;
  const res = await listProducts(ctx, { q: sp.q, filter: sp.filtro });
  const canWrite = can(ctx.role, "inventory.write");
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, filtro: res.filter, ...o })) if (v) p.set(k, v);
    return `?${p}`;
  };
  const c = res.counts;

  return (
    <>
      <PageHeader
        title="Estoque"
        subtitle="Produtos químicos, saldos, lotes e validade"
        actions={
          <>
            <LinkButton href="/app/estoque/indicadores" variant="secondary">
              <BarChart3 className="size-4" /> Consumo e custos
            </LinkButton>
            {canWrite && (
              <LinkButton href="/app/estoque/novo">
                <Plus className="size-4" /> Novo produto
              </LinkButton>
            )}
          </>
        }
      />

      {res.filter !== "inativos" && c.total > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Estoque baixo" value={c.low} tone={c.low ? "warn" : undefined} hint="no mínimo ou abaixo" href={qs({ filtro: "baixo" })} />
          <Stat label="Vencendo" value={c.expiring} tone={c.expiring ? "warn" : undefined} hint="em até 30 dias" href={qs({ filtro: "validade" })} />
          <Stat label="Vencidos" value={c.expired} tone={c.expired ? "danger" : undefined} hint="com saldo em estoque" href={qs({ filtro: "validade" })} />
          <Stat label="Valor em estoque" value={money(c.stockValueCents)} hint={c.noLot ? `${c.noLot} sem lote informado` : "pelo custo cadastrado"} />
        </div>
      )}

      <form className="mb-4 flex flex-col gap-2 md:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nome, marca, fabricante, princípio ativo…" className="input" style={{ paddingLeft: 36 }} aria-label="Buscar produtos" />
          <input type="hidden" name="filtro" value={res.filter} />
        </div>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {Object.entries(PRODUCT_FILTERS).map(([k, l]) => (
            <Link key={k} href={qs({ filtro: k })} className={cx("rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap", res.filter === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
              {l}
            </Link>
          ))}
        </div>
      </form>

      <Card>
        {res.rows.length === 0 ? (
          <EmptyState
            icon={<FlaskConical className="size-5" />}
            title={sp.q || res.filter !== "ativos" ? "Nenhum produto neste filtro" : "Nenhum produto cadastrado"}
            text={sp.q || res.filter !== "ativos" ? "Tente outro termo ou filtro." : "Cadastre os produtos que sua equipe usa. As baixas acontecem automaticamente quando o técnico confirma o consumo ao finalizar a visita."}
            action={!sp.q && res.filter === "ativos" && canWrite ? <LinkButton href="/app/estoque/novo">Cadastrar produto</LinkButton> : undefined}
          />
        ) : (
          <>
            <div className="hidden grid-cols-[1fr_120px_130px_110px_20px] gap-3 border-b border-line px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted md:grid">
              <span>Produto</span>
              <span className="text-right">Saldo</span>
              <span>Validade</span>
              <span className="text-right">Custo/un.</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {res.rows.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/estoque/${p.id}`} className="flex flex-col gap-1.5 px-4 py-3.5 transition hover:bg-surface-2 md:grid md:grid-cols-[1fr_120px_130px_110px_20px] md:items-center md:gap-3 md:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                      <p className="truncate text-[13px] text-muted">
                        {[PRODUCT_CATEGORIES[p.category] ?? p.category, p.brand || p.manufacturer, p.concentration].filter(Boolean).join(" · ")}
                      </p>
                      {p.alerts.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.alerts.map((a) => (
                            <Badge key={a} tone={ALERT_TONE[a]}>{PRODUCT_ALERT_LABEL[a]}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[13px] md:contents">
                      <span className={cx("font-display text-[15px] font-bold tabular md:text-right", p.stockQty < 0 ? "text-danger" : p.alerts.includes("low") ? "text-warn" : "text-ink")}>
                        {num(p.stockQty, 3)} {p.unit}
                        {p.minQty != null && <span className="block text-[11px] font-medium text-muted">mín. {num(p.minQty, 3)}</span>}
                      </span>
                      <span className="text-muted">
                        {p.expiresOn ? <span className={p.alerts.includes("expired") ? "font-semibold text-danger" : ""}>{date(p.expiresOn)}</span> : "—"}
                        {p.lot && <span className="block text-[11px]">lote {p.lot}</span>}
                      </span>
                      <span className="text-muted tabular md:text-right">{money(p.costCentsPerUnit)}</span>
                      <ChevronRight className="hidden size-4 text-muted md:block" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
