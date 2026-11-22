import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, MapPin } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { listAgenda } from "@/server/visits";
import { listTeamOptions } from "@/server/pools";
import { Card, PageHeader, LinkButton, EmptyState, cx } from "@/components/ui";
import { VisitStatusBadge } from "@/components/VisitBits";
import { addDays, isoDay, time, weekday, weekdayOf, monthLabel, mapsLink, wazeLink, longDay } from "@/lib/format";
import { OPEN_VISIT_STATUSES, SERVICE_TYPES } from "@/lib/domain/catalog";

export const metadata = { title: "Agenda" };

type View = "dia" | "semana" | "mes";

export default async function Agenda({ searchParams }: { searchParams: Promise<{ data?: string; v?: string; tec?: string; filtro?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const today = isoDay();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : today;
  const view: View = sp.v === "semana" || sp.v === "mes" ? sp.v : "dia";
  const all = can(ctx.role, "agenda.view_all");
  const tec = all ? sp.tec : undefined;
  const overdueMode = sp.filtro === "atrasadas";

  let from = day;
  let to = day;
  if (view === "semana") {
    from = addDays(day, -weekdayOf(day));
    to = addDays(from, 6);
  } else if (view === "mes") {
    from = `${day.slice(0, 8)}01`;
    const next = new Date(`${from}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    to = addDays(next.toISOString().slice(0, 10), -1);
  }
  if (overdueMode) {
    from = addDays(today, -90);
    to = addDays(today, -1);
  }
  const [visitsRaw, team] = await Promise.all([listAgenda(ctx, from, to, { assignee: tec }), all ? listTeamOptions(ctx) : Promise.resolve([])]);
  const visits = overdueMode ? visitsRaw.filter((v) => OPEN_VISIT_STATUSES.includes(v.status)) : visitsRaw;
  const step = view === "dia" ? 1 : view === "semana" ? 7 : 31;
  const prev = view === "mes" ? `${addDays(from, -1).slice(0, 8)}01` : addDays(day, -step);
  const next = view === "mes" ? addDays(to, 1) : addDays(day, step);
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m = { data: day, v: view, tec, ...o };
    for (const [k, val] of Object.entries(m)) if (val) p.set(k, val);
    return `/app/agenda?${p}`;
  };
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) {
    const k = isoDay(v.scheduledStart);
    byDay.set(k, [...(byDay.get(k) ?? []), v]);
  }
  const title = overdueMode ? "Visitas atrasadas" : view === "dia" ? longDay(day) : view === "semana" ? `Semana de ${weekday(from)}` : monthLabel(day);

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={<span className="inline-block first-letter:uppercase">{title}</span>}
        actions={can(ctx.role, "agenda.write") && <LinkButton href={`/app/agenda/nova?data=${day}`}><Plus className="size-4" /> Agendar</LinkButton>}
      />
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1.5">
          <Link href={link({ data: prev })} className="grid size-9 place-items-center rounded-lg border border-line-strong bg-surface" aria-label="Anterior"><ChevronLeft className="size-4" /></Link>
          <Link href={link({ data: today })} className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-semibold leading-9">Hoje</Link>
          <Link href={link({ data: next })} className="grid size-9 place-items-center rounded-lg border border-line-strong bg-surface" aria-label="Próximo"><ChevronRight className="size-4" /></Link>
          <div className="ml-2 inline-flex rounded-lg bg-surface-2 p-0.5">
            {(["dia", "semana", "mes"] as View[]).map((v) => (
              <Link key={v} href={link({ v, filtro: undefined })} className={cx("rounded-md px-3 py-1.5 text-[13px] font-semibold", view === v && !overdueMode ? "bg-surface text-ink shadow-sm" : "text-muted")}>
                {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
              </Link>
            ))}
          </div>
        </div>
        {all && team.length > 1 && (
          <div className="flex gap-1 overflow-x-auto">
            <Link href={link({ tec: undefined })} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap", !tec ? "bg-primary-soft text-primary" : "text-muted")}>Todos</Link>
            {team.map((t) => (
              <Link key={t.userId} href={link({ tec: t.userId })} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap", tec === t.userId ? "bg-primary-soft text-primary" : "text-muted")}>
                {t.name.split(" ")[0]}
              </Link>
            ))}
            <Link href={link({ tec: "none" })} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap", tec === "none" ? "bg-primary-soft text-primary" : "text-muted")}>Sem responsável</Link>
          </div>
        )}
      </div>

      {view === "mes" && !overdueMode ? (
        <MonthGrid from={from} to={to} byDay={byDay} link={link} today={today} />
      ) : visits.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarDays className="size-5" />} title={overdueMode ? "Nenhuma visita atrasada" : "Nenhuma visita neste período"} action={can(ctx.role, "agenda.write") && !overdueMode ? <LinkButton href={`/app/agenda/nova?data=${day}`} size="sm">Agendar visita</LinkButton> : undefined} />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {[...byDay.entries()].map(([d, list]) => (
            <section key={d}>
              {(view !== "dia" || overdueMode) && (
                <h2 className={cx("mb-2 text-[13px] font-bold uppercase tracking-wide", d === today ? "text-primary" : "text-muted")}>
                  {weekday(d)} {d === today && "· hoje"}
                </h2>
              )}
              <Card>
                <ul className="divide-y divide-line">
                  {list.map((v) => (
                    <li key={v.id} className="flex items-start gap-3 px-4 py-3.5 md:px-5">
                      <div className="w-14 shrink-0">
                        <p className="font-display text-[16px] font-extrabold tabular">{time(v.scheduledStart)}</p>
                        <p className="text-[11px] text-muted">{v.durationMin} min</p>
                      </div>
                      <Link href={`/app/visitas/${v.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{v.customerName}</p>
                        <p className="truncate text-[13px] text-muted">
                          {v.poolName} ({v.poolCode}) · {SERVICE_TYPES[v.serviceType] ?? v.serviceType}
                          {v.priority === "alta" || v.priority === "urgente" ? <b className="text-danger"> · {v.priority}</b> : null}
                        </p>
                        <p className="truncate text-[12px] text-muted">{v.techName ?? "Sem responsável"}</p>
                        {v.address && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted"><MapPin className="size-3 shrink-0" />{v.address}</p>
                        )}
                      </Link>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <VisitStatusBadge status={v.status} />
                        {v.address && OPEN_VISIT_STATUSES.includes(v.status) && (
                          <span className="flex gap-2 text-[12px] font-semibold">
                            <a href={mapsLink(v.address)} target="_blank" rel="noopener" className="text-primary">Maps</a>
                            <a href={wazeLink(v.address)} target="_blank" rel="noopener" className="text-primary">Waze</a>
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          {visits.some((v) => v.address) && (
            <p className="text-center text-[12px] text-muted">
              Ordem por horário agendado. Otimização automática de rota exige conectar um serviço de mapas (Google Maps) — sem ele o Ondaro não estima distâncias.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function MonthGrid({ from, to, byDay, link, today }: { from: string; to: string; byDay: Map<string, { status: string }[]>; link: (o: Record<string, string | undefined>) => string; today: string }) {
  const start = addDays(from, -weekdayOf(from));
  const cells: string[] = [];
  for (let d = start; d <= to || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[11px] font-bold uppercase text-muted">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const list = byDay.get(d) ?? [];
          const done = list.filter((v) => v.status === "completed").length;
          const inMonth = d >= from && d <= to;
          return (
            <Link key={d} href={link({ data: d, v: "dia" })} className={cx("min-h-16 border-b border-r border-line p-1.5 text-left transition hover:bg-surface-2 md:min-h-24 md:p-2", !inMonth && "opacity-40")}>
              <span className={cx("inline-grid size-6 place-items-center rounded-full text-[12px] font-bold", d === today ? "bg-primary text-primary-ink" : "text-ink-2")}>{Number(d.slice(8))}</span>
              {list.length > 0 && (
                <span className="mt-1 block text-[11px] font-semibold text-primary md:text-[12px]">
                  {list.length} <span className="hidden md:inline">visita{list.length > 1 ? "s" : ""}</span>
                  {done > 0 && <span className="block text-ok">{done} ok</span>}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
