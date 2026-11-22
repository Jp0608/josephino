import Link from "next/link";
import { OndaroLogo } from "./Brand";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/"><OndaroLogo size={24} /></Link>
      <h1 className="mt-8 text-3xl font-extrabold">{title}</h1>
      <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">Versão preliminar para a fase de testes. Deve ser revisada por advogado antes do lançamento comercial.</p>
      <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">{children}</div>
    </div>
  );
}
