-- Todas as tabelas do Ondaro ficam no schema ondaro; nada fora dele é tocado.
SET LOCAL search_path TO ondaro, public;
--> statement-breakpoint
-- Row Level Security: segunda barreira de isolamento entre empresas.
-- O app executa consultas de empresa com SET LOCAL ROLE ondaro_app + app.tenant_id.
-- Sem app.tenant_id definido, current_setting devolve NULL e nenhuma linha aparece.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ondaro_app') THEN
    CREATE ROLE ondaro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT ondaro_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA ondaro TO ondaro_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ondaro.app_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT SELECT ON plans TO ondaro_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON tenants TO ondaro_app;
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self ON tenants FOR ALL TO ondaro_app USING (id = app_tenant()) WITH CHECK (id = app_tenant());
--> statement-breakpoint
GRANT SELECT ON users TO ondaro_app;
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_same_tenant ON users FOR SELECT TO ondaro_app USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.tenant_id = app_tenant()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO ondaro_app;
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO ondaro_app;
--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON customers FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pools TO ondaro_app;
--> statement-breakpoint
ALTER TABLE pools ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pools FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pool_equipment TO ondaro_app;
--> statement-breakpoint
ALTER TABLE pool_equipment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pool_equipment FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON parameter_definitions TO ondaro_app;
--> statement-breakpoint
ALTER TABLE parameter_definitions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON parameter_definitions FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON recurrences TO ondaro_app;
--> statement-breakpoint
ALTER TABLE recurrences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON recurrences FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON visits TO ondaro_app;
--> statement-breakpoint
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON visits FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON visit_checklist TO ondaro_app;
--> statement-breakpoint
ALTER TABLE visit_checklist ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON visit_checklist FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON measurements TO ondaro_app;
--> statement-breakpoint
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON measurements FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON visit_procedures TO ondaro_app;
--> statement-breakpoint
ALTER TABLE visit_procedures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON visit_procedures FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO ondaro_app;
--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON products FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_movements TO ondaro_app;
--> statement-breakpoint
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON inventory_movements FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON chemical_applications TO ondaro_app;
--> statement-breakpoint
ALTER TABLE chemical_applications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chemical_applications FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON photos TO ondaro_app;
--> statement-breakpoint
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON photos FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON technical_reports TO ondaro_app;
--> statement-breakpoint
ALTER TABLE technical_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON technical_reports FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON service_plans TO ondaro_app;
--> statement-breakpoint
ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON service_plans FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON contracts TO ondaro_app;
--> statement-breakpoint
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contracts FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO ondaro_app;
--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoices FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO ondaro_app;
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payments FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO ondaro_app;
--> statement-breakpoint
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON expenses FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO ondaro_app;
--> statement-breakpoint
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON leads FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_activities TO ondaro_app;
--> statement-breakpoint
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lead_activities FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON proposals TO ondaro_app;
--> statement-breakpoint
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON proposals FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON message_logs TO ondaro_app;
--> statement-breakpoint
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON message_logs FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON service_requests TO ondaro_app;
--> statement-breakpoint
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON service_requests FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO ondaro_app;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_events TO ondaro_app;
--> statement-breakpoint
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON billing_events FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
