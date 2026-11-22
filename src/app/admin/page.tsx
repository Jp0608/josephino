import Link from "next/link";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { getPlatformMetrics, listTenants, TENANT_STATUS_LABEL } from "@/server/platform";
import { Card, CardHeader, Stat, Badge, EmptyState } from "@/components/ui";
import { dateShort, money } from "@/lib/format";

export const metadata = { title: "Painel" };

const INTEGRATION_LABEL: Record<string, string> = { whatsapp: "WhatsApp oficial (Meta)", email: "E-mail (Resend)", payments: "Gateway de pagamento", maps: "Google Maps" };

export default async function AdminHome() {
  const [m, recent] = await Promise.all([getPlatformMetrics(), listTenants()]);
  const pct = m.conversionRate == null ? "—" : `${Math.round(m.conversionRate * 100)}%`;
  return (
    <>
      <h1 className="text-[24px] font-extrabold text-ink">Painel da plataforma</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Números sem as {m.demo} conta{m.demo === 1 ? "" : "s"} de demonstração.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="MRR" value={money(m.mrrCents)} hint="soma do preço do plano das empresas ativas" tone="ok" />
        <Stat label="Empresas" value={m.total} hint={`${m.newSignups30} novas em 30 dias`} href="/admin/empresas" />
        <Stat label="Conversão do teste" value={pct} hint="pagantes ÷ empresas que já saíram do teste" />
        <Stat label="Pagamento pendente" value={m.pastDue} tone={m.pastDue ? "warn" : undefined} href="/admin/empresas?status=past_due" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Ativas" value={m.active} href="/admin/empresas?status=active" />
        <Stat label="Em teste" value={m.trialing} href="/admin/empresas?status=trialing" />
        <Stat label="Teste vencido" value={m.trialExpired} tone={m.trialExpired ? "warn" : undefined} href="/admin/empresas?status=trial_expired" />
        <Stat label="Suspensas" value={m.suspended} tone={m.suspended ? "danger" : undefined} href="/admin/empresas?status=suspended" />
        <Stat label="Canceladas" value={m.cancelled} href="/admin/empresas?status=cancelled" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Cadastros recentes" action={<Link href="/admin/empresas" className="text-[13px] font-semibold text-primary">Ver todas</Link>} />
          {recent.length === 0 ? (
            <EmptyState title="Nenhuma empresa cadastrada" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {recent.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/empresas/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 md:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{t.name}{t.isDemo ? " (demo)" : ""}</span>
                      <span className="block text-[12px] text-muted">{t.planName ?? "Sem plano"} · desde {dateShort(t.createdAt)}</span>
                    </span>
                    <Badge tone={t.effectiveStatus === "active" ? "ok" : t.effectiveStatus === "trialing" ? "info" : t.effectiveStatus === "past_due" ? "warn" : "danger"}>
                      {TENANT_STATUS_LABEL[t.effectiveStatus]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <h2 className="text-[15px] font-bold text-ink">Uso (30 dias)</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[12px] font-semibold text-muted">Visitas concluídas</dt>
                <dd className="font-display text-[22px] font-extrabold tabular text-ink">{m.visits30.toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-muted">Relatórios emitidos</dt>
                <dd className="font-display text-[22px] font-extrabold tabular text-ink">{m.reports30.toLocaleString("pt-BR")}</dd>
                <dd className="text-[12px] text-muted">{m.reportsTotal.toLocaleString("pt-BR")} no total</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-4 md:p-5">
            <h2 className="text-[15px] font-bold text-ink">Integrações</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {Object.entries(m.integrations).map(([k, on]) => (
                <li key={k} className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{INTEGRATION_LABEL[k] ?? k}</span>
                  {on ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-ok"><CheckCircle2 className="size-4" /> Conectado</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-muted"><CircleSlash className="size-4" /> Não conectado</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
