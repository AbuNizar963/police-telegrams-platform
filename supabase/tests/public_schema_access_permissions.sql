BEGIN;

SELECT plan(5);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS role_names(role_name)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        has_table_privilege(role_names.role_name, c.oid, 'SELECT')
        OR has_table_privilege(role_names.role_name, c.oid, 'INSERT')
        OR has_table_privilege(role_names.role_name, c.oid, 'UPDATE')
        OR has_table_privilege(role_names.role_name, c.oid, 'DELETE')
        OR has_table_privilege(role_names.role_name, c.oid, 'TRUNCATE')
        OR has_table_privilege(role_names.role_name, c.oid, 'REFERENCES')
        OR has_table_privilege(role_names.role_name, c.oid, 'TRIGGER')
      )
  ),
  'browser roles have no direct privileges on public-schema tables or views'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS role_names(role_name)
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND (
        has_sequence_privilege(role_names.role_name, c.oid, 'USAGE')
        OR has_sequence_privilege(role_names.role_name, c.oid, 'SELECT')
        OR has_sequence_privilege(role_names.role_name, c.oid, 'UPDATE')
      )
  ),
  'browser roles have no direct privileges on public-schema sequences'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS role_names(role_name)
    WHERE n.nspname = 'public'
      AND has_function_privilege(role_names.role_name, p.oid, 'EXECUTE')
  ),
  'browser roles cannot directly execute public-schema database functions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl AS d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    WHERE d.defaclacl IS NOT NULL
      AND d.defaclrole IN (
        SELECT oid FROM pg_roles
        WHERE rolname IN ('postgres', 'supabase_admin')
      )
      AND (
        d.defaclnamespace = 0
        OR d.defaclnamespace = 'public'::regnamespace
      )
      AND (
        acl.grantee IN (
          SELECT oid FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        )
        OR (
          d.defaclobjtype = 'f'
          AND acl.grantee = 0
        )
      )
  ),
  'future objects created by migration owners do not default to browser access'
);

SELECT ok(
  has_table_privilege('service_role', 'public.telegrams', 'SELECT')
  AND has_table_privilege('service_role', 'public.telegrams', 'INSERT')
  AND has_sequence_privilege('service_role', 'public.telegrams_id_seq', 'USAGE')
  AND has_function_privilege(
    'service_role',
    'public.route_telegram_broadcast_atomic(integer,uuid,uuid,integer,text,jsonb)',
    'EXECUTE'
  ),
  'server-side service role retains required database access'
);

SELECT * FROM finish();
ROLLBACK;
