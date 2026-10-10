BEGIN;

SELECT plan(3);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_route_id_fk_idx'
  ),
  'notifications route foreign key has a supporting index'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_telegram_id_fk_idx'
  ),
  'notifications telegram foreign key has a supporting index'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'telegram_routes'
      AND indexname = 'telegram_routes_receiver_decision_by_user_fk_idx'
  ),
  'receiver decision user foreign key has a supporting index'
);

SELECT * FROM finish();
ROLLBACK;
