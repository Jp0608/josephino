import { notFound } from "next/navigation";
import { CheckCircle2, ShieldCheck, Clock, MessageCircle, Phone, Mail } from "lucide-react";
import { getPublicProposal } from "@/server/crm";
import { readFileByKey } from "@/server/storage";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { OndaroMark } from "@/components/Brand";
import { date, dateTime, money, waLink } from "@/lib/format";
import { acceptProposalAction } from "./actions";

export const metadata = { title: "Orçamento", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function logoDataUri(key: string | null) {
  if (!key) return null;
  try {
    const buf = await readFileByKey(key);
    const ext = key.split(".").pop();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const safeColor = (c: string | null | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#0A6E8A");

export default async function PublicProposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await getPublicProposal(token);
  if (!pub || !pub.tenant || pub.tenant.status === "suspended") notFound();
  const { proposal: p, tenant: t, state } = pub;
  const brand = safeColor(t.brandColor);
  const logo = await logoDataUri(t.logoKey);
  const contact = t.whatsapp || t.phone;

  return (
    <div className="min-h-dvh bg-bg">
      <header style={{ backgroundColor: brand }} className="text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-5 md:px-6">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`Logo ${t.name}`} className="size-12 rounded-xl bg-white object-contain p-1" />
          ) : (
            <div className="grid size-12 place-items-center rounded-xl bg-white/15 font-display text-lg font-extrabold">{t.name.slice(0, 1).toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-[18px] font-extrabold">{t.name}</p>
            <p className="truncate text-[13px] opacity-85">{[t.legalName && t.legalName !== t.name ? t.legalName : null, t.document ? `CNPJ/CPF ${t.document}` : null, [t.city, t.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ") || "Orçamento de serviço"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Orçamento · versão {p.version}</p>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight text-ink md:text-[28px]">{p.title}</h1>
        {pub.clientName && <p className="mt-1 text-sm text-muted">Preparado para {pub.clientName} · emitido em {date(p.createdAt)}</p>}

        <section className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">Itens e condições</h2>
          <div className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{p.items}</div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="text-[12px] font-semibold text-muted">{p.recurring ? "Valor mensal" : "Valor total"}</p>
              <p className="font-display text-[30px] font-extrabold tabular text-ink">
                {money(p.totalCents)}
                {p.recurring && <span className="text-base font-bold text-muted">/mês</span>}
              </p>
            </div>
            {p.validUntil && (
              <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                <Clock className="size-4" /> Válido até {date(p.validUntil)}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6">
          {state === "accepted" ? (
            <div className="rounded-[var(--radius-card)] border border-ok/30 bg-ok-soft p-5 text-ok">
              <p className="flex items-center gap-2 text-[16px] font-bold"><CheckCircle2 className="size-5" /> Orçamento aceito</p>
              <p className="mt-1 text-sm">
                Aceite eletrônico registrado em {dateTime(p.acceptedAt)} por <b>{p.acceptedName}</b> (versão {p.version}). A {t.name} entrará em contato para os próximos passos.
              </p>
            </div>
          ) : state === "expired" ? (
            <div className="rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft p-5 text-warn">
              <p className="text-[16px] font-bold">Este orçamento passou da validade</p>
              <p className="mt-1 text-sm">Peça à {t.name} uma versão atualizada.</p>
            </div>
          ) : state === "rejected" ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-5 text-ink-2">
              <p className="text-[16px] font-bold">Este orçamento não está mais disponível</p>
              <p className="mt-1 text-sm">Fale com a {t.name} se quiser retomar a conversa.</p>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-[16px] font-bold text-ink">Aceitar este orçamento</h2>
              <p className="mt-1 text-sm text-muted">Digite seu nome completo para registrar que você concorda com os itens, o valor e as condições acima.</p>
              <ActionForm action={acceptProposalAction.bind(null, token)} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="version" value={p.version} />
                <Field label="Nome completo" required>
                  <Input name="name" autoComplete="name" required minLength={5} placeholder="Nome e sobrenome" />
                </Field>
                <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
                  <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>Li e aceito este orçamento (versão {p.version}) da {t.name}.</span>
                </label>
                <SubmitButton size="lg" pendingText="Registrando…">Aceitar orçamento</SubmitButton>
              </ActionForm>
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Isto é um <b>registro eletrônico de aceite</b>: guardamos o nome digitado, a data e a hora, o endereço IP, o navegador e a versão do orçamento. Não é uma assinatura digital
              qualificada (certificado ICP-Brasil). Se precisar de contrato formal assinado, combine com a empresa.
            </span>
          </p>
        </section>

        {(contact || t.email) && (
          <section className="mt-6 flex flex-wrap gap-2">
            {contact && (
              <a href={waLink(contact, `Olá! Tenho uma dúvida sobre o orçamento “${p.title}”.`)} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink">
                <MessageCircle className="size-4" /> Tirar dúvidas pelo WhatsApp
              </a>
            )}
            {t.phone && t.phone !== contact && (
              <a href={`tel:${t.phone}`} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink">
                <Phone className="size-4" /> Ligar
              </a>
            )}
            {t.email && (
              <a href={`mailto:${t.email}`} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink">
                <Mail className="size-4" /> E-mail
              </a>
            )}
          </section>
        )}

        <footer className="mt-10 flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <OndaroMark size={14} /> Orçamento enviado pelo Ondaro
        </footer>
      </main>
    </div>
  );
}
