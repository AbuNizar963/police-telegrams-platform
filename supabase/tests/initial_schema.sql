begin;

select plan(8);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'telegrams', 'telegrams table exists');
select has_table('public', 'telegram_attachments', 'telegram attachments table exists');
select has_table('public', 'audit_logs', 'audit logs table exists');
select has_index('public', 'telegrams', 'telegrams_created_at_idx', 'telegram timestamp index exists');
select policies_are('public', 'telegrams', 3, 'telegram table has explicit RLS policies');
select policies_are('storage', 'objects', 3, 'storage object policies exist');
select results_eq(
  $$ select public from storage.buckets where id = 'telegram-files' $$,
  $$ values (false) $$,
  'telegram files bucket is private'
);

select * from finish();
rollback;
