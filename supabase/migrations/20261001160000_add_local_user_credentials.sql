-- Add the credentials required by the application's local username/password flow.
-- Existing OAuth users remain valid; nullable columns preserve their records.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username varchar(120),
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Enforce case-insensitive uniqueness while allowing legacy/OAuth users to have no username.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;
