import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getCtx } from "@/server/auth";
import { OndaroLogo } from "@/components/Brand";
import { ThemeToggle } from "@/components/client";

export const metadata = { title: { default: "Administração", template: "%s · Admin Ondaro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LINKS = [
  ["/admin", "Painel"],
  ["/admin/empresas", "Empresas"],
  ["/admin/planos", "Planos"],
  ["/admin/auditoria", "Auditoria"],
] as const;

/** Administração da plataforma: só e-mails em PLATFORM_ADMIN_EMAILS. Os demais recebem 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  if (!ctx?.isPlatformAdmin) notFound();
  if (ctx.mustChangePassword) redirect("/trocar-senha");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <OndaroLogo size={22} />
            <span className="rounded-md bg-abyss-800 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Admin</span>
          </Link>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[12px] text-muted sm:inline">{ctx.email}</span>
            {ctx.tenantId && (
              <Link href="/app" className="text-[13px] font-semibold text-primary">Ir para o app</Link>
            )}
            <form action="/api/auth/logout" method="post">
              <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Sair" title="Sair">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-6 md:px-6">{children}</main>
      <footer className="mx-auto flex max-w-[1180px] items-center justify-between px-4 pb-8 text-[12px] text-muted md:px-6">
        <span>Somente dados agregados e metadados das empresas — nenhum dado de clientes finais.</span>
        <ThemeToggle />
      </footer>
    </div>
  );
}
