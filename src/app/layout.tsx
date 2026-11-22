import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { ToastProvider } from "@/components/client";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Ondaro — gestão para manutenção de piscinas", template: "%s · Ondaro" },
  description: "Agenda, visitas técnicas, parâmetros da água, relatórios profissionais, estoque, financeiro e CRM para piscineiros e empresas de manutenção de piscinas.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#06141e" },
  ],
};

// Aplica o tema salvo antes da pintura (evita piscar claro→escuro).
const themeScript = `try{var t=localStorage.getItem('ondaro-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
