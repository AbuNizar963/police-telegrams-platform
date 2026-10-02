begin;

select plan(7);

select has_table('public', 'users', 'application users table exists');
select has_table('public', 'department_settings', 'department settings table exists');
select has_table('public', 'telegrams', 'telegrams table exists');
select has_table('public', 'audit_logs', 'audit logs table exists');
select has_index('public', 'telegrams', 'telegrams_created_at_idx', 'telegram timestamp index exists');
select has_function('public', 'allocate_serial_number', array[]::text[], 'serial allocator exists');
select results_eq(
  $$ select public from storage.buckets where id = 'telegram-files' $$,
  $$ values (false) $$,
  'telegram files bucket is private'
);

select * from finish();
rollback;
