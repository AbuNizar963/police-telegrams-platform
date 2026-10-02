-- Initial production schema for the Police Telegrams platform.
-- All application writes are performed server-side with the Supabase secret key.
-- Keep the tables protected with RLS; the browser never receives the secret key.

create type public.user_role as enum ('user', 'admin');
create type public.telegram_classification as enum ('secret', 'normal');
create type public.telegram_priority as enum ('slow', 'normal', 'urgent');
create type public.telegram_category as enum ('criminal', 'administrative', 'traffic', 'security', 'tactical');
create type public.telegram_status as enum ('pending', 'in_progress', 'resolved', 'archived');
create type public.number_system as enum ('latin', 'arabic', 'hindi');

create table public.users (
  id serial primary key,
  "authUserId" uuid not null unique,
  name text,
  "badgeNumber" varchar(80),
  email varchar(320),
  "loginMethod" varchar(64),
  role public.user_role not null default 'user',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "lastSignedIn" timestamptz not null default now()
);

create table public.department_settings (
  id serial primary key,
  "configKey" varchar(32) not null unique default 'primary',
  "departmentName" varchar(255) not null default 'إدارة الشرطة',
  "unitName" varchar(255) not null default 'وحدة العمليات',
  "unitChiefRank" varchar(120) not null default 'العقيد',
  "unitChiefName" varchar(255) not null default 'رئيس الوحدة',
  "serialPrefix" varchar(24) not null default 'POL',
  "serialStart" integer not null default 1,
  "nextSerial" integer not null default 1,
  timezone varchar(64) not null default 'Asia/Damascus',
  "dateFormat" varchar(32) not null default 'dd/MM/yyyy HH:mm:ss',
  "numberSystem" public.number_system not null default 'latin',
  "logoUrl" text,
  "updatedByUserId" integer,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.telegrams (
  id serial primary key,
  "serialNumber" integer not null unique,
  "serialCode" varchar(48) not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdByUserId" integer not null,
  "creatorName" varchar(255) not null,
  "creatorEmail" varchar(320),
  "creatorBadgeId" varchar(80),
  "creatorIp" varchar(80),
  "creatorFingerprint" varchar(128),
  subject varchar(255) not null,
  recipient varchar(255) not null,
  body text not null,
  classification public.telegram_classification not null default 'normal',
  priority public.telegram_priority not null default 'normal',
  category public.telegram_category not null default 'administrative',
  status public.telegram_status not null default 'pending',
  "attachmentManifest" text,
  "gpsLatitude" varchar(40),
  "gpsLongitude" varchar(40),
  "archivedAt" timestamptz
);

create table public.audit_logs (
  id serial primary key,
  "actorUserId" integer not null,
  "actorName" varchar(255) not null,
  action varchar(80) not null,
  "entityType" varchar(80) not null,
  "entityId" varchar(80),
  metadata text,
  "createdAt" timestamptz not null default now()
);

create index "telegrams_creator_idx" on public.telegrams ("createdByUserId");
create index "telegrams_created_at_idx" on public.telegrams ("createdAt");
create index "telegrams_classification_idx" on public.telegrams (classification);
create index "audit_actor_idx" on public.audit_logs ("actorUserId");
create index "audit_created_at_idx" on public.audit_logs ("createdAt");

alter table public.users enable row level security;
alter table public.department_settings enable row level security;
alter table public.telegrams enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.allocate_serial_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
begin
  insert into public.department_settings ("configKey")
  values ('primary')
  on conflict ("configKey") do nothing;

  select "nextSerial"
    into allocated
    from public.department_settings
   where "configKey" = 'primary'
   for update;

  if allocated is null or allocated < 1 then
    allocated := 1;
  end if;

  update public.department_settings
     set "nextSerial" = allocated + 1,
         "updatedAt" = now()
   where "configKey" = 'primary';

  return allocated;
end;
$$;

revoke all on function public.allocate_serial_number() from public, anon, authenticated;
grant execute on function public.allocate_serial_number() to service_role;

insert into public.department_settings ("configKey")
values ('primary')
on conflict ("configKey") do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'telegram-files',
  'telegram-files',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'audio/mpeg',
    'audio/wav',
    'audio/webm'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
