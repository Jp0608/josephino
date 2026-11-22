import Link from "next/link";
import { Search, Building2 } from "lucide-react";
import { listTenants, TENANT_STATUS_LABEL } from "@/server/platform";
import { Card, Badge, EmptyState, cx } from "@/components/ui";
import { STATUS_TONE } from "../status";
import { date, dateTime } from "@/lib/format";

export const metadata = { title: "Empresas" };

const FILTERS = { all: "Todas", ...TENANT_STATUS_LABEL } as Record<string, string>;

export default async function Tenants({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && sp.status in FILTERS ? sp.status : "all";
  const rows = await listTenants({ q: sp.q, status });
  const qs = (st: string) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (st !== "all") p.set("status", st);
    return `?${p}`;
  };
  return (
    <>
      <h1 className="text-[24px] font-extrabold text-ink">Empresas</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{rows.length} resultado{rows.length === 1 ? "" : "s"}</p>
      <form className="mb-4 flex flex-col gap-2 md:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nome ou identificador da empresa" className="input pl-9" aria-label="Buscar empresas" />
          {status !== "all" && <input type="hidden" name="status" value={status} />}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {Object.entries(FILTERS).map(([k, l]) => (
            <Link key={k} href={qs(k)} className={cx("whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold", status === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
              {l}
            </Link>
          ))}
        </div>
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title="Nenhuma empresa encontrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5">Empresa</th>
                  <th className="px-3 py-2.5">Plano</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5">Criada</th>
                  <th className="px-3 py-2.5">Fim do teste</th>
                  <th className="px-3 py-2.5 text-right">Usuários</th>
                  <th className="px-3 py-2.5 text-right">Piscinas</th>
                  <th className="px-4 py-2.5">Última atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/empresas/${t.id}`} className="font-semibold text-ink hover:text-primary">{t.name}</Link>
                      <span className="block text-[12px] text-muted">{t.slug}{t.isDemo ? " · demo" : ""}</span>
                    </td>
                    <td className="px-3 py-2.5">{t.planName ?? "—"}</td>
                    <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[t.effectiveStatus]}>{TENANT_STATUS_LABEL[t.effectiveStatus]}</Badge></td>
                    <td className="px-3 py-2.5 tabular">{date(t.createdAt)}</td>
                    <td className="px-3 py-2.5 tabular">{t.status === "trialing" ? date(t.trialEndsAt) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular">{t.users}</td>
                    <td className="px-3 py-2.5 text-right tabular">{t.pools}</td>
                    <td className="px-4 py-2.5 tabular text-muted">{t.lastActivity ? dateTime(t.lastActivity) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
