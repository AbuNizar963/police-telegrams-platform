-- Web Push subscriptions are server-owned and scoped to both the user and police organization.
create table if not exists public.push_subscriptions (
  id serial primary key,
  "userId" integer not null references public.users(id) on delete cascade,
  "organizationId" uuid not null references public.organizations(id) on delete cascade,
  endpoint text not null unique,
  "p256dh" text not null,
  auth text not null,
  "userAgent" text,
  "lastUsedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("userId", endpoint)
);
create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions ("organizationId", "lastUsedAt");
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions ("userId", "lastUsedAt");
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
comment on table public.push_subscriptions is 'Private Web Push endpoints scoped to an authenticated police user and organization.';
