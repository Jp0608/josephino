"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, GripVertical, Loader2, X, UserRound } from "lucide-react";
import { useToast } from "@/components/client";
import { btnClass, cx } from "@/components/ui";
import type { LeadStage } from "@/db/schema";
import { moveLeadAction } from "./actions";

export type BoardLead = {
  id: string;
  name: string;
  city: string | null;
  source: string | null;
  stage: LeadStage;
  estimatedMonthlyCents: number | null;
  nextFollowUpAt: string | null;
  stageChangedAt: string;
  ownerName: string | null;
  converted: boolean;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dShort = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
const QUICK_REASONS = ["Preço", "Fechou com outra empresa", "Sem retorno do contato", "Desistiu do serviço", "Fora da área atendida"];

/* ───────────── Motivo da perda ───────────── */

export function LostReasonDialog({ open, leadName, onCancel, onConfirm }: { open: boolean; leadName: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open]);
  if (!open) return null;
  const valid = reason.trim().length >= 3;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="lost-title">
      <button className="absolute inset-0 bg-abyss-950/40" onClick={onCancel} aria-label="Cancelar" />
      <div className="relative w-full max-w-md animate-[var(--animate-fade-up)] rounded-t-2xl bg-surface p-5 shadow-[var(--shadow-pop)] sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="lost-title" className="text-[16px] font-bold text-ink">Marcar como perdido</h2>
            <p className="text-[13px] text-muted">{leadName}</p>
          </div>
          <button onClick={onCancel} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-2 text-[13px] font-semibold text-ink-2">Por que o negócio não aconteceu?</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={cx("rounded-full border px-2.5 py-1 text-[12px] font-semibold", reason === r ? "border-primary bg-primary-soft text-primary" : "border-line text-ink-2 hover:bg-surface-2")}>
              {r}
            </button>
          ))}
        </div>
        <textarea ref={ref} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="input" placeholder="Descreva o motivo" aria-label="Motivo da perda" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnClass("ghost")}>Cancelar</button>
          <button type="button" disabled={!valid} onClick={() => onConfirm(reason.trim())} className={btnClass("danger")}>
            Confirmar perda
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Seletor de etapa (página do lead) ───────────── */

export function StageMover({ leadId, leadName, stage, stages }: { leadId: string; leadName: string; stage: LeadStage; stages: [LeadStage, string][] }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const go = (to: LeadStage, reason?: string) =>
    start(async () => {
      const r = await moveLeadAction(leadId, to, reason).catch(() => ({ ok: false as const, error: "Sem conexão. Tente de novo." }));
      if (r.ok) {
        if (r.message) toast({ tone: "ok", text: r.message });
        router.refresh();
      } else toast({ tone: "error", text: r.error });
    });
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="stage-mover">Etapa do funil</label>
      <select
        id="stage-mover"
        value={stage}
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value as LeadStage;
          if (to === "lost") setAsking(true);
          else go(to);
        }}
        className="input h-10 w-auto min-w-[190px] font-semibold"
      >
        {stages.map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </select>
      {pending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Salvando" />}
      <LostReasonDialog open={asking} leadName={leadName} onCancel={() => setAsking(false)} onConfirm={(r) => { setAsking(false); go("lost", r); }} />
    </div>
  );
}

/* ───────────── Quadro (kanban) ───────────── */

