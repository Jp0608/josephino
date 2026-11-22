"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2 } from "lucide-react";
import { useToast } from "@/components/client";
import { btnClass } from "@/components/ui";
import { compressImage } from "@/lib/offline";

export function LogoUpload({ hasLogo }: { hasLogo: boolean }) {
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="flex items-center gap-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
        {hasLogo || v ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/logo?v=${v}`} alt="Logo da empresa" className="size-full object-contain p-1.5" />
        ) : (
          <span className="text-[11px] text-muted">sem logo</span>
        )}
      </div>
      <label className={btnClass("secondary", "md", "cursor-pointer")}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
        {hasLogo ? "Trocar logo" : "Enviar logo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            try {
              const fd = new FormData();
              fd.append("file", f.type === "image/png" ? f : await compressImage(f, 800, 0.9), "logo");
              const r = await fetch("/api/settings/logo", { method: "POST", body: fd });
              const j = await r.json();
              if (!j.ok) toast({ tone: "error", text: j.error });
              else {
                setV(Date.now());
                toast({ tone: "ok", text: "Logo atualizado. Ele aparece nos próximos relatórios." });
                router.refresh();
              }
            } catch {
              toast({ tone: "error", text: "Sem conexão." });
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}
