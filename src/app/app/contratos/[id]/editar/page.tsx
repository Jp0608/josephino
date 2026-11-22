import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getContract, getContractFormOptions } from "@/server/contracts";
import { notFoundGuard } from "@/server/guards";
import { PageHeader } from "@/components/ui";
import { isoDay } from "@/lib/format";
import { FeatureLocked } from "../../../estoque/_locked";
import { ContractForm } from "../../ContractForm";
import { updateContractAction } from "../../actions";

export const metadata = { title: "Editar contrato" };

export default async function EditContract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return <FeatureLocked title="Editar contrato" feature="Contratos e planos" text="Contratos recorrentes fazem parte dos planos com o módulo de contratos." canManageBilling={can(ctx.role, "billing.manage")} />;
  const [d, o] = await Promise.all([notFoundGuard(() => getContract(ctx, id)), getContractFormOptions(ctx)]);
  // O cliente do contrato continua na lista mesmo se estiver inativo.
  const customers = o.customers.some((c) => c.id === d.customer.id) ? o.customers : [{ id: d.customer.id, name: d.customer.name }, ...o.customers];
  const plans = d.plan && !o.plans.some((p) => p.id === d.plan!.id) ? [d.plan, ...o.plans] : o.plans;
  return (
    <>
      <PageHeader title="Editar contrato" subtitle={d.customer.name} back={{ href: `/app/contratos/${id}`, label: d.contract.title }} />
      <ContractForm
        action={updateContractAction.bind(null, id)}
        customers={customers}
        pools={o.pools}
        plans={plans}
        team={o.team}
        canSchedule={false}
        initial={d.contract}
        today={isoDay()}
        submit="Salvar alterações"
      />
    </>
  );
}
