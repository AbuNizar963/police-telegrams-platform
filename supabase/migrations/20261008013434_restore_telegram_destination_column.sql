-- Restore the organization-level telegram destination column required by route_telegram.
-- This is additive and safe for existing data; existing organizations remain unconfigured.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "telegramDestinationOrganizationId" uuid
    REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS organizations_telegram_destination_idx
  ON public.organizations ("telegramDestinationOrganizationId");

COMMENT ON COLUMN public.organizations."telegramDestinationOrganizationId" IS
  'Manually selected organization that receives telegrams created by this organization.';
