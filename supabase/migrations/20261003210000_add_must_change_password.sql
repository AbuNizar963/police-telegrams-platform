ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false;
