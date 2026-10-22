-- Restrict database RPC access to trusted server-side callers.
GRANT EXECUTE ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb) TO service_role;
