import Link from "next/link";
import { ScrollText } from "lucide-react";
import { listPlatformAudit } from "@/server/platform";
import { Card, EmptyState } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Auditoria da plataforma" };

const ACTION_LABEL: Record<string, string> = {
  "tenant.plan": "Alterou plano",
  "tenant.status.active": "Ativou empresa",
  "tenant.status.past_due": "Marcou pagamento pendente",
  "tenant.status.suspended": "Suspendeu empresa",
  "tenant.status.cancelled": "Cancelou empresa",
  "tenant.trial_extend": "Prorrogou teste",
  "tenant.reactivate": "Reativou empresa",
  "plan.update": "Editou plano",
  "plan.create": "Criou plano",
};

function summary(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.reason === "string" && d.reason) return `Motivo: ${d.reason}`;
  if (typeof d.days === "number") return `+${d.days} dias`;
  if (typeof d.planCode === "string") return `Plano ${d.planCode}${d.note ? ` · ${d.note}` : ""}`;
  if (typeof d.code === "string") return `Plano ${d.code}`;
  return "";
}

export default async function PlatformAudit() {
  const rows = await listPlatformAudit(200);
  return (
    <>
      <h1 className="text-[24px] font-extrabold text-ink">Auditoria da plataforma</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Últimas 200 ações de administradores.</p>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-5" />} title="Nenhuma ação registrada" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ a, tenantName }) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:px-5">
                <span className="w-36 shrink-0 text-[12px] tabular text-muted">{dateTime(a.createdAt)}</span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
                  {tenantName && a.tenantId && (
                    <>
                      {" · "}
                      <Link href={`/admin/empresas/${a.tenantId}`} className="text-primary hover:underline">{tenantName}</Link>
                    </>
                  )}
                  {summary(a.data) && <span className="text-muted"> · {summary(a.data)}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-muted">{a.actorEmail}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
