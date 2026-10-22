-- Keep trigger function name resolution deterministic and satisfy the
-- Supabase security advisor's mutable search_path check.
ALTER FUNCTION public.bump_telegram_revision()
  SET search_path = public;
