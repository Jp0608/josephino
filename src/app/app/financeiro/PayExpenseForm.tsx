"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { Button } from "@/components/ui";
import { markExpensePaidAction } from "./actions";

/** Marca a despesa como paga, com a data do pagamento (padrão: hoje). */
export function PayExpenseForm({ id, today }: { id: string; today: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" size="sm" variant="soft" onClick={() => setOpen(true)}>
        Marcar paga
      </Button>
    );
  return (
    <ActionForm action={markExpensePaidAction.bind(null, id)} onDone={() => setOpen(false)} className="flex items-center gap-1.5">
      <input type="date" name="paidOn" defaultValue={today} max={today} aria-label="Data do pagamento" className="input !h-8 !min-h-8 w-[140px] !px-2 !text-[13px]" />
      <SubmitButton size="sm" pendingText="…">Confirmar</SubmitButton>
    </ActionForm>
  );
}
