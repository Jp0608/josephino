import Link from "next/link";
import { Waves, Plus, CalendarDays, FileText, MessageCircle, Mail, MapPin, Pencil, Wallet, Repeat } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { getCustomer, customerAddress } from "@/server/customers";
import { notFoundGuard } from "@/server/guards";
import { appUrl } from "@/server/reports";
import { Card, CardHeader, PageHeader, LinkButton, Badge, EmptyState, KeyValue } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";
import { VisitStatusBadge } from "@/components/VisitBits";
import { POOL_USAGE, SERVICE_TYPES } from "@/lib/domain/catalog";
import { date, dateTime, money, waLink, mapsLink } from "@/lib/format";
import { portalLinkAction } from "../actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("customers.read");
  const d = await notFoundGuard(() => getCustomer(ctx, id));
  const c = d.customer;
  const addr = customerAddress(c);
  const poolName = new Map(d.pools.map((p) => [p.id, p.name]));
  const upcoming = d.visits.filter((v) => ["scheduled", "confirmed", "on_the_way"].includes(v.status) && v.scheduledStart > new Date()).reverse();
  const canWrite = can(ctx.role, "customers.write");
  const portalUrl = c.portalToken ? `${appUrl()}/portal/${c.portalToken}` : null;
  const openCents = d.invoices.filter((i) => i.status === "open").reduce((s, i) => s + i.amountCents, 0);

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.kind === "pj" ? "Empresa / condomínio" : "Pessoa física", c.contactName && `Responsável: ${c.contactName}`].filter(Boolean).join(" · ")}
        back={{ href: "/app/clientes", label: "Clientes" }}
        actions={
          <>
            {(c.whatsapp || c.phone) && (
              <a href={waLink(c.whatsapp || c.phone, `Olá, ${c.name.split(" ")[0]}!`)} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            {canWrite && <LinkButton href={`/app/clientes/${id}/editar`} variant="secondary"><Pencil className="size-4" /> Editar</LinkButton>}
            {can(ctx.role, "agenda.write") && <LinkButton href={`/app/agenda/nova?cliente=${id}`}><CalendarDays className="size-4" /> Agendar</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Piscinas"
              subtitle={`${d.pools.length} cadastrada${d.pools.length === 1 ? "" : "s"}`}
              icon={<Waves className="size-[18px]" />}
              action={canWrite && <LinkButton href={`/app/piscinas/nova?cliente=${id}`} size="sm" variant="soft"><Plus className="size-4" /> Piscina</LinkButton>}
            />
            {d.pools.length === 0 ? (
              <EmptyState title="Nenhuma piscina" text="Cadastre a piscina para registrar o histórico técnico e agendar visitas." action={canWrite && <LinkButton href={`/app/piscinas/nova?cliente=${id}`} size="sm">Cadastrar piscina</LinkButton>} />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.pools.map((p) => (
                  <li key={p.id}>
                    <Link href={`/app/piscinas/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 md:px-5">
                      <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-[11px] font-bold text-primary">{p.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {POOL_USAGE[p.usage]}
                          {p.volumeLiters ? ` · ${p.volumeLiters.toLocaleString("pt-BR")} L${p.volumeIsEstimated ? " (estimado)" : ""}` : " · volume não informado"}
                        </span>
                      </span>
                      {!p.active && <Badge>Inativa</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Visitas" icon={<CalendarDays className="size-[18px]" />} subtitle={upcoming[0] ? `Próxima: ${dateTime(upcoming[0].scheduledStart)}` : "Nenhuma visita futura agendada"} />
            {d.visits.length === 0 ? (
              <EmptyState title="Sem visitas registradas" />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.visits.slice(0, 12).map((v) => (
                  <li key={v.id}>
                    <Link href={`/app/visitas/${v.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 md:px-5">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold tabular">{dateTime(v.scheduledStart)}</span>
                        <span className="block truncate text-[13px] text-muted">{poolName.get(v.poolId)} · {SERVICE_TYPES[v.serviceType] ?? v.serviceType}</span>
                      </span>
                      <VisitStatusBadge status={v.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Relatórios enviados" icon={<FileText className="size-[18px]" />} />
            {d.reports.length === 0 ? (
              <EmptyState title="Nenhum relatório ainda" text="Ao finalizar uma visita, o relatório técnico é gerado automaticamente." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/app/relatorios/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 md:px-5">
                      <span>
                        <span className="block text-sm font-semibold">{r.protocol}</span>
                        <span className="block text-[13px] text-muted">{poolName.get(r.poolId)} · {date(r.createdAt)}</span>
                      </span>
                      <Badge tone={r.viewCount ? "ok" : "neutral"}>{r.viewCount ? `Visto ${r.viewCount}×` : "Não visualizado"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="p-4 md:p-5">
            <KeyValue
              items={[
                ["WhatsApp", c.whatsapp],
                ["Telefone", c.phone],
                ["E-mail", c.email ? <a href={`mailto:${c.email}`} className="text-primary"><Mail className="mr-1 inline size-3.5" />{c.email}</a> : null],
                ["CPF/CNPJ", c.document],
                ["Cliente desde", c.startedAt ? date(c.startedAt) : null],
                ["Consentimento WhatsApp", c.whatsappConsent ? `Sim, em ${date(c.whatsappConsentAt)}` : "Não registrado"],
              ]}
            />
            {addr && (
              <a href={mapsLink(addr)} target="_blank" rel="noopener" className="mt-4 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> {addr}
              </a>
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <h3 className="text-[15px] font-bold">Portal do cliente</h3>
            <p className="mt-1 text-[13px] text-muted">Link seguro onde o cliente acompanha visitas, relatórios e parâmetros. Sem anotações internas nem dados financeiros da empresa.</p>
            {portalUrl ? (
              <div className="mt-3 flex flex-col gap-2">
                <code className="block truncate rounded-lg bg-surface-2 px-3 py-2 text-[12px]">{portalUrl}</code>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={portalUrl} />
                  <a href={portalUrl} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-[10px] px-3 text-[13px] font-semibold text-primary">Abrir</a>
                  {(c.whatsapp || c.phone) && (
                    <a href={waLink(c.whatsapp || c.phone, `Olá! Este é o seu portal para acompanhar a manutenção da piscina: ${portalUrl}`)} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-[10px] px-3 text-[13px] font-semibold text-primary">Enviar pelo WhatsApp</a>
                  )}
                  {canWrite && <ActionButton action={portalLinkAction.bind(null, id)} confirm="Gerar um novo link? O link atual deixará de funcionar." variant="ghost">Gerar novo link</ActionButton>}
                </div>
              </div>
            ) : (
              canWrite && <div className="mt-3"><ActionButton action={portalLinkAction.bind(null, id)} variant="soft">Ativar portal do cliente</ActionButton></div>
            )}
          </Card>

          {d.contracts.length > 0 && (
            <Card>
              <CardHeader title="Contratos" icon={<Repeat className="size-[18px]" />} />
              <ul className="divide-y divide-line border-t border-line">
                {d.contracts.map((ct) => (
                  <li key={ct.id} className="flex items-center justify-between px-4 py-3 text-sm md:px-5">
                    <span>
                      <span className="block font-semibold">{ct.title}</span>
                      <span className="block text-[13px] text-muted">{ct.planName ?? "Plano personalizado"} · desde {date(ct.startsOn)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular">{money(ct.monthlyCents)}/mês</span>
                      <Badge tone={ct.status === "active" ? "ok" : "neutral"}>{ct.status === "active" ? "Ativo" : ct.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {can(ctx.role, "finance.read") && (
            <Card>
              <CardHeader title="Financeiro" icon={<Wallet className="size-[18px]" />} subtitle={openCents ? `${money(openCents)} em aberto` : "Nada em aberto"} />
              {d.invoices.length === 0 ? (
                <p className="border-t border-line px-5 py-4 text-sm text-muted">Nenhum lançamento.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {d.invoices.slice(0, 8).map((i) => {
                    const late = i.status === "open" && i.dueOn < new Date().toISOString().slice(0, 10);
                    return (
                      <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm md:px-5">
                        <span className="min-w-0">
                          <span className="block truncate">{i.description}</span>
                          <span className="block text-[12px] text-muted">vence {date(i.dueOn)}</span>
                        </span>
                        <span className="text-right">
                          <span className="block font-semibold tabular">{money(i.amountCents)}</span>
                          <Badge tone={i.status === "paid" ? "ok" : late ? "danger" : i.status === "cancelled" ? "neutral" : "warn"}>
                            {i.status === "paid" ? "Pago" : i.status === "cancelled" ? "Cancelado" : late ? "Atrasado" : "Em aberto"}
                          </Badge>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {c.internalNotes && (
            <Card className="p-4 md:p-5">
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Observações internas</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{c.internalNotes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
