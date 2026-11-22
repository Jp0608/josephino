import Link from "next/link";
import { Pencil, History, ShieldAlert, PackagePlus, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getProduct, PRODUCT_ALERT_LABEL, type ProductAlert } from "@/server/inventory";
import { notFoundGuard } from "@/server/guards";
import { Card, CardHeader, PageHeader, LinkButton, Badge, EmptyState, KeyValue, cx, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { MOVEMENT_KIND, PRODUCT_CATEGORIES } from "@/lib/domain/catalog";
import { date, dateTime, money, num } from "@/lib/format";
import { FeatureLocked } from "../_locked";
import { MovementForm } from "../MovementForm";
import { recordMovementAction, setProductActiveAction } from "../actions";

const ALERT_TONE: Record<ProductAlert, Tone> = { low: "warn", negative: "danger", expiring: "warn", expired: "danger", no_lot: "neutral" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("inventory.read");
  if (!hasFeature(ctx, "inventory"))
    return <FeatureLocked title="Estoque" feature="Controle de estoque" text="O histórico de movimentações faz parte dos planos com controle de estoque." canManageBilling={can(ctx.role, "billing.manage")} />;
  const { product: p, movements } = await notFoundGuard(() => getProduct(ctx, id));
  const canWrite = can(ctx.role, "inventory.write");

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={[PRODUCT_CATEGORIES[p.category] ?? p.category, p.brand, p.concentration].filter(Boolean).join(" · ")}
        back={{ href: "/app/estoque", label: "Estoque" }}
        actions={
          canWrite && (
            <>
              <LinkButton href={`/app/estoque/${id}/editar`} variant="secondary">
                <Pencil className="size-4" /> Editar
              </LinkButton>
              <ActionButton
                action={setProductActiveAction.bind(null, id, !p.active)}
                confirm={p.active ? "Desativar este produto? Ele deixa de aparecer para os técnicos nas visitas. O histórico é mantido." : undefined}
                variant="ghost"
                size="md"
              >
                {p.active ? "Desativar" : "Reativar"}
              </ActionButton>
            </>
          )
        }
      />

      {!p.active && <div className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink-2">Produto inativo — não aparece na lista de produtos das visitas.</div>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Saldo atual</p>
                <p className={cx("mt-1 font-display text-[32px] font-extrabold leading-none tabular", p.stockQty < 0 ? "text-danger" : "text-ink")}>
                  {num(p.stockQty, 3)} <span className="text-[18px] font-bold text-muted">{p.unit}</span>
                </p>
                {p.minQty != null && <p className="mt-1.5 text-[13px] text-muted">Mínimo: {num(p.minQty, 3)} {p.unit}</p>}
              </div>
              {p.costCentsPerUnit != null && p.stockQty > 0 && (
                <div className="text-right">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Valor em estoque</p>
                  <p className="mt-1 font-display text-[20px] font-bold tabular">{money(Math.round(p.costCentsPerUnit * p.stockQty))}</p>
                </div>
              )}
            </div>
            {p.alerts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.alerts.map((a) => (
                  <Badge key={a} tone={ALERT_TONE[a]} dot>{PRODUCT_ALERT_LABEL[a]}</Badge>
                ))}
              </div>
            )}
            <div className="mt-5 border-t border-line pt-4">
              <KeyValue
                items={[
                  ["Fabricante", p.manufacturer],
                  ["Marca", p.brand],
                  ["Princípio ativo", p.activeIngredient],
                  ["Concentração (rótulo)", p.concentration],
                  ["Fornecedor", p.supplier],
                  ["Custo por unidade", p.costCentsPerUnit != null ? `${money(p.costCentsPerUnit)} / ${p.unit}` : null],
                  ["Lote atual", p.lot],
                  ["Validade", p.expiresOn ? date(p.expiresOn) : null],
                  ["Armazenamento", p.storageLocation],
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Histórico de movimentações" subtitle={movements.length ? `${movements.length} registro${movements.length > 1 ? "s" : ""}${movements.length >= 200 ? " (últimos 200)" : ""}` : undefined} icon={<History className="size-[18px]" />} />
            {movements.length === 0 ? (
              <EmptyState title="Nenhuma movimentação" text="Entradas, saídas, ajustes e o consumo confirmado nas visitas aparecem aqui." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {movements.map((m) => {
                  const inbound = m.quantity > 0;
                  return (
                    <li key={m.id} className="flex items-start gap-3 px-4 py-3 md:px-5">
                      <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", inbound ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2")}>
                        {inbound ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">
                          {MOVEMENT_KIND[m.kind] ?? m.kind}
                          {m.kind === "consumo_visita" && m.visitId && (
                            <>
                              {" · "}
                              <Link href={`/app/visitas/${m.visitId}`} className="text-primary underline-offset-2 hover:underline">
                                {m.customerName ? `visita de ${m.customerName}` : "ver visita"}
                              </Link>
                            </>
                          )}
                        </p>
                        <p className="text-[12px] text-muted">
                          {dateTime(m.createdAt)}
                          {m.userName ? ` · ${m.userName}` : ""}
                          {m.lot ? ` · lote ${m.lot}` : ""}
                          {m.location ? ` · ${m.location}` : ""}
                        </p>
                        {m.note && <p className="mt-0.5 text-[13px] text-ink-2">{m.note}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cx("text-sm font-bold tabular", inbound ? "text-ok" : "text-ink")}>
                          {inbound ? "+" : "−"}
                          {num(Math.abs(m.quantity), 3)} {p.unit}
                        </p>
                        <p className="text-[12px] text-muted tabular">saldo {num(m.balanceAfter, 3)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {canWrite && p.active && (
            <Card>
              <CardHeader title="Registrar movimentação" subtitle="O saldo é atualizado na hora" icon={<PackagePlus className="size-[18px]" />} />
              <div className="border-t border-line p-4 md:p-5">
                <MovementForm action={recordMovementAction.bind(null, id)} unit={p.unit} currentQty={p.stockQty} />
                <p className="mt-3 text-[12px] text-muted">O consumo em visitas é baixado automaticamente quando o técnico confirma o uso ao finalizar o atendimento.</p>
              </div>
            </Card>
          )}

          <Card className="p-4 md:p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-bold">
              <ShieldAlert className="size-[18px] text-warn" /> Cuidados do fabricante
            </h3>
            {p.safetyNotes ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{p.safetyNotes}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">Nenhuma orientação cadastrada. Transcreva os cuidados do rótulo ou da FISPQ{canWrite ? " em Editar" : ""}.</p>
            )}
            <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
              Texto informado pela empresa a partir do material do fabricante. O Ondaro não recomenda dosagens: siga o rótulo e a orientação do responsável técnico.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
