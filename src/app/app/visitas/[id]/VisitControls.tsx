"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, XCircle, CalendarClock, Repeat, Loader2 } from "lucide-react";
import { btnClass, Input, Select } from "@/components/ui";
import { useToast } from "@/components/client";
import { statusAction, rescheduleAction, stopRecurrenceAction } from "../../agenda/actions";

export function VisitControls({
  id, status, canReschedule, recurrenceId, day, team, assignee,
}: { id: string; status: string; canReschedule: boolean; recurrenceId: string | null; day: string; team: { userId: string; name: string }[]; assignee: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<null | "notdone" | "resched">(null);
  const [reason, setReason] = useState("");
  const [d, setD] = useState(day);
  const [t, setT] = useState("08:00");
  const [a, setA] = useState(assignee ?? "");
  const [busy, setBusy] = useState(false);
  const done = (r: { ok: boolean; message?: string; error?: string }) => {
    if (r.ok) {
      if (r.message) toast({ tone: "ok", text: r.message });
      setMode(null);
      router.refresh();
    } else toast({ tone: "error", text: r.error ?? "Erro" });
  };
  const go = async (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(true);
    try {
      done(await fn());
    } catch {
      toast({ tone: "error", text: "Sem conexão." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {["scheduled", "confirmed"].includes(status) && (
          <button disabled={busy} onClick={() => go(() => statusAction(id, "on_the_way"))} className={btnClass("secondary", "sm")}>
            <Truck className="size-4" /> Estou a caminho
          </button>
        )}
        <button disabled={busy} onClick={() => setMode(mode === "notdone" ? null : "notdone")} className={btnClass("ghost", "sm")}>
          <XCircle className="size-4" /> Não realizada
        </button>
        {canReschedule && (
          <button disabled={busy} onClick={() => setMode(mode === "resched" ? null : "resched")} className={btnClass("ghost", "sm")}>
            <CalendarClock className="size-4" /> Remarcar
          </button>
        )}
        {canReschedule && recurrenceId && (
          <button
            disabled={busy}
            onClick={() => window.confirm("Encerrar a recorrência a partir desta data? Visitas futuras agendadas serão canceladas.") && go(() => stopRecurrenceAction(recurrenceId, day))}
            className={btnClass("ghost", "sm")}
          >
            <Repeat className="size-4" /> Encerrar recorrência
          </button>
        )}
        {busy && <Loader2 className="size-4 animate-spin self-center text-muted" />}
      </div>
      {mode === "notdone" && (
        <div className="flex gap-2 rounded-xl border border-line bg-surface p-3">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (ex.: cliente ausente, chuva)" />
          <button disabled={busy || reason.trim().length < 3} onClick={() => go(() => statusAction(id, "not_done", reason))} className={btnClass("danger", "md")}>Registrar</button>
        </div>
      )}
      {mode === "resched" && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-4">
          <Input type="date" value={d} onChange={(e) => setD(e.target.value)} aria-label="Nova data" />
          <Input type="time" value={t} onChange={(e) => setT(e.target.value)} aria-label="Novo horário" />
          <Select value={a} onChange={(e) => setA(e.target.value)} placeholder="Responsável" options={team.map((x) => [x.userId, x.name] as [string, string])} />
          <button
            disabled={busy}
            onClick={() =>
              go(async () => {
                const r = await rescheduleAction(id, { date: d, time: t, assignedUserId: a || undefined });
                if (r.ok && r.data && !r.data.ok) {
                  if (window.confirm("Há conflito de horário ou visita duplicada nesse dia. Remarcar mesmo assim?")) return rescheduleAction(id, { date: d, time: t, assignedUserId: a || undefined, force: true });
                  return { ok: false, error: "Remarcação cancelada." };
                }
                return r;
              })
            }
            className={btnClass("primary", "md")}
          >
            Remarcar
          </button>
        </div>
      )}
    </div>
  );
}
