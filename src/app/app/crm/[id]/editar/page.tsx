import { redirect } from "next/navigation";
import { requireCtx, hasFeature } from "@/server/auth";
import { getLead, listTeamOptions } from "@/server/crm";
import { notFoundGuard } from "@/server/guards";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../../LeadForm";
import { updateLeadAction } from "../../actions";

export const metadata = { title: "Editar lead" };

export default async function EditLead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("crm.use");
  if (!hasFeature(ctx, "crm")) redirect(`/app/plano?recurso=${encodeURIComponent("CRM comercial")}`);
  const [d, members] = await Promise.all([notFoundGuard(() => getLead(ctx, id)), listTeamOptions(ctx)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar lead" subtitle={d.lead.name} back={{ href: `/app/crm/${id}`, label: d.lead.name }} />
      <LeadForm action={updateLeadAction.bind(null, id)} lead={d.lead} members={members} submit="Salvar alterações" />
    </div>
  );
}
