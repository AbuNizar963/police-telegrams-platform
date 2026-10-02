-- Central organization foundation.
-- Backfills the existing single-department installation into one organization
-- before making organization ownership mandatory for users and telegrams.

create type public.organization_type as enum (
  'central',
  'command',
  'department',
  'station',
  'unit'
);

create type public.organization_member_role as enum (
  'system_admin',
  'organization_admin',
  'dispatcher',
  'reviewer',
  'reader',
  'auditor'
);

create type public.telegram_route_status as enum (
  'sent',
  'received',
  'accepted',
  'completed',
  'rejected',
  'cancelled'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  "parentOrganizationId" uuid references public.organizations(id) on delete restrict,
  code varchar(64) not null unique,
  name varchar(255) not null,
  type public.organization_type not null default 'department',
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index organizations_parent_idx
  on public.organizations ("parentOrganizationId");

create index organizations_active_idx
  on public.organizations ("isActive");

insert into public.organizations (code, name, type)
values ('LEGACY-PRIMARY', 'إدارة الشرطة', 'department')
on conflict (code) do nothing;

update public.organizations
set name = coalesce(
  nullif((select "departmentName"
          from public.department_settings
          where "configKey" = 'primary'
          limit 1), ''),
  name
),
"updatedAt" = now()
where code = 'LEGACY-PRIMARY';

alter table public.users
  add column "organizationId" uuid;

alter table public.telegrams
  add column "organizationId" uuid;

update public.users
set "organizationId" = (
  select id from public.organizations where code = 'LEGACY-PRIMARY'
)
where "organizationId" is null;

update public.telegrams t
set "organizationId" = u."organizationId"
from public.users u
where u.id = t."createdByUserId"
  and t."organizationId" is null;

update public.telegrams
set "organizationId" = (
  select id from public.organizations where code = 'LEGACY-PRIMARY'
)
where "organizationId" is null;

alter table public.users
  alter column "organizationId" set not null;

alter table public.telegrams
  alter column "organizationId" set not null;

alter table public.users
  add constraint users_organization_fk
  foreign key ("organizationId")
  references public.organizations(id)
  on delete restrict;

alter table public.telegrams
  add constraint telegrams_organization_fk
  foreign key ("organizationId")
  references public.organizations(id)
  on delete restrict;

create index users_organization_idx
  on public.users ("organizationId");

create index telegrams_organization_idx
  on public.telegrams ("organizationId");

create table public.organization_memberships (
  id serial primary key,
  "organizationId" uuid not null
    references public.organizations(id) on delete cascade,
  "userId" integer not null
    references public.users(id) on delete cascade,
  role public.organization_member_role not null default 'dispatcher',
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("organizationId", "userId")
);

create index organization_memberships_user_idx
  on public.organization_memberships ("userId");

create index organization_memberships_org_role_idx
  on public.organization_memberships ("organizationId", role);

insert into public.organization_memberships (
  "organizationId",
  "userId",
  role
)
select
  u."organizationId",
  u.id,
  case
    when u.role = 'admin' then 'organization_admin'::public.organization_member_role
    else 'dispatcher'::public.organization_member_role
  end
from public.users u
on conflict ("organizationId", "userId") do update
set role = excluded.role,
    "isActive" = true,
    "updatedAt" = now();

create table public.telegram_routes (
  id serial primary key,
  "telegramId" integer not null
    references public.telegrams(id) on delete restrict,
  "fromOrganizationId" uuid not null
    references public.organizations(id) on delete restrict,
  "toOrganizationId" uuid not null
    references public.organizations(id) on delete restrict,
  "forwardedByUserId" integer not null
    references public.users(id) on delete restrict,
  status public.telegram_route_status not null default 'sent',
  note text,
  "createdAt" timestamptz not null default now(),
  "receivedAt" timestamptz,
  "completedAt" timestamptz,
  constraint telegram_routes_different_organizations
    check ("fromOrganizationId" <> "toOrganizationId")
);

create index telegram_routes_telegram_idx
  on public.telegram_routes ("telegramId", "createdAt");

create index telegram_routes_destination_idx
  on public.telegram_routes ("toOrganizationId", "status");

create index telegram_routes_source_idx
  on public.telegram_routes ("fromOrganizationId", "createdAt");

create index telegram_routes_forwarder_idx
  on public.telegram_routes ("forwardedByUserId");

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.telegram_routes enable row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_memberships from anon, authenticated;
revoke all on table public.telegram_routes from anon, authenticated;

comment on table public.organizations is
  'Central hierarchy of police organizations. All application access is server-authorized.';

comment on table public.organization_memberships is
  'User membership and organization-scoped role assignments.';

comment on table public.telegram_routes is
  'Immutable-by-default routing history for telegram movement between organizations.';
