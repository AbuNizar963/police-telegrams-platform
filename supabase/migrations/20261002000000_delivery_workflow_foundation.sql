-- Delivery report foundation: organizational scope, workflow history, and numbering.
-- This migration is intentionally additive. Apply it in a reviewed Supabase environment
-- after the initial schema has been tested locally.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  role public.app_role not null default 'officer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, organization_id, unit_id)
);

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists unit_id uuid references public.units(id) on delete restrict;

alter table public.telegrams
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists unit_id uuid references public.units(id) on delete restrict;

create table public.telegram_versions (
  id bigint generated always as identity primary key,
  telegram_id uuid not null references public.telegrams(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  reason text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (telegram_id, version_number)
);

create table public.telegram_actions (
  id bigint generated always as identity primary key,
  telegram_id uuid not null references public.telegrams(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  from_status public.telegram_status,
  to_status public.telegram_status,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.numbering_sequences (
  scope_key text primary key,
  prefix text not null check (prefix <> ''),
  next_value bigint not null check (next_value > 0),
  reset_period text not null default 'daily' check (reset_period in ('daily', 'annual', 'never')),
  sequence_date date,
  updated_at timestamptz not null default now()
);

create index units_organization_idx on public.units(organization_id);
create index memberships_profile_idx on public.memberships(profile_id);
create index memberships_scope_idx on public.memberships(organization_id, unit_id);
create index profiles_scope_idx on public.profiles(organization_id, unit_id);
create index telegrams_scope_idx on public.telegrams(organization_id, unit_id);
create index telegram_versions_telegram_idx on public.telegram_versions(telegram_id, version_number desc);
create index telegram_actions_telegram_idx on public.telegram_actions(telegram_id, created_at desc);
create index telegram_actions_actor_idx on public.telegram_actions(actor_user_id, created_at desc);

create or replace function public.is_org_member(target_organization uuid, target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.profile_id = (select auth.uid())
      and m.organization_id = target_organization
      and m.active
      and (m.unit_id is null or m.unit_id = target_unit)
  )
$$;

create or replace function public.can_access_telegram(
  target_creator uuid,
  target_organization uuid,
  target_unit uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select auth.uid()) = target_creator
    or public.is_admin()
    or (
      public.current_app_role() = 'commander'
      and (
        target_organization is null
        or public.is_org_member(target_organization, target_unit)
      )
    )
$$;

alter table public.organizations enable row level security;
alter table public.units enable row level security;
alter table public.memberships enable row level security;
alter table public.telegram_versions enable row level security;
alter table public.telegram_actions enable row level security;
alter table public.numbering_sequences enable row level security;

revoke all on public.organizations, public.units, public.memberships,
  public.telegram_versions, public.telegram_actions, public.numbering_sequences
  from anon;
grant select on public.organizations, public.units, public.memberships to authenticated;
grant select on public.telegram_versions, public.telegram_actions to authenticated;

drop policy if exists organizations_read_scope on public.organizations;
create policy organizations_read_scope on public.organizations
for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.memberships m
  where m.organization_id = organizations.id
    and m.profile_id = (select auth.uid())
    and m.active
));

drop policy if exists units_read_scope on public.units;
create policy units_read_scope on public.units
for select to authenticated
using (public.is_admin() or public.is_org_member(organization_id, id));

drop policy if exists memberships_self_or_command on public.memberships;
create policy memberships_self_or_command on public.memberships
for select to authenticated
using (profile_id = (select auth.uid()) or public.is_commander_or_admin());

drop policy if exists telegram_versions_read_scope on public.telegram_versions;
create policy telegram_versions_read_scope on public.telegram_versions
for select to authenticated
using (exists (
  select 1 from public.telegrams t
  where t.id = telegram_id
    and public.can_access_telegram(t.created_by, t.organization_id, t.unit_id)
));

drop policy if exists telegram_actions_read_scope on public.telegram_actions;
create policy telegram_actions_read_scope on public.telegram_actions
for select to authenticated
using (exists (
  select 1 from public.telegrams t
  where t.id = telegram_id
    and public.can_access_telegram(t.created_by, t.organization_id, t.unit_id)
));

-- Replace the initial broad commander/admin policies with organization-aware checks.
drop policy if exists telegrams_read_by_scope on public.telegrams;
create policy telegrams_read_by_scope on public.telegrams
for select to authenticated
using (public.can_access_telegram(created_by, organization_id, unit_id));

drop policy if exists telegrams_create_as_self on public.telegrams;
create policy telegrams_create_as_self on public.telegrams
for insert to authenticated
with check (
  (select auth.uid()) = created_by
  and (
    organization_id is null
    or public.is_admin()
    or public.is_org_member(organization_id, unit_id)
  )
);

drop policy if exists telegrams_command_update on public.telegrams;
create policy telegrams_command_update on public.telegrams
for update to authenticated
using (public.can_access_telegram(created_by, organization_id, unit_id))
with check (public.can_access_telegram(created_by, organization_id, unit_id));

drop policy if exists attachments_read_by_scope on public.telegram_attachments;
create policy attachments_read_by_scope on public.telegram_attachments
for select to authenticated
using (exists (
  select 1
  from public.telegrams t
  where t.id = telegram_id
    and public.can_access_telegram(t.created_by, t.organization_id, t.unit_id)
));

create or replace function public.prevent_workflow_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'workflow history is immutable';
end;
$$;

create trigger telegram_versions_immutable
before update or delete on public.telegram_versions
for each row execute function public.prevent_workflow_history_mutation();

create trigger telegram_actions_immutable
before update or delete on public.telegram_actions
for each row execute function public.prevent_workflow_history_mutation();
