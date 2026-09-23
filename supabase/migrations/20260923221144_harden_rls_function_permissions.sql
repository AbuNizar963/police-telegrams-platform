-- Harden the initial database by removing public execution rights from an
-- unrelated SECURITY DEFINER helper that is not used by the application.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