export function Board({ leads, stages, today }: { leads: BoardLead[]; stages: [LeadStage, string][]; today: string }) {
  const [items, setItems] = useState(leads);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [tab, setTab] = useState<LeadStage>("new");
  const [askLost, setAskLost] = useState<BoardLead | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => setItems(leads), [leads]);

  const byStage = useMemo(() => {
    const m = new Map<LeadStage, BoardLead[]>(stages.map(([k]) => [k, []]));
    for (const l of items) m.get(l.stage)?.push(l);
    return m;
  }, [items, stages]);

  async function move(lead: BoardLead, to: LeadStage, reason?: string) {
    if (lead.stage === to) return;
    if (to === "lost" && !reason) {
      setAskLost({ ...lead, stage: lead.stage });
      return;
    }
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === lead.id ? { ...x, stage: to, stageChangedAt: new Date().toISOString() } : x)));
    setBusy(lead.id);
    try {
      const r = await moveLeadAction(lead.id, to, reason);
      if (r.ok) {
        if (r.message) toast({ tone: "ok", text: r.message });
        router.refresh();
      } else {
        setItems(prev);
        toast({ tone: "error", text: r.error });
      }
    } catch {
      setItems(prev);
      toast({ tone: "error", text: "Sem conexão. A mudança não foi salva." });
    } finally {
      setBusy(null);
    }
  }

  const card = (l: BoardLead) => {
    const fu = l.nextFollowUpAt ? new Date(l.nextFollowUpAt) : null;
    const fuDay = fu ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(fu) : null;
    const overdue = !!fuDay && fuDay < today && l.stage !== "won" && l.stage !== "lost";
    const days = Math.max(0, Math.floor((Date.now() - new Date(l.stageChangedAt).getTime()) / 86400000));
    return (
      <article
        key={l.id}
        draggable
        onDragStart={(e) => {
          setDragId(l.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", l.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOver(null);
        }}
        className={cx(
          "group rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-card)] transition hover:border-line-strong",
          dragId === l.id && "opacity-50",
          busy === l.id && "animate-pulse",
        )}
      >
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 hidden size-4 shrink-0 cursor-grab text-muted/60 md:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <Link href={`/app/crm/${l.id}`} className="block truncate text-[14px] font-semibold text-ink hover:text-primary">
              {l.name}
            </Link>
            <p className="truncate text-[12px] text-muted">{[l.city, l.source].filter(Boolean).join(" · ") || "Sem cidade/origem"}</p>
          </div>
          {l.estimatedMonthlyCents != null && <span className="shrink-0 text-[12px] font-bold tabular text-ink">{brl.format(l.estimatedMonthlyCents / 100)}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {fu && (
            <span className={cx("inline-flex items-center gap-1 font-semibold", overdue ? "text-danger" : "text-ink-2")}>
              <CalendarClock className="size-3.5" /> {overdue ? "Atrasado: " : ""}
              {dShort.format(fu).replace(".", "")}
            </span>
          )}
          {l.ownerName && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3.5" /> {l.ownerName.split(" ")[0]}
            </span>
          )}
          <span>{days === 0 ? "hoje nesta etapa" : `${days} dia${days === 1 ? "" : "s"} nesta etapa`}</span>
          {l.converted && <span className="font-semibold text-ok">Cliente</span>}
        </div>
        <label className="mt-2 block">
          <span className="sr-only">Mover {l.name} para</span>
          <select
            value={l.stage}
            onChange={(e) => move(l, e.target.value as LeadStage)}
            disabled={busy === l.id}
            className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] font-semibold text-ink-2"
          >
            {stages.map(([k, lb]) => (
              <option key={k} value={k}>{k === l.stage ? `Etapa: ${lb}` : `Mover para: ${lb}`}</option>
            ))}
          </select>
        </label>
      </article>
    );
  };

  const total = (s: LeadStage) => (byStage.get(s) ?? []).reduce((acc, l) => acc + (l.estimatedMonthlyCents ?? 0), 0);

  return (
    <>
      {/* Mobile: abas de etapa (rolagem horizontal) + lista da etapa */}
      <div className="md:hidden">
        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Etapas do funil">
          {stages.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold", tab === k ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2")}
            >
              {l}
              <span className={cx("rounded-full px-1.5 text-[11px]", tab === k ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted")}>{byStage.get(k)?.length ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2" role="tabpanel">
          {(byStage.get(tab) ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Nenhum lead nesta etapa.</p>
          ) : (
            (byStage.get(tab) ?? []).map(card)
          )}
        </div>
      </div>

      {/* Desktop: colunas com arrastar e soltar */}
      <div className="hidden gap-3 overflow-x-auto pb-3 md:flex">
        {stages.map(([k, label]) => {
          const list = byStage.get(k) ?? [];
          return (
            <section
              key={k}
              aria-label={label}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== k) setOver(k);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOver(null);
                setDragId(null);
                const lead = items.find((x) => x.id === id);
                if (lead) move(lead, k);
              }}
              className={cx(
                "flex w-[232px] shrink-0 flex-col rounded-2xl border p-2 transition",
                over === k ? "border-primary bg-primary-soft/60" : "border-transparent bg-surface-2/70",
              )}
            >
              <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                <h3 className={cx("text-[13px] font-bold", k === "won" ? "text-ok" : k === "lost" ? "text-danger" : "text-ink")}>
                  {label} <span className="font-semibold text-muted">· {list.length}</span>
                </h3>
                {total(k) > 0 && <span className="text-[11px] font-semibold tabular text-muted">{brl.format(total(k) / 100)}</span>}
              </header>
              <div className="flex min-h-[120px] flex-col gap-2">
                {list.length === 0 ? <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted">Arraste um lead para cá</p> : list.map(card)}
              </div>
            </section>
          );
        })}
      </div>

      <LostReasonDialog
        open={!!askLost}
        leadName={askLost?.name ?? ""}
        onCancel={() => setAskLost(null)}
        onConfirm={(reason) => {
          const l = askLost!;
          setAskLost(null);
          move(l, "lost", reason);
        }}
      />
    </>
  );
}
