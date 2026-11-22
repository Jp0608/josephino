import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getProduct } from "@/server/inventory";
import { notFoundGuard } from "@/server/guards";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../../ProductForm";
import { FeatureLocked } from "../../_locked";
import { updateProductAction } from "../../actions";

export const metadata = { title: "Editar produto" };

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("inventory.write");
  if (!hasFeature(ctx, "inventory"))
    return <FeatureLocked title="Editar produto" feature="Controle de estoque" text="Cadastro de produtos e controle de saldo fazem parte dos planos com estoque." canManageBilling={can(ctx.role, "billing.manage")} />;
  const { product } = await notFoundGuard(() => getProduct(ctx, id));
  return (
    <>
      <PageHeader title="Editar produto" subtitle={product.name} back={{ href: `/app/estoque/${id}`, label: product.name }} />
      <ProductForm action={updateProductAction.bind(null, id)} p={product} submit="Salvar alterações" />
    </>
  );
}
