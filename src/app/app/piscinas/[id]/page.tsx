import Link from "next/link";
import { Pencil, QrCode, CalendarDays, Activity, Wrench, FileText, Camera, FlaskConical, Plus } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { getPool } from "@/server/pools";
import { customerAddress } from "@/server/customers";
import { notFoundGuard } from "@/server/guards";
import { Card, CardHeader, PageHeader, LinkButton, Badge, EmptyState, KeyValue, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, SubmitButton, ActionButton } from "@/components/client";
import { VisitStatusBadge, RangeBadge } from "@/components/VisitBits";
import { ParamChart } from "@/components/ParamChart";
import { POOL_USAGE, LINING, DISINFECTION, SERVICE_TYPES } from "@/lib/domain/catalog";
import { SHAPES } from "@/lib/domain/volume";
import { date, dateTime, num, daysBetween } from "@/lib/format";
import { addEquipmentAction, removeEquipmentAction, togglePoolAction } from "../actions";

const EQUIP = { bomba: "Bomba", filtro: "Filtro", aquecedor: "Aquecedor", gerador_cloro: "Gerador de cloro", automacao: "Automação", iluminacao: "Iluminação", outro: "Outro" };

export default async function PoolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ param?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireCtx();
  const d = await notFoundGuard(() => getPool(ctx, id));
  const p = d.pool;
  const canWrite = can(ctx.role, "pools.write");
  const measuredKeys = [...new Set(d.measurements.map((m) => m.parameterKey))];
  const selected = sp.param && measuredKeys.includes(sp.param) ? sp.param : measuredKeys.includes("ph") ? "ph" : measuredKeys[0];
  const def = d.params.find((x) => x.key === selected);
  const series = d.measurements.filter((m) => m.parameterKey === selected && m.value != null).map((m) => ({ at: m.measuredAt, value: m.value!, status: m.status }));
  const lastDone = d.visits.find((v) => v.status === "completed");
  const nextVisit = [...d.visits].reverse().find((v) => ["scheduled", "confirmed"].includes(v.status) && v.scheduledStart > new Date());
  const reportByVisit = new Map(d.reports.map((r) => [r.visitId, r]));
  const measByVisit = new Map<string, typeof d.measurements>();
  for (const m of d.measurements) measByVisit.set(m.visitId, [...(measByVisit.get(m.visitId) ?? []), m]);
  const chemByVisit = new Map<string, typeof d.chemicals>();
  for (const c of d.chemicals) chemByVisit.set(c.visitId, [...(chemByVisit.get(c.visitId) ?? []), c]);
  const days = lastDone?.completedAt ? daysBetween(lastDone.completedAt, new Date()) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-[12px] font-bold text-primary">{p.code}</span>
            {p.name}
            {!p.active && <Badge>Inativa</Badge>}
          </span>
        }
        subtitle={
          can(ctx.role, "customers.read") ? (
            <Link href={`/app/clientes/${d.customer.id}`} className="font-medium text-primary">{d.customer.name}</Link>
          ) : (
            d.customer.name
          )
        }
        back={{ href: "/app/piscinas", label: "Piscinas" }}
        actions={
          <>
            <LinkButton href={`/app/piscinas/${id}/qr`} variant="secondary"><QrCode className="size-4" /> QR code</LinkButton>
            {canWrite && <LinkButton href={`/app/piscinas/${id}/editar`} variant="secondary"><Pencil className="size-4" /> Editar</LinkButton>}
            {can(ctx.role, "agenda.write") && p.active && <LinkButton href={`/app/agenda/nova?piscina=${id}`}><CalendarDays className="size-4" /> Agendar</LinkButton>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Volume" value={p.volumeLiters ? `${p.volumeLiters.toLocaleString("pt-BR")} L` : "—"} hint={p.volumeLiters ? (p.volumeIsEstimated ? "estimado pelas medidas" : "informado") : "não informado"} />
        <MiniStat label="Último atendimento" value={lastDone?.completedAt ? date(lastDone.completedAt) : "—"} hint={days != null ? `há ${days} dia${days === 1 ? "" : "s"}` : "nunca atendida"} tone={days != null && days > (p.frequencyDays ?? 7) * 2 ? "danger" : undefined} />
        <MiniStat label="Próxima visita" value={nextVisit ? date(nextVisit.scheduledStart) : "—"} hint={nextVisit ? dateTime(nextVisit.scheduledStart).slice(11) : "nenhuma agendada"} />
        <MiniStat label="Frequência" value={p.frequencyDays ? `${p.frequencyDays} dias` : "—"} hint="recomendada" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Evolução da água" subtitle="Valores medidos nas visitas" icon={<Activity className="size-[18px]" />} />
            <div className="border-t border-line px-4 pb-4 pt-3 md:px-5">
              {measuredKeys.length > 0 && (
                <div className="mb-3 flex gap-1 overflow-x-auto">
                  {measuredKeys.map((k) => {
                    const label = d.params.find((x) => x.key === k)?.label ?? d.measurements.find((m) => m.parameterKey === k)?.label ?? k;
                    return (
                      <Link key={k} href={`?param=${k}`} scroll={false} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap", k === selected ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2")}>
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
              <ParamChart points={series} min={def?.rangeMin ?? null} max={def?.rangeMax ?? null} unit={def?.unit ?? ""} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Histórico técnico" subtitle="Permanente: não se perde quando um funcionário sai da empresa." icon={<FileText className="size-[18px]" />} />
            {d.visits.length === 0 ? (
              <EmptyState title="Nenhuma visita ainda" />
            ) : (
              <ol className="border-t border-line">
                {d.visits.map((v) => {
                  const ms = measByVisit.get(v.id) ?? [];
                  const cs = chemByVisit.get(v.id) ?? [];
                  const rep = reportByVisit.get(v.id);
                  return (
                    <li key={v.id} className="relative border-b border-line px-4 py-4 last:border-0 md:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/app/visitas/${v.id}`} className="min-w-0">
                          <p className="text-sm font-semibold tabular">{dateTime(v.completedAt ?? v.scheduledStart)}</p>
                          <p className="text-[13px] text-muted">{SERVICE_TYPES[v.serviceType] ?? v.serviceType}{v.techName ? ` · ${v.techName}` : ""}</p>
                        </Link>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <VisitStatusBadge status={v.status} />
                          {rep && <Link href={`/app/relatorios/${rep.id}`} className="text-[12px] font-semibold text-primary">{rep.protocol}</Link>}
                        </div>
                      </div>
                      {ms.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {ms.map((m) => (
                            <span key={m.id} className={cx("rounded-md px-2 py-0.5 text-[12px] font-medium tabular", m.status === "in_range" ? "bg-ok-soft text-ok" : m.status === "above" ? "bg-danger-soft text-danger" : m.status === "below" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}>
                              {m.label} {num(m.value)} {m.unit}
                            </span>
                          ))}
                        </div>
                      )}
                      {cs.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-2">
                          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-muted" />
                          {cs.map((c) => `${c.productName} ${num(c.quantity, 3)} ${c.unit}`).join(" · ")}
                        </p>
                      )}
                      {v.findings && <p className="mt-2 text-[13px] text-ink-2"><b>Problemas:</b> {v.findings}</p>}
                      {v.recommendations && <p className="mt-1 text-[13px] text-ink-2"><b>Recomendações:</b> {v.recommendations}</p>}
                      {v.notDoneReason && <p className="mt-1 text-[13px] text-danger">Não realizada: {v.notDoneReason}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <h3 className="mb-3 text-[15px] font-bold">Ficha técnica</h3>
            <KeyValue
              items={[
                ["Uso", POOL_USAGE[p.usage]],
                ["Formato", p.shape ? SHAPES[p.shape as keyof typeof SHAPES]?.label ?? p.shape : null],
                ["Medidas", p.lengthM && p.widthM ? `${num(p.lengthM)} × ${num(p.widthM)} m` : null],
                ["Profundidade", p.depthMinM || p.depthMaxM ? `${num(p.depthMinM)} a ${num(p.depthMaxM)} m` : null],
                ["Revestimento", p.lining ? LINING[p.lining] : null],
                ["Desinfecção", p.disinfection ? DISINFECTION[p.disinfection] : null],
                ["Filtragem", p.filtration],
                ["Bomba", [p.pump, p.pumpSpec].filter(Boolean).join(" · ")],
                ["Aquecimento", p.heating],
                ["Endereço", p.address || customerAddress(d.customer)],
              ]}
            />
            {p.technicalNotes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-[13px] text-ink-2">{p.technicalNotes}</p>}
            {canWrite && (
              <div className="mt-4 border-t border-line pt-3">
                <ActionButton action={togglePoolAction.bind(null, id, !p.active)} variant="ghost" confirm={p.active ? "Desativar esta piscina? O histórico continua guardado." : undefined}>
                  {p.active ? "Desativar piscina" : "Reativar piscina"}
                </ActionButton>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Equipamentos" subtitle="Manutenção preventiva" icon={<Wrench className="size-[18px]" />} />
            {d.equipment.filter((e) => e.active).length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-muted">Nenhum equipamento cadastrado.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.equipment
                  .filter((e) => e.active)
                  .map((e) => {
                    const due = e.nextServiceOn && e.nextServiceOn <= new Date().toISOString().slice(0, 10);
                    return (
                      <li key={e.id} className="px-4 py-3 text-sm md:px-5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{EQUIP[e.kind as keyof typeof EQUIP] ?? e.kind} {[e.brand, e.model].filter(Boolean).join(" ")}</p>
                            <p className="text-[12px] text-muted">
                              {e.serial && `Série ${e.serial} · `}
                              {e.installedOn && `Instalado ${date(e.installedOn)} · `}
                              {e.warrantyUntil && `Garantia até ${date(e.warrantyUntil)}`}
                            </p>
                            {e.nextServiceOn && <Badge tone={due ? "danger" : "info"} className="mt-1">Revisão {due ? "vencida" : "prevista"}: {date(e.nextServiceOn)}</Badge>}
                          </div>
                          {canWrite && <ActionButton action={removeEquipmentAction.bind(null, e.id)} variant="ghost" confirm="Remover da lista de equipamentos ativos?">Remover</ActionButton>}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
            {canWrite && (
              <details className="border-t border-line px-4 py-3 md:px-5">
                <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary"><Plus className="size-4" /> Adicionar equipamento</summary>
                <ActionForm action={addEquipmentAction.bind(null, id)} className="mt-3 grid gap-3 sm:grid-cols-2" resetOnSuccess>
                  <Field label="Tipo"><Select name="kind" options={EQUIP} /></Field>
                  <Field label="Marca"><Input name="brand" /></Field>
                  <Field label="Modelo"><Input name="model" /></Field>
                  <Field label="Nº de série"><Input name="serial" /></Field>
                  <Field label="Instalação"><Input name="installedOn" type="date" /></Field>
                  <Field label="Garantia até"><Input name="warrantyUntil" type="date" /></Field>
                  <Field label="Próxima revisão"><Input name="nextServiceOn" type="date" /></Field>
                  <Field label="Observações" className="sm:col-span-2"><Textarea name="notes" className="min-h-16" /></Field>
                  <div className="sm:col-span-2"><SubmitButton size="sm">Salvar equipamento</SubmitButton></div>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card>
            <CardHeader title="Fotos recentes" icon={<Camera className="size-[18px]" />} />
            {d.photos.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-muted">As fotos tiradas nas visitas aparecem aqui.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 border-t border-line p-3">
                {d.photos.map((ph) => (
                  <a key={ph.id} href={`/api/files/${ph.id}`} target="_blank" rel="noopener" className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${ph.id}`} alt={ph.caption ?? "Foto da visita"} loading="lazy" className="size-full object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold text-white">{ph.kind === "before" ? "Antes" : ph.kind === "after" ? "Depois" : ph.kind === "problem" ? "Problema" : "Foto"}</span>
                  </a>
                ))}
              </div>
            )}
          </Card>

          {d.measurements.length > 0 && (
            <Card className="p-4 md:p-5">
              <h3 className="mb-3 text-[15px] font-bold">Última medição</h3>
              <ul className="flex flex-col gap-2">
                {d.measurements
                  .filter((m) => m.visitId === lastDone?.id)
                  .map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-sm">
                      <span>{m.label}</span>
                      <span className="flex items-center gap-2"><b className="tabular">{num(m.value)} {m.unit}</b><RangeBadge status={m.status} /></span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3.5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-[18px] font-extrabold tabular", tone === "danger" ? "text-danger" : "text-ink")}>{value}</p>
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}
