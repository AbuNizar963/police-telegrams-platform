-- Index the referencing side of foreign keys used by notification and route lookups.
-- These indexes also keep parent-row deletes/updates from scanning the full child tables.
CREATE INDEX IF NOT EXISTS notifications_route_id_fk_idx
  ON public.notifications ("routeId");

CREATE INDEX IF NOT EXISTS notifications_telegram_id_fk_idx
  ON public.notifications ("telegramId");

CREATE INDEX IF NOT EXISTS telegram_routes_receiver_decision_by_user_fk_idx
  ON public.telegram_routes ("receiverDecisionByUserId");
