"use client";
import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-types";
import { btnClass, cx } from "./ui";

/* ───────────── Toasts discretos ───────────── */
type Toast = { id: number; tone: "ok" | "error" | "info"; text: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.tone === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex max-w-sm animate-[var(--animate-fade-up)] items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-[var(--shadow-pop)]"
          >
            {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /> : null}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} className="text-muted" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────────── Formulário ligado a uma server action ───────────── */
type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const FieldErrCtx = createContext<Record<string, string>>({});
const PendingCtx = createContext(false);
export const useFieldError = (name: string) => useContext(FieldErrCtx)[name];

export function ActionForm({
  action,
  children,
  className = "",
  onDone,
  resetOnSuccess,
  successToast = true,
}: {
  action: Act;
  children: ReactNode;
  className?: string;
  onDone?: (r: ActionResult) => void;
  resetOnSuccess?: boolean;
  successToast?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (successToast && state.message) toast({ tone: "ok", text: state.message });
      if (resetOnSuccess) ref.current?.reset();
      onDone?.(state);
      if (state.redirect) router.push(state.redirect);
      else router.refresh();
    } else toast({ tone: "error", text: state.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <PendingCtx.Provider value={isPending}>
    <FieldErrCtx.Provider value={state && !state.ok ? state.fieldErrors ?? {} : {}}>
      {/* onSubmit em vez de action: o React 19 limparia os campos mesmo quando a validação falha. */}
      <form
        ref={ref}
        className={className}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {state && !state.ok && (
          <div role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {state.error}
          </div>
        )}
        {children}
      </form>
    </FieldErrCtx.Provider>
    </PendingCtx.Provider>
  );
}

export function FieldError({ name }: { name: string }) {
  const e = useFieldError(name);
  return e ? <span className="mt-1 block text-[12px] font-medium text-danger">{e}</span> : null;
}

export function SubmitButton({ children, variant = "primary", size = "md", className = "", pendingText }: { children: ReactNode; variant?: Parameters<typeof btnClass>[0]; size?: Parameters<typeof btnClass>[1]; className?: string; pendingText?: string }) {
  const { pending: native } = useFormStatus();
  const pending = native || useContext(PendingCtx);
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={btnClass(variant, size, className)}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? pendingText ?? "Salvando…" : children}
    </button>
  );
}

/** Botão que chama uma action com confirmação opcional. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className = "",
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirm?: string;
  variant?: Parameters<typeof btnClass>[0];
  size?: Parameters<typeof btnClass>[1];
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className={btnClass(variant, size, className)}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setPending(true);
        try {
          const r = await action();
          if (r.ok) {
            if (r.message) toast({ tone: "ok", text: r.message });
            if (r.redirect) router.push(r.redirect);
            else router.refresh();
          } else toast({ tone: "error", text: r.error });
        } catch {
          toast({ tone: "error", text: "Sem conexão. Tente de novo." });
        } finally {
          setPending(false);
        }
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copiar link", className = "" }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={cx(btnClass("secondary", "sm"), className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast({ tone: "ok", text: "Copiado." });
        } catch {
          toast({ tone: "error", text: "Não foi possível copiar. Selecione e copie manualmente." });
        }
      }}
    >
      {label}
    </button>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTheme(localStorage.getItem("ondaro-theme"));
    } catch {}
  }, []);
  const apply = (t: string) => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("ondaro-theme");
      else localStorage.setItem("ondaro-theme", t);
    } catch {}
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  };
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 text-[12px] font-semibold">
      {[
        ["light", "Claro"],
        ["dark", "Escuro"],
        ["system", "Auto"],
      ].map(([k, l]) => (
        <button key={k} type="button" onClick={() => apply(k)} className={cx("rounded-md px-2.5 py-1", (theme ?? "system") === k ? "bg-primary-soft text-primary" : "text-muted")}>
          {l}
        </button>
      ))}
    </div>
  );
}
