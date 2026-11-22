import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth, monthTitle } from "@/server/fields";
import { isoMonth } from "@/lib/format";

/** Navegação por mês (links reais na URL: ?mes=AAAA-MM). */
export function MonthNav({ month, href }: { month: string; href: (m: string) => string }) {
  const isCurrent = month === isoMonth();
  return (
    <div className="inline-flex items-center gap-1 rounded-[10px] border border-line-strong bg-surface p-0.5">
      <Link href={href(shiftMonth(month, -1))} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Mês anterior">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-[132px] px-1 text-center text-sm font-semibold text-ink">{monthTitle(month)}</span>
      <Link href={href(shiftMonth(month, 1))} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Próximo mês">
        <ChevronRight className="size-4" />
      </Link>
      {!isCurrent && (
        <Link href={href(isoMonth())} className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary-soft">
          Hoje
        </Link>
      )}
    </div>
  );
}
