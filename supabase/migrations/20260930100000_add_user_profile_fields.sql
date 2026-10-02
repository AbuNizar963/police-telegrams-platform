-- Extend user records with editable personal and service profile details.
-- This migration is additive and preserves all existing account data.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS phone varchar(32),
  ADD COLUMN IF NOT EXISTS rank varchar(120),
  ADD COLUMN IF NOT EXISTS unit varchar(255),
  ADD COLUMN IF NOT EXISTS "avatarKey" text;

-- Profile photos are stored separately from telegram attachments and remain private.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Access is performed by the trusted server using the Supabase service role.
-- No client-facing storage policies are added for this private bucket.
