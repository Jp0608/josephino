import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getServicePlan } from "@/server/contracts";
import { notFoundGuard } from "@/server/guards";
import { PageHeader } from "@/components/ui";
import { FeatureLocked } from "../../../estoque/_locked";
import { PlanForm } from "../../PlanForm";
import { updatePlanAction } from "../../actions";

export const metadata = { title: "Editar plano de serviço" };

export default async function EditPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return <FeatureLocked title="Editar plano" feature="Contratos e planos" text="Planos de serviço fazem parte dos planos com o módulo de contratos." canManageBilling={can(ctx.role, "billing.manage")} />;
  const p = await notFoundGuard(() => getServicePlan(ctx, id));
  return (
    <>
      <PageHeader title="Editar plano" subtitle={`${p.name} — alterações não mudam contratos já criados`} back={{ href: "/app/contratos#planos", label: "Contratos e planos" }} />
      <PlanForm action={updatePlanAction.bind(null, id)} p={p} submit="Salvar plano" />
    </>
  );
}
