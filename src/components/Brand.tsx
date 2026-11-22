/**
 * Marca Ondaro: um anel (a borda da piscina, vista de cima) cortado por uma onda —
 * a lâmina d'água sob controle. Funciona em 16px e em tamanho grande.
 */
export function OndaroMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="16" cy="16" r="12.5" stroke="#1391BE" strokeWidth="5" />
      <path d="M5.5 17.2c2.6-2.4 5.2-2.4 7.8 0s5.2 2.4 7.8 0 4.4-2 5.8-.9" stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function OndaroLogo({ size = 28, className = "", tone = "auto" }: { size?: number; className?: string; tone?: "auto" | "light" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <OndaroMark size={size} />
      <span
        className={`font-display font-extrabold tracking-[-0.04em] ${tone === "light" ? "text-white" : "text-ink"}`}
        style={{ fontSize: size * 0.82 }}
      >
        ondaro
      </span>
    </span>
  );
}
