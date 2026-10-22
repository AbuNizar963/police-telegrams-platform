-- Restrict database RPC access to trusted server-side callers.
GRANT EXECUTE ON FUNCTION public.route_telegram_broadcast_atomic(integer, uuid, uuid, integer, text, jsonb) TO service_role;
