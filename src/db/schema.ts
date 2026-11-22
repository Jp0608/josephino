/**
 * Modelo de dados do Ondaro.
 *
 * Regras de isolamento (multi-tenant):
 *  1. Toda tabela de negócio tem `tenant_id`.
 *  2. Toda tabela-pai tem UNIQUE (tenant_id, id) e as filhas referenciam (tenant_id, x_id):
 *     o banco recusa, por exemplo, uma piscina de uma empresa ligada ao cliente de outra.
 *  3. Row Level Security (migração 0001_rls.sql): o app executa as consultas com o papel
 *     `ondaro_app`, que só enxerga linhas cujo tenant_id = current_setting('app.tenant_id').
 *
 * Dinheiro: sempre centavos (integer). Quantidades químicas: numeric.
 * JSON só onde há motivo real: snapshot imutável do relatório e dados de auditoria.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  smallint,
  check,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

/* ───────────────────────────── Plataforma (global) ───────────────────────────── */

export const plans = pgTable("plans", {
  id: id(),
  code: text("code").notNull().unique(), // starter | pro | business | enterprise
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(), // mensal
  maxUsers: integer("max_users"), // null = ilimitado
  maxPools: integer("max_pools"),
  features: text("features").array().notNull().default(sql`'{}'::text[]`),
  sortOrder: integer("sort_order").notNull().default(0),
  public: boolean("public").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    document: text("document"), // CPF/CNPJ da empresa
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    operationType: text("operation_type"), // autonomo | empresa_pequena | empresa
    teamSize: text("team_size"),
    logoKey: text("logo_key"),
    brandColor: text("brand_color").notNull().default("#0A6E8A"),
    reportFooter: text("report_footer"),
    defaultFrequencyDays: integer("default_frequency_days"),
    planId: uuid("plan_id").references(() => plans.id),
    status: text("status").notNull().default("trialing"), // trialing | active | past_due | suspended | cancelled
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    isDemo: boolean("is_demo").notNull().default(false),
    onboardingDone: boolean("onboarding_done").notNull().default(false),
    reportSeq: integer("report_seq").notNull().default(0),
    aiQueriesMonth: integer("ai_queries_month").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("tenants_status_chk", sql`${t.status} in ('trialing','active','past_due','suspended','cancelled')`)],
);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(), // sempre minúsculo
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: id(),
    key: text("key").notNull(), // "login:email" | "login-ip:1.2.3.4" | "reset:email"
    createdAt: createdAt(),
  },
  (t) => [index("auth_attempts_key_idx").on(t.key, t.createdAt)],
);

export const platformAudit = pgTable("platform_audit", {
  id: id(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  tenantId: uuid("tenant_id"),
  data: jsonb("data"),
  createdAt: createdAt(),
});

export const billingEvents = pgTable("billing_events", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // trial_started | plan_changed | payment_confirmed | suspended | reactivated | trial_extended
  planCode: text("plan_code"),
  amountCents: integer("amount_cents"),
  note: text("note"),
  actor: text("actor"),
  createdAt: createdAt(),
});

/* ───────────────────────────── Empresa: pessoas ───────────────────────────── */

export const ROLES = ["owner", "admin", "manager", "supervisor", "technician", "finance", "sales"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    active: boolean("active").notNull().default(true),
    jobTitle: text("job_title"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("memberships_tenant_user").on(t.tenantId, t.userId),
    unique("memberships_tenant_id").on(t.tenantId, t.id),
    index("memberships_user_idx").on(t.userId),
  ],
);

