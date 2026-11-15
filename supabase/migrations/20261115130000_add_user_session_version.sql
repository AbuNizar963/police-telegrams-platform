-- Keep the external Supabase identity stable while rotating app sessions.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "sessionVersion" uuid;

UPDATE public.users
SET "sessionVersion" = gen_random_uuid()
WHERE "sessionVersion" IS NULL;

ALTER TABLE public.users
  ALTER COLUMN "sessionVersion" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "sessionVersion" SET NOT NULL;
