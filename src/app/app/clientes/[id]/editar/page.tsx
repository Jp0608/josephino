import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { getCustomer } from "@/server/customers";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../../CustomerForm";
import { updateCustomerAction } from "../../actions";
import { notFoundGuard } from "@/server/guards";

export default async function EditCustomer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("customers.write");
  const data = await notFoundGuard(() => getCustomer(ctx, id));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar cliente" back={{ href: `/app/clientes/${id}`, label: data.customer.name }} />
      <CustomerForm action={updateCustomerAction.bind(null, id)} c={data.customer} submit="Salvar alterações" showInternal={can(ctx.role, "customers.internal_notes")} />
    </div>
  );
}
