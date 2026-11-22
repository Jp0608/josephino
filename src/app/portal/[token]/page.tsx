import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, FileText, MessageCircle, Droplets } from "lucide-react";
import { getPortal } from "@/server/settings";
import { ParamChart } from "@/components/ParamChart";
import { ActionForm, SubmitButton } from "@/components/client";
import { OndaroMark } from "@/components/Brand";
import { dateTime, date, num, waLink } from "@/lib/format";
import { SERVICE_TYPES } from "@/lib/domain/catalog";
import { RANGE_LABEL, type RangeStatus } from "@/lib/domain/ranges";
import { portalRequestAction } from "./actions";

export const metadata = { title: "Portal do cliente", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string; param?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const d = await getPortal(token);
  if (!d) notFound();
  const brand = /^#[0-9a-f]{6}$/i.test(d.company.brandColor) ? d.company.brandColor : "#0A6E8A";
  const pool = d.pools.find((p) => p.id === sp.p) ?? d.pools[0];
  const pm = d.measurements.filter((m) => m.poolId === pool?.id);
  const keys = [...new Set(pm.map((m) => m.parameterKey))];
  const key = sp.param && keys.includes(sp.param) ? sp.param : keys.includes("ph") ? "ph" : keys[0];
  const series = pm.filter((m) => m.parameterKey === key && m.value != null);
  const last = series[series.length - 1];
  const latestByKey = keys.map((k) => pm.filter((m) => m.parameterKey === k).at(-1)!).filter(Boolean);
  const phone = d.company.whatsapp || d.company.phone;
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ p: pool?.id, param: key, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="min-h-dvh bg-[#eef3f6] text-[#0b1d29]" style={{ colorScheme: "light" }}>
      <header className="px-4 pb-16 pt-6 text-white" style={{ background: `linear-gradient(135deg, ${brand}, #06263a)` }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {d.company.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/portal/${token}/logo`} alt={d.company.name} className="h-11 w-auto max-w-[140px] rounded-lg bg-white object-contain p-1" />
          ) : (
            <div className="grid size-11 place-items-center rounded-xl bg-white/15 font-bold">{d.company.name.slice(0, 2).toUpperCase()}</div>
          )}
          <div>
            <p className="font-display text-lg font-extrabold">{d.company.name}</p>
            <p className="text-[13px] opacity-80">Portal de {d.customer.name}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-10 flex max-w-3xl flex-col gap-4 px-4 pb-16">
        {d.pools.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm">
            {d.pools.map((p) => (
              <Link key={p.id} href={qs({ p: p.id, param: undefined })} className={`rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap ${p.id === pool?.id ? "text-white" : "text-[#26394a]"}`} style={p.id === pool?.id ? { background: brand } : undefined}>{p.name}</Link>
            ))}
          </div>
        )}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-[15px] font-bold"><CalendarDays className="size-4" /> Próximas visitas</h2>
          {d.upcoming.length === 0 ? <p className="mt-2 text-sm text-[#5a6b78]">Nenhuma visita agendada no momento.</p> : (
            <ul className="mt-3 flex flex-col gap-2">
              {d.upcoming.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-xl bg-[#f5f8fa] px-3 py-2.5 text-sm">
                  <span className="font-semibold">{dateTime(v.scheduledStart)}</span>
                  <span className="text-[#5a6b78]">{SERVICE_TYPES[v.serviceType] ?? v.serviceType}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {pool && (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-[15px] font-bold"><Droplets className="size-4" /> Condição da água · {pool.name}</h2>
            {latestByKey.length === 0 ? <p className="mt-2 text-sm text-[#5a6b78]">Ainda não há medições registradas.</p> : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {latestByKey.map((m) => (
                    <Link key={m.parameterKey} href={qs({ param: m.parameterKey })} scroll={false} className={`rounded-xl border px-3 py-2 ${m.parameterKey === key ? "border-[#0b6e99]" : "border-[#e2e8ed]"}`}>
                      <p className="text-[12px] text-[#5a6b78]">{m.label}</p>
                      <p className="font-bold tabular-nums">{num(m.value)} {m.unit}</p>
                      <p className="text-[11px]" style={{ color: m.status === "in_range" ? "#0f7a52" : m.status === "above" ? "#b4321f" : m.status === "below" ? "#9a6212" : "#5a6b78" }}>{RANGE_LABEL[m.status as RangeStatus]}</p>
                    </Link>
                  ))}
                </div>
                <div className="mt-4">
                  <ParamChart points={series.map((m) => ({ at: m.measuredAt, value: m.value!, status: m.status }))} min={last?.rangeMin ?? null} max={last?.rangeMax ?? null} unit={last?.unit ?? ""} height={160} />
                </div>
                <p className="mt-2 text-[11px] text-[#5a6b78]">Faixas definidas pela empresa responsável pela manutenção.</p>
              </>
            )}
          </section>
        )}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-[15px] font-bold"><FileText className="size-4" /> Histórico de atendimentos</h2>
          {d.reports.length === 0 ? <p className="mt-2 text-sm text-[#5a6b78]">Os relatórios das visitas aparecem aqui.</p> : (
            <ol className="relative mt-4 border-l-2 border-[#e2e8ed] pl-5">
              {d.reports.filter((r) => !pool || r.poolId === pool.id).map((r) => (
                <li key={r.id} className="mb-5 last:mb-0">
                  <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full" style={{ background: brand }} />
                  <Link href={`/r/${r.publicToken}`} className="block">
                    <p className="text-sm font-bold">{date(r.snapshot.visit.completedAt)} · {r.snapshot.visit.serviceType}</p>
                    <p className="text-[13px] text-[#5a6b78]">
                      {r.snapshot.procedures.slice(0, 4).map((p) => p.label).join(" · ") || "Atendimento registrado"}
                      {r.snapshot.photos.length ? ` · ${r.snapshot.photos.length} foto(s)` : ""}
                    </p>
                    {r.snapshot.recommendations && <p className="mt-1 line-clamp-2 text-[13px]">Recomendação: {r.snapshot.recommendations}</p>}
                    <span className="text-[12px] font-semibold" style={{ color: brand }}>Ver relatório {r.protocol} →</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
        {d.contract && (
          <section className="rounded-2xl bg-white p-5 text-sm shadow-sm">
            <h2 className="text-[15px] font-bold">Contrato</h2>
            <p className="mt-1">{d.contract.title} · desde {date(d.contract.startsOn)}{d.contract.endsOn ? ` até ${date(d.contract.endsOn)}` : ""}</p>
          </section>
        )}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-bold">Pedir uma visita ou informar um problema</h2>
          <ActionForm action={portalRequestAction.bind(null, token)} className="mt-3 grid gap-3" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="kind" className="input" style={{ background: "#fff", color: "#0b1d29" }} aria-label="Tipo de pedido">
                <option value="visita_extra">Visita adicional</option>
                <option value="problema">Problema na piscina</option>
                <option value="outro">Outro assunto</option>
              </select>
              {d.pools.length > 1 && (
                <select name="poolId" defaultValue={pool?.id} className="input" style={{ background: "#fff", color: "#0b1d29" }} aria-label="Piscina">
                  {d.pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {d.pools.length === 1 && <input type="hidden" name="poolId" value={pool?.id} />}
            </div>
            <textarea name="message" required minLength={5} className="input" placeholder="Descreva o que você precisa" style={{ background: "#fff", color: "#0b1d29" }} aria-label="Mensagem" />
            <SubmitButton>Enviar pedido</SubmitButton>
          </ActionForm>
          {d.requests.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-[#5a6b78]">
              {d.requests.map((r) => <li key={r.id}>{date(r.createdAt)} — {r.message.slice(0, 80)} · <b>{r.status === "open" ? "recebido" : r.status === "scheduled" ? "agendado" : r.status === "done" ? "resolvido" : "encerrado"}</b></li>)}
            </ul>
          )}
          {phone && (
            <a href={waLink(phone, `Olá! Sou ${d.customer.name}.`)} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: brand }}>
              <MessageCircle className="size-4" /> Falar com a {d.company.name} pelo WhatsApp
            </a>
          )}
        </section>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#5a6b78]"><OndaroMark size={12} /> Portal seguro — acesso exclusivo por este link.</p>
      </main>
    </div>
  );
}
