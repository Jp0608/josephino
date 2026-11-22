"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Check, ChevronLeft, ChevronRight, Cloud, CloudOff, Loader2, Camera, Trash2, AlertTriangle, ShieldAlert, Plus, MessageCircle, FileText, Navigation, Droplets, CircleCheck,
} from "lucide-react";
import { btnClass, cx, Field, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/client";
import { CHECKLIST, PROCEDURES, MEASURE_METHODS, CHECK_STATE_LABEL } from "@/lib/domain/catalog";
import { rangeStatus, formatRange, RANGE_LABEL } from "@/lib/domain/ranges";
import { compressImage, queueDelete, queueList, queuePut, type QueuedPhoto } from "@/lib/offline";
import { mapsLink, waLink } from "@/lib/format";

type Param = { key: string; label: string; unit: string; rangeMin: number | null; rangeMax: number | null };
type Product = { id: string; name: string; unit: string; stockQty: number; lot: string | null; category: string; safetyNotes: string | null };
type Chem = { id: string; productId: string | null; productName: string; quantity: string; unit: string; lot: string; purpose: string; consume: boolean };
type Draft = {
  checklist: Record<string, { state: "ok" | "attention" | "problem" | "not_checked"; comment: string }>;
  measurements: Record<string, string>;
  method: string;
  instrument: string;
  procedures: Record<string, { done: boolean; notes: string }>;
  chemicals: Chem[];
  notes: { findings: string; actionsTaken: string; followUp: string; recommendations: string; internalNotes: string; poolSafetyNote: string; nextVisitSuggestion: string };
};
type Local = { draft: Draft; baseVersion: number; dirty: boolean; savedAt: number };

export type FlowProps = {
  visitId: string;
  version: number;
  status: string;
  header: { customer: string; pool: string; code: string; address: string | null; volume: string | null; instructions: string | null; scheduled: string; techName: string | null };
  previous: null | { when: string; measurements: { label: string; value: number | null; unit: string; status: string }[]; chemicals: string[]; recommendations: string | null; followUp: string | null; findings: string | null };
  params: Param[];
  products: Product[];
  initial: Draft;
  photos: { id: string; kind: string; caption: string | null }[];
  customerPhone: string | null;
  userName: string;
  canReschedule: boolean;
};

const STEPS = ["Identificação", "Inspeção", "Água", "Serviços", "Produtos", "Observações", "Fotos", "Finalizar"] as const;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function toPayload(d: Draft, baseVersion: number) {
  return {
    baseVersion,
    checklist: Object.entries(d.checklist).map(([itemKey, v]) => ({ itemKey, state: v.state, comment: v.comment || null })),
    measurements: Object.entries(d.measurements)
      .filter(([, v]) => v.trim() !== "" && Number.isFinite(num(v)))
      .map(([parameterKey, v]) => ({ parameterKey, value: num(v), method: d.method || null, instrument: d.instrument || null })),
    procedures: Object.entries(d.procedures).map(([procKey, v]) => ({ procKey, done: v.done, notes: v.notes || null })),
    chemicals: d.chemicals
      .filter((c) => c.productName.trim() && Number(c.quantity.replace(",", ".")) > 0)
      .map((c) => ({ id: c.id, productId: c.productId, productName: c.productName, quantity: Number(c.quantity.replace(",", ".")), unit: c.unit, lot: c.lot || null, purpose: c.purpose || null })),
    notes: { ...d.notes, nextVisitSuggestion: d.notes.nextVisitSuggestion || null },
  };
}

export function VisitFlow(p: FlowProps) {
  const toast = useToast();
  const key = `ondaro:visit:${p.visitId}`;
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(p.initial);
  const [baseVersion, setBaseVersion] = useState(p.version);
  const [dirty, setDirty] = useState(false);
  const [online, setOnline] = useState(true);
  const [sync, setSync] = useState<"idle" | "saving" | "saved" | "offline" | "error" | "conflict">("idle");
  const [photos, setPhotos] = useState(p.photos);
  const [pendingPhotos, setPendingPhotos] = useState<QueuedPhoto[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<null | { publicToken: string; protocol: string; reportId: string; warnings: string[] }>(null);
  const [queuedFinish, setQueuedFinish] = useState(false);
  const loaded = useRef(false);

  // Recupera rascunho local não sincronizado (ex.: celular ficou sem sinal)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const l = JSON.parse(raw) as Local;
        if (l.dirty) {
          setDraft(l.draft);
          setBaseVersion(l.baseVersion);
          setDirty(true);
          toast({ tone: "info", text: "Recuperamos o rascunho salvo neste aparelho." });
        }
      }
      setQueuedFinish(localStorage.getItem(`${key}:finish`) === "1");
    } catch {}
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    queueList(p.visitId).then(setPendingPhotos).catch(() => {});
    loaded.current = true;
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  }, []);

  // Grava no aparelho a cada mudança
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify({ draft, baseVersion, dirty, savedAt: Date.now() } satisfies Local));
    } catch {}
  }, [draft, baseVersion, dirty, key]);

  const pushDraft = useCallback(
    async (overwrite = false) => {
      if (!navigator.onLine) {
        setSync("offline");
        return false;
      }
      setSync("saving");
      try {
        const res = await fetch(`/api/visits/${p.visitId}/draft`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: toPayload(draft, baseVersion), overwrite }) });
        const j = await res.json();
        if (!j.ok) {
          setSync("error");
          toast({ tone: "error", text: j.error });
          return false;
        }
        if (j.data.conflict) {
          setSync("conflict");
          return false;
        }
        setBaseVersion(j.data.version);
        setDirty(false);
        setSync("saved");
        return true;
      } catch {
        setSync("offline");
        return false;
      }
    },
    [draft, baseVersion, p.visitId, toast],
  );

  // Autosave no servidor (2,5 s depois da última alteração)
  useEffect(() => {
    if (!dirty || result) return;
    const t = setTimeout(() => pushDraft(), 2500);
    return () => clearTimeout(t);
  }, [dirty, draft, pushDraft, result]);

  // Ao voltar a conexão: envia rascunho, fotos e finalização pendentes
  useEffect(() => {
    if (!online) {
      setSync("offline");
      return;
    }
    (async () => {
      if (dirty) await pushDraft();
      const q = await queueList(p.visitId).catch(() => [] as QueuedPhoto[]);
      for (const item of q) {
        const ok = await uploadPhoto(item.blob, item.kind, item.caption);
        if (ok) await queueDelete(item.id);
      }
      setPendingPhotos(await queueList(p.visitId).catch(() => []));
      if (localStorage.getItem(`${key}:finish`) === "1") finish(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function uploadPhoto(blob: Blob, kind: string, caption: string) {
    const fd = new FormData();
    fd.append("file", blob, "foto.jpg");
    fd.append("kind", kind);
    fd.append("caption", caption);
    try {
      const r = await fetch(`/api/visits/${p.visitId}/photos`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) {
        toast({ tone: "error", text: j.error });
        return false;
      }
      setPhotos((x) => [...x, j.data]);
      return true;
    } catch {
      return false;
    }
  }

  async function addPhoto(file: File, kind: string) {
    const blob = await compressImage(file);
    if (navigator.onLine && (await uploadPhoto(blob, kind, ""))) {
      toast({ tone: "ok", text: "Foto adicionada." });
      return;
    }
    const item: QueuedPhoto = { id: uuid(), visitId: p.visitId, kind, caption: "", blob, createdAt: Date.now() };
    await queuePut(item);
    setPendingPhotos((x) => [...x, item]);
    toast({ tone: "info", text: "Sem conexão: a foto fica guardada no aparelho e é enviada quando a internet voltar." });
  }

  async function removePhoto(id: string) {
    const { deletePhotoAction } = await import("./actions");
    const r = await deletePhotoAction(id);
    if (r.ok) setPhotos((x) => x.filter((f) => f.id !== id));
    else toast({ tone: "error", text: r.error });
  }

  const issues = useMemo(() => {
    const out: string[] = [];
    const measured = Object.values(draft.measurements).filter((v) => v.trim() !== "").length;
    const procs = Object.values(draft.procedures).filter((v) => v.done).length;
    if (!measured && !procs) out.push("Registre ao menos uma medição ou um procedimento.");
    const bad = draft.chemicals.filter((c) => c.productName.trim() && !(Number(c.quantity.replace(",", ".")) > 0));
    if (bad.length) out.push("Informe a quantidade de todos os produtos aplicados.");
    if (pendingPhotos.length) out.push(`${pendingPhotos.length} foto(s) ainda não enviada(s) — serão incluídas só se enviarem antes de finalizar.`);
    return out;
  }, [draft, pendingPhotos]);
  const blocking = issues.filter((i) => !i.includes("foto"));

  async function finish(fromQueue = false) {
    if (!fromQueue && !confirmed) {
      toast({ tone: "error", text: "Confirme a data e o horário do atendimento." });
      return;
    }
    if (!navigator.onLine) {
      localStorage.setItem(`${key}:finish`, "1");
      setQueuedFinish(true);
      toast({ tone: "info", text: "Sem conexão. A finalização fica pendente e acontece sozinha quando a internet voltar." });
      return;
    }
    setFinishing(true);
    try {
      const res = await fetch(`/api/visits/${p.visitId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: toPayload(draft, baseVersion), consumeStockFor: draft.chemicals.filter((c) => c.productId && c.consume).map((c) => c.id), confirmDateTime: true }),
      });
      const j = await res.json();
      if (!j.ok) {
        localStorage.removeItem(`${key}:finish`);
        setQueuedFinish(false);
        toast({ tone: "error", text: j.error });
        return;
      }
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}:finish`);
      setDirty(false);
      // Sem router.refresh(): a página passaria a mostrar a visita concluída e esconderia a tela de envio.
      setResult(j.data);
    } catch {
      localStorage.setItem(`${key}:finish`, "1");
      setQueuedFinish(true);
      toast({ tone: "info", text: "Conexão caiu. A finalização será reenviada automaticamente." });
    } finally {
      setFinishing(false);
    }
  }

  if (result) return <Done {...result} customerPhone={p.customerPhone} customer={p.header.customer} pool={p.header.pool} />;

  const SyncBadge = (
    <span className="flex items-center gap-1.5 text-[12px] font-semibold" aria-live="polite">
      {sync === "saving" ? (
        <><Loader2 className="size-3.5 animate-spin text-muted" /><span className="text-muted">Salvando…</span></>
      ) : !online || sync === "offline" ? (
        <><CloudOff className="size-3.5 text-warn" /><span className="text-warn">Offline · salvo no aparelho</span></>
      ) : sync === "conflict" ? (
        <><AlertTriangle className="size-3.5 text-danger" /><span className="text-danger">Conflito</span></>
      ) : sync === "error" ? (
        <><AlertTriangle className="size-3.5 text-danger" /><span className="text-danger">Erro ao salvar</span></>
      ) : dirty ? (
        <><Cloud className="size-3.5 text-muted" /><span className="text-muted">Alterações locais</span></>
      ) : (
        <><Check className="size-3.5 text-ok" /><span className="text-ok">Salvo</span></>
      )}
    </span>
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* Cabeçalho fixo */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 pb-3 pt-2 backdrop-blur md:top-0 md:-mx-6 md:px-6 lg:mx-0 lg:rounded-b-xl lg:px-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{p.header.customer}</p>
            <p className="truncate text-[12px] text-muted">{p.header.pool} · {p.header.code}</p>
          </div>
          {SyncBadge}
        </div>
        <div className="mt-2.5 flex gap-1" role="tablist" aria-label="Etapas do atendimento">
          {STEPS.map((s, i) => (
            <button key={s} role="tab" aria-selected={i === step} aria-label={s} onClick={() => setStep(i)} className={cx("h-1.5 flex-1 rounded-full transition", i === step ? "bg-primary" : i < step ? "bg-primary/45" : "bg-line-strong/60")} />
          ))}
        </div>
        <p className="mt-1.5 text-[12px] font-semibold text-primary">
          {step + 1}/{STEPS.length} · {STEPS[step]}
        </p>
      </div>

      {sync === "conflict" && (
        <div role="alert" className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          <p className="font-bold">Este atendimento foi alterado em outro aparelho.</p>
          <div className="mt-2 flex gap-2">
            <button className={btnClass("secondary", "sm")} onClick={() => pushDraft(true)}>Manter o deste aparelho</button>
            <button className={btnClass("ghost", "sm")} onClick={() => { localStorage.removeItem(key); location.reload(); }}>Carregar o do servidor</button>
          </div>
        </div>
      )}
      {queuedFinish && (
        <div className="mb-4 rounded-xl bg-warn-soft p-3 text-sm font-medium text-warn">Finalização pendente — será enviada automaticamente quando a conexão voltar. Não feche este atendimento em outro aparelho.</div>
      )}

      <div className="animate-[var(--animate-fade-up)]" key={step}>
        {step === 0 && <StepIdent p={p} />}
        {step === 1 && <StepInspection draft={draft} update={update} />}
        {step === 2 && <StepWater draft={draft} update={update} params={p.params} />}
        {step === 3 && <StepProcedures draft={draft} update={update} />}
        {step === 4 && <StepProducts draft={draft} update={update} products={p.products} />}
        {step === 5 && <StepNotes draft={draft} update={update} />}
        {step === 6 && <StepPhotos photos={photos} pending={pendingPhotos} onAdd={addPhoto} onRemove={removePhoto} />}
        {step === 7 && (
          <StepFinish
            draft={draft}
            params={p.params}
            photos={photos.length}
            issues={issues}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
            userName={p.userName}
            update={update}
            products={p.products}
          />
        )}
      </div>

      {/* Navegação inferior */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:px-0">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={btnClass("secondary", "lg", "w-28")}>
            <ChevronLeft className="size-4" /> Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                if (dirty) pushDraft();
                setStep((s) => s + 1);
                window.scrollTo({ top: 0 });
              }}
              className={btnClass("primary", "lg", "flex-1")}
            >
              {step === 0 ? "Iniciar atendimento" : "Continuar"} <ChevronRight className="size-4" />
            </button>
          ) : (
            <button type="button" onClick={() => finish()} disabled={finishing || blocking.length > 0 || queuedFinish} className={btnClass("primary", "lg", "flex-1")}>
              {finishing ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
              Finalizar e gerar relatório
            </button>
          )}
        </div>
      </div>
      <div className="h-20 lg:hidden" />
    </div>
  );
}

/* ───────────────────────────── Etapas ───────────────────────────── */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StepIdent({ p }: { p: FlowProps }) {
  const h = p.header;
  return (
    <>
      <Section title="Piscina">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[12px] text-muted">Cliente</dt><dd className="font-semibold">{h.customer}</dd></div>
          <div><dt className="text-[12px] text-muted">Piscina</dt><dd className="font-semibold">{h.pool} ({h.code})</dd></div>
          <div><dt className="text-[12px] text-muted">Volume</dt><dd className="font-semibold">{h.volume ?? "não informado"}</dd></div>
          <div><dt className="text-[12px] text-muted">Agendada</dt><dd className="font-semibold">{h.scheduled}</dd></div>
        </dl>
        {h.address && (
          <a href={mapsLink(h.address)} target="_blank" rel="noopener" className="mt-3 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
            <Navigation className="size-4 shrink-0 text-primary" /> {h.address}
          </a>
        )}
        {h.instructions && <p className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-sm text-info"><b>Instruções:</b> {h.instructions}</p>}
      </Section>
      <Section title="Última visita" hint={p.previous ? p.previous.when : "Primeiro atendimento desta piscina."}>
        {p.previous ? (
          <div className="flex flex-col gap-3 text-sm">
            {p.previous.measurements.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.previous.measurements.map((m) => (
                  <span key={m.label} className={cx("rounded-md px-2 py-0.5 text-[12px] font-medium tabular", m.status === "in_range" ? "bg-ok-soft text-ok" : m.status === "above" ? "bg-danger-soft text-danger" : m.status === "below" ? "bg-warn-soft text-warn" : "bg-surface-2")}>
                    {m.label}: {m.value ?? "—"} {m.unit}
                  </span>
                ))}
              </div>
            )}
            {p.previous.chemicals.length > 0 && <p><b>Produtos:</b> {p.previous.chemicals.join(" · ")}</p>}
            {p.previous.findings && <p><b>Problemas:</b> {p.previous.findings}</p>}
            {p.previous.followUp && <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn"><b>Acompanhar:</b> {p.previous.followUp}</p>}
            {p.previous.recommendations && <p><b>Recomendações:</b> {p.previous.recommendations}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">Sem histórico anterior.</p>
        )}
      </Section>
    </>
  );
}

const STATES: { k: "ok" | "attention" | "problem" | "not_checked"; cls: string }[] = [
  { k: "ok", cls: "bg-ok text-white" },
  { k: "attention", cls: "bg-warn text-white" },
  { k: "problem", cls: "bg-danger text-white" },
  { k: "not_checked", cls: "bg-line-strong text-ink" },
];

function StepInspection({ draft, update }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  return (
    <Section title="Inspeção visual" hint="Toque no estado de cada item. Adicione comentário quando precisar.">
      <ul className="flex flex-col divide-y divide-line">
        {CHECKLIST.map((c) => {
          const cur = draft.checklist[c.key] ?? { state: "not_checked", comment: "" };
          return (
            <li key={c.key} className="py-3">
              <p className="mb-2 text-sm font-semibold">{c.label}</p>
              <div className="grid grid-cols-4 gap-1">
                {STATES.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    aria-pressed={cur.state === s.k}
                    onClick={() => update((d) => ({ ...d, checklist: { ...d.checklist, [c.key]: { ...cur, state: s.k } } }))}
                    className={cx("h-10 rounded-lg text-[12px] font-semibold transition", cur.state === s.k ? s.cls : "bg-surface-2 text-ink-2")}
                  >
                    {CHECK_STATE_LABEL[s.k]}
                  </button>
                ))}
              </div>
              {(cur.state === "attention" || cur.state === "problem" || cur.comment) && (
                <input
                  className="input mt-2"
                  placeholder="Comentário"
                  value={cur.comment}
                  onChange={(e) => update((d) => ({ ...d, checklist: { ...d.checklist, [c.key]: { ...cur, comment: e.target.value } } }))}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function StepWater({ draft, update, params }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void; params: Param[] }) {
  return (
    <>
      <Section title="Parâmetros da água" hint="Deixe em branco o que não foi medido. A faixa exibida é a configurada pela sua empresa.">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Método">
            <Select value={draft.method} onChange={(e) => update((d) => ({ ...d, method: e.target.value }))} placeholder="—" options={MEASURE_METHODS} />
          </Field>
          <Field label="Kit / equipamento">
            <Input value={draft.instrument} onChange={(e) => update((d) => ({ ...d, instrument: e.target.value }))} placeholder="Opcional" />
          </Field>
        </div>
        <ul className="flex flex-col gap-3">
          {params.map((pm) => {
            const raw = draft.measurements[pm.key] ?? "";
            const v = num(raw);
            const st = rangeStatus(v, pm.rangeMin, pm.rangeMax);
            return (
              <li key={pm.key} className="grid grid-cols-[1fr_120px] items-center gap-3">
                <div>
                  <p className="text-sm font-semibold">{pm.label} {pm.unit && <span className="font-normal text-muted">({pm.unit})</span>}</p>
                  <p className="text-[12px] text-muted">
                    Faixa: {formatRange(pm.rangeMin, pm.rangeMax, pm.unit)}
                    {raw && (
                      <span className={cx("ml-1.5 font-semibold", st === "in_range" ? "text-ok" : st === "above" ? "text-danger" : st === "below" ? "text-warn" : "text-muted")}>· {RANGE_LABEL[st]}</span>
                    )}
                  </p>
                </div>
                <input
                  className={cx("input text-right text-[18px] font-semibold tabular", st === "above" && "border-danger", st === "below" && "border-warn")}
                  inputMode="decimal"
                  aria-label={pm.label}
                  value={raw}
                  onChange={(e) => update((d) => ({ ...d, measurements: { ...d.measurements, [pm.key]: e.target.value.replace(/[^\d.,-]/g, "") } }))}
                  placeholder="—"
                />
              </li>
            );
          })}
        </ul>
        {params.length === 0 && <p className="text-sm text-muted">Nenhum parâmetro ativo. Configure em Configurações → Parâmetros da água.</p>}
      </Section>
    </>
  );
}

function StepProcedures({ draft, update }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  return (
    <Section title="Serviços realizados" hint="Marque o que foi executado. O horário é registrado automaticamente.">
      <ul className="grid gap-2 sm:grid-cols-2">
        {PROCEDURES.map((pr) => {
          const cur = draft.procedures[pr.key] ?? { done: false, notes: "" };
          return (
            <li key={pr.key}>
              <button
                type="button"
                aria-pressed={cur.done}
                onClick={() => update((d) => ({ ...d, procedures: { ...d.procedures, [pr.key]: { ...cur, done: !cur.done } } }))}
                className={cx("flex h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition", cur.done ? "border-primary bg-primary-soft text-primary" : "border-line-strong bg-surface text-ink-2")}
              >
                <span className={cx("grid size-6 place-items-center rounded-md border", cur.done ? "border-primary bg-primary text-primary-ink" : "border-line-strong")}>{cur.done && <Check className="size-4" />}</span>
                {pr.label}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function StepProducts({ draft, update, products }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void; products: Product[] }) {
  const add = (prod?: Product) =>
    update((d) => ({
      ...d,
      chemicals: [...d.chemicals, { id: uuid(), productId: prod?.id ?? null, productName: prod?.name ?? "", quantity: "", unit: prod?.unit ?? "kg", lot: prod?.lot ?? "", purpose: "", consume: !!prod }],
    }));
  const set = (id: string, patch: Partial<Chem>) => update((d) => ({ ...d, chemicals: d.chemicals.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  return (
    <>
      <div className="mb-4 flex gap-2.5 rounded-xl border border-warn/30 bg-warn-soft p-3 text-[13px] text-warn">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>O Ondaro <b>registra</b> o que foi aplicado — não calcula nem recomenda dosagens. Siga o rótulo e as orientações do fabricante, nunca misture produtos e confirme a liberação da piscina com seu responsável técnico.</p>
      </div>
      <Section title="Produtos aplicados">
        {draft.chemicals.length === 0 && <p className="mb-3 text-sm text-muted">Nenhum produto registrado nesta visita.</p>}
        <ul className="flex flex-col gap-3">
          {draft.chemicals.map((c) => {
            const prod = products.find((x) => x.id === c.productId);
            return (
              <li key={c.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  {prod ? (
                    <p className="text-sm font-semibold">{prod.name} <span className="font-normal text-muted">· estoque {prod.stockQty} {prod.unit}</span></p>
                  ) : (
                    <input className="input" placeholder="Nome do produto" value={c.productName} onChange={(e) => set(c.id, { productName: e.target.value })} />
                  )}
                  <button type="button" onClick={() => update((d) => ({ ...d, chemicals: d.chemicals.filter((x) => x.id !== c.id) }))} className="rounded-lg p-2 text-muted" aria-label="Remover produto">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {prod?.safetyNotes && <p className="mt-1 text-[12px] text-warn">Fabricante: {prod.safetyNotes}</p>}
                <div className="mt-2 grid grid-cols-[1fr_90px] gap-2">
                  <input className="input text-right text-[17px] font-semibold tabular" inputMode="decimal" placeholder="Quantidade" aria-label="Quantidade" value={c.quantity} onChange={(e) => set(c.id, { quantity: e.target.value.replace(/[^\d.,]/g, "") })} />
                  {prod ? (
                    <span className="grid place-items-center rounded-[10px] bg-surface-2 text-sm font-semibold">{prod.unit}</span>
                  ) : (
                    <select className="input" value={c.unit} onChange={(e) => set(c.id, { unit: e.target.value })} aria-label="Unidade">
                      {["kg", "g", "L", "mL", "un"].map((u) => <option key={u}>{u}</option>)}
                    </select>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Finalidade (ex.: correção de pH)" value={c.purpose} onChange={(e) => set(c.id, { purpose: e.target.value })} />
                  <input className="input" placeholder="Lote" value={c.lot} onChange={(e) => set(c.id, { lot: e.target.value })} />
                </div>
                {prod && (
                  <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
                    <input type="checkbox" checked={c.consume} onChange={(e) => set(c.id, { consume: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                    Dar baixa no estoque ao finalizar
                  </label>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {products.length > 0 && (
            <select
              className="input sm:flex-1"
              value=""
              onChange={(e) => {
                const prod = products.find((x) => x.id === e.target.value);
                if (prod) add(prod);
              }}
              aria-label="Adicionar produto do estoque"
            >
              <option value="">+ Produto do estoque…</option>
              {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} ({pr.stockQty} {pr.unit})</option>)}
            </select>
          )}
          <button type="button" onClick={() => add()} className={btnClass("secondary", "md")}>
            <Plus className="size-4" /> Outro produto
          </button>
        </div>
      </Section>
    </>
  );
}

function StepNotes({ draft, update }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  const n = draft.notes;
  const set = (k: keyof Draft["notes"]) => (e: { target: { value: string } }) => update((d) => ({ ...d, notes: { ...d.notes, [k]: e.target.value } }));
  return (
    <Section title="Observações e recomendações" hint="O que entra no relatório do cliente — exceto as notas internas.">
      <div className="flex flex-col gap-4">
        <Field label="Problemas encontrados"><Textarea value={n.findings} onChange={set("findings")} /></Field>
        <Field label="Ações realizadas"><Textarea value={n.actionsTaken} onChange={set("actionsTaken")} className="min-h-16" /></Field>
        <Field label="Precisa de acompanhamento" hint="Aparece em destaque na próxima visita."><Textarea value={n.followUp} onChange={set("followUp")} className="min-h-16" /></Field>
        <Field label="Recomendações ao cliente" hint="Ex.: manter o filtro ligado 8 h/dia, trocar a areia do filtro."><Textarea value={n.recommendations} onChange={set("recommendations")} /></Field>
        <Field label="Orientação sobre o uso da piscina" hint="Escrita por você. O sistema não presume que a piscina está liberada após uma aplicação.">
          <Textarea value={n.poolSafetyNote} onChange={set("poolSafetyNote")} className="min-h-16" placeholder="Ex.: aguardar o tempo indicado no rótulo antes de liberar o banho." />
        </Field>
        <Field label="Próxima intervenção sugerida"><Input type="date" value={n.nextVisitSuggestion} onChange={set("nextVisitSuggestion")} /></Field>
        <Field label="Notas internas" hint="Só a equipe vê. Nunca vai para o relatório nem para o portal."><Textarea value={n.internalNotes} onChange={set("internalNotes")} className="min-h-16" /></Field>
      </div>
    </Section>
  );
}

function StepPhotos({ photos, pending, onAdd, onRemove }: { photos: { id: string; kind: string; caption: string | null }[]; pending: QueuedPhoto[]; onAdd: (f: File, kind: string) => Promise<void>; onRemove: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const label = (k: string) => (k === "before" ? "Antes" : k === "after" ? "Depois" : k === "problem" ? "Problema" : "Outra");
  return (
    <Section title="Fotos" hint="Antes e depois valorizam o seu trabalho no relatório. As fotos são reduzidas antes do envio.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["before", "after", "problem", "other"] as const).map((k) => (
          <label key={k} className={cx("flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong text-[13px] font-semibold text-ink-2", busy === k && "opacity-60")}>
            {busy === k ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5 text-primary" />}
            {label(k)}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(k);
                await onAdd(f, k);
                setBusy(null);
              }}
            />
          </label>
        ))}
      </div>
      {(photos.length > 0 || pending.length > 0) && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((ph) => (
            <div key={ph.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${ph.id}`} alt={label(ph.kind)} className="size-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold text-white">{label(ph.kind)}</span>
              <button type="button" onClick={() => onRemove(ph.id)} className="absolute right-1 top-1 rounded-md bg-black/55 p-1 text-white" aria-label="Apagar foto">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {pending.map((ph) => (
            <div key={ph.id} className="relative grid aspect-square place-items-center rounded-lg bg-warn-soft text-center text-[11px] font-semibold text-warn">
              <span><CloudOff className="mx-auto mb-1 size-4" />{label(ph.kind)}<br />aguardando envio</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function StepFinish({
  draft, params, photos, issues, confirmed, setConfirmed, userName, products,
}: {
  draft: Draft; params: Param[]; photos: number; issues: string[]; confirmed: boolean; setConfirmed: (b: boolean) => void; userName: string; update: (fn: (d: Draft) => Draft) => void; products: Product[];
}) {
  const measured = params.filter((p) => (draft.measurements[p.key] ?? "").trim() !== "");
  const out = measured.filter((p) => ["above", "below"].includes(rangeStatus(num(draft.measurements[p.key]), p.rangeMin, p.rangeMax)));
  const procs = PROCEDURES.filter((p) => draft.procedures[p.key]?.done);
  const chems = draft.chemicals.filter((c) => c.productName.trim());
  const toConsume = chems.filter((c) => c.productId && c.consume);
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <>
      <Section title="Conferência final">
        <ul className="flex flex-col gap-2 text-sm">
          <Row ok={measured.length > 0} text={`${measured.length} parâmetro(s) medido(s)`} />
          {out.length > 0 && (
            <li className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Fora da faixa configurada: {out.map((p) => p.label).join(", ")}. Registre a orientação na etapa de observações.</span>
            </li>
          )}
          <Row ok={procs.length > 0} text={`${procs.length} serviço(s) realizado(s)`} />
          <Row ok text={`${chems.length} produto(s) registrado(s)${toConsume.length ? ` · ${toConsume.length} com baixa no estoque` : ""}`} />
          <Row ok={photos > 0} text={`${photos} foto(s)`} />
          <Row ok={!!draft.notes.recommendations || !!draft.notes.findings} text="Observações e recomendações" />
        </ul>
        {toConsume.length > 0 && (
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-[13px]">
            <p className="font-semibold">Baixa no estoque ao finalizar:</p>
            <ul className="mt-1 list-disc pl-5">
              {toConsume.map((c) => {
                const pr = products.find((x) => x.id === c.productId);
                return <li key={c.id}>{c.productName}: {c.quantity} {pr?.unit ?? c.unit}</li>;
              })}
            </ul>
          </div>
        )}
        {issues.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {issues.map((i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] font-medium text-danger"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{i}</li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Responsável e horário">
        <p className="text-sm">Registrado por <b>{userName}</b> · {now}</p>
        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
          Confirmo que realizei este atendimento nesta data e horário e que as informações registradas estão corretas.
        </label>
      </Section>
    </>
  );
}

function Row({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cx("grid size-5 place-items-center rounded-full", ok ? "bg-ok text-white" : "bg-line-strong text-ink")}>{ok ? <Check className="size-3" /> : "–"}</span>
      {text}
    </li>
  );
}

function Done({ publicToken, protocol, reportId, warnings, customerPhone, customer, pool }: { publicToken: string; protocol: string; reportId: string; warnings: string[]; customerPhone: string | null; customer: string; pool: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/r/${publicToken}` : `/r/${publicToken}`;
  const msg = `Olá, ${customer.split(" ")[0]}! O atendimento da ${pool} foi concluído. Relatório técnico completo: ${url}`;
  return (
    <div className="mx-auto max-w-md animate-[var(--animate-fade-up)] py-6 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-ok-soft text-ok"><Droplets className="size-8" /></div>
      <h1 className="mt-4 text-2xl font-extrabold">Atendimento finalizado</h1>
      <p className="mt-1 text-sm text-muted">Relatório {protocol} gerado e salvo no histórico da piscina.</p>
      {warnings.map((w) => <p key={w} className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{w}</p>)}
      <div className="mt-6 flex flex-col gap-2">
        {customerPhone && (
          <a
            href={waLink(customerPhone, msg)}
            target="_blank"
            rel="noopener"
            onClick={() => import("./actions").then((m) => m.logShareAction(reportId))}
            className={btnClass("primary", "lg")}
          >
            <MessageCircle className="size-4" /> Enviar ao cliente pelo WhatsApp
          </a>
        )}
        <a href={`/r/${publicToken}`} target="_blank" rel="noopener" className={btnClass("secondary", "lg")}>
          <FileText className="size-4" /> Ver relatório
        </a>
        <a href="/app" className={btnClass("ghost", "lg")}>Voltar ao início</a>
      </div>
      <p className="mt-4 text-[12px] text-muted">O envio automático pelo WhatsApp oficial acontece quando a integração estiver conectada e o cliente tiver consentimento registrado.</p>
    </div>
  );
}
