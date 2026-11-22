import { redirect } from "next/navigation";
import { requireCtx, hasFeature } from "@/server/auth";
import { listTeamOptions } from "@/server/crm";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../LeadForm";
import { createLeadAction } from "../actions";

export const metadata = { title: "Novo lead" };

export default async function NewLead() {
  const ctx = await requireCtx("crm.use");
  if (!hasFeature(ctx, "crm")) redirect(`/app/plano?recurso=${encodeURIComponent("CRM comercial")}`);
  const members = await listTeamOptions(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo lead" subtitle="Ele entra no funil na etapa “Lead novo”." back={{ href: "/app/crm", label: "CRM comercial" }} />
      <LeadForm action={createLeadAction} members={members} submit="Cadastrar lead" />
    </div>
  );
}
