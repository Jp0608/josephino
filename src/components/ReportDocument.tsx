import type { ReportSnapshot } from "@/server/reports";
import { formatRange, RANGE_LABEL, type RangeStatus } from "@/lib/domain/ranges";
import { CHECK_STATE_LABEL } from "@/lib/domain/catalog";
import { date, dateTime, num, time } from "@/lib/format";
import { OndaroMark } from "./Brand";

/**
 * Documento do relatório técnico. Renderiza SÓ o snapshot emitido (imutável) —
 * nunca anotações internas nem dados financeiros.
 */
export function ReportDocument({ s, logoUrl, photoUrl }: { s: ReportSnapshot; logoUrl: string | null; photoUrl: (id: string) => string }) {
  const brand = /^#[0-9a-f]{6}$/i.test(s.company.brandColor) ? s.company.brandColor : "#0A6E8A";
  const tone: Record<string, string> = { in_range: "#0f7a52", below: "#9a6212", above: "#b4321f", not_measured: "#5a6b78", no_range: "#5a6b78" };
  const bg: Record<string, string> = { in_range: "#e3f5ec", below: "#fcf1dc", above: "#fde8e4", not_measured: "#eef2f5", no_range: "#eef2f5" };
  const before = s.photos.filter((p) => p.kind === "before");
  const after = s.photos.filter((p) => p.kind === "after");
  const others = s.photos.filter((p) => p.kind !== "before" && p.kind !== "after");
  const contact = [s.company.phone, s.company.whatsapp && s.company.whatsapp !== s.company.phone ? s.company.whatsapp : null, s.company.email].filter(Boolean).join(" · ");

  return (
    <article className="print-card mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl border border-[#e2e8ed] bg-white text-[#0b1d29] shadow-[0_12px_40px_-12px_rgba(6,38,58,.25)]" style={{ colorScheme: "light" }}>
      {/* Cabeçalho */}
      <header className="relative px-6 pb-6 pt-7 text-white md:px-10" style={{ background: `linear-gradient(135deg, ${brand}, #06263a)` }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={s.company.name} className="h-12 w-auto max-w-[160px] rounded-lg bg-white object-contain p-1.5" />
            ) : (
              <div className="grid size-12 place-items-center rounded-xl bg-white/15 font-display text-lg font-extrabold">{s.company.name.slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <p className="font-display text-[19px] font-extrabold leading-tight">{s.company.name}</p>
              {contact && <p className="break-words text-[12px] opacity-80">{contact}</p>}
              {s.company.document && <p className="text-[11px] opacity-70">CNPJ/CPF {s.company.document}</p>}
            </div>
          </div>
          <div className="shrink-0 border-t border-white/20 pt-3 sm:border-0 sm:pt-0 sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-75">Relatório técnico</p>
            <p className="font-display text-[15px] font-bold">{s.protocol}</p>
            <p className="text-[11px] opacity-75">Emitido em {dateTime(s.issuedAt)}</p>
          </div>
        </div>
      </header>

      <div className="px-6 py-7 md:px-10">
        {/* Dados do atendimento */}
        <section className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-[#f5f8fa] p-4 text-sm md:grid-cols-4">
          <Info k="Cliente" v={s.customer.name} />
          <Info k="Piscina" v={`${s.pool.name} (${s.pool.code})`} />
          <Info k="Data" v={date(s.visit.completedAt)} />
          <Info k="Horário" v={`${s.visit.startedAt ? time(s.visit.startedAt) + " – " : ""}${time(s.visit.completedAt)}`} />
          <Info k="Endereço" v={s.customer.address || "—"} wide />
          <Info k="Serviço" v={s.visit.serviceType} />
          <Info k="Volume" v={s.pool.volumeLiters ? `${s.pool.volumeLiters.toLocaleString("pt-BR")} L${s.pool.volumeIsEstimated ? " (est.)" : ""}` : "—"} />
        </section>

        {/* Condição da água */}
        <H>Condição da água</H>
        {s.measurements.length === 0 ? (
          <p className="text-sm text-[#5a6b78]">Nenhum parâmetro medido nesta visita.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e2e8ed]">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f8fa] text-left text-[11px] uppercase tracking-wide text-[#5a6b78]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Parâmetro</th>
                  <th className="px-3 py-2 text-right font-semibold">Resultado</th>
                  <th className="hidden px-3 py-2 font-semibold sm:table-cell">Faixa de referência</th>
                  <th className="px-3 py-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {s.measurements.map((m) => (
                  <tr key={m.label} className="border-t border-[#e2e8ed]">
                    <td className="px-3 py-2.5 font-medium">{m.label}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{num(m.value)} {m.unit}</td>
                    <td className="hidden px-3 py-2.5 text-[#5a6b78] sm:table-cell">{formatRange(m.rangeMin, m.rangeMax, m.unit)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: tone[m.status], background: bg[m.status] }}>{RANGE_LABEL[m.status as RangeStatus] ?? m.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s.measurements.length > 0 && (
          <p className="mt-2 text-[11px] text-[#5a6b78]">Faixas de referência definidas pela empresa responsável. Medições registradas no momento do atendimento.</p>
        )}

        {/* Inspeção */}
        {s.inspection.length > 0 && (
          <>
            <H>Inspeção visual</H>
            <ul className="grid gap-2 sm:grid-cols-2">
              {s.inspection.map((i) => (
                <li key={i.label} className="flex items-start justify-between gap-2 rounded-lg border border-[#e2e8ed] px-3 py-2 text-sm">
                  <span>
                    {i.label}
                    {i.comment && <span className="block text-[12px] text-[#5a6b78]">{i.comment}</span>}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold" style={{ color: i.state === "ok" ? tone.in_range : i.state === "problem" ? tone.above : tone.below }}>
                    {CHECK_STATE_LABEL[i.state]}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Serviços */}
        <H>Serviços realizados</H>
        {s.procedures.length === 0 ? (
          <p className="text-sm text-[#5a6b78]">Nenhum procedimento registrado.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {s.procedures.map((p) => (
              <li key={p.label} className="flex items-start gap-2">
                <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[10px] text-white" style={{ background: brand }}>✓</span>
                <span>{p.label}{p.notes && <span className="block text-[12px] text-[#5a6b78]">{p.notes}</span>}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Produtos */}
        {s.products.length > 0 && (
          <>
            <H>Produtos utilizados</H>
            <div className="overflow-hidden rounded-xl border border-[#e2e8ed]">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f8fa] text-left text-[11px] uppercase tracking-wide text-[#5a6b78]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Produto</th>
                    <th className="hidden px-3 py-2 font-semibold sm:table-cell">Finalidade</th>
                    <th className="px-3 py-2 text-right font-semibold">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {s.products.map((p, i) => (
                    <tr key={i} className="border-t border-[#e2e8ed]">
                      <td className="px-3 py-2.5">
                        {p.name}
                        {p.purpose && <span className="block text-[12px] text-[#5a6b78] sm:hidden">{p.purpose}</span>}
                        {p.lot && <span className="block text-[11px] text-[#5a6b78]">Lote {p.lot}</span>}
                      </td>
                      <td className="hidden px-3 py-2.5 text-[#5a6b78] sm:table-cell">{p.purpose || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{num(p.quantity, 3)} {p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Fotos */}
        {s.photos.length > 0 && (
          <>
            <H>Registro fotográfico</H>
            {before.length > 0 && after.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <PhotoCol title="Antes" items={before} url={photoUrl} />
                <PhotoCol title="Depois" items={after} url={photoUrl} />
              </div>
            ) : null}
            {(before.length === 0 || after.length === 0 ? s.photos : others).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(before.length === 0 || after.length === 0 ? s.photos : others).map((p) => (
                  <Photo key={p.id} id={p.id} url={photoUrl} label={p.kind === "before" ? "Antes" : p.kind === "after" ? "Depois" : p.kind === "problem" ? "Problema identificado" : p.caption ?? ""} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Observações */}
        {(s.findings || s.actionsTaken || s.recommendations || s.followUp || s.safetyNote) && (
          <>
            <H>Observações técnicas</H>
            <div className="flex flex-col gap-3 text-sm leading-relaxed">
              {s.findings && <Note title="Problemas encontrados" text={s.findings} />}
              {s.actionsTaken && <Note title="Ações realizadas" text={s.actionsTaken} />}
              {s.followUp && <Note title="Pontos em acompanhamento" text={s.followUp} />}
              {s.recommendations && <Note title="Recomendações" text={s.recommendations} highlight={brand} />}
              {s.safetyNote && <Note title="Orientação sobre o uso da piscina" text={s.safetyNote} />}
            </div>
          </>
        )}

        <div className="mt-8 grid gap-4 border-t border-[#e2e8ed] pt-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a6b78]">Próxima visita</p>
            <p className="mt-0.5 font-semibold">{s.nextVisit ? (s.nextVisit.length > 10 ? dateTime(s.nextVisit) : date(s.nextVisit)) : "A combinar"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a6b78]">Atendimento realizado e registrado por</p>
            <p className="mt-0.5 font-semibold">{s.responsible.name ?? s.visit.technician ?? "—"}</p>
            <p className="text-[12px] text-[#5a6b78]">{s.company.name}</p>
          </div>
        </div>
        {s.company.footer && <p className="mt-5 whitespace-pre-wrap text-[12px] text-[#5a6b78]">{s.company.footer}</p>}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-[#e2e8ed] bg-[#f5f8fa] px-6 py-3 text-[11px] text-[#5a6b78] md:px-10">
        <span>{s.protocol} · documento gerado eletronicamente a partir do registro do atendimento</span>
        <span className="flex items-center gap-1"><OndaroMark size={12} /> Ondaro</span>
      </footer>
    </article>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 font-display text-[16px] font-extrabold tracking-tight text-[#06263a]">{children}</h2>;
}
function Info({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a6b78]">{k}</p>
      <p className="mt-0.5 font-semibold">{v}</p>
    </div>
  );
}
function Note({ title, text, highlight }: { title: string; text: string; highlight?: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8ed] p-3.5" style={highlight ? { borderLeft: `4px solid ${highlight}` } : undefined}>
      <p className="text-[12px] font-bold text-[#26394a]">{title}</p>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
function Photo({ id, url, label }: { id: string; url: (id: string) => string; label: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-[#e2e8ed]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url(id)} alt={label || "Foto do atendimento"} loading="lazy" className="aspect-[4/3] w-full object-cover" />
      {label && <figcaption className="px-2.5 py-1.5 text-[11px] font-semibold text-[#5a6b78]">{label}</figcaption>}
    </figure>
  );
}
function PhotoCol({ title, items, url }: { title: string; items: { id: string }[]; url: (id: string) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[#5a6b78]">{title}</p>
      {items.map((p) => <Photo key={p.id} id={p.id} url={url} label="" />)}
    </div>
  );
}
