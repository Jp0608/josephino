CREATE SCHEMA IF NOT EXISTS "ondaro";
--> statement-breakpoint
CREATE TABLE "ondaro"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"plan_code" text,
	"amount_cents" integer,
	"note" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."chemical_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"manufacturer" text,
	"category" text,
	"active_ingredient" text,
	"concentration" text,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"lot" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" text,
	"applied_by" uuid,
	"stock_movement_id" uuid,
	"cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid,
	"service_plan_id" uuid,
	"title" text NOT NULL,
	"monthly_cents" integer NOT NULL,
	"billing_day" integer DEFAULT 10 NOT NULL,
	"payment_method" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"adjustment_rule" text,
	"conditions" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_invoiced_month" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text DEFAULT 'pf' NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"contact_name" text,
	"zip" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"source" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sales_owner_id" uuid,
	"internal_notes" text,
	"whatsapp_consent" boolean DEFAULT false NOT NULL,
	"whatsapp_consent_at" timestamp with time zone,
	"portal_token" text,
	"started_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_portal_token_unique" UNIQUE("portal_token"),
	CONSTRAINT "customers_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"supplier" text,
	"amount_cents" integer NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_chk" CHECK ("ondaro"."expenses"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ondaro"."inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"unit_cost_cents" integer,
	"lot" text,
	"expires_on" date,
	"location" text,
	"visit_id" uuid,
	"user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"contract_id" uuid,
	"visit_id" uuid,
	"kind" text DEFAULT 'mensalidade' NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_on" date NOT NULL,
	"competence" text,
	"status" text DEFAULT 'open' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "invoices_amount_chk" CHECK ("ondaro"."invoices"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ondaro"."lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"city" text,
	"source" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"estimated_monthly_cents" integer,
	"owner_user_id" uuid,
	"next_follow_up_at" timestamp with time zone,
	"lost_reason" text,
	"notes" text,
	"converted_customer_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"parameter_key" text NOT NULL,
	"label" text NOT NULL,
	"value" numeric(10, 3),
	"unit" text DEFAULT '' NOT NULL,
	"method" text,
	"instrument" text,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"measured_by" uuid,
	"range_min" numeric(10, 3),
	"range_max" numeric(10, 3),
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"job_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_user" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "memberships_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."message_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"to_address" text,
	"template" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"customer_id" uuid,
	"visit_id" uuid,
	"report_id" uuid,
	"invoice_id" uuid,
	"provider_ref" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ondaro"."parameter_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"range_min" numeric(10, 3),
	"range_max" numeric(10, 3),
	"reference_source" text,
	"applies_to" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"gateway_ref" text,
	"recorded_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid,
	"pool_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"caption" text,
	"show_in_report" boolean DEFAULT true NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"max_users" integer,
	"max_pools" integer,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."platform_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"tenant_id" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."pool_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"brand" text,
	"model" text,
	"serial" text,
	"installed_on" date,
	"warranty_until" date,
	"next_service_on" date,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"usage" text DEFAULT 'residencial' NOT NULL,
	"address" text,
	"shape" text,
	"length_m" numeric(6, 2),
	"width_m" numeric(6, 2),
	"depth_min_m" numeric(5, 2),
	"depth_max_m" numeric(5, 2),
	"volume_liters" integer,
	"volume_is_estimated" boolean DEFAULT true NOT NULL,
	"lining" text,
	"filtration" text,
	"pump" text,
	"pump_spec" text,
	"heating" text,
	"disinfection" text,
	"frequency_days" integer,
	"technical_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pools_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"manufacturer" text,
	"category" text DEFAULT 'outro' NOT NULL,
	"active_ingredient" text,
	"concentration" text,
	"unit" text DEFAULT 'kg' NOT NULL,
	"supplier" text,
	"cost_cents_per_unit" integer,
	"stock_qty" numeric(14, 3) DEFAULT 0 NOT NULL,
	"min_qty" numeric(14, 3),
	"lot" text,
	"expires_on" date,
	"storage_location" text,
	"safety_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"title" text NOT NULL,
	"items" text NOT NULL,
	"total_cents" integer NOT NULL,
	"recurring" boolean DEFAULT true NOT NULL,
	"valid_until" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"public_token" text,
	"version" integer DEFAULT 1 NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_name" text,
	"accepted_ip" text,
	"accepted_user_agent" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"contract_id" uuid,
	"service_type" text DEFAULT 'manutencao' NOT NULL,
	"weekdays" smallint[] NOT NULL,
	"interval_weeks" integer DEFAULT 1 NOT NULL,
	"start_time" text NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"generated_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrences_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekdays" smallint[],
	"interval_weeks" integer DEFAULT 1 NOT NULL,
	"visits_per_month" integer,
	"included_services" text,
	"extras" text,
	"price_cents" integer NOT NULL,
	"conditions" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid,
	"kind" text DEFAULT 'visita_extra' NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ondaro"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."technical_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"protocol" text NOT NULL,
	"public_token" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_name" text,
	"acknowledged_ip" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_reports_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"document" text,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"operation_type" text,
	"team_size" text,
	"logo_key" text,
	"brand_color" text DEFAULT '#0A6E8A' NOT NULL,
	"report_footer" text,
	"default_frequency_days" integer,
	"plan_id" uuid,
	"status" text DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"suspended_reason" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"onboarding_done" boolean DEFAULT false NOT NULL,
	"report_seq" integer DEFAULT 0 NOT NULL,
	"ai_queries_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_status_chk" CHECK ("ondaro"."tenants"."status" in ('trialing','active','past_due','suspended','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "ondaro"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ondaro"."visit_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"state" text DEFAULT 'not_checked' NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "ondaro"."visit_procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"proc_key" text NOT NULL,
	"label" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ondaro"."visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"recurrence_id" uuid,
	"service_type" text DEFAULT 'manutencao' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"instructions" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"findings" text,
	"actions_taken" text,
	"follow_up" text,
	"recommendations" text,
	"internal_notes" text,
	"next_visit_suggestion" date,
	"pool_safety_note" text,
	"not_done_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "ondaro"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."billing_events" ADD CONSTRAINT "billing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."chemical_applications" ADD CONSTRAINT "chemical_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."chemical_applications" ADD CONSTRAINT "chem_app_visit_fk" FOREIGN KEY ("tenant_id","visit_id") REFERENCES "ondaro"."visits"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."contracts" ADD CONSTRAINT "contracts_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "ondaro"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."inventory_movements" ADD CONSTRAINT "inv_mov_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "ondaro"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."invoices" ADD CONSTRAINT "invoices_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "ondaro"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."lead_activities" ADD CONSTRAINT "lead_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."lead_activities" ADD CONSTRAINT "lead_act_lead_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "ondaro"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."measurements" ADD CONSTRAINT "measurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."measurements" ADD CONSTRAINT "measurements_visit_fk" FOREIGN KEY ("tenant_id","visit_id") REFERENCES "ondaro"."visits"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ondaro"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."message_logs" ADD CONSTRAINT "message_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."parameter_definitions" ADD CONSTRAINT "parameter_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ondaro"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."payments" ADD CONSTRAINT "payments_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "ondaro"."invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."photos" ADD CONSTRAINT "photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."pool_equipment" ADD CONSTRAINT "pool_equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."pool_equipment" ADD CONSTRAINT "pool_equipment_pool_fk" FOREIGN KEY ("tenant_id","pool_id") REFERENCES "ondaro"."pools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."pools" ADD CONSTRAINT "pools_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."pools" ADD CONSTRAINT "pools_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "ondaro"."customers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."proposals" ADD CONSTRAINT "proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."recurrences" ADD CONSTRAINT "recurrences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."recurrences" ADD CONSTRAINT "recurrences_pool_fk" FOREIGN KEY ("tenant_id","pool_id") REFERENCES "ondaro"."pools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."service_plans" ADD CONSTRAINT "service_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."service_requests" ADD CONSTRAINT "service_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."service_requests" ADD CONSTRAINT "service_requests_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "ondaro"."customers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ondaro"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."technical_reports" ADD CONSTRAINT "technical_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."technical_reports" ADD CONSTRAINT "reports_visit_fk" FOREIGN KEY ("tenant_id","visit_id") REFERENCES "ondaro"."visits"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "ondaro"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visit_checklist" ADD CONSTRAINT "visit_checklist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visit_checklist" ADD CONSTRAINT "visit_checklist_visit_fk" FOREIGN KEY ("tenant_id","visit_id") REFERENCES "ondaro"."visits"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visit_procedures" ADD CONSTRAINT "visit_procedures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visit_procedures" ADD CONSTRAINT "visit_procedures_visit_fk" FOREIGN KEY ("tenant_id","visit_id") REFERENCES "ondaro"."visits"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visits" ADD CONSTRAINT "visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "ondaro"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visits" ADD CONSTRAINT "visits_pool_fk" FOREIGN KEY ("tenant_id","pool_id") REFERENCES "ondaro"."pools"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondaro"."visits" ADD CONSTRAINT "visits_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "ondaro"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "ondaro"."audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "ondaro"."audit_logs" USING btree ("tenant_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "auth_attempts_key_idx" ON "ondaro"."auth_attempts" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "chem_app_visit_idx" ON "ondaro"."chemical_applications" USING btree ("tenant_id","visit_id");--> statement-breakpoint
CREATE INDEX "contracts_customer_idx" ON "ondaro"."contracts" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_name_idx" ON "ondaro"."customers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "customers_tenant_status_idx" ON "ondaro"."customers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "expenses_tenant_due_idx" ON "ondaro"."expenses" USING btree ("tenant_id","due_on");--> statement-breakpoint
CREATE INDEX "inv_mov_product_idx" ON "ondaro"."inventory_movements" USING btree ("tenant_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_tenant_due_idx" ON "ondaro"."invoices" USING btree ("tenant_id","status","due_on");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "ondaro"."invoices" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_contract_competence" ON "ondaro"."invoices" USING btree ("tenant_id","contract_id","competence") WHERE contract_id is not null and competence is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_visit_uq" ON "ondaro"."invoices" USING btree ("tenant_id","visit_id") WHERE visit_id is not null;--> statement-breakpoint
CREATE INDEX "lead_act_lead_idx" ON "ondaro"."lead_activities" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "leads_tenant_stage_idx" ON "ondaro"."leads" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_visit_param" ON "ondaro"."measurements" USING btree ("tenant_id","visit_id","parameter_key");--> statement-breakpoint
CREATE INDEX "measurements_pool_idx" ON "ondaro"."measurements" USING btree ("tenant_id","pool_id","parameter_key","measured_at");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "ondaro"."memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_logs_tenant_idx" ON "ondaro"."message_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "param_def_tenant_key" ON "ondaro"."parameter_definitions" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "ondaro"."payments" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "photos_visit_idx" ON "ondaro"."photos" USING btree ("tenant_id","visit_id");--> statement-breakpoint
CREATE INDEX "photos_pool_idx" ON "ondaro"."photos" USING btree ("tenant_id","pool_id");--> statement-breakpoint
CREATE INDEX "pool_equipment_pool_idx" ON "ondaro"."pool_equipment" USING btree ("tenant_id","pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_tenant_code" ON "ondaro"."pools" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "pools_customer_idx" ON "ondaro"."pools" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "products_tenant_name_idx" ON "ondaro"."products" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "proposals_lead_idx" ON "ondaro"."proposals" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "service_requests_tenant_idx" ON "ondaro"."service_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "ondaro"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_visit_uq" ON "ondaro"."technical_reports" USING btree ("tenant_id","visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_protocol_uq" ON "ondaro"."technical_reports" USING btree ("tenant_id","protocol");--> statement-breakpoint
CREATE INDEX "reports_customer_idx" ON "ondaro"."technical_reports" USING btree ("tenant_id","customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_checklist_item" ON "ondaro"."visit_checklist" USING btree ("tenant_id","visit_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_procedures_item" ON "ondaro"."visit_procedures" USING btree ("tenant_id","visit_id","proc_key");--> statement-breakpoint
CREATE INDEX "visits_tenant_start_idx" ON "ondaro"."visits" USING btree ("tenant_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "visits_pool_idx" ON "ondaro"."visits" USING btree ("tenant_id","pool_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "visits_assignee_idx" ON "ondaro"."visits" USING btree ("tenant_id","assigned_user_id","scheduled_start");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_recurrence_slot" ON "ondaro"."visits" USING btree ("tenant_id","recurrence_id","scheduled_start") WHERE recurrence_id is not null;