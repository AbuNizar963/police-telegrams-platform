-- Preserve imported telegram identifiers and source metadata without changing internal IDs.
ALTER TABLE public.telegrams
  ADD COLUMN IF NOT EXISTS "originalSerial" varchar(120),
  ADD COLUMN IF NOT EXISTS "telegramDate" timestamptz,
  ADD COLUMN IF NOT EXISTS "importNotes" text;

CREATE INDEX IF NOT EXISTS "telegrams_organization_original_serial_idx"
  ON public.telegrams ("organizationId", "originalSerial")
  WHERE "originalSerial" IS NOT NULL;
