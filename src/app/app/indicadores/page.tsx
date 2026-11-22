import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { getInsights } from "@/server/settings";
import { Card, CardHeader, PageHeader, Stat, EmptyState, LinkButton } from "@/components/ui";
import { money } from "@/lib/format";

export const metadata = { title: "Indicadores" };

export default async function Insights() {
  const ctx = await requireCtx("insights.view");
  if (!hasFeature(ctx, "insights"))
    return (
      <Card><EmptyState icon={<BarChart3 className="size-5" />} title="Indicadores fazem parte do plano Pro" text="Veja visitas por mês, produtividade da equipe, rentabilidade por cliente e piscinas com mais problemas." action={<LinkButton href="/app/plano?recurso=Indicadores">Ver planos</LinkButton>} /></Card>
    );
  const d = await getInsights(ctx);
  const max = Math.max(1, ...d.months.map((m) => m.total));
  const totals = d.months.reduce((a, m) => ({ done: a.done + m.done, cancelled: a.cancelled + m.cancelled, total: a.total + m.total }), { done: 0, cancelled: 0, total: 0 });
  return (
    <>
      <PageHeader title="Indicadores" subtitle="Calculados a partir dos registros reais da sua empresa. Fonte e período indicados em cada bloco." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Clientes ativos" value={d.growth?.active ?? 0} hint={`${d.growth?.new30 ?? 0} novos em 30 dias`} />
        <Stat label="Clientes inativos" value={d.growth?.inactive ?? 0} />
        <Stat label="Visitas (6 meses)" value={totals.total} hint={`${totals.done} concluídas`} />
        <Stat label="Taxa de cancelamento" value={totals.total ? `${Math.round((totals.cancelled / totals.total) * 100)}%` : "—"} hint="canceladas / agendadas, 6 meses" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Visitas por mês" subtitle="Fonte: agenda · últimos 6 meses" />
          {d.months.length === 0 ? <EmptyState title="Sem visitas no período" /> : (
            <div className="flex h-52 items-end gap-3 border-t border-line px-5 pb-4 pt-6">
              {d.months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[12px] font-semibold tabular">{m.done}/{m.total}</span>
                  <div className="relative w-full max-w-12 overflow-hidden rounded-t-md bg-surface-2" style={{ height: `${(m.total / max) * 140}px` }}>
                    <div className="absolute inset-x-0 bottom-0 bg-primary" style={{ height: `${m.total ? (m.done / m.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[11px] text-muted">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Produtividade por responsável" subtitle="Fonte: visitas concluídas · últimos 90 dias" />
          {d.byTech.length === 0 ? <EmptyState title="Sem visitas concluídas" /> : (
            <ul className="divide-y divide-line border-t border-line">
              {d.byTech.map((t) => (
                <li key={t.name} className="flex justify-between px-5 py-3 text-sm"><span className="font-semibold">{t.name}</span><span className="tabular text-muted">{t.done} visitas{t.avg_min != null ? ` · ${t.avg_min} min em média` : ""}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Receita e custo químico por cliente" subtitle="Fonte: pagamentos registrados e produtos aplicados · últimos 90 dias" />
          {d.revenue.every((r) => !r.received && !r.chem) ? <EmptyState title="Sem pagamentos ou produtos registrados no período" /> : (
            <ul className="divide-y divide-line border-t border-line">
              {d.revenue.filter((r) => r.received || r.chem).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <Link href={`/app/clientes/${r.id}`} className="font-semibold hover:text-primary">{r.name}</Link>
                  <span className="text-right tabular"><span className="block">{money(r.received)} recebido</span><span className="block text-[12px] text-muted">{money(r.chem)} em produtos · margem est. {money(r.received - r.chem)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Piscinas com mais medições fora da faixa" subtitle="Fonte: medições · últimos 30 dias · faixas configuradas pela empresa" />
          {d.problems.length === 0 ? <EmptyState title="Nenhuma medição fora da faixa" /> : (
            <ul className="divide-y divide-line border-t border-line">
              {d.problems.map((p) => (
                <li key={p.id}><Link href={`/app/piscinas/${p.id}`} className="flex justify-between px-5 py-3 text-sm hover:bg-surface-2"><span><b>{p.customer}</b> · {p.pool}</span><span className="tabular text-warn">{p.n} medições</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
