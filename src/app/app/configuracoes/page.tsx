import Link from "next/link";
import { ChevronRight, Droplets, Plug } from "lucide-react";
import { requireCtx } from "@/server/auth";
import { integrationStatus } from "@/server/integrations";
import { Card, PageHeader, Badge } from "@/components/ui";
import { ThemeToggle } from "@/components/client";
import { CompanyForm } from "./CompanyForm";
import { LogoUpload } from "./LogoUpload";

export const metadata = { title: "Configurações" };

export default async function Settings() {
  const ctx = await requireCtx("settings.manage");
  const st = integrationStatus();
  const items: [string, boolean, string][] = [
    ["WhatsApp Business Platform (API oficial)", st.whatsapp, "Envio automático de relatórios e lembretes."],
    ["E-mail transacional", st.email, "Recuperação de senha e envio de relatórios por e-mail."],
    ["Gateway de pagamento / Pix", st.payments, "Cobranças e confirmação automática de pagamento."],
    ["Mapas (Google Maps)", st.maps, "Distâncias reais e otimização de rotas."],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configurações" subtitle="Identidade da empresa, relatório e parâmetros técnicos." />
      <div className="flex flex-col gap-6">
        <Card className="p-4 md:p-5">
          <h2 className="mb-1 text-[15px] font-bold">Logo</h2>
          <p className="mb-4 text-[13px] text-muted">Aparece no relatório técnico, no portal do cliente e nas propostas. PNG com fundo transparente fica melhor.</p>
          <LogoUpload hasLogo={!!ctx.tenant.logoKey} />
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="mb-4 text-[15px] font-bold">Dados da empresa</h2>
          <CompanyForm t={ctx.tenant} />
        </Card>
        <Link href="/app/configuracoes/parametros">
          <Card className="flex items-center gap-3 p-4 transition hover:border-line-strong md:p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Droplets className="size-5" /></span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Parâmetros da água e faixas de referência</span>
              <span className="block text-[13px] text-muted">Defina as faixas que a sua empresa adota. Sem faixa, o sistema registra o valor mas não indica se está dentro ou fora.</span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </Card>
        </Link>
        <Card className="p-4 md:p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold"><Plug className="size-4" /> Integrações</h2>
          <p className="mb-3 text-[13px] text-muted">Configuradas pelo administrador da instalação. Enquanto não conectadas, nada é marcado como enviado ou pago automaticamente.</p>
          <ul className="divide-y divide-line">
            {items.map(([n, ok, d]) => (
              <li key={n} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span><span className="block font-semibold">{n}</span><span className="block text-[12px] text-muted">{d}</span></span>
                <Badge tone={ok ? "ok" : "neutral"}>{ok ? "Conectado" : "Não conectado"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="flex items-center justify-between p-4 md:p-5">
          <span className="text-[15px] font-bold">Tema</span>
          <ThemeToggle />
        </Card>
      </div>
    </div>
  );
}
