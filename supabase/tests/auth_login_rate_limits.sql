BEGIN;

SELECT plan(9);

SELECT ok(
  to_regclass('public.auth_login_rate_limits') IS NOT NULL,
  'persistent login rate-limit table exists'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.auth_login_rate_limits', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.auth_login_rate_limits', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.auth_login_rate_limits', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.auth_login_rate_limits', 'INSERT'),
  'browser roles cannot read or write login rate-limit buckets'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.consume_auth_login_rate_limit(text,integer,integer,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.consume_auth_login_rate_limit(text,integer,integer,integer)',
    'EXECUTE'
  ),
  'browser roles cannot execute the rate-limit function directly'
);

SELECT ok(
  has_table_privilege('service_role', 'public.auth_login_rate_limits', 'INSERT')
  AND has_table_privilege('service_role', 'public.auth_login_rate_limits', 'DELETE')
  AND has_function_privilege(
    'service_role',
    'public.consume_auth_login_rate_limit(text,integer,integer,integer)',
    'EXECUTE'
  ),
  'server-side service role retains rate-limit access'
);

SELECT ok(
  (SELECT allowed FROM public.consume_auth_login_rate_limit(repeat('a', 64), 2, 900, 60)),
  'first login attempt is allowed'
);

SELECT ok(
  (SELECT allowed FROM public.consume_auth_login_rate_limit(repeat('a', 64), 2, 900, 60)),
  'attempts up to the configured limit are allowed'
);

SELECT ok(
  NOT (SELECT allowed FROM public.consume_auth_login_rate_limit(repeat('a', 64), 2, 900, 60)),
  'attempt beyond the configured limit is blocked'
);

SELECT ok(
  NOT (SELECT allowed FROM public.consume_auth_login_rate_limit(repeat('a', 64), 2, 900, 60)),
  'subsequent attempts remain blocked during the cooldown'
);

UPDATE public.auth_login_rate_limits
SET "blockedUntil" = now() - interval '1 second'
WHERE "keyHash" = repeat('a', 64);

SELECT ok(
  (SELECT allowed FROM public.consume_auth_login_rate_limit(repeat('a', 64), 2, 900, 60)),
  'expired cooldown resets the bucket instead of re-blocking indefinitely'
);

SELECT * FROM finish();
ROLLBACK;
