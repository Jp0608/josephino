import Link from "next/link";
import { requireCtx, hasFeature } from "@/server/auth";
import { can, ROLE_LABEL } from "@/server/permissions";
import { NAV } from "@/lib/nav";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const nav = NAV.filter((n) => !n.perm || can(ctx.role, n.perm)).map((n) => ({
    href: n.href,
    label: n.label,
    icon: n.icon,
    group: n.group,
    locked: !!n.feature && !hasFeature(ctx, n.feature),
  }));
  const s = ctx.subscription;
  const banner =
    s.status === "trial_expired" ? (
      <Banner tone="danger" text="Seu teste grátis terminou. Seus dados estão guardados e você pode consultá-los; para voltar a registrar, escolha um plano." cta={can(ctx.role, "billing.manage")} />
    ) : s.status === "past_due" ? (
      <Banner tone="warn" text="Há uma pendência na assinatura. O acesso continua normal por enquanto." cta={can(ctx.role, "billing.manage")} />
    ) : s.status === "cancelled" ? (
      <Banner tone="danger" text="Assinatura cancelada. Seus dados continuam disponíveis para consulta e exportação." cta={can(ctx.role, "billing.manage")} />
    ) : s.status === "trialing" && (s.trialDaysLeft ?? 99) <= 5 ? (
      <Banner tone="info" text={`Seu teste grátis termina em ${s.trialDaysLeft} dia${s.trialDaysLeft === 1 ? "" : "s"}.`} cta={can(ctx.role, "billing.manage")} />
    ) : null;
  return (
    <AppShell nav={nav} company={{ name: ctx.tenant.name, isDemo: ctx.tenant.isDemo }} user={{ name: ctx.name, role: ROLE_LABEL[ctx.role] }} banner={banner} canSchedule={can(ctx.role, "agenda.write")}>
      {children}
    </AppShell>
  );
}

function Banner({ tone, text, cta }: { tone: "danger" | "warn" | "info"; text: string; cta: boolean }) {
  const cls = tone === "danger" ? "bg-danger-soft text-danger" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-info-soft text-info";
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] font-semibold ${cls}`}>
      <span>{text}</span>
      {cta && (
        <Link href="/app/plano" className="underline underline-offset-2">
          Ver planos
        </Link>
      )}
    </div>
  );
}
