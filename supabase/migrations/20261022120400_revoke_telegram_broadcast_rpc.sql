-- Restrict database RPC access to trusted server-side callers.
REVOKE ALL ON FUNCTION public.route_telegram_broadcast_atomic(integer, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
