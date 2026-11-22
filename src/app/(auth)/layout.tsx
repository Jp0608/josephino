import Link from "next/link";
import { OndaroLogo } from "@/components/Brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_520px]">
      <section className="relative hidden overflow-hidden bg-abyss-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Waves />
        <Link href="/" className="relative">
          <OndaroLogo size={30} tone="light" />
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-[34px] font-extrabold leading-[1.1] tracking-tight">Cada piscina com prontuário, cada visita com relatório.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-raia-100/80">
            Agenda, atendimento técnico pelo celular, parâmetros da água, produtos aplicados e o relatório profissional pronto para o cliente — numa operação só.
          </p>
        </div>
        <p className="relative text-[12px] text-raia-100/60">Seus dados ficam isolados por empresa e protegidos no servidor.</p>
      </section>
      <section className="flex flex-col px-5 py-8 md:px-12">
        <Link href="/" className="mb-10 lg:hidden">
          <OndaroLogo size={26} />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">{children}</div>
      </section>
    </div>
  );
}

function Waves() {
  return (
    <svg className="absolute inset-x-0 bottom-0 w-full opacity-60" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden>
      <path d="M0 260 C 130 220, 250 300, 400 260 S 650 220, 800 250 V400 H0Z" fill="#0A4F73" />
      <path d="M0 300 C 160 270, 260 340, 420 300 S 660 270, 800 300 V400 H0Z" fill="#0B6E99" opacity="0.7" />
      <path d="M0 340 C 150 320, 300 370, 450 340 S 680 320, 800 345 V400 H0Z" fill="#1391BE" opacity="0.5" />
    </svg>
  );
}
