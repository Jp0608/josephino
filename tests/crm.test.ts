import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { leadActivities, leads, proposals } from "@/db/schema";
import {
  createLead, moveLead, getLead, addActivity, createProposal, updateProposal, getPublicProposal, acceptProposal, convertLead, getCrmMetrics, listBoard,
} from "@/server/crm";
import { getCustomer } from "@/server/customers";
import { ForbiddenError, NotFoundError, UserError } from "@/server/errors";
import { newTenant, addMember } from "./helpers";
import { addDays, isoDay } from "@/lib/format";

describe("CRM comercial", () => {
  let A: Awaited<ReturnType<typeof newTenant>>;
  let B: Awaited<ReturnType<typeof newTenant>>;

  beforeAll(async () => {
    A = await newTenant("business");
    B = await newTenant("business");
  });

  it("mudança de etapa grava atividade 'stage' e atualiza stage_changed_at", async () => {
    const lead = await createLead(A, { name: "Condomínio Solar", phone: "11988887777", estimatedMonthly: "450,00" });
    expect(lead.stage).toBe("new");
    expect(lead.estimatedMonthlyCents).toBe(45000);
    await new Promise((r) => setTimeout(r, 20));
    const r = await moveLead(A, lead.id, "contacted");
    expect(r.changed).toBe(true);
    expect(r.lead.stage).toBe("contacted");
    expect(r.lead.stageChangedAt.getTime()).toBeGreaterThan(lead.stageChangedAt.getTime());
    const acts = await withTenant(A.tenantId, (tx) =>
      tx.select().from(leadActivities).where(and(eq(leadActivities.tenantId, A.tenantId), eq(leadActivities.leadId, lead.id), eq(leadActivities.kind, "stage"))),
    );
    expect(acts.some((a) => a.note.includes("Lead novo → Primeiro contato"))).toBe(true);
    // Mesma etapa: não duplica atividade.
    const again = await moveLead(A, lead.id, "contacted");
    expect(again.changed).toBe(false);
  });

  it("'Perdido' exige motivo e grava o motivo", async () => {
    const lead = await createLead(A, { name: "Casa Praia" });
    await expect(moveLead(A, lead.id, "lost")).rejects.toBeInstanceOf(UserError);
    const r = await moveLead(A, lead.id, "lost", "Fechou com concorrente");
    expect(r.lead.lostReason).toBe("Fechou com concorrente");
    const d = await getLead(A, lead.id);
    expect(d.activities[0].note).toContain("Motivo: Fechou com concorrente");
    // Saindo de "Perdido", o motivo é limpo.
    const back = await moveLead(A, lead.id, "negotiation");
    expect(back.lead.lostReason).toBeNull();
  });

  it("aceite do orçamento pelo link registra nome, data, IP, navegador e versão", async () => {
    const lead = await createLead(A, { name: "Hotel Brisa" });
    const p = await createProposal(A, lead.id, { title: "Manutenção semanal", items: "4 visitas/mês\nProdutos inclusos", total: "890,00", recurring: true, validUntil: addDays(isoDay(), 10) });
    expect(p.publicToken).toBeTruthy();
    expect(p.status).toBe("sent");
    // Lead no início do funil avança para "Orçamento enviado".
    expect((await getLead(A, lead.id)).lead.stage).toBe("quote_sent");

    const edited = await updateProposal(A, p.id, { title: "Manutenção semanal", items: "4 visitas/mês", total: "850,00", recurring: true, validUntil: addDays(isoDay(), 10) });
    expect(edited.version).toBe(2);

    const pub = await getPublicProposal(p.publicToken!);
    expect(pub?.proposal.totalCents).toBe(85000);
    expect(pub?.state).toBe("open");

    await expect(acceptProposal(p.publicToken!, { name: "Ana", version: 2, ip: "1.1.1.1", userAgent: "x" })).rejects.toBeInstanceOf(UserError);
    await expect(acceptProposal(p.publicToken!, { name: "Ana Souza", version: 1, ip: "1.1.1.1", userAgent: "x" })).rejects.toThrow(/atualizado/);

    const acc = await acceptProposal(p.publicToken!, { name: "Ana Souza Lima", version: 2, ip: "200.10.20.30", userAgent: "Mozilla/5.0 Teste" });
    expect(acc.status).toBe("accepted");
    expect(acc.acceptedName).toBe("Ana Souza Lima");
    expect(acc.acceptedIp).toBe("200.10.20.30");
    expect(acc.acceptedUserAgent).toBe("Mozilla/5.0 Teste");
    expect(acc.acceptedAt).toBeInstanceOf(Date);
    expect(acc.version).toBe(2);
    await expect(acceptProposal(p.publicToken!, { name: "Outra Pessoa", version: 2, ip: "x", userAgent: "x" })).rejects.toThrow(/já foi aceito/);
    await expect(updateProposal(A, p.id, { title: "x x x", items: "abc", total: "1,00" })).rejects.toBeInstanceOf(UserError);
    expect(await getPublicProposal("token-inexistente-aaaaaaaaaaaa")).toBeNull();
  });

  it("orçamento vencido não aceita", async () => {
    const lead = await createLead(A, { name: "Sítio Verde" });
    const p = await createProposal(A, lead.id, { title: "Recuperação", items: "Tratamento de choque", total: "300" });
    await withTenant(A.tenantId, (tx) => tx.update(proposals).set({ validUntil: addDays(isoDay(), -1) }).where(and(eq(proposals.tenantId, A.tenantId), eq(proposals.id, p.id))));
    expect((await getPublicProposal(p.publicToken!))?.state).toBe("expired");
    await expect(acceptProposal(p.publicToken!, { name: "Ana Souza", version: 1, ip: "x", userAgent: "x" })).rejects.toThrow(/validade/);
  });

  it("outra empresa não lê nem altera lead pelo id", async () => {
    const lead = await createLead(A, { name: "Lead secreto da A" });
    await expect(getLead(B, lead.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(moveLead(B, lead.id, "qualified")).rejects.toBeInstanceOf(NotFoundError);
    await expect(addActivity(B, lead.id, { kind: "note", note: "invasão" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createProposal(B, lead.id, { title: "Invasão", items: "xxx", total: "10" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(convertLead(B, lead.id)).rejects.toBeInstanceOf(NotFoundError);
    const board = await listBoard(B);
    expect(board.find((l) => l.id === lead.id)).toBeUndefined();
    const rows = await withTenant(B.tenantId, (tx) => tx.select().from(leads));
    expect(rows.find((r) => r.id === lead.id)).toBeUndefined();
  });

  it("converter em cliente só quando fechado; cria o cliente e liga ao lead", async () => {
    const lead = await createLead(A, { name: "Maria Cliente Nova", phone: "11977776666", city: "Campinas", source: "indicacao" });
    await expect(convertLead(A, lead.id)).rejects.toThrow(/Fechado/);
    await moveLead(A, lead.id, "won");
    const c = await convertLead(A, lead.id);
    expect(c.name).toBe("Maria Cliente Nova");
    const d = await getLead(A, lead.id);
    expect(d.lead.convertedCustomerId).toBe(c.id);
    expect((await getCustomer(A, c.id)).customer.city).toBe("Campinas");
    await expect(convertLead(A, lead.id)).rejects.toThrow(/já foi convertido/);
  });

  it("métricas: abertos, conversão 90 dias, pipeline e follow-ups atrasados", async () => {
    const C = await newTenant("business");
    const l1 = await createLead(C, { name: "Um Lead", estimatedMonthly: "100", nextFollowUp: addDays(isoDay(), -2) });
    await createLead(C, { name: "Dois Lead", estimatedMonthly: "250,50", nextFollowUp: addDays(isoDay(), 3) });
    const l3 = await createLead(C, { name: "Três Lead", estimatedMonthly: "999" });
    const l4 = await createLead(C, { name: "Quatro Lead" });
    await moveLead(C, l3.id, "won");
    await moveLead(C, l4.id, "lost", "Preço");
    const m = await getCrmMetrics(C);
    expect(m.open).toBe(2);
    expect(m.pipeline).toBe(10000 + 25050);
    expect(m.overdue).toBe(1);
    expect(m.won).toBe(1);
    expect(m.lost).toBe(1);
    expect(m.conversionRate).toBe(0.5);
    void l1;
  });

  it("permissão e plano: técnico e plano sem CRM são bloqueados", async () => {
    const tech = await addMember(A.tenantId, "technician");
    await expect(listBoard({ ...tech, plan: A.plan })).rejects.toBeInstanceOf(ForbiddenError);
    const S = await newTenant("starter");
    await expect(createLead(S, { name: "Sem plano" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
