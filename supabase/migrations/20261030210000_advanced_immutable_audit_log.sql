-- Advanced append-only audit log. This migration is additive and does not alter
-- historical business data. Apply it in a reviewed staging environment first.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS "actorRank" varchar(120),
  ADD COLUMN IF NOT EXISTS "actorRole" varchar(80),
  ADD COLUMN IF NOT EXISTS "organizationId" uuid,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS "beforeState" text,
  ADD COLUMN IF NOT EXISTS "afterState" text,
  ADD COLUMN IF NOT EXISTS "previousHash" varchar(64),
  ADD COLUMN IF NOT EXISTS "entryHash" varchar(64);

-- A deterministic hash includes the complete immutable row payload and the
-- preceding hash. It is not a replacement for backups or external WORM storage,
-- but makes alteration of rows in the application database detectable.
CREATE OR REPLACE FUNCTION public.audit_log_hash(
  previous_hash text,
  payload jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, extensions
AS $$
  SELECT encode(
    extensions.digest(coalesce(previous_hash, '') || E'\n' || payload::text, 'sha256'),
    'hex'
  );
$$;

-- Backfill a chain for historical rows before writes become immutable. Ordering
-- is deterministic even when two records have the same timestamp.
WITH RECURSIVE ordered AS (
  SELECT
    id,
    row_number() OVER (ORDER BY "createdAt", id) AS sequence,
    to_jsonb(audit_logs) - 'previousHash' - 'entryHash' AS payload
  FROM public.audit_logs
), chain AS (
  SELECT
    id,
    sequence,
    NULL::text AS previous_hash,
    public.audit_log_hash(NULL, payload) AS entry_hash
  FROM ordered
  WHERE sequence = 1

  UNION ALL

  SELECT
    current_row.id,
    current_row.sequence,
    chain.entry_hash AS previous_hash,
    public.audit_log_hash(chain.entry_hash, current_row.payload) AS entry_hash
  FROM ordered AS current_row
  INNER JOIN chain ON current_row.sequence = chain.sequence + 1
)
UPDATE public.audit_logs AS target
SET
  "previousHash" = chain.previous_hash,
  "entryHash" = chain.entry_hash
FROM chain
WHERE target.id = chain.id;

CREATE OR REPLACE FUNCTION public.audit_logs_assign_integrity_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  previous_hash text;
BEGIN
  -- Serialise ledger appends so concurrent requests cannot fork the chain.
  PERFORM pg_advisory_xact_lock(904219731);

  -- The database is the time authority; callers cannot backdate audit events.
  NEW."createdAt" := clock_timestamp();

  SELECT "entryHash"
    INTO previous_hash
    FROM public.audit_logs
   ORDER BY "createdAt" DESC, id DESC
   LIMIT 1;

  NEW."previousHash" := previous_hash;
  NEW."entryHash" := public.audit_log_hash(
    previous_hash,
    to_jsonb(NEW) - 'previousHash' - 'entryHash'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_assign_integrity_hash ON public.audit_logs;
CREATE TRIGGER audit_logs_assign_integrity_hash
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.audit_logs_assign_integrity_hash();

CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE, DELETE and TRUNCATE are prohibited'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_prevent_row_mutation ON public.audit_logs;
CREATE TRIGGER audit_logs_prevent_row_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.reject_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_prevent_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_prevent_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_audit_log_mutation();

-- These revocations protect normal client roles. Service-role writes remain
-- possible for the trusted server, while the triggers above reject mutations
-- even if a privileged SQL role attempts them through the application path.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS audit_actor_created_at_idx
  ON public.audit_logs ("actorUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS audit_action_created_at_idx
  ON public.audit_logs (action, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS audit_entity_created_at_idx
  ON public.audit_logs ("entityType", "entityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS audit_organization_created_at_idx
  ON public.audit_logs ("organizationId", "createdAt" DESC)
  WHERE "organizationId" IS NOT NULL;

COMMENT ON COLUMN public.audit_logs."actorRank" IS 'Snapshot of the actor rank when the action was recorded';
COMMENT ON COLUMN public.audit_logs."actorRole" IS 'Snapshot of the actor authorization role when the action was recorded';
COMMENT ON COLUMN public.audit_logs.reason IS 'Human supplied reason for a sensitive operation such as deletion';
COMMENT ON COLUMN public.audit_logs."beforeState" IS 'Sanitized JSON snapshot before a sensitive mutation';
COMMENT ON COLUMN public.audit_logs."afterState" IS 'Sanitized JSON snapshot after a sensitive mutation';
COMMENT ON COLUMN public.audit_logs."previousHash" IS 'SHA-256 hash of the previous audit row in chronological order';
COMMENT ON COLUMN public.audit_logs."entryHash" IS 'SHA-256 integrity hash of this audit row and its predecessor';
