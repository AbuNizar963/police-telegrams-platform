-- Keep the external Supabase identity stable while rotating app sessions.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "sessionVersion" uuid;

-- Preserve existing sessions during rollout. Legacy JWTs carry authUserId;
-- the verifier accepts that claim until a password reset rotates sessionVersion.
UPDATE public.users
SET "sessionVersion" = "authUserId"
WHERE "sessionVersion" IS NULL;

ALTER TABLE public.users
  ALTER COLUMN "sessionVersion" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "sessionVersion" SET NOT NULL;
