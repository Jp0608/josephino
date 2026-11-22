import "server-only";
import { onlyDigits } from "@/lib/format";

/**
 * Integrações externas. Regra: sem credencial configurada, a integração aparece como
 * "não conectada" e nada é marcado como enviado/pago.
 */
export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}
export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
export function paymentGatewayConfigured() {
  return !!process.env.PAYMENT_GATEWAY_KEY;
}

export function integrationStatus() {
  return {
    whatsapp: whatsappConfigured(),
    email: emailConfigured(),
    payments: paymentGatewayConfigured(),
    maps: !!process.env.GOOGLE_MAPS_API_KEY,
  };
}

/**
 * WhatsApp Business Platform (Cloud API oficial da Meta).
 * Observação: fora da janela de 24h de conversa, a Meta exige modelo (template) aprovado.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!whatsappConfigured()) return { ok: false, error: "WhatsApp oficial não conectado" };
  let d = onlyDigits(to);
  if (d.length <= 11) d = `55${d}`;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: d, type: "text", text: { body, preview_url: true } }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok || !json.messages?.[0]?.id) return { ok: false, error: json.error?.message || `HTTP ${res.status}` };
    return { ok: true, id: json.messages[0].id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!emailConfigured()) return { ok: false, error: "E-mail não configurado" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !json.id) return { ok: false, error: json.message || `HTTP ${res.status}` };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}
