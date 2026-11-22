"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { btnClass, cx } from "@/components/ui";
import { useToast } from "@/components/client";
import { paramsAction } from "../actions";

type Row = { id: string; label: string; unit: string; rangeMin: string; rangeMax: string; referenceSource: string; active: boolean };

export function ParamsEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const set = (id: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className={cx("rounded-xl border border-line bg-surface p-4", !r.active && "opacity-60")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">{r.label} {r.unit && <span className="font-normal text-muted">({r.unit})</span>}</p>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={r.active} onChange={(e) => set(r.id, { active: e.target.checked })} className="size-4 accent-[var(--primary)]" />
              Ativo
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[110px_110px_1fr]">
            <input className="input" inputMode="decimal" placeholder="Mínimo" aria-label={`Mínimo de ${r.label}`} value={r.rangeMin} onChange={(e) => set(r.id, { rangeMin: e.target.value })} />
            <input className="input" inputMode="decimal" placeholder="Máximo" aria-label={`Máximo de ${r.label}`} value={r.rangeMax} onChange={(e) => set(r.id, { rangeMax: e.target.value })} />
            <input className="input col-span-2 sm:col-span-1" placeholder="Fonte da faixa (norma, fabricante, responsável técnico)" aria-label={`Fonte da faixa de ${r.label}`} value={r.referenceSource} onChange={(e) => set(r.id, { referenceSource: e.target.value })} />
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <button
          disabled={busy}
          className={btnClass("primary", "lg")}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await paramsAction(rows);
              if (r.ok) {
                toast({ tone: "ok", text: r.message ?? "Salvo." });
                router.refresh();
              } else toast({ tone: "error", text: r.error });
            } catch {
              toast({ tone: "error", text: "Sem conexão." });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Salvar faixas
        </button>
      </div>
    </div>
  );
}
