"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Home, CalendarDays, Users, Waves, FileText, Inbox, FlaskConical, Wallet, Repeat, BadgeCheck, Target, MessageSquare,
  BarChart3, Settings, CreditCard, Plus, Menu, X, Lock, LogOut, Search,
} from "lucide-react";
import { OndaroLogo } from "./Brand";
import { cx } from "./ui";
import { ThemeToggle } from "./client";
import { NAV_GROUP_LABEL } from "@/lib/nav";

const ICONS: Record<string, typeof Home> = {
  home: Home, calendar: CalendarDays, users: Users, waves: Waves, file: FileText, inbox: Inbox, flask: FlaskConical,
  wallet: Wallet, repeat: Repeat, badge: BadgeCheck, target: Target, message: MessageSquare, chart: BarChart3, settings: Settings, card: CreditCard,
};

export type ShellNav = { href: string; label: string; icon: string; group: keyof typeof NAV_GROUP_LABEL; locked: boolean };

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

export function AppShell({
  nav, company, user, banner, children, canSchedule,
}: {
  nav: ShellNav[];
  company: { name: string; isDemo: boolean };
  user: { name: string; role: string };
  banner?: ReactNode;
  children: ReactNode;
  canSchedule: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const groups = (Object.keys(NAV_GROUP_LABEL) as (keyof typeof NAV_GROUP_LABEL)[]).map((g) => ({ g, items: nav.filter((n) => n.group === g) })).filter((x) => x.items.length);

  const navList = (
    <nav className="flex flex-col gap-5">
      {groups.map(({ g, items }) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted/80">{NAV_GROUP_LABEL[g]}</p>
          <ul className="flex flex-col gap-0.5">
            {items.map((n) => {
              const I = ICONS[n.icon] ?? Home;
              const active = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.locked ? `/app/plano?recurso=${encodeURIComponent(n.label)}` : n.href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition",
                      active ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <I className="size-[18px] shrink-0" strokeWidth={active ? 2.3 : 1.9} />
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.locked && <Lock className="size-3.5 text-muted" aria-label="Disponível em outro plano" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-line pt-3">
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-abyss-800 text-[12px] font-bold text-white">
          {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
          <p className="truncate text-[12px] text-muted">{user.role}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Sair" title="Sair">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
      <div className="mt-3 px-2">
        <ThemeToggle />
      </div>
    </div>
  );

  const tabs = nav.filter((n) => ["/app", "/app/agenda", "/app/clientes", "/app/relatorios"].includes(n.href) && !n.locked);

  return (
    <div className="min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface px-3 pb-4 pt-5 lg:flex">
        <div className="mb-1 px-3">
          <OndaroLogo size={26} />
        </div>
        <p className="mb-5 truncate px-3 text-[12px] text-muted">{company.name}</p>
        {canSchedule && (
          <Link href="/app/agenda/nova" className="mx-1 mb-5 flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-ink shadow-sm hover:brightness-110">
            <Plus className="size-4" /> Agendar visita
          </Link>
        )}
        <div className="-mx-1 flex-1 overflow-y-auto px-1">{navList}</div>
        {userBox}
      </aside>

      {/* Topo mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <OndaroLogo size={22} />
        <div className="flex items-center gap-1">
          <Link href="/app/clientes" className="rounded-lg p-2 text-ink-2" aria-label="Buscar">
            <Search className="size-5" />
          </Link>
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-2" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* Menu lateral mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-abyss-950/40" onClick={() => setOpen(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 right-0 flex w-[84%] max-w-[320px] animate-[var(--animate-fade-up)] flex-col bg-surface px-3 pb-4 pt-4 shadow-[var(--shadow-pop)]">
            <div className="mb-4 flex items-center justify-between px-3">
              <p className="truncate text-sm font-semibold text-ink">{company.name}</p>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navList}</div>
            {userBox}
          </div>
        </div>
      )}

      <div className="lg:pl-[248px]">
        {company.isDemo && (
          <div className="bg-warn-soft px-4 py-1.5 text-center text-[12px] font-semibold text-warn">
            Conta de demonstração — dados fictícios, separados de qualquer empresa real.
          </div>
        )}
        {banner}
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 md:px-6 md:pt-7 lg:pb-12">{children}</main>
      </div>

      {/* Barra inferior mobile */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {tabs.slice(0, 2).map((t) => <Tab key={t.href} t={t} active={isActive(path, t.href)} />)}
          <li className="flex justify-center">
            {canSchedule ? (
              <Link href="/app/agenda/nova" className="-mt-6 grid size-14 place-items-center rounded-2xl bg-primary text-primary-ink shadow-[var(--shadow-pop)]" aria-label="Agendar visita">
                <Plus className="size-6" />
              </Link>
            ) : (
              <span />
            )}
          </li>
          {tabs.slice(2, 4).map((t) => <Tab key={t.href} t={t} active={isActive(path, t.href)} />)}
        </ul>
      </nav>
    </div>
  );
}

function Tab({ t, active }: { t: ShellNav; active: boolean }) {
  const I = ICONS[t.icon] ?? Home;
  return (
    <li>
      <Link href={t.href} className={cx("flex flex-col items-center gap-0.5 text-[11px] font-semibold", active ? "text-primary" : "text-muted")}>
        <I className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} />
        {t.label}
      </Link>
    </li>
  );
}
