import { OndaroLogo } from "@/components/Brand";

export default function Suspended() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <OndaroLogo size={26} />
      <h1 className="mt-8 text-2xl font-extrabold text-ink">Conta suspensa</h1>
      <p className="mt-2 text-sm text-muted">
        O acesso desta empresa está suspenso. Nenhum dado foi apagado. Fale com o suporte do Ondaro para regularizar e reativar a conta.
      </p>
      <form action="/api/auth/logout" method="post" className="mt-6">
        <button className="text-sm font-semibold text-primary">Sair</button>
      </form>
    </div>
  );
}
