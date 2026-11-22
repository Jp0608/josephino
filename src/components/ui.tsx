import Link from "next/link";
import type { ReactNode, ComponentProps } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:brightness-110 shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
  soft: "bg-primary-soft text-primary hover:brightness-95",
};
const SIZE = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-5 text-[15px] gap-2" };

export function btnClass(variant: Variant = "primary", size: keyof typeof SIZE = "md", extra = "") {
  return cx(
    "inline-flex items-center justify-center rounded-[10px] font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <button {...p} className={btnClass(variant, size, className)} />;
}

export function LinkButton({ variant = "primary", size = "md", className = "", ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <Link {...p} className={btnClass(variant, size, className)} />;
}

export function Card({ className = "", children, ...p }: ComponentProps<"div">) {
  return (
    <div {...p} className={cx("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 md:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "brand";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  info: "bg-info-soft text-info border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  brand: "bg-primary-soft text-primary border-transparent",
};
export function Badge({ tone = "neutral", children, className = "", dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap", TONE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[22px] font-extrabold leading-tight text-ink md:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className = "", required }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[12px] font-medium text-danger">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx("input", p.className)} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx("input", p.className)} />;
}
export function Select({ options, placeholder, ...p }: ComponentProps<"select"> & { options: Record<string, string> | [string, string][]; placeholder?: string }) {
  const entries = Array.isArray(options) ? options : Object.entries(options);
  return (
    <select {...p} className={cx("input", p.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {entries.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-[26px] font-extrabold tabular leading-none", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink")}>{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </>
  );
  const cls = "block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]";
  return href ? (
    <Link href={href} className={cx(cls, "transition hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm md:flex-row md:items-center md:justify-between", TONE[tone])}>
      <div>
        {title && <p className="font-bold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] font-semibold text-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-sm text-ink">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
