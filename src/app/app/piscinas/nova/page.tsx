import { requireCtx } from "@/server/auth";
import { listCustomerOptions } from "@/server/customers";
import { PageHeader, EmptyState, LinkButton, Card } from "@/components/ui";
import { PoolForm } from "../PoolForm";
import { createPoolAction } from "../actions";

export const metadata = { title: "Nova piscina" };

export default async function NewPool({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const ctx = await requireCtx("pools.write");
  const { cliente } = await searchParams;
  const customers = await listCustomerOptions(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova piscina" subtitle="O prontuário técnico começa aqui." back={{ href: cliente ? `/app/clientes/${cliente}` : "/app/piscinas", label: "Voltar" }} />
      {customers.length === 0 ? (
        <Card>
          <EmptyState title="Cadastre um cliente primeiro" text="Toda piscina pertence a um cliente." action={<LinkButton href="/app/clientes/novo">Novo cliente</LinkButton>} />
        </Card>
      ) : (
        <PoolForm action={createPoolAction} customers={customers} customerId={cliente} submit="Salvar piscina" offerSchedule />
      )}
    </div>
  );
}
