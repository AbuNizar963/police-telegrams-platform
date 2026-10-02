-- Auditable workflow, idempotent creation, immutable versions and attachment metadata.
-- All tables remain server-owned: the service role is the only application writer.

DO $$
BEGIN
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'draft';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'submitted';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'in_review';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'approved';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'returned';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'rejected';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'forwarded';
  ALTER TYPE public.telegram_status ADD VALUE IF NOT EXISTS 'completed';
END $$;

ALTER TABLE public.telegrams
  ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(120),
  ADD COLUMN IF NOT EXISTS "workflowReason" text,
  ADD COLUMN IF NOT EXISTS "closedAt" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS telegrams_idempotency_key_idx
  ON public.telegrams ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_versions (
  id serial PRIMARY KEY,
  "telegramId" integer NOT NULL REFERENCES public.telegrams(id) ON DELETE RESTRICT,
  "versionNumber" integer NOT NULL,
  "changedByUserId" integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  "changeReason" text NOT NULL,
  snapshot text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("telegramId", "versionNumber")
);
CREATE INDEX IF NOT EXISTS telegram_versions_telegram_idx
  ON public.telegram_versions ("telegramId", "createdAt");

CREATE TABLE IF NOT EXISTS public.telegram_attachments (
  id serial PRIMARY KEY,
  "telegramId" integer NOT NULL REFERENCES public.telegrams(id) ON DELETE RESTRICT,
  "storageKey" text NOT NULL UNIQUE,
  "originalName" varchar(180) NOT NULL,
  "mimeType" varchar(120) NOT NULL,
  "sizeBytes" integer NOT NULL CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  "uploadedByUserId" integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  "scanStatus" varchar(32) NOT NULL DEFAULT 'pending' CHECK ("scanStatus" IN ('pending', 'clean', 'rejected', 'unavailable')),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_attachments_telegram_idx
  ON public.telegram_attachments ("telegramId", "createdAt");
CREATE INDEX IF NOT EXISTS telegram_attachments_scan_idx
  ON public.telegram_attachments ("scanStatus");

CREATE TABLE IF NOT EXISTS public.telegram_actions (
  id serial PRIMARY KEY,
  "telegramId" integer NOT NULL REFERENCES public.telegrams(id) ON DELETE RESTRICT,
  "actorUserId" integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action varchar(80) NOT NULL,
  "fromStatus" public.telegram_status,
  "toStatus" public.telegram_status,
  reason text,
  metadata text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_actions_telegram_idx
  ON public.telegram_actions ("telegramId", "createdAt");
CREATE INDEX IF NOT EXISTS telegram_actions_actor_idx
  ON public.telegram_actions ("actorUserId", "createdAt");

ALTER TABLE public.telegram_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telegram_versions, public.telegram_attachments, public.telegram_actions FROM anon, authenticated;

COMMENT ON TABLE public.telegram_versions IS 'Immutable snapshots for material telegram changes.';
COMMENT ON TABLE public.telegram_attachments IS 'Metadata and integrity record for private Storage objects.';
COMMENT ON TABLE public.telegram_actions IS 'Immutable workflow decision and transition history.';