/* ───────────────────────────── Clientes e piscinas ───────────────────────────── */

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantId(),
    kind: text("kind").notNull().default("pf"), // pf | pj
    name: text("name").notNull(),
    document: text("document"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    contactName: text("contact_name"), // responsável pelo imóvel
    zip: text("zip"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    lat: numeric("lat", { precision: 9, scale: 6, mode: "number" }),
    lng: numeric("lng", { precision: 9, scale: 6, mode: "number" }),
    source: text("source"),
    status: text("status").notNull().default("active"), // active | paused | inactive
    salesOwnerId: uuid("sales_owner_id"),
    internalNotes: text("internal_notes"), // nunca vai para o portal
    whatsappConsent: boolean("whatsapp_consent").notNull().default(false),
    whatsappConsentAt: timestamp("whatsapp_consent_at", { withTimezone: true }),
    portalToken: text("portal_token").unique(),
    startedAt: date("started_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("customers_tenant_id").on(t.tenantId, t.id),
    index("customers_tenant_name_idx").on(t.tenantId, t.name),
    index("customers_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const pools = pgTable(
  "pools",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id").notNull(),
    name: text("name").notNull(), // "Piscina adulta"
    code: text("code").notNull(), // identificação curta, vai no QR code
    usage: text("usage").notNull().default("residencial"), // residencial | comercial | condominio | hotel | academia | clube | outro
    address: text("address"), // se diferente do endereço do cliente
    shape: text("shape"),
    lengthM: numeric("length_m", { precision: 6, scale: 2, mode: "number" }),
    widthM: numeric("width_m", { precision: 6, scale: 2, mode: "number" }),
    depthMinM: numeric("depth_min_m", { precision: 5, scale: 2, mode: "number" }),
    depthMaxM: numeric("depth_max_m", { precision: 5, scale: 2, mode: "number" }),
    volumeLiters: integer("volume_liters"),
    volumeIsEstimated: boolean("volume_is_estimated").notNull().default(true),
    lining: text("lining"), // vinil | azulejo | fibra | concreto | outro
    filtration: text("filtration"),
    pump: text("pump"),
    pumpSpec: text("pump_spec"),
    heating: text("heating"),
    disinfection: text("disinfection"), // cloro | sal | ozonio | uv | outro
    frequencyDays: integer("frequency_days"),
    technicalNotes: text("technical_notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("pools_tenant_id").on(t.tenantId, t.id),
    uniqueIndex("pools_tenant_code").on(t.tenantId, t.code),
    index("pools_customer_idx").on(t.tenantId, t.customerId),
    foreignKey({ columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id], name: "pools_customer_fk" }).onDelete("cascade"),
  ],
);

export const poolEquipment = pgTable(
  "pool_equipment",
  {
    id: id(),
    tenantId: tenantId(),
    poolId: uuid("pool_id").notNull(),
    kind: text("kind").notNull(), // bomba | filtro | aquecedor | gerador_cloro | outro
    brand: text("brand"),
    model: text("model"),
    serial: text("serial"),
    installedOn: date("installed_on"),
    warrantyUntil: date("warranty_until"),
    nextServiceOn: date("next_service_on"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("pool_equipment_pool_idx").on(t.tenantId, t.poolId),
    foreignKey({ columns: [t.tenantId, t.poolId], foreignColumns: [pools.tenantId, pools.id], name: "pool_equipment_pool_fk" }).onDelete("cascade"),
  ],
);

/**
 * Parâmetros da água configurados pela empresa. As faixas começam VAZIAS:
 * o Ondaro não inventa limites técnicos — cada empresa informa a referência que adota.
 */
export const parameterDefinitions = pgTable(
  "parameter_definitions",
  {
    id: id(),
    tenantId: tenantId(),
    key: text("key").notNull(), // ph | cloro_livre | ...
    label: text("label").notNull(),
    unit: text("unit").notNull().default(""),
    rangeMin: numeric("range_min", { precision: 10, scale: 3, mode: "number" }),
    rangeMax: numeric("range_max", { precision: 10, scale: 3, mode: "number" }),
    referenceSource: text("reference_source"), // de onde a empresa tirou a faixa
    appliesTo: text("applies_to"), // null = todas | "sal" | "aquecida" ...
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("param_def_tenant_key").on(t.tenantId, t.key)],
);

/* ───────────────────────────── Agenda e visitas ───────────────────────────── */

export const recurrences = pgTable(
  "recurrences",
  {
    id: id(),
    tenantId: tenantId(),
    poolId: uuid("pool_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    assignedUserId: uuid("assigned_user_id"),
    contractId: uuid("contract_id"),
    serviceType: text("service_type").notNull().default("manutencao"),
    weekdays: smallint("weekdays").array().notNull(), // 0=dom … 6=sáb
    intervalWeeks: integer("interval_weeks").notNull().default(1), // 1 semanal, 2 quinzenal
    startTime: text("start_time").notNull(), // "08:00"
    durationMin: integer("duration_min").notNull().default(60),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    generatedUntil: date("generated_until"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("recurrences_tenant_id").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.poolId], foreignColumns: [pools.tenantId, pools.id], name: "recurrences_pool_fk" }).onDelete("cascade"),
  ],
);

export const VISIT_STATUSES = [
  "scheduled",
  "confirmed",
  "on_the_way",
  "in_progress",
  "waiting_info",
  "completed",
  "not_done",
  "rescheduled",
  "cancelled",
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const visits = pgTable(
  "visits",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id").notNull(),
    poolId: uuid("pool_id").notNull(),
    assignedUserId: uuid("assigned_user_id"),
    recurrenceId: uuid("recurrence_id"),
    serviceType: text("service_type").notNull().default("manutencao"),
    priority: text("priority").notNull().default("normal"), // baixa | normal | alta | urgente
    status: text("status").$type<VisitStatus>().notNull().default("scheduled"),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(60),
    instructions: text("instructions"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
    findings: text("findings"), // problemas encontrados
    actionsTaken: text("actions_taken"),
    followUp: text("follow_up"), // precisa de acompanhamento
    recommendations: text("recommendations"), // para o cliente
    internalNotes: text("internal_notes"), // nunca vai para relatório/portal
    nextVisitSuggestion: date("next_visit_suggestion"),
    poolSafetyNote: text("pool_safety_note"), // orientação de liberação de uso, escrita pelo profissional
    notDoneReason: text("not_done_reason"),
    version: integer("version").notNull().default(1), // controle de concorrência do rascunho offline
    priceCents: integer("price_cents"), // serviço avulso: gera conta a receber ao concluir
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("visits_tenant_id").on(t.tenantId, t.id),
    index("visits_tenant_start_idx").on(t.tenantId, t.scheduledStart),
    index("visits_pool_idx").on(t.tenantId, t.poolId, t.scheduledStart),
    index("visits_assignee_idx").on(t.tenantId, t.assignedUserId, t.scheduledStart),
    // Evita visita duplicada gerada pela mesma recorrência no mesmo horário.
    uniqueIndex("visits_recurrence_slot").on(t.tenantId, t.recurrenceId, t.scheduledStart).where(sql`recurrence_id is not null`),
    foreignKey({ columns: [t.tenantId, t.poolId], foreignColumns: [pools.tenantId, pools.id], name: "visits_pool_fk" }),
    foreignKey({ columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id], name: "visits_customer_fk" }),
  ],
);

export const visitChecklist = pgTable(
  "visit_checklist",
  {
    id: id(),
    tenantId: tenantId(),
    visitId: uuid("visit_id").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    state: text("state").notNull().default("not_checked"), // ok | attention | problem | not_checked
    comment: text("comment"),
  },
  (t) => [
    uniqueIndex("visit_checklist_item").on(t.tenantId, t.visitId, t.itemKey),
    foreignKey({ columns: [t.tenantId, t.visitId], foreignColumns: [visits.tenantId, visits.id], name: "visit_checklist_visit_fk" }).onDelete("cascade"),
  ],
);

export const measurements = pgTable(
  "measurements",
  {
    id: id(),
    tenantId: tenantId(),
    visitId: uuid("visit_id").notNull(),
    poolId: uuid("pool_id").notNull(),
    parameterKey: text("parameter_key").notNull(),
    label: text("label").notNull(),
    value: numeric("value", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit").notNull().default(""),
    method: text("method"), // kit | fotometro | tira | sonda | outro
    instrument: text("instrument"),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
    measuredBy: uuid("measured_by"),
    // Faixa vigente no momento da medição (snapshot: mudanças futuras não reescrevem o passado)
    rangeMin: numeric("range_min", { precision: 10, scale: 3, mode: "number" }),
    rangeMax: numeric("range_max", { precision: 10, scale: 3, mode: "number" }),
    status: text("status").notNull(), // in_range | below | above | not_measured | no_range
  },
  (t) => [
    uniqueIndex("measurements_visit_param").on(t.tenantId, t.visitId, t.parameterKey),
    index("measurements_pool_idx").on(t.tenantId, t.poolId, t.parameterKey, t.measuredAt),
    foreignKey({ columns: [t.tenantId, t.visitId], foreignColumns: [visits.tenantId, visits.id], name: "measurements_visit_fk" }).onDelete("cascade"),
  ],
);

export const visitProcedures = pgTable(
  "visit_procedures",
  {
    id: id(),
    tenantId: tenantId(),
    visitId: uuid("visit_id").notNull(),
    procKey: text("proc_key").notNull(),
    label: text("label").notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: uuid("done_by"),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("visit_procedures_item").on(t.tenantId, t.visitId, t.procKey),
    foreignKey({ columns: [t.tenantId, t.visitId], foreignColumns: [visits.tenantId, visits.id], name: "visit_procedures_visit_fk" }).onDelete("cascade"),
  ],
);

/* ───────────────────────────── Produtos e estoque ───────────────────────────── */

export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    brand: text("brand"),
    manufacturer: text("manufacturer"),
    category: text("category").notNull().default("outro"), // desinfetante | ph | alcalinidade | algicida | clarificante | floculante | oxidante | outro
    activeIngredient: text("active_ingredient"),
    concentration: text("concentration"), // como declarado no rótulo
    unit: text("unit").notNull().default("kg"), // kg | g | L | mL | un
    supplier: text("supplier"),
    costCentsPerUnit: integer("cost_cents_per_unit"),
    stockQty: qty("stock_qty").notNull().default(0),
    minQty: qty("min_qty"),
    lot: text("lot"),
    expiresOn: date("expires_on"),
    storageLocation: text("storage_location"),
    safetyNotes: text("safety_notes"), // cuidados de armazenamento/compatibilidade, do fabricante
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("products_tenant_id").on(t.tenantId, t.id), index("products_tenant_name_idx").on(t.tenantId, t.name)],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    tenantId: tenantId(),
    productId: uuid("product_id").notNull(),
    kind: text("kind").notNull(), // entrada | saida | consumo_visita | ajuste | perda | devolucao | transferencia
    quantity: qty("quantity").notNull(), // positivo entra, negativo sai
    balanceAfter: qty("balance_after").notNull(),
    unitCostCents: integer("unit_cost_cents"),
    lot: text("lot"),
    expiresOn: date("expires_on"),
    location: text("location"),
    visitId: uuid("visit_id"),
    userId: uuid("user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("inv_mov_product_idx").on(t.tenantId, t.productId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id], name: "inv_mov_product_fk" }).onDelete("cascade"),
  ],
);

export const chemicalApplications = pgTable(
  "chemical_applications",
  {
    id: id(),
    tenantId: tenantId(),
    visitId: uuid("visit_id").notNull(),
    productId: uuid("product_id"),
    productName: text("product_name").notNull(), // snapshot
    manufacturer: text("manufacturer"),
    category: text("category"),
    activeIngredient: text("active_ingredient"),
    concentration: text("concentration"),
    quantity: qty("quantity").notNull(),
    unit: text("unit").notNull(),
    lot: text("lot"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    purpose: text("purpose"),
    appliedBy: uuid("applied_by"),
    stockMovementId: uuid("stock_movement_id"), // preenchido quando a baixa no estoque foi confirmada
    costCents: integer("cost_cents"),
    createdAt: createdAt(),
  },
  (t) => [
    index("chem_app_visit_idx").on(t.tenantId, t.visitId),
    foreignKey({ columns: [t.tenantId, t.visitId], foreignColumns: [visits.tenantId, visits.id], name: "chem_app_visit_fk" }).onDelete("cascade"),
  ],
);

/* ───────────────────────────── Fotos e relatórios ───────────────────────────── */

export const photos = pgTable(
  "photos",
  {
    id: id(),
    tenantId: tenantId(),
    visitId: uuid("visit_id"),
    poolId: uuid("pool_id"),
    kind: text("kind").notNull().default("other"), // before | after | problem | other
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    caption: text("caption"),
    showInReport: boolean("show_in_report").notNull().default(true),
    uploadedBy: uuid("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("photos_visit_idx").on(t.tenantId, t.visitId), index("photos_pool_idx").on(t.tenantId, t.poolId)],
);

export const technicalReports = pgTable(
  "technical_reports",
  {
    id: id(),
    tenantId: tenantId(),
    visitId: uuid("visit_id").notNull(),
    poolId: uuid("pool_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    protocol: text("protocol").notNull(), // ex.: AQ-2026-000123
    publicToken: text("public_token").notNull().unique(),
    // Snapshot imutável do documento emitido: o relatório não muda se o cadastro mudar depois.
    snapshot: jsonb("snapshot").notNull(),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedName: text("acknowledged_name"),
    acknowledgedIp: text("acknowledged_ip"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_visit_uq").on(t.tenantId, t.visitId),
    uniqueIndex("reports_protocol_uq").on(t.tenantId, t.protocol),
    index("reports_customer_idx").on(t.tenantId, t.customerId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.visitId], foreignColumns: [visits.tenantId, visits.id], name: "reports_visit_fk" }),
  ],
);

/* ───────────────────────────── Contratos e financeiro ───────────────────────────── */

export const servicePlans = pgTable(
  "service_plans",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    weekdays: smallint("weekdays").array(), // dias sugeridos
    intervalWeeks: integer("interval_weeks").notNull().default(1),
    visitsPerMonth: integer("visits_per_month"),
    includedServices: text("included_services"),
    extras: text("extras"),
    priceCents: integer("price_cents").notNull(),
    conditions: text("conditions"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("service_plans_tenant_id").on(t.tenantId, t.id)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id").notNull(),
    poolId: uuid("pool_id"),
    servicePlanId: uuid("service_plan_id"),
    title: text("title").notNull(),
    monthlyCents: integer("monthly_cents").notNull(),
    billingDay: integer("billing_day").notNull().default(10),
    paymentMethod: text("payment_method"), // pix | boleto | cartao | dinheiro | transferencia
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    adjustmentRule: text("adjustment_rule"),
    conditions: text("conditions"),
    status: text("status").notNull().default("active"), // draft | active | paused | ended | cancelled
    lastInvoicedMonth: text("last_invoiced_month"), // "2026-11"
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("contracts_tenant_id").on(t.tenantId, t.id),
    index("contracts_customer_idx").on(t.tenantId, t.customerId),
    foreignKey({ columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id], name: "contracts_customer_fk" }),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id").notNull(),
    contractId: uuid("contract_id"),
    visitId: uuid("visit_id"),
    kind: text("kind").notNull().default("mensalidade"), // mensalidade | avulso | tratamento | produto | outro
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueOn: date("due_on").notNull(),
    competence: text("competence"), // "2026-11" para mensalidade (evita duplicar)
    status: text("status").notNull().default("open"), // open | paid | cancelled
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("invoices_tenant_id").on(t.tenantId, t.id),
    index("invoices_tenant_due_idx").on(t.tenantId, t.status, t.dueOn),
    index("invoices_customer_idx").on(t.tenantId, t.customerId),
    uniqueIndex("invoices_contract_competence").on(t.tenantId, t.contractId, t.competence).where(sql`contract_id is not null and competence is not null`),
    uniqueIndex("invoices_visit_uq").on(t.tenantId, t.visitId).where(sql`visit_id is not null`),
    foreignKey({ columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id], name: "invoices_customer_fk" }),
    check("invoices_amount_chk", sql`${t.amountCents} >= 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid("invoice_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    // manual = registrado por um usuário autorizado; gateway = confirmado pelo provedor
    source: text("source").notNull().default("manual"),
    gatewayRef: text("gateway_ref"),
    recordedBy: uuid("recorded_by"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.tenantId, t.invoiceId),
    foreignKey({ columns: [t.tenantId, t.invoiceId], foreignColumns: [invoices.tenantId, invoices.id], name: "payments_invoice_fk" }).onDelete("cascade"),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    tenantId: tenantId(),
    category: text("category").notNull(), // produtos | combustivel | veiculo | equipamentos | pessoal | fornecedores | administrativo | outro
    description: text("description").notNull(),
    supplier: text("supplier"),
    amountCents: integer("amount_cents").notNull(),
    dueOn: date("due_on").notNull(),
    status: text("status").notNull().default("open"), // open | paid | cancelled
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_tenant_due_idx").on(t.tenantId, t.dueOn), check("expenses_amount_chk", sql`${t.amountCents} >= 0`)],
);

/* ───────────────────────────── CRM ───────────────────────────── */

export const LEAD_STAGES = ["new", "contacted", "qualified", "quote_sent", "negotiation", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const leads = pgTable(
  "leads",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    city: text("city"),
    source: text("source"),
    stage: text("stage").$type<LeadStage>().notNull().default("new"),
    estimatedMonthlyCents: integer("estimated_monthly_cents"),
    ownerUserId: uuid("owner_user_id"),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    convertedCustomerId: uuid("converted_customer_id"),
    position: integer("position").notNull().default(0),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("leads_tenant_id").on(t.tenantId, t.id), index("leads_tenant_stage_idx").on(t.tenantId, t.stage)],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid("lead_id").notNull(),
    kind: text("kind").notNull(), // note | call | whatsapp | email | visit | stage
    note: text("note").notNull(),
    userId: uuid("user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("lead_act_lead_idx").on(t.tenantId, t.leadId),
    foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id], name: "lead_act_lead_fk" }).onDelete("cascade"),
  ],
);

export const proposals = pgTable(
  "proposals",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid("lead_id"),
    customerId: uuid("customer_id"),
    title: text("title").notNull(),
    items: text("items").notNull(), // descrição dos itens
    totalCents: integer("total_cents").notNull(),
    recurring: boolean("recurring").notNull().default(true),
    validUntil: date("valid_until"),
    status: text("status").notNull().default("draft"), // draft | sent | accepted | rejected | expired
    publicToken: text("public_token").unique(),
    version: integer("version").notNull().default(1),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedName: text("accepted_name"),
    acceptedIp: text("accepted_ip"),
    acceptedUserAgent: text("accepted_user_agent"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("proposals_lead_idx").on(t.tenantId, t.leadId)],
);

/* ───────────────────────────── Comunicação, portal, auditoria ───────────────────────────── */

export const messageLogs = pgTable(
  "message_logs",
  {
    id: id(),
    tenantId: tenantId(),
    channel: text("channel").notNull(), // whatsapp | email | link
    toAddress: text("to_address"),
    template: text("template").notNull(), // report_ready | visit_reminder | payment_reminder ...
    body: text("body").notNull(),
    // pending_integration = integração não conectada (mensagem guardada, não enviada)
    // manual = profissional abriu o WhatsApp e enviou por conta própria (não confirmamos entrega)
    status: text("status").notNull(), // pending_integration | queued | sent | delivered | failed | manual
    error: text("error"),
    customerId: uuid("customer_id"),
    visitId: uuid("visit_id"),
    reportId: uuid("report_id"),
    invoiceId: uuid("invoice_id"),
    providerRef: text("provider_ref"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("message_logs_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id").notNull(),
    poolId: uuid("pool_id"),
    kind: text("kind").notNull().default("visita_extra"), // visita_extra | problema | outro
    message: text("message").notNull(),
    status: text("status").notNull().default("open"), // open | scheduled | done | dismissed
    createdAt: createdAt(),
  },
  (t) => [
    index("service_requests_tenant_idx").on(t.tenantId, t.status),
    foreignKey({ columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id], name: "service_requests_customer_fk" }).onDelete("cascade"),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id"),
    action: text("action").notNull(), // customer.create | visit.complete | invoice.paid ...
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_tenant_idx").on(t.tenantId, t.createdAt), index("audit_entity_idx").on(t.tenantId, t.entity, t.entityId)],
);

/** Tabelas com tenant_id — recebem RLS na migração 0001. */
export const TENANT_TABLES = [
  "memberships",
  "customers",
  "pools",
  "pool_equipment",
  "parameter_definitions",
  "recurrences",
  "visits",
  "visit_checklist",
  "measurements",
  "visit_procedures",
  "products",
  "inventory_movements",
  "chemical_applications",
  "photos",
  "technical_reports",
  "service_plans",
  "contracts",
  "invoices",
  "payments",
  "expenses",
  "leads",
  "lead_activities",
  "proposals",
  "message_logs",
  "service_requests",
  "audit_logs",
  "billing_events",
] as const;
