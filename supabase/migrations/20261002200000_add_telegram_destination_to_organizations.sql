-- Allow each police department or station to define the organization that receives its telegrams.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "telegramDestinationOrganizationId" uuid
    REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS organizations_telegram_destination_idx
  ON public.organizations ("telegramDestinationOrganizationId");

COMMENT ON COLUMN public.organizations."telegramDestinationOrganizationId" IS
  'Manually selected organization that receives telegrams created by this organization.';
