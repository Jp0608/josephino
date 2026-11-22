"use client";
import { useState } from "react";
import { estimateVolumeLiters, SHAPES } from "@/lib/domain/volume";
import { Field, Input, Select } from "@/components/ui";

type P = { shape?: string | null; lengthM?: number | null; widthM?: number | null; depthMinM?: number | null; depthMaxM?: number | null; volumeLiters?: number | null; volumeIsEstimated?: boolean };

const n = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

export function Dimensions({ p }: { p?: P }) {
  const [v, setV] = useState({
    shape: p?.shape ?? "retangular",
    lengthM: p?.lengthM?.toString() ?? "",
    widthM: p?.widthM?.toString() ?? "",
    depthMinM: p?.depthMinM?.toString() ?? "",
    depthMaxM: p?.depthMaxM?.toString() ?? "",
    volume: p && !p.volumeIsEstimated && p.volumeLiters ? String(p.volumeLiters) : "",
  });
  const est = estimateVolumeLiters({ shape: v.shape, lengthM: n(v.lengthM), widthM: n(v.widthM), depthMinM: n(v.depthMinM), depthMaxM: n(v.depthMaxM) });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Field label="Formato" className="md:col-span-2">
        <Select name="shape" value={v.shape} onChange={set("shape")} options={Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label]))} />
      </Field>
      <Field label="Comprimento (m)" className="md:col-span-1">
        <Input name="lengthM" inputMode="decimal" value={v.lengthM} onChange={set("lengthM")} />
      </Field>
      <Field label="Largura (m)" className="md:col-span-1">
        <Input name="widthM" inputMode="decimal" value={v.widthM} onChange={set("widthM")} />
      </Field>
      <Field label="Prof. mín. (m)" className="md:col-span-1">
        <Input name="depthMinM" inputMode="decimal" value={v.depthMinM} onChange={set("depthMinM")} />
      </Field>
      <Field label="Prof. máx. (m)" className="md:col-span-1">
        <Input name="depthMaxM" inputMode="decimal" value={v.depthMaxM} onChange={set("depthMaxM")} />
      </Field>
      <Field
        label="Volume conhecido (litros)"
        className="md:col-span-3"
        hint="Se você sabe o volume real (projeto, construtora), informe aqui: ele substitui a estimativa."
      >
        <Input name="volumeLiters" inputMode="numeric" value={v.volume} onChange={set("volume")} />
      </Field>
      <div className="flex items-end md:col-span-3">
        <div className="w-full rounded-xl bg-primary-soft px-4 py-3 text-sm">
          {v.volume ? (
            <span className="text-primary">
              Volume informado: <b className="tabular">{Number(v.volume).toLocaleString("pt-BR")} L</b>
            </span>
          ) : est ? (
            <span className="text-primary">
              Volume estimado pelas medidas: <b className="tabular">{est.toLocaleString("pt-BR")} L</b>
              <span className="block text-[12px] opacity-80">Estimativa geométrica — confira com o projeto quando possível.</span>
            </span>
          ) : (
            <span className="text-muted">{v.shape === "irregular" ? "Formato livre: informe o volume conhecido." : "Preencha as medidas para estimar o volume."}</span>
          )}
        </div>
      </div>
    </div>
  );
}
