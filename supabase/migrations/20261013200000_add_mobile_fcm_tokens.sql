create table if not exists public.mobile_push_tokens (
  id serial primary key,
  "userId" integer not null references public.users(id) on delete cascade,
  "organizationId" uuid not null references public.organizations(id) on delete cascade,
  token text not null unique,
  platform varchar(16) not null,
  "lastUsedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists mobile_push_tokens_org_idx
  on public.mobile_push_tokens ("organizationId", "lastUsedAt");
create index if not exists mobile_push_tokens_user_idx
  on public.mobile_push_tokens ("userId", "lastUsedAt");
alter table public.mobile_push_tokens enable row level security;
revoke all on table public.mobile_push_tokens from anon, authenticated;
comment on table public.mobile_push_tokens is 'Private Firebase Cloud Messaging tokens scoped to authenticated mobile users.';
