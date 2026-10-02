-- Harden the optional SECURITY DEFINER helper when it exists.
-- Some schema versions do not define this helper, so fresh database setup
-- must not fail while applying this permission-only migration.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end;
$$;
