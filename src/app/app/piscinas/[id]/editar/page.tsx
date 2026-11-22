import { requireCtx } from "@/server/auth";
import { listCustomerOptions } from "@/server/customers";
import { getPool } from "@/server/pools";
import { notFoundGuard } from "@/server/guards";
import { PageHeader } from "@/components/ui";
import { PoolForm } from "../../PoolForm";
import { updatePoolAction } from "../../actions";

export default async function EditPool({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("pools.write");
  const [d, customers] = await Promise.all([notFoundGuard(() => getPool(ctx, id)), listCustomerOptions(ctx)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Editar ${d.pool.name}`} back={{ href: `/app/piscinas/${id}`, label: d.pool.name }} />
      <PoolForm action={updatePoolAction.bind(null, id)} p={d.pool} customers={customers} submit="Salvar alterações" />
    </div>
  );
}
