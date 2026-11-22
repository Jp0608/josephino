import { Lock } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";

/** Estado bloqueado honesto: o recurso não faz parte do plano. Nenhuma tela de mentira por trás. */
export function FeatureLocked({ title, feature, text, canManageBilling }: { title: string; feature: string; text: string; canManageBilling: boolean }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Lock className="size-5" />
          </div>
          <p className="text-[16px] font-bold text-ink">{feature} não está incluído no seu plano</p>
          <p className="mt-1.5 max-w-md text-sm text-muted">{text}</p>
          <div className="mt-5">
            {canManageBilling ? (
              <LinkButton href={`/app/plano?recurso=${encodeURIComponent(feature)}`}>Ver planos</LinkButton>
            ) : (
              <p className="text-[13px] text-muted">Fale com o responsável pela conta para mudar de plano.</p>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
