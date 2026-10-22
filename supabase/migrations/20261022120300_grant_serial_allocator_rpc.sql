-- Restrict database RPC access to trusted server-side callers.
GRANT EXECUTE ON FUNCTION public.allocate_serial_number() TO service_role;
