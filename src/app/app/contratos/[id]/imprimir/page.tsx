import Link from "next/link";
import { requireCtx, hasFeature } from "@/server/auth";
import { can } from "@/server/permissions";
import { getContract } from "@/server/contracts";
import { customerAddress } from "@/server/customers";
import { notFoundGuard } from "@/server/guards";
import { FeatureLocked } from "../../../estoque/_locked";
import { POOL_USAGE, PAYMENT_METHODS } from "@/lib/domain/catalog";
import { describeRule } from "@/lib/domain/recurrence";
import { date, isoDay, longDay, money, onlyDigits } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Contrato para impressão" };

function fmtDoc(doc: string | null | undefined) {
  const d = onlyDigits(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc || null;
}

/* Folha A4 sempre em cores claras (papel), independente do tema da tela. */
const PRINT_CSS = `
@page { size: A4; margin: 16mm 15mm; }
@media print {
  aside, header, nav, .no-print { display: none !important; }
  html, body { background: #fff !important; }
  main { padding: 0 !important; max-width: none !important; }
  main, main * { box-shadow: none !important; }
  .lg\\:pl-\\[248px\\] { padding-left: 0 !important; }
  .contract-sheet { border: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; }
  .contract-sheet h2, .contract-sheet .keep { break-inside: avoid; }
}
`;

export default async function PrintContract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("contracts.write");
  if (!hasFeature(ctx, "contracts"))
    return <FeatureLocked title="Contrato" feature="Contratos e planos" text="O contrato para impressão faz parte dos planos com o módulo de contratos." canManageBilling={can(ctx.role, "billing.manage")} />;
  const d = await notFoundGuard(() => getContract(ctx, id));
  const t = ctx.tenant;
  const ct = d.contract;
  const c = d.customer;
  const brand = /^#[0-9a-f]{6}$/i.test(t.brandColor) ? t.brandColor : "#0A6E8A";
  const companyAddr = [t.address, [t.city, t.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ");
  const custAddr = customerAddress(c);
  const companyName = t.legalName || t.name;
  const missing = [!t.document && "CPF/CNPJ da empresa", !t.address && "endereço da empresa", !c.document && "CPF/CNPJ do cliente", !custAddr && "endereço do cliente"].filter(Boolean) as string[];
  const n = (() => {
    let i = 0;
    return () => ++i;
  })();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link href={`/app/contratos/${id}`} className="text-[13px] font-medium text-muted hover:text-ink">
          ← Voltar ao contrato
        </Link>
        <PrintButton />
      </div>
      {missing.length > 0 && (
        <div className="no-print mb-4 rounded-lg bg-warn-soft px-3 py-2 text-[13px] font-medium text-warn">
          Faltam dados no documento: {missing.join(", ")}. {can(ctx.role, "settings.manage") ? "Complete em Configurações e no cadastro do cliente." : "Complete no cadastro do cliente ou peça ao responsável."}
        </div>
      )}

      <div className="overflow-x-auto">
        <article className="contract-sheet mx-auto w-full max-w-[210mm] rounded-sm border border-[#d9dee3] bg-white px-6 py-8 text-[13px] leading-relaxed text-[#1a1f24] md:min-h-[297mm] md:px-[15mm] md:py-[16mm]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
          <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: brand }}>
            <div>
              <p className="text-[18px] font-extrabold" style={{ color: brand, fontFamily: "var(--font-manrope), sans-serif" }}>{t.name}</p>
              {t.legalName && t.legalName !== t.name && <p className="text-[12px]">{t.legalName}</p>}
              {fmtDoc(t.document) && <p className="text-[12px]">CPF/CNPJ: {fmtDoc(t.document)}</p>}
              {companyAddr && <p className="text-[12px]">{companyAddr}</p>}
              <p className="text-[12px]">{[t.phone || t.whatsapp, t.email].filter(Boolean).join(" · ")}</p>
            </div>
            <p className="shrink-0 text-right text-[11px] text-[#5b6670]">
              Contrato nº {ct.id.slice(0, 8).toUpperCase()}
              <br />
              Emitido em {date(new Date())}
            </p>
          </div>

          <h1 className="mt-6 text-center text-[15px] font-extrabold uppercase tracking-wide" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
            Contrato de prestação de serviços de manutenção de piscina
          </h1>
          <p className="mt-1 text-center text-[13px] text-[#5b6670]">{ct.title}</p>

          <Section n={n()} title="Das partes">
            <p>
              <strong>CONTRATADA:</strong> {companyName}
              {fmtDoc(t.document) ? `, inscrita no CPF/CNPJ sob nº ${fmtDoc(t.document)}` : ""}
              {companyAddr ? `, com endereço em ${companyAddr}` : ""}.
            </p>
            <p className="mt-2">
              <strong>CONTRATANTE:</strong> {c.name}
              {fmtDoc(c.document) ? `, inscrito(a) no CPF/CNPJ sob nº ${fmtDoc(c.document)}` : ""}
              {custAddr ? `, com endereço em ${custAddr}` : ""}
              {c.contactName ? `, tendo como responsável pelo imóvel ${c.contactName}` : ""}.
            </p>
          </Section>

          <Section n={n()} title="Do objeto">
            <p>
              Prestação de serviços de manutenção {d.pool ? <>da piscina <strong>{d.pool.name}</strong> (identificação {d.pool.code}, uso {POOL_USAGE[d.pool.usage]?.toLowerCase() ?? d.pool.usage}{d.pool.volumeLiters ? `, volume ${d.pool.volumeIsEstimated ? "estimado em " : "de "}${d.pool.volumeLiters.toLocaleString("pt-BR")} litros` : ""})</> : "da(s) piscina(s) do CONTRATANTE"}
              {d.pool?.address ? `, localizada em ${d.pool.address}` : ""}, conforme as condições abaixo.
            </p>
            {d.plan && (
              <div className="keep mt-2">
                <p>
                  Plano contratado: <strong>{d.plan.name}</strong>
                  {d.plan.weekdays?.length ? ` — ${describeRule({ weekdays: d.plan.weekdays, intervalWeeks: d.plan.intervalWeeks })}` : ""}
                  {d.plan.visitsPerMonth ? `, previsão de ${d.plan.visitsPerMonth} visitas por mês` : ""}.
                </p>
              </div>
            )}
          </Section>

          <Section n={n()} title="Do valor e da forma de pagamento">
            <p>
              Pelos serviços, o CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>{money(ct.monthlyCents)}</strong>, com vencimento todo dia {ct.billingDay} de cada mês
              {ct.paymentMethod ? `, por ${PAYMENT_METHODS[ct.paymentMethod]?.toLowerCase() ?? ct.paymentMethod}` : ""}. Em meses com menos dias, o vencimento será no último dia do mês.
            </p>
            {ct.adjustmentRule && <p className="mt-2">Reajuste: {ct.adjustmentRule}</p>}
          </Section>

          <Section n={n()} title="Da vigência">
            <p>
              Este contrato vigora a partir de {date(ct.startsOn)}
              {ct.endsOn ? ` até ${date(ct.endsOn)}` : ", por prazo indeterminado"}.
            </p>
          </Section>

          {ct.conditions && (
            <Section n={n()} title="Das condições gerais">
              <div className="whitespace-pre-wrap">{ct.conditions}</div>
            </Section>
          )}

          <div className="keep mt-10">
            <p>
              {[t.city, t.state].filter(Boolean).join(" - ") || "__________________"}, {longDay(new Date()).replace(/^[^,]+, /, "")} de {isoDay().slice(0, 4)}.
            </p>
            <div className="mt-14 grid grid-cols-1 gap-12 sm:grid-cols-2">
              <div className="border-t border-[#1a1f24] pt-1.5 text-center text-[12px]">
                <strong>{companyName}</strong>
                <br />
                CONTRATADA
              </div>
              <div className="border-t border-[#1a1f24] pt-1.5 text-center text-[12px]">
                <strong>{c.name}</strong>
                <br />
                CONTRATANTE
              </div>
            </div>
          </div>

          <p className="keep mt-12 border-t border-[#d9dee3] pt-3 text-[10.5px] leading-snug text-[#5b6670]">
            Documento-modelo gerado pelo Ondaro a partir dos dados e cláusulas informados pela {t.name}. Revise o conteúdo com um profissional jurídico antes de usar.
            O aceite por clique ou a assinatura em tela não equivale a assinatura digital qualificada (certificado ICP-Brasil); para esse fim, utilize um serviço de assinatura digital certificada ou a assinatura física das partes.
          </p>
        </article>
      </div>
    </>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
        Cláusula {n}ª — {title}
      </h2>
      <div className="text-justify">{children}</div>
    </section>
  );
}
