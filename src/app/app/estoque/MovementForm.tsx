"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, FieldError } from "@/components/client";
import { Field, Input, Select, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/action-types";

const KINDS: [string, string, string][] = [
  ["entrada", "Entrada", "Compra ou recebimento de produto."],
  ["saida", "Saída", "Retirada do estoque (uso interno, venda, empréstimo)."],
  ["perda", "Perda", "Avaria, vazamento, produto vencido descartado."],
  ["devolucao", "Devolução", "Produto que volta ao estoque (sobra de visita, troca)."],
  ["transferencia", "Transferência", "Entre locais: depósito, veículo, outra unidade."],
  ["ajuste", "Ajuste", "Contagem física diferente do saldo do sistema."],
];

export function MovementForm({ action, unit, currentQty }: { action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; unit: string; currentQty: number }) {
  const [kind, setKind] = useState("entrada");
  const [direction, setDirection] = useState("out");
  const desc = KINDS.find((k) => k[0] === kind)?.[2];
  return (
    <ActionForm action={action} resetOnSuccess className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Tipo</span>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tipo de movimentação">
          {KINDS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cx(
                "h-10 rounded-lg border text-[13px] font-semibold transition",
                kind === k ? "border-primary bg-primary-soft text-primary" : "border-line text-ink-2 hover:bg-surface-2",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-muted">{desc}</p>
      </div>

      {kind === "transferencia" && (
        <Field label="Sentido">
          <Select name="direction" value={direction} onChange={(e) => setDirection(e.target.value)} options={{ out: "Sai deste estoque", in: "Entra neste estoque" }} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === "ajuste" ? `Quantidade contada (${unit})` : `Quantidade (${unit})`} hint={kind === "ajuste" ? `Saldo atual no sistema: ${currentQty.toLocaleString("pt-BR")} ${unit}` : undefined}>
          <Input name="quantity" inputMode="decimal" required placeholder="0" />
          <FieldError name="quantity" />
        </Field>
        {kind === "entrada" ? (
          <Field label="Custo unitário (R$)" hint="Atualiza o custo do produto.">
            <Input name="unitCostCents" inputMode="decimal" placeholder="0,00" />
            <FieldError name="unitCostCents" />
          </Field>
        ) : (
          <Field label={kind === "transferencia" ? (direction === "in" ? "Origem" : "Destino") : "Local"}>
            <Input name="location" placeholder={kind === "transferencia" ? "Ex.: Veículo 2" : ""} />
            <FieldError name="location" />
          </Field>
        )}
      </div>

      {kind === "entrada" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lote">
            <Input name="lot" />
          </Field>
          <Field label="Validade">
            <Input name="expiresOn" type="date" />
            <FieldError name="expiresOn" />
          </Field>
        </div>
      )}

      <Field label={kind === "ajuste" || kind === "perda" ? "Motivo" : "Observação"} required={kind === "ajuste" || kind === "perda"}>
        <Input name="note" placeholder={kind === "ajuste" ? "Ex.: Inventário mensal" : kind === "perda" ? "Ex.: Embalagem rompida" : "Ex.: NF 1234"} />
        <FieldError name="note" />
      </Field>

      <SubmitButton className="w-full" pendingText="Registrando…">Registrar movimentação</SubmitButton>
    </ActionForm>
  );
}
