import { MessageSquare } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { listMessages } from "@/server/settings";
import { whatsappConfigured } from "@/server/integrations";
import { Card, PageHeader, EmptyState, Badge, Notice } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Mensagens" };
const ST: Record<string, [string, "ok" | "warn" | "info" | "danger" | "neutral"]> = {
  pending_integration: ["Guardada — integração não conectada", "warn"],
  queued: ["Na fila", "neutral"],
  sent: ["Aceita pelo WhatsApp oficial", "ok"],
  delivered: ["Entregue", "ok"],
  failed: ["Falhou", "danger"],
  manual: ["Enviada pelo profissional", "info"],
};
const TPL: Record<string, string> = { report_ready: "Relatório pronto", visit_reminder: "Lembrete de visita", payment_reminder: "Lembrete de pagamento" };

export default async function Messages() {
  const ctx = await requireCtx("agenda.write");
  const rows = await listMessages(ctx);
  return (
    <>
      <PageHeader title="Mensagens" subtitle="Registro de tudo que foi preparado ou enviado aos clientes." />
      {!whatsappConfigured() && (
        <div className="mb-4">
          <Notice tone="info" title="WhatsApp oficial não conectado">
            As mensagens ficam prontas e guardadas aqui. Você envia pelo seu WhatsApp com um toque; o envio automático começa quando a instalação conectar a WhatsApp Business Platform (API oficial da Meta) e o cliente tiver consentimento registrado.
          </Notice>
        </div>
      )}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<MessageSquare className="size-5" />} title="Nenhuma mensagem ainda" text="Ao finalizar uma visita, a mensagem com o relatório é preparada automaticamente." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ m, customerName }) => {
              const [label, tone] = ST[m.status] ?? [m.status, "neutral"];
              return (
                <li key={m.id} className="px-4 py-3.5 md:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{customerName ?? m.toAddress ?? "—"} · <span className="font-normal text-muted">{TPL[m.template] ?? m.template} · {m.channel}</span></p>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted">{m.body}</p>
                  <p className="mt-1 text-[12px] text-muted">{dateTime(m.sentAt ?? m.createdAt)}{m.error ? ` · ${m.error}` : ""}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
