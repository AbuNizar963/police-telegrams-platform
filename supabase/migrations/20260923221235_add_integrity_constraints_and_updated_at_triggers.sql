-- Add database-level integrity and automatic updatedAt maintenance.

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

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger department_settings_set_updated_at
before update on public.department_settings
for each row execute function public.set_updated_at();

create trigger telegrams_set_updated_at
before update on public.telegrams
for each row execute function public.set_updated_at();

alter table public.department_settings
  add constraint department_settings_serial_start_positive
  check ("serialStart" > 0);

alter table public.department_settings
  add constraint department_settings_next_serial_positive
  check ("nextSerial" > 0);

alter table public.department_settings
  add constraint department_settings_updated_by_user_fk
  foreign key ("updatedByUserId")
  references public.users(id)
  on delete set null;

alter table public.telegrams
  add constraint telegrams_created_by_user_fk
  foreign key ("createdByUserId")
  references public.users(id)
  on delete restrict;

alter table public.audit_logs
  add constraint audit_logs_actor_user_fk
  foreign key ("actorUserId")
  references public.users(id)
  on delete restrict;
