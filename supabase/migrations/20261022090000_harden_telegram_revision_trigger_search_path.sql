-- The trigger function only uses NEW/OLD and pg_catalog built-ins.
-- An empty search_path prevents object shadowing from writable schemas.
ALTER FUNCTION public.bump_telegram_revision()
  SET search_path = '';
