-- Organization-scoped settings may share the legacy configKey namespace only
-- when they belong to different organizations. The organizationId unique index
-- is the concurrency arbiter for organization rows; a global configKey constraint
-- conflicts with ON CONFLICT ("organizationId") and breaks concurrent first saves.
ALTER TABLE public.department_settings
  DROP CONSTRAINT IF EXISTS "department_settings_configKey_key";

-- Preserve uniqueness for legacy template rows, which are the only rows without
-- an organization owner. Organization-owned rows are uniquely identified by
-- organizationId and use deterministic configKey values derived from that UUID.
CREATE UNIQUE INDEX IF NOT EXISTS department_settings_legacy_config_key_unique_idx
  ON public.department_settings ("configKey")
  WHERE "organizationId" IS NULL;
