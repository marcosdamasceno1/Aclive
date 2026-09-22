-- Integração de notificações via CRM (api.apiintegracoes.com), por agência.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS crm_api_key     TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS crm_instance_id TEXT;
