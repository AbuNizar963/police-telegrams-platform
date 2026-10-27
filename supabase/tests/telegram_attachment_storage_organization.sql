BEGIN;

SELECT plan(5);

SELECT has_column(
  'public',
  'telegram_attachments',
  'storageOrganizationId',
  'attachment metadata records the storage-owning organization'
);

SELECT ok(
  NOT (
    SELECT attribute.attnotnull
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.telegram_attachments'::regclass
      AND attribute.attname = 'storageOrganizationId'
      AND NOT attribute.attisdropped
  ),
  'storage owner remains nullable during the expand-and-deploy phase'
);

SELECT has_index(
  'public',
  'telegram_attachments',
  'telegram_attachments_storage_org_idx',
  'organization-scoped attachment index exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telegram_attachments_storage_organization_fk'
      AND conrelid = 'public.telegram_attachments'::regclass
      AND confrelid = 'public.organizations'::regclass
      AND contype = 'f'
  ),
  'attachment storage owner references a real organization'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.telegram_attachments AS attachment
    JOIN public.telegrams AS telegram
      ON telegram.id = attachment."telegramId"
    WHERE attachment."storageOrganizationId" IS NOT NULL
      AND attachment."storageOrganizationId" IS DISTINCT FROM telegram."organizationId"
  ),
  'backfilled attachment owners match the immutable telegram origin'
);

SELECT * FROM finish();
ROLLBACK;
