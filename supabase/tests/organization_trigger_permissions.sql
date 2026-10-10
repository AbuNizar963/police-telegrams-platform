BEGIN;

SELECT plan(3);

SELECT has_function(
  'public',
  'enforce_organization_parent_acyclic',
  ARRAY[]::text[],
  'organization hierarchy guard remains installed'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.enforce_organization_parent_acyclic()',
    'EXECUTE'
  ),
  'anonymous users cannot execute the organization hierarchy trigger'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.enforce_organization_parent_acyclic()',
    'EXECUTE'
  ),
  'authenticated users cannot execute the organization hierarchy trigger'
);

SELECT * FROM finish();
ROLLBACK;
