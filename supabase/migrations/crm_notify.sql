-- Integração de notificações via endpoint do sistema Acta, por agência.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS crm_api_key      TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS crm_instance_id  TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS crm_endpoint_url TEXT;
