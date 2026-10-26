ALTER TABLE public.telegram_attachments
  ADD COLUMN IF NOT EXISTS "storageOrganizationId" uuid;

UPDATE public.telegram_attachments AS attachment
SET "storageOrganizationId" = telegram."organizationId"
FROM public.telegrams AS telegram
WHERE telegram.id = attachment."telegramId"
  AND attachment."storageOrganizationId" IS NULL;

ALTER TABLE public.telegram_attachments
  ALTER COLUMN "storageOrganizationId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telegram_attachments_storage_organization_fk'
      AND conrelid = 'public.telegram_attachments'::regclass
  ) THEN
    ALTER TABLE public.telegram_attachments
      ADD CONSTRAINT telegram_attachments_storage_organization_fk
      FOREIGN KEY ("storageOrganizationId")
      REFERENCES public.organizations(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS telegram_attachments_storage_org_idx
  ON public.telegram_attachments ("storageOrganizationId", "createdAt");
