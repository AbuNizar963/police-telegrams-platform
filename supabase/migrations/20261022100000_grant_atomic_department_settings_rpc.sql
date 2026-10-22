-- Keep function privilege changes in a standalone migration statement.
-- The RPC is restricted to trusted server-side callers.
REVOKE ALL ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb)
  TO service_role;
