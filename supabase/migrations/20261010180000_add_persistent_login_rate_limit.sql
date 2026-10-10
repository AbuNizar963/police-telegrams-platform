-- Persistent login throttling protects the custom local-password flow across
-- serverless instances. Only the server-side service role may access the buckets.
CREATE TABLE public.auth_login_rate_limits (
  "keyHash" text PRIMARY KEY
    CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  "windowStartedAt" timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  "blockedUntil" timestamptz,
  "updatedAt" timestamptz NOT NULL
);

CREATE INDEX auth_login_rate_limits_updated_at_idx
  ON public.auth_login_rate_limits ("updatedAt");

ALTER TABLE public.auth_login_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.auth_login_rate_limits
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.auth_login_rate_limits
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_auth_login_rate_limit(
  p_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_block interval;
  v_row public.auth_login_rate_limits%rowtype;
BEGIN
  IF p_key_hash !~ '^[0-9a-f]{64}$'
     OR p_max_attempts < 1 OR p_max_attempts > 1000
     OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_block_seconds < 1 OR p_block_seconds > 86400 THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Invalid login rate-limit parameters';
  END IF;

  v_window := make_interval(secs => p_window_seconds);
  v_block := make_interval(secs => p_block_seconds);

  INSERT INTO public.auth_login_rate_limits AS existing (
    "keyHash", "windowStartedAt", attempts, "blockedUntil", "updatedAt"
  )
  VALUES (p_key_hash, v_now, 1, NULL, v_now)
  ON CONFLICT ("keyHash") DO UPDATE
  SET
    "windowStartedAt" = CASE
      WHEN existing."blockedUntil" > v_now THEN existing."windowStartedAt"
      WHEN existing."windowStartedAt" <= v_now - v_window
        OR (
          existing."blockedUntil" IS NOT NULL
          AND existing."blockedUntil" <= v_now
        )
        THEN v_now
      ELSE existing."windowStartedAt"
    END,
    attempts = CASE
      WHEN existing."blockedUntil" > v_now THEN existing.attempts
      WHEN existing."windowStartedAt" <= v_now - v_window
        OR (
          existing."blockedUntil" IS NOT NULL
          AND existing."blockedUntil" <= v_now
        )
        THEN 1
      ELSE existing.attempts + 1
    END,
    "blockedUntil" = CASE
      WHEN existing."blockedUntil" > v_now THEN existing."blockedUntil"
      WHEN existing."windowStartedAt" <= v_now - v_window
        OR (
          existing."blockedUntil" IS NOT NULL
          AND existing."blockedUntil" <= v_now
        )
        THEN NULL
      WHEN existing.attempts >= p_max_attempts
        THEN v_now + v_block
      ELSE NULL
    END,
    "updatedAt" = v_now
  RETURNING * INTO v_row;

  -- Periodically remove stale buckets so arbitrary usernames/IPs cannot grow
  -- this table indefinitely. The cleanup uses the indexed timestamp column.
  IF random() < 0.01 THEN
    DELETE FROM public.auth_login_rate_limits
    WHERE "updatedAt" < v_now - interval '2 days';
  END IF;

  RETURN QUERY
  SELECT
    v_row."blockedUntil" IS NULL OR v_row."blockedUntil" <= v_now,
    CASE
      WHEN v_row."blockedUntil" > v_now
        THEN greatest(
          1,
          ceil(extract(epoch FROM (v_row."blockedUntil" - v_now)))::integer
        )
      ELSE 0
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_auth_login_rate_limit(text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_login_rate_limit(text, integer, integer, integer)
  TO service_role;
