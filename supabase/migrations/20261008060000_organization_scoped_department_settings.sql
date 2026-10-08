-- Each police organization owns its own letterhead, chief, numbering and locale settings.
ALTER TABLE public.department_settings
  ALTER COLUMN "configKey" TYPE varchar(80);

ALTER TABLE public.department_settings
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS department_settings_organization_idx
  ON public.department_settings ("organizationId");

-- Keep the legacy primary row as a migration template. New users receive a
-- copied settings row scoped to their active organization on first access.
COMMENT ON COLUMN public.department_settings."organizationId"
  IS 'Owning police organization; NULL is retained only for the legacy template row';
