import { ScrollText } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { listAudit, AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL } from "@/server/team";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Trilha de auditoria" };

export default async function AuditTrail() {
  const ctx = await requireCtx("audit.read");
  const rows = await listAudit(ctx, 100);
  return (
    <>
      <PageHeader
        title="Trilha de auditoria"
        subtitle="Últimos 100 registros: quem fez o quê e quando."
        back={can(ctx.role, "team.manage") ? { href: "/app/equipe", label: "Equipe" } : { href: "/app", label: "Início" }}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-5" />} title="Nenhum registro ainda" text="Ações como cadastros, alterações e mudanças de acesso aparecem aqui." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:px-5">
                <span className="w-36 shrink-0 text-[12px] tabular text-muted">{dateTime(r.createdAt)}</span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  <span className="font-semibold">{r.userName ?? "Sistema / link público"}</span> · {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                </span>
                <span className="shrink-0 text-[12px] text-muted">
                  {AUDIT_ENTITY_LABEL[r.entity] ?? r.entity}
                  {r.entityId ? ` #${r.entityId.slice(0, 8)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
