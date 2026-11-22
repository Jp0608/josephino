import "server-only";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db";
import type { Ctx } from "./auth";
import { can } from "./permissions";
import { dayStart, addDays, isoDay } from "@/lib/format";

type C = Pick<Ctx, "tenantId" | "userId" | "role">;

export type Alert = {
  kind: "overdue_visit" | "no_schedule" | "stale_pool" | "out_of_range" | "late_payment" | "low_stock" | "contract_ending" | "no_report" | "setup_ranges" | "service_request" | "expiring_product";
  tone: "danger" | "warn" | "info";
  title: string;
  detail: string;
  href: string;
};

/** Tudo calculado a partir dos dados reais da empresa. Nenhum número é estimado ou inventado. */
export async function getDashboard(ctx: C) {
  const today = isoDay();
  const t0 = dayStart(today);
  const t1 = dayStart(addDays(today, 1));
  const monthStart = `${today.slice(0, 8)}01`;
  const isAll = can(ctx.role, "agenda.view_all");
  const seeFinance = can(ctx.role, "finance.read");
  return withTenant(ctx.tenantId, async (tx) => {
    const q = async <T,>(s: ReturnType<typeof sql>) => (await tx.execute(s)) as unknown as T[];
    const mine = isAll ? sql`true` : sql`v.assigned_user_id = ${ctx.userId}`;
    const [k] = await q<Record<string, number>>(sql`
      select
        (select count(*)::int from customers where tenant_id = ${ctx.tenantId} and status = 'active') as active_customers,
        (select count(*)::int from pools where tenant_id = ${ctx.tenantId} and active) as pools,
        (select count(*)::int from visits v where tenant_id = ${ctx.tenantId} and ${mine} and scheduled_start >= ${t0.toISOString()}::timestamptz and scheduled_start < ${t1.toISOString()}::timestamptz and status not in ('cancelled','rescheduled')) as visits_today,
        (select count(*)::int from visits v where tenant_id = ${ctx.tenantId} and ${mine} and scheduled_start >= ${t0.toISOString()}::timestamptz and scheduled_start < ${t1.toISOString()}::timestamptz and status = 'completed') as done_today,
        (select count(*)::int from visits v where tenant_id = ${ctx.tenantId} and ${mine} and scheduled_start >= ${t0.toISOString()}::timestamptz and scheduled_start < ${t1.toISOString()}::timestamptz and status in ('scheduled','confirmed','on_the_way','in_progress','waiting_info')) as pending_today,
        (select count(*)::int from visits v where tenant_id = ${ctx.tenantId} and ${mine} and scheduled_start < ${t0.toISOString()}::timestamptz and status in ('scheduled','confirmed','on_the_way','in_progress','waiting_info')) as overdue,
        (select count(*)::int from contracts where tenant_id = ${ctx.tenantId} and status = 'active') as active_contracts,
        (select count(*)::int from products where tenant_id = ${ctx.tenantId} and active and min_qty is not null and stock_qty <= min_qty) as low_stock,
        (select count(*)::int from visits v where tenant_id = ${ctx.tenantId} and ${mine} and completed_at >= ${dayStart(monthStart).toISOString()}::timestamptz and status = 'completed') as done_month
    `);
    let finance: { billedMonth: number; receivedMonth: number; openMonth: number; overdueCents: number; overdueCustomers: number; mrr: number } | null = null;
    if (seeFinance) {
      const [f] = await q<Record<string, number>>(sql`
        select
          (select coalesce(sum(amount_cents),0)::int from invoices where tenant_id = ${ctx.tenantId} and status <> 'cancelled' and due_on >= ${monthStart}::date and due_on < (${monthStart}::date + interval '1 month')) as billed,
          (select coalesce(sum(p.amount_cents),0)::int from payments p where p.tenant_id = ${ctx.tenantId} and p.paid_at >= ${dayStart(monthStart).toISOString()}::timestamptz) as received,
          (select coalesce(sum(amount_cents),0)::int from invoices where tenant_id = ${ctx.tenantId} and status = 'open' and due_on >= ${monthStart}::date and due_on < (${monthStart}::date + interval '1 month')) as open_month,
          (select coalesce(sum(amount_cents),0)::int from invoices where tenant_id = ${ctx.tenantId} and status = 'open' and due_on < current_date) as overdue_cents,
          (select count(distinct customer_id)::int from invoices where tenant_id = ${ctx.tenantId} and status = 'open' and due_on < current_date) as overdue_customers,
          (select coalesce(sum(monthly_cents),0)::int from contracts where tenant_id = ${ctx.tenantId} and status = 'active') as mrr
      `);
      finance = { billedMonth: f.billed, receivedMonth: f.received, openMonth: f.open_month, overdueCents: f.overdue_cents, overdueCustomers: f.overdue_customers, mrr: f.mrr };
    }

    const team = isAll
      ? await q<{ name: string; done: number; total: number; avg_min: number | null }>(sql`
          select u.name,
            count(*) filter (where v.status = 'completed')::int as done,
            count(*)::int as total,
            round(avg(extract(epoch from (v.completed_at - v.started_at)) / 60) filter (where v.status = 'completed' and v.started_at is not null))::int as avg_min
          from visits v join users u on u.id = v.assigned_user_id
          where v.tenant_id = ${ctx.tenantId} and v.scheduled_start >= ${dayStart(monthStart).toISOString()}::timestamptz and v.scheduled_start < ${t1.toISOString()}::timestamptz and v.status not in ('cancelled','rescheduled')
          group by u.name order by done desc limit 8`)
      : [];

    /* ───────── alertas: ordem = o que exige atenção primeiro ───────── */
    const alerts: Alert[] = [];
    const overdueVisits = await q<{ id: string; customer: string; pool: string; start: Date }>(sql`
      select v.id, c.name as customer, p.name as pool, v.scheduled_start as start from visits v
      join customers c on c.tenant_id = v.tenant_id and c.id = v.customer_id
      join pools p on p.tenant_id = v.tenant_id and p.id = v.pool_id
      where v.tenant_id = ${ctx.tenantId} and ${mine} and v.scheduled_start < ${t0.toISOString()}::timestamptz and v.status in ('scheduled','confirmed','on_the_way','in_progress','waiting_info')
      order by v.scheduled_start desc limit 5`);
    for (const v of overdueVisits)
      alerts.push({ kind: "overdue_visit", tone: "danger", title: `Visita não concluída · ${v.customer}`, detail: `${v.pool} — prevista para ${new Date(v.start).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, href: `/app/visitas/${v.id}` });

    const outOfRange = await q<{ pool_id: string; pool: string; customer: string; labels: string }>(sql`
      with last as (
        select distinct on (v.pool_id) v.id, v.pool_id from visits v
        where v.tenant_id = ${ctx.tenantId} and v.status = 'completed' and ${mine}
        order by v.pool_id, v.completed_at desc
      )
      select p.id as pool_id, p.name as pool, c.name as customer, string_agg(m.label, ', ') as labels
      from last l join measurements m on m.tenant_id = ${ctx.tenantId} and m.visit_id = l.id and m.status in ('below','above')
      join pools p on p.tenant_id = ${ctx.tenantId} and p.id = l.pool_id
      join customers c on c.tenant_id = ${ctx.tenantId} and c.id = p.customer_id
      group by p.id, p.name, c.name limit 5`);
    for (const r of outOfRange)
      alerts.push({ kind: "out_of_range", tone: "warn", title: `Fora da faixa configurada · ${r.customer}`, detail: `${r.pool}: ${r.labels} na última medição`, href: `/app/piscinas/${r.pool_id}` });

    const reqs = isAll
      ? await q<{ id: string; customer: string; message: string }>(sql`
          select s.id, c.name as customer, s.message from service_requests s join customers c on c.tenant_id = s.tenant_id and c.id = s.customer_id
          where s.tenant_id = ${ctx.tenantId} and s.status = 'open' order by s.created_at desc limit 5`)
      : [];
    for (const r of reqs)
      alerts.push({ kind: "service_request", tone: "warn", title: `Pedido pelo portal · ${r.customer}`, detail: r.message.slice(0, 120), href: `/app/solicitacoes` });

    if (seeFinance) {
      const late = await q<{ customer_id: string; customer: string; total: number; oldest: string }>(sql`
        select c.id as customer_id, c.name as customer, sum(i.amount_cents)::int as total, min(i.due_on)::text as oldest
        from invoices i join customers c on c.tenant_id = i.tenant_id and c.id = i.customer_id
        where i.tenant_id = ${ctx.tenantId} and i.status = 'open' and i.due_on < current_date
        group by c.id, c.name order by min(i.due_on) limit 5`);
      for (const l of late)
        alerts.push({ kind: "late_payment", tone: "danger", title: `Pagamento atrasado · ${l.customer}`, detail: `R$ ${(l.total / 100).toFixed(2).replace(".", ",")} em aberto desde ${l.oldest.split("-").reverse().join("/")}`, href: `/app/clientes/${l.customer_id}` });
    }

    if (isAll) {
      const noSchedule = await q<{ id: string; name: string }>(sql`
        select c.id, c.name from customers c
        where c.tenant_id = ${ctx.tenantId} and c.status = 'active'
          and exists (select 1 from pools p where p.tenant_id = c.tenant_id and p.customer_id = c.id and p.active)
          and not exists (select 1 from visits v where v.tenant_id = c.tenant_id and v.customer_id = c.id and v.scheduled_start >= now() and v.status in ('scheduled','confirmed'))
        order by c.name limit 5`);
      for (const c of noSchedule)
        alerts.push({ kind: "no_schedule", tone: "info", title: `Sem próxima visita · ${c.name}`, detail: "Cliente ativo sem nenhuma visita futura agendada", href: `/app/agenda/nova?cliente=${c.id}` });

      const stale = await q<{ id: string; name: string; customer: string; days: number }>(sql`
        select p.id, p.name, c.name as customer,
          (current_date - coalesce(max(v.completed_at)::date, p.created_at::date))::int as days
        from pools p join customers c on c.tenant_id = p.tenant_id and c.id = p.customer_id
        left join visits v on v.tenant_id = p.tenant_id and v.pool_id = p.id and v.status = 'completed'
        where p.tenant_id = ${ctx.tenantId} and p.active and c.status = 'active'
        group by p.id, p.name, c.name, p.frequency_days, p.created_at
        having (current_date - coalesce(max(v.completed_at)::date, p.created_at::date)) > coalesce(p.frequency_days * 2, 14)
        order by days desc limit 5`);
      for (const s of stale)
        alerts.push({ kind: "stale_pool", tone: "warn", title: `Há ${s.days} dias sem atendimento · ${s.customer}`, detail: s.name, href: `/app/piscinas/${s.id}` });

      const noReport = await q<{ id: string; name: string }>(sql`
        select c.id, c.name from customers c
        where c.tenant_id = ${ctx.tenantId} and c.status = 'active'
          and exists (select 1 from technical_reports r where r.tenant_id = c.tenant_id and r.customer_id = c.id)
          and not exists (select 1 from technical_reports r where r.tenant_id = c.tenant_id and r.customer_id = c.id and r.created_at > now() - interval '30 days')
        limit 3`);
      for (const c of noReport)
        alerts.push({ kind: "no_report", tone: "info", title: `Sem relatório há mais de 30 dias · ${c.name}`, detail: "O cliente não recebe um relatório técnico há um mês", href: `/app/clientes/${c.id}` });

      const ending = await q<{ id: string; title: string; customer: string; ends: string }>(sql`
        select ct.id, ct.title, c.name as customer, ct.ends_on::text as ends from contracts ct
        join customers c on c.tenant_id = ct.tenant_id and c.id = ct.customer_id
        where ct.tenant_id = ${ctx.tenantId} and ct.status = 'active' and ct.ends_on is not null and ct.ends_on <= current_date + 30
        order by ct.ends_on limit 5`);
      for (const e of ending)
        alerts.push({ kind: "contract_ending", tone: "warn", title: `Contrato vence em breve · ${e.customer}`, detail: `${e.title} — termina em ${e.ends.split("-").reverse().join("/")}`, href: `/app/contratos` });
    }

    if (can(ctx.role, "inventory.read")) {
      const low = await q<{ id: string; name: string; qty: number; min: number; unit: string }>(sql`
        select id, name, stock_qty::float as qty, min_qty::float as min, unit from products
        where tenant_id = ${ctx.tenantId} and active and min_qty is not null and stock_qty <= min_qty order by name limit 5`);
      for (const p of low)
        alerts.push({ kind: "low_stock", tone: "warn", title: `Estoque baixo · ${p.name}`, detail: `${p.qty} ${p.unit} (mínimo ${p.min} ${p.unit})`, href: `/app/estoque` });
      const exp = await q<{ name: string; exp: string; expired: boolean }>(sql`
        select name, expires_on::text as exp, expires_on < current_date as expired from products
        where tenant_id = ${ctx.tenantId} and active and expires_on is not null and expires_on <= current_date + 30 and stock_qty > 0 order by expires_on limit 3`);
      for (const p of exp)
        alerts.push({ kind: "expiring_product", tone: p.expired ? "danger" : "warn", title: `${p.expired ? "Produto vencido" : "Vence em breve"} · ${p.name}`, detail: `Validade ${p.exp.split("-").reverse().join("/")}`, href: `/app/estoque` });
    }

    if (can(ctx.role, "settings.manage")) {
      const [r] = await q<{ n: number }>(sql`select count(*)::int as n from parameter_definitions where tenant_id = ${ctx.tenantId} and active and range_min is null and range_max is null and key not in ('temperatura')`);
      if (r.n > 0)
        alerts.push({ kind: "setup_ranges", tone: "info", title: "Configure as faixas de referência", detail: `${r.n} parâmetros ainda sem faixa. Sem faixa, o sistema registra o valor mas não indica se está dentro ou fora.`, href: "/app/configuracoes/parametros" });
    }

    return {
      kpis: {
        activeCustomers: k.active_customers,
        pools: k.pools,
        visitsToday: k.visits_today,
        doneToday: k.done_today,
        pendingToday: k.pending_today,
        overdue: k.overdue,
        activeContracts: k.active_contracts,
        lowStock: k.low_stock,
        doneMonth: k.done_month,
      },
      finance,
      team,
      alerts,
    };
  });
}
