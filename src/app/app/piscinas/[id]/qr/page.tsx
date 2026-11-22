import QRCode from "qrcode";
import { requireCtx } from "@/server/auth";
import { getPool } from "@/server/pools";
import { notFoundGuard } from "@/server/guards";
import { appUrl } from "@/server/reports";
import { OndaroMark } from "@/components/Brand";
import { PrintButton } from "@/components/PrintButton";

/**
 * Etiqueta com QR code da piscina. O QR aponta para o prontuário DENTRO do app:
 * só abre para quem está logado na empresa (o código não expõe dados).
 */
export default async function PoolQr({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("customers.read");
  const d = await notFoundGuard(() => getPool(ctx, id));
  const url = `${appUrl()}/app/piscinas/${id}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#06263a", light: "#ffffff" } });
  return (
    <div className="mx-auto max-w-sm">
      <div className="print-card rounded-2xl border border-line bg-white p-6 text-center text-[#0b1d29]">
        <div className="mx-auto w-56" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 font-display text-2xl font-extrabold">{d.pool.code}</p>
        <p className="text-sm">{d.customer.name} · {d.pool.name}</p>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#5a6b78]">
          <OndaroMark size={14} /> {ctx.tenant.name} — prontuário técnico
        </p>
      </div>
      <div className="no-print mt-4 flex justify-center">
        <PrintButton label="Imprimir etiqueta" />
      </div>
      <p className="no-print mt-3 text-center text-[12px] text-muted">Cole perto da casa de máquinas. Ao escanear, o técnico logado abre o prontuário desta piscina.</p>
    </div>
  );
}
