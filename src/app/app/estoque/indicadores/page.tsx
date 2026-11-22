import Link from "next/link";
import { BarChart3, Users, FlaskConical, Info } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getInventoryInsights } from "@/server/inventory";
import { Card, CardHeader, PageHeader, EmptyState, Stat } from "@/components/ui";
import { money, num } from "@/lib/format";
import { FeatureLocked } from "../_locked";
import { MonthNav } from "../_month";

export const metadata = { title: "Consumo e custos" };

export default async function InventoryInsights({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requireCtx("inventory.read");
  if (!hasFeature(ctx, "inventory"))
    return <FeatureLocked title="Consumo e custos" feature="Controle de estoque" text="Indicadores de consumo e custo químico fazem parte dos planos com controle de estoque." canManageBilling={can(ctx.role, "billing.manage")} />;
  const sp = await searchParams;
  const d = await getInventoryInsights(ctx, sp.mes);
  const t = d.totals;
  const maxVisits = Math.max(1, ...d.topProducts.map((p) => p.visits));

  return (
    <>
      <PageHeader
        title="Consumo e custos"
        subtitle="Calculado dos produtos registrados nas visitas concluídas no mês"
        back={{ href: "/app/estoque", label: "Estoque" }}
        actions={<MonthNav month={d.month} href={(m) => `/app/estoque/indicadores?mes=${m}`} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Custo químico" value={money(t.chemicalCostCents)} hint={`${t.visitsWithProducts} de ${t.completedVisits} visitas com produto`} />
        <Stat label="Custo por visita" value={t.costPerVisitCents == null ? "—" : money(t.costPerVisitCents)} hint={t.completedVisits ? `média de ${t.completedVisits} visitas concluídas` : "nenhuma visita concluída"} />
        <Stat label="Compras (entradas)" value={money(t.purchasesCents)} hint="pelo custo informado na entrada" />
        <Stat label="Perdas" value={money(t.lossesCents)} tone={t.lossesCents ? "warn" : undefined} hint="avarias e descartes registrados" />
      </div>

      {t.uncostedApplications > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-info-soft px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {t.uncostedApplications} aplicação{t.uncostedApplications > 1 ? "ões" : ""} no mês sem custo: o produto não tinha custo por unidade cadastrado ou foi digitado fora do estoque. Os valores acima não incluem essas aplicações.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Produtos mais usados" subtitle="por número de visitas em que foram aplicados" icon={<FlaskConical className="size-[18px]" />} />
          {d.topProducts.length === 0 ? (
            <EmptyState icon={<BarChart3 className="size-5" />} title="Sem aplicações no mês" text="Os produtos registrados pelos técnicos ao finalizar visitas aparecem aqui." />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d.topProducts.map((p, i) => (
                <li key={`${p.productId ?? p.name}-${p.unit}-${i}`} className="px-4 py-3 md:px-5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-ink">
                      {p.productId ? <Link href={`/app/estoque/${p.productId}`} className="hover:text-primary">{p.name}</Link> : p.name}
                      {!p.productId && <span className="ml-1.5 text-[12px] font-medium text-muted">(fora do cadastro)</span>}
                    </span>
                    <span className="shrink-0 tabular text-muted">
                      {num(p.qty, 3)} {p.unit} · {p.costCents != null ? money(p.costCents) : "sem custo"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((p.visits / maxVisits) * 100)}%` }} />
                    </div>
                    <span className="w-16 text-right text-[12px] tabular text-muted">{p.visits} visita{p.visits > 1 ? "s" : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Custo químico por cliente" subtitle="soma do custo dos produtos nas visitas concluídas" icon={<Users className="size-[18px]" />} />
          {d.perCustomer.length === 0 ? (
            <EmptyState title="Sem custo registrado no mês" text="Cadastre o custo por unidade dos produtos para acompanhar quanto cada cliente consome." />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d.perCustomer.map((c) => (
                <li key={c.customerId}>
                  <Link href={`/app/clientes/${c.customerId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2 md:px-5">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{c.name}</span>
                      <span className="block text-[12px] text-muted">
                        {c.visits} visita{c.visits > 1 ? "s" : ""} · {money(c.perVisitCents)} por visita
                      </span>
                    </span>
                    <span className="shrink-0 font-display font-bold tabular">{money(c.costCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-5 text-[12px] text-muted">
        Custos calculados com o custo por unidade cadastrado no produto no momento em que a aplicação foi registrada. Para a margem por cliente (recebido − custo químico), veja o Financeiro.
      </p>
    </>
  );
}
