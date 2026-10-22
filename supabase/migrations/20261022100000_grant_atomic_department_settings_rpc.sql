-- Keep function privilege changes in a standalone migration statement.
-- The RPC is restricted to trusted server-side callers.
REVOKE ALL ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb)
  TO service_role;

-- Restrict the global serial allocator to trusted server-side callers.
REVOKE ALL ON FUNCTION public.allocate_serial_number()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.allocate_serial_number()
  TO service_role;

-- Restrict atomic broadcast routing to trusted server-side callers.
REVOKE ALL ON FUNCTION public.route_telegram_broadcast_atomic(
  integer, uuid, uuid, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.route_telegram_broadcast_atomic(
  integer, uuid, uuid, integer, text, jsonb
) TO service_role;
