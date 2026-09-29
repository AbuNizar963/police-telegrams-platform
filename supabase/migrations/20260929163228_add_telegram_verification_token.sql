-- Add an unguessable public verification token without exposing telegram content.
alter table public.telegrams
  add column if not exists "verificationToken" uuid;

update public.telegrams
set "verificationToken" = gen_random_uuid()
where "verificationToken" is null;

alter table public.telegrams
  alter column "verificationToken" set default gen_random_uuid(),
  alter column "verificationToken" set not null;

create unique index if not exists "telegrams_verification_token_idx"
  on public.telegrams ("verificationToken");
