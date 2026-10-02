-- Cover user foreign keys used by lifecycle audit and attachment records.
-- These indexes prevent full-table scans when a referenced user is updated or removed.

CREATE INDEX IF NOT EXISTS telegram_attachments_uploaded_by_user_idx
  ON public.telegram_attachments ("uploadedByUserId");

CREATE INDEX IF NOT EXISTS telegram_routes_approved_by_user_idx
  ON public.telegram_routes ("approvedByUserId")
  WHERE "approvedByUserId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_versions_changed_by_user_idx
  ON public.telegram_versions ("changedByUserId");
