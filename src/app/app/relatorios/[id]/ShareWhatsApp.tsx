"use client";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { btnClass } from "@/components/ui";
import { logShareAction } from "../../visitas/[id]/actions";

export function ShareWhatsApp({ href, reportId }: { href: string; reportId: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => logShareAction(reportId).then(() => router.refresh())}
      className={btnClass("primary", "md")}
    >
      <MessageCircle className="size-4" /> Enviar pelo meu WhatsApp
    </a>
  );
}
