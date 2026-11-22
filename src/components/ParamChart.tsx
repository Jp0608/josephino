import { formatRange } from "@/lib/domain/ranges";

type Point = { at: Date; value: number; status: string };

/**
 * Evolução de um parâmetro ao longo das visitas. Só desenha valores medidos de verdade;
 * a faixa sombreada é a configurada pela empresa (se houver).
 */
export function ParamChart({ points, min, max, unit, height = 180 }: { points: Point[]; min: number | null; max: number | null; unit: string; height?: number }) {
  if (points.length === 0) return <p className="px-1 py-8 text-center text-sm text-muted">Nenhuma medição registrada ainda.</p>;
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const vals = points.map((p) => p.value).concat(min ?? [], max ?? []);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  const t0 = points[0].at.getTime();
  const t1 = points[points.length - 1].at.getTime();
  const x = (t: number) => (t1 === t0 ? (pad.l + W - pad.r) / 2 : pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.at.getTime()).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
  const dfmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const color = (s: string) => (s === "in_range" ? "var(--ok)" : s === "above" ? "var(--danger)" : s === "below" ? "var(--warn)" : "var(--primary)");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Gráfico com ${points.length} medições`}>
        {(min != null || max != null) && (
          <rect x={pad.l} width={W - pad.l - pad.r} y={y(max ?? hi)} height={Math.max(0, y(min ?? lo) - y(max ?? hi))} fill="var(--ok)" opacity="0.09" />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(t)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.at.getTime())} cy={y(p.value)} r="3.6" fill="var(--surface)" stroke={color(p.status)} strokeWidth="2">
            <title>{`${dfmt(p.at)}: ${fmt(p.value)} ${unit}`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 6} fontSize="11" fill="var(--muted)">{dfmt(points[0].at)}</text>
        {points.length > 1 && <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="11" fill="var(--muted)">{dfmt(points[points.length - 1].at)}</text>}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span>{points.length} medições</span>
        <span>Última: <b className="text-ink">{fmt(points[points.length - 1].value)} {unit}</b></span>
        <span>Faixa configurada: {formatRange(min, max, unit)}</span>
      </figcaption>
    </figure>
  );
}
