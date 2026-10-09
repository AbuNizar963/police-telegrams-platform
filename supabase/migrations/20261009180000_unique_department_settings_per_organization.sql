-- Keep one independently managed settings row per organization.
-- Existing production rows were checked for duplicates before adding this index.
CREATE UNIQUE INDEX IF NOT EXISTS department_settings_organization_unique_idx
  ON public.department_settings ("organizationId");
