import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/ui";
import { FeatureLocked } from "../../../estoque/_locked";
import { PlanForm } from "../../PlanForm";
import { createPlanAction } from "../../actions";

export const metadata = { title: "Novo plano de serviço" };

export default async function NewPlan() {
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return <FeatureLocked title="Novo plano" feature="Contratos e planos" text="Planos de serviço fazem parte dos planos com o módulo de contratos." canManageBilling={can(ctx.role, "billing.manage")} />;
  return (
    <>
      <PageHeader title="Novo plano de serviço" subtitle="Modelo reutilizável para contratos" back={{ href: "/app/contratos#planos", label: "Contratos e planos" }} />
      <PlanForm action={createPlanAction} submit="Criar plano" />
    </>
  );
}
