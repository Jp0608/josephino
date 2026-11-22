import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getContractFormOptions } from "@/server/contracts";
import { Card, PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { isoDay } from "@/lib/format";
import { FeatureLocked } from "../../estoque/_locked";
import { ContractForm } from "../ContractForm";
import { createContractAction, scheduleContractAction } from "../actions";

export const metadata = { title: "Novo contrato" };

export default async function NewContract({ searchParams }: { searchParams: Promise<{ cliente?: string; plano?: string }> }) {
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return <FeatureLocked title="Novo contrato" feature="Contratos e planos" text="Contratos recorrentes fazem parte dos planos com o módulo de contratos." canManageBilling={can(ctx.role, "billing.manage")} />;
  const sp = await searchParams;
  const o = await getContractFormOptions(ctx);
  return (
    <>
      <PageHeader title="Novo contrato" back={{ href: "/app/contratos", label: "Contratos" }} />
      {o.customers.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum cliente ativo" text="Cadastre o cliente e a piscina antes de criar o contrato." action={can(ctx.role, "customers.write") ? <LinkButton href="/app/clientes/novo">Cadastrar cliente</LinkButton> : undefined} />
        </Card>
      ) : (
        <ContractForm
          action={createContractAction}
          scheduleAction={scheduleContractAction}
          customers={o.customers}
          pools={o.pools}
          plans={o.plans}
          team={o.team}
          canSchedule={can(ctx.role, "agenda.write")}
          defaults={{ customerId: sp.cliente, planId: sp.plano }}
          today={isoDay()}
          submit="Criar contrato"
        />
      )}
    </>
  );
}
