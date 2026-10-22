-- Restrict database RPC access to trusted server-side callers.
REVOKE ALL ON FUNCTION public.allocate_serial_number() FROM PUBLIC, anon, authenticated;
