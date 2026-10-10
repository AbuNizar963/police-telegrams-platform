-- Organization-owned settings are uniquely identified by organizationId.
-- The legacy global configKey constraint conflicts with concurrent first saves,
-- whose RPC correctly uses ON CONFLICT ("organizationId"). Keep configKey unique
-- only for legacy template rows, which have no organization owner.
ALTER TABLE public.department_settings
  DROP CONSTRAINT IF EXISTS "department_settings_configKey_key";

-- PostgreSQL can infer the partial unique index only when the seed's
-- ON CONFLICT target carries the same organizationId IS NULL predicate.
CREATE UNIQUE INDEX IF NOT EXISTS department_settings_legacy_config_key_unique_idx
  ON public.department_settings ("configKey")
  WHERE "organizationId" IS NULL;
