-- Restrict database RPC access to trusted server-side callers.
REVOKE ALL ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
