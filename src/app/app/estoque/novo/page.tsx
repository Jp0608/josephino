import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../ProductForm";
import { FeatureLocked } from "../_locked";
import { createProductAction } from "../actions";

export const metadata = { title: "Novo produto" };

export default async function NewProduct() {
  const ctx = await requireCtx("inventory.write");
  if (!hasFeature(ctx, "inventory"))
    return <FeatureLocked title="Novo produto" feature="Controle de estoque" text="Cadastro de produtos e controle de saldo fazem parte dos planos com estoque." canManageBilling={can(ctx.role, "billing.manage")} />;
  return (
    <>
      <PageHeader title="Novo produto" back={{ href: "/app/estoque", label: "Estoque" }} />
      <ProductForm action={createProductAction} submit="Cadastrar produto" />
    </>
  );
}
