import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../CustomerForm";
import { createCustomerAction } from "../actions";

export const metadata = { title: "Novo cliente" };

export default async function NewCustomer() {
  const ctx = await requireCtx("customers.write");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo cliente" back={{ href: "/app/clientes", label: "Clientes" }} />
      <CustomerForm action={createCustomerAction} submit="Salvar cliente" showInternal={can(ctx.role, "customers.internal_notes")} offerPoolNext />
    </div>
  );
}
