create extension if not exists pgcrypto;

create type public.app_role as enum ('officer', 'commander', 'admin');
create type public.telegram_secrecy as enum ('secret', 'normal');
create type public.telegram_priority as enum ('slow', 'normal', 'urgent');
create type public.telegram_category as enum ('criminal', 'administrative', 'traffic', 'security', 'tactical');
create type public.telegram_status as enum ('pending', 'in_progress', 'resolved', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null,
  email text,
  badge_number text,
  rank text,
  role public.app_role not null default 'officer',
  department_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.department_settings (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique default 'primary',
  department_name text not null default 'إدارة الشرطة',
  unit_name text not null default 'وحدة العمليات',
  unit_chief_rank text not null default 'العقيد',
  unit_chief_name text not null default 'رئيس الوحدة',
  serial_prefix text not null default 'POL',
  serial_start integer not null default 1 check (serial_start > 0),
  next_serial integer not null default 1 check (next_serial > 0),
  timezone text not null default 'Asia/Damascus',
  date_format text not null default 'dd/MM/yyyy HH:mm:ss',
  number_system text not null default 'latin' check (number_system in ('latin', 'arabic', 'hindi')),
  logo_path text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.department_settings (config_key) values ('primary') on conflict (config_key) do nothing;

create table public.telegrams (
  id uuid primary key default gen_random_uuid(),
  serial_number integer not null unique,
  serial_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  creator_name text not null,
  creator_email text,
  creator_badge_number text,
  creator_rank text,
  creator_ip inet,
  creator_fingerprint text,
  subject text not null,
  recipient text not null,
  body text not null,
  secrecy public.telegram_secrecy not null default 'normal',
  priority public.telegram_priority not null default 'normal',
  category public.telegram_category not null default 'administrative',
  status public.telegram_status not null default 'pending',
  gps_latitude numeric(10,7),
  gps_longitude numeric(10,7),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null
);

create table public.telegram_attachments (
  id uuid primary key default gen_random_uuid(),
  telegram_id uuid not null references public.telegrams(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  checksum text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);
create index telegrams_created_by_idx on public.telegrams(created_by);
create index telegrams_created_at_idx on public.telegrams(created_at desc);
create index telegrams_status_idx on public.telegrams(status);
create index telegrams_priority_idx on public.telegrams(priority);
create index telegram_attachments_telegram_idx on public.telegram_attachments(telegram_id);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_commander_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('commander', 'admin')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin'
$$;

alter table public.profiles enable row level security;
alter table public.department_settings enable row level security;
alter table public.telegrams enable row level security;
alter table public.telegram_attachments enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles, public.department_settings, public.telegrams, public.telegram_attachments, public.audit_logs from anon;
grant select on public.profiles to authenticated;
grant select on public.department_settings to authenticated;
grant select, insert on public.telegrams to authenticated;
grant select, insert on public.telegram_attachments to authenticated;
grant select on public.audit_logs to authenticated;
grant update on public.department_settings to authenticated;
grant update on public.telegrams to authenticated;

create policy profiles_self_read on public.profiles for select to authenticated
using ((select auth.uid()) = id or public.is_commander_or_admin());

create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy settings_authenticated_read on public.department_settings for select to authenticated
using (true);

create policy settings_admin_update on public.department_settings for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy telegrams_read_by_scope on public.telegrams for select to authenticated
using ((select auth.uid()) = created_by or public.is_commander_or_admin());

create policy telegrams_create_as_self on public.telegrams for insert to authenticated
with check ((select auth.uid()) = created_by);

create policy telegrams_command_update on public.telegrams for update to authenticated
using (public.is_commander_or_admin()) with check (public.is_commander_or_admin());

create policy attachments_read_by_scope on public.telegram_attachments for select to authenticated
using (
  exists (
    select 1 from public.telegrams t
    where t.id = telegram_id
      and (t.created_by = (select auth.uid()) or public.is_commander_or_admin())
  )
);

create policy attachments_create_as_self on public.telegram_attachments for insert to authenticated
with check ((select auth.uid()) = uploaded_by);

create policy audit_read_command on public.audit_logs for select to authenticated
using (public.is_commander_or_admin());

create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'audit_logs are immutable';
end;
$$;

create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_mutation();

create or replace function public.prevent_telegram_identity_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by <> old.created_by or new.created_at <> old.created_at
     or new.creator_name <> old.creator_name
     or new.creator_badge_number is distinct from old.creator_badge_number
     or new.creator_rank is distinct from old.creator_rank then
    raise exception 'telegram creator identity is immutable';
  end if;
  return new;
end;
$$;

create trigger telegram_identity_immutable
before update on public.telegrams
for each row execute function public.prevent_telegram_identity_mutation();

insert into storage.buckets (id, name, public)
values ('telegram-files', 'telegram-files', false)
on conflict (id) do nothing;

create policy telegram_files_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'telegram-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy telegram_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'telegram-files'
  and exists (
    select 1 from public.telegram_attachments a
    join public.telegrams t on t.id = a.telegram_id
    where a.storage_path = name
      and (t.created_by = (select auth.uid()) or public.is_commander_or_admin())
  )
);

create policy telegram_files_no_delete on storage.objects
for delete to authenticated
using (false);
