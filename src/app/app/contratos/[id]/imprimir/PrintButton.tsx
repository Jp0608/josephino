"use client";
import { Printer } from "lucide-react";
import { btnClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btnClass("primary", "md")}>
      <Printer className="size-4" /> Imprimir ou salvar PDF
    </button>
  );
}
