import { notFound } from "next/navigation";
import { getPublicReport } from "@/server/reports";
import { ReportDocument } from "@/components/ReportDocument";
import { PrintButton } from "@/components/PrintButton";
import { ActionForm, SubmitButton } from "@/components/client";
import { dateTime } from "@/lib/format";
import { ackAction } from "./actions";

export const metadata = { title: "Relatório técnico", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await getPublicReport(token, { countView: true });
  if (!pub) notFound();
  const { snapshot: s, report: r } = pub;
  return (
    <div className="min-h-dvh bg-[#eef3f6] px-3 py-6 md:py-10 print:bg-white print:p-0" style={{ colorScheme: "light" }}>
      <ReportDocument s={s} logoUrl={pub.logoKey ? `/api/r/${token}/logo` : null} photoUrl={(id) => `/api/r/${token}/photo/${id}`} />
      <div className="no-print mx-auto mt-5 flex max-w-[820px] flex-col gap-4">
        <div className="flex flex-wrap justify-center gap-2">
          <PrintButton label="Salvar em PDF / imprimir" />
        </div>
        <div className="rounded-2xl border border-[#e2e8ed] bg-white p-5 text-[#0b1d29]">
          {r.acknowledgedAt ? (
            <p className="text-sm">
              Ciência registrada por <b>{r.acknowledgedName}</b> em {dateTime(r.acknowledgedAt)}.
            </p>
          ) : (
            <>
              <p className="text-sm font-bold">Confirmar recebimento</p>
              <p className="mt-0.5 text-[13px] text-[#5a6b78]">
                Registra que você recebeu e leu este relatório (nome, data, hora e endereço IP). É um registro de ciência — não é assinatura digital qualificada.
              </p>
              <ActionForm action={ackAction.bind(null, token)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input name="name" required minLength={3} placeholder="Seu nome completo" className="input flex-1" aria-label="Seu nome completo" style={{ background: "#fff", color: "#0b1d29" }} />
                <SubmitButton>Registrar ciência</SubmitButton>
              </ActionForm>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
