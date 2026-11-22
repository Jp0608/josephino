-- Vitrine com dois planos: Profissional (pro) e Empresa (business). Starter e Enterprise saem da vitrine.
-- Contas existentes nesses planos continuam funcionando normalmente.
UPDATE ondaro.plans SET name = 'Profissional', description = 'A operação completa para quem atende piscinas todos os dias',
  price_cents = 12900, max_users = 3, max_pools = NULL, sort_order = 1, public = true, active = true,
  features = ARRAY['core','reports','portal','whatsapp','finance','contracts','inventory','crm','insights','team'], updated_at = now()
  WHERE code = 'pro';
--> statement-breakpoint
UPDATE ondaro.plans SET name = 'Empresa', description = 'Para empresas com equipes, várias funções e muitos clientes',
  price_cents = 29900, max_users = 30, max_pools = NULL, sort_order = 2, public = true, active = true,
  features = ARRAY['core','reports','portal','whatsapp','finance','contracts','inventory','crm','insights','team','advanced_permissions','support_priority','ai','multiunit','api'], updated_at = now()
  WHERE code = 'business';
--> statement-breakpoint
UPDATE ondaro.plans SET public = false, sort_order = 9, updated_at = now() WHERE code = 'starter';
--> statement-breakpoint
UPDATE ondaro.plans SET public = false, sort_order = 10, updated_at = now() WHERE code = 'enterprise';
