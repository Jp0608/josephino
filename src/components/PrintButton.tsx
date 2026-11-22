"use client";
import { Printer } from "lucide-react";
import { btnClass } from "./ui";

export function PrintButton({ label = "Imprimir / salvar PDF", variant = "secondary" as const }: { label?: string; variant?: "secondary" | "primary" }) {
  return (
    <button type="button" onClick={() => window.print()} className={btnClass(variant, "md")}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
