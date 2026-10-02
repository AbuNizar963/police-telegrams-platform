begin;

select plan(12);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'units', 'units table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'telegram_versions', 'telegram versions table exists');
select has_table('public', 'telegram_actions', 'telegram actions table exists');
select has_table('public', 'numbering_sequences', 'numbering sequences table exists');

select has_function(
  'public',
  'is_org_member',
  'organization membership helper exists'
);
select has_function(
  'public',
  'can_access_telegram',
  'telegram scope helper exists'
);

select has_trigger(
  'public',
  'telegram_versions',
  'telegram_versions_immutable',
  'telegram versions are immutable'
);
select has_trigger(
  'public',
  'telegram_actions',
  'telegram_actions_immutable',
  'telegram actions are immutable'
);

select results_eq(
  $$
    select relrowsecurity
    from pg_class
    where oid = 'public.organizations'::regclass
  $$,
  $$ values (true) $$,
  'organizations RLS is enabled'
);
select results_eq(
  $$
    select relrowsecurity
    from pg_class
    where oid = 'public.telegram_actions'::regclass
  $$,
  $$ values (true) $$,
  'telegram actions RLS is enabled'
);

select * from finish();
rollback;
