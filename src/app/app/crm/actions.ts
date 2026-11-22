"use server";
import { revalidatePath } from "next/cache";
import { actionCtx } from "@/server/auth";
import { run, formObject } from "@/server/action";
import {
  createLead, updateLead, moveLead, addActivity, createProposal, updateProposal, markProposalRejected, convertLead,
} from "@/server/crm";
import { LEAD_STAGE_LABEL } from "@/lib/domain/catalog";
import type { LeadStage } from "@/db/schema";
import type { ActionResult } from "@/lib/action-types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function leadInput(fd: FormData) {
  return {
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    city: str(fd, "city"),
    source: str(fd, "source"),
    estimatedMonthly: str(fd, "estimatedMonthly"),
    ownerUserId: str(fd, "ownerUserId"),
    nextFollowUp: str(fd, "nextFollowUp"),
    notes: str(fd, "notes"),
  };
}

export async function createLeadAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    const lead = await createLead(ctx, leadInput(fd));
    revalidatePath("/app/crm");
    return { ok: true, message: "Lead cadastrado.", redirect: `/app/crm/${lead.id}` };
  });
}

export async function updateLeadAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    await updateLead(ctx, id, leadInput(fd));
    revalidatePath(`/app/crm/${id}`);
    return { ok: true, message: "Alterações salvas.", redirect: `/app/crm/${id}` };
  });
}

export async function moveLeadAction(id: string, stage: string, lostReason?: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    const r = await moveLead(ctx, id, stage, lostReason);
    revalidatePath("/app/crm");
    revalidatePath(`/app/crm/${id}`);
    return { ok: true, message: r.changed ? `Movido para “${LEAD_STAGE_LABEL[stage as LeadStage]}”.` : undefined };
  });
}

export async function addActivityAction(leadId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    await addActivity(ctx, leadId, { kind: str(fd, "kind") as "note", note: str(fd, "note"), nextFollowUp: str(fd, "nextFollowUp") });
    revalidatePath(`/app/crm/${leadId}`);
    return { ok: true, message: "Registro adicionado ao histórico." };
  });
}

function proposalInput(fd: FormData) {
  const o = formObject(fd);
  return { title: str(fd, "title"), items: str(fd, "items"), total: str(fd, "total"), recurring: o.recurring === true, validUntil: str(fd, "validUntil") };
}

export async function createProposalAction(leadId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    await createProposal(ctx, leadId, proposalInput(fd));
    revalidatePath(`/app/crm/${leadId}`);
    revalidatePath("/app/crm");
    return { ok: true, message: "Orçamento criado. Copie o link e envie ao cliente." };
  });
}

export async function updateProposalAction(proposalId: string, leadId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    const p = await updateProposal(ctx, proposalId, proposalInput(fd));
    revalidatePath(`/app/crm/${leadId}`);
    return { ok: true, message: `Orçamento atualizado (versão ${p.version}). O mesmo link mostra a nova versão.` };
  });
}

export async function rejectProposalAction(proposalId: string, leadId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    await markProposalRejected(ctx, proposalId);
    revalidatePath(`/app/crm/${leadId}`);
    return { ok: true, message: "Orçamento marcado como recusado. O link não aceita mais aprovação." };
  });
}

export async function convertLeadAction(leadId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionCtx("crm.use");
    const c = await convertLead(ctx, leadId);
    revalidatePath(`/app/crm/${leadId}`);
    revalidatePath("/app/clientes");
    return { ok: true, message: "Cliente cadastrado a partir do lead.", redirect: `/app/clientes/${c.id}` };
  });
}
