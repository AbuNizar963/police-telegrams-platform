-- Organization-owned settings are uniquely identified by organizationId.
-- The legacy global configKey constraint conflicts with concurrent first saves,
-- whose RPC correctly uses ON CONFLICT ("organizationId"). Keep configKey unique
-- only for legacy template rows, which have no organization owner.
ALTER TABLE public.department_settings
  DROP CONSTRAINT IF EXISTS "department_settings_configKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS department_settings_legacy_config_key_unique_idx
  ON public.department_settings ("configKey")
  WHERE "organizationId" IS NULL;
