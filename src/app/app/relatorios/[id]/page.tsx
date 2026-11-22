import { requireCtx } from "@/server/auth";
import { can } from "@/server/permissions";
import { getReport } from "@/server/reports";
import { whatsappConfigured } from "@/server/integrations";
import { notFoundGuard } from "@/server/guards";
import { Card, PageHeader, Badge, LinkButton } from "@/components/ui";
import { CopyButton, ActionButton } from "@/components/client";
import { ReportDocument } from "@/components/ReportDocument";
import { dateTime } from "@/lib/format";
import { ShareWhatsApp } from "./ShareWhatsApp";
import { rotateLinkAction } from "./actions";

const STATUS: Record<string, string> = {
  pending_integration: "Guardada — WhatsApp oficial não conectado",
  queued: "Na fila do WhatsApp oficial",
  sent: "Aceita pelo WhatsApp oficial",
  delivered: "Entregue",
  failed: "Falhou",
  manual: "Compartilhada pelo profissional (entrega não confirmada)",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("reports.read");
  const d = await notFoundGuard(() => getReport(ctx, id));
  const r = d.report;
  return (
    <>
      <PageHeader
        title={`Relatório ${r.protocol}`}
        subtitle={`${d.snapshot.customer.name} · ${d.snapshot.pool.name} · emitido em ${dateTime(r.createdAt)}`}
        back={{ href: "/app/relatorios", label: "Relatórios" }}
        actions={<LinkButton href={`/r/${r.publicToken}`} target="_blank" variant="secondary">Abrir versão do cliente</LinkButton>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="order-2 xl:order-1">
          <ReportDocument s={d.snapshot} logoUrl={d.snapshot.company.hasLogo ? `/api/files/logo` : null} photoUrl={(pid) => `/api/files/${pid}`} />
        </div>
        <div className="order-1 flex flex-col gap-4 xl:order-2">
          <Card className="p-4">
            <h3 className="text-[15px] font-bold">Enviar ao cliente</h3>
            <p className="mt-1 text-[13px] text-muted">Link privado (não indexado). Só quem tem o link consegue abrir.</p>
            <code className="mt-3 block truncate rounded-lg bg-surface-2 px-3 py-2 text-[12px]">{d.url}</code>
            <div className="mt-3 flex flex-wrap gap-2">
              {d.waUrl ? <ShareWhatsApp href={d.waUrl} reportId={id} /> : <Badge tone="warn">Cliente sem WhatsApp cadastrado</Badge>}
              <CopyButton text={d.url} />
            </div>
            {!whatsappConfigured() && (
              <p className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-[12px] text-info">
                Envio automático: conecte o WhatsApp Business Platform (API oficial) nas configurações da instalação. Até lá, a mensagem fica pronta e você envia pelo seu WhatsApp.
              </p>
            )}
            {can(ctx.role, "customers.write") && (
              <div className="mt-3 border-t border-line pt-3">
                <ActionButton action={rotateLinkAction.bind(null, id)} confirm="Gerar um novo link? Quem tem o link atual perde o acesso." variant="ghost">Revogar e gerar novo link</ActionButton>
              </div>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="text-[15px] font-bold">Acompanhamento</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
              <li>Visualizações: <b>{r.viewCount}</b>{r.lastViewedAt ? ` · última ${dateTime(r.lastViewedAt)}` : ""}</li>
              <li>Ciência do cliente: {r.acknowledgedAt ? <b>{r.acknowledgedName} em {dateTime(r.acknowledgedAt)}</b> : "ainda não registrada"}</li>
            </ul>
            <h4 className="mt-4 text-[12px] font-bold uppercase tracking-wide text-muted">Registro de envios</h4>
            <ul className="mt-2 flex flex-col gap-2">
              {d.messages.map((m) => (
                <li key={m.id} className="rounded-lg bg-surface-2 px-3 py-2 text-[12px]">
                  <p className="font-semibold">{STATUS[m.status] ?? m.status}</p>
                  <p className="text-muted">{m.channel} · {dateTime(m.sentAt ?? m.createdAt)}{m.error ? ` · ${m.error}` : ""}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
