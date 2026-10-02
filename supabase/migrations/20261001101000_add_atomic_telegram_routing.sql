-- Atomically route a telegram to a directly connected organization.
-- The database validates the sender membership and updates the current destination
-- in the same transaction so a telegram cannot be partially routed.

create or replace function public.route_telegram(
  p_telegram_id integer,
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_forwarded_by_user_id integer,
  p_note text default null
)
returns public.telegram_routes
language plpgsql
security definer
set search_path = public
as $$
declare
  telegram_row public.telegrams%rowtype;
  source_org public.organizations%rowtype;
  target_org public.organizations%rowtype;
  route_row public.telegram_routes%rowtype;
begin
  if p_from_organization_id = p_to_organization_id then
    raise exception using
      errcode = '22023',
      message = 'Source and destination organizations must differ';
  end if;

  select *
    into telegram_row
    from public.telegrams
   where id = p_telegram_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Telegram not found';
  end if;

  if telegram_row."currentOrganizationId" <> p_from_organization_id then
    raise exception using
      errcode = '42501',
      message = 'Telegram is not currently assigned to the source organization';
  end if;

  select *
    into source_org
    from public.organizations
   where id = p_from_organization_id
     and "isActive" = true;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Source organization is inactive or unavailable';
  end if;

  select *
    into target_org
    from public.organizations
   where id = p_to_organization_id
     and "isActive" = true;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Destination organization is inactive or unavailable';
  end if;

  if not (
    target_org."parentOrganizationId" = source_org.id
    or source_org."parentOrganizationId" = target_org.id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Telegram routing is limited to directly connected organizations';
  end if;

  if not exists (
    select 1
      from public.organization_memberships membership
     where membership."organizationId" = p_from_organization_id
       and membership."userId" = p_forwarded_by_user_id
       and membership."isActive" = true
       and membership.role in (
         'system_admin',
         'organization_admin',
         'dispatcher',
         'reviewer'
       )
  ) then
    raise exception using
      errcode = '42501',
      message = 'User is not authorized to route telegrams from this organization';
  end if;

  insert into public.telegram_routes (
    "telegramId",
    "fromOrganizationId",
    "toOrganizationId",
    "forwardedByUserId",
    status,
    note
  )
  values (
    p_telegram_id,
    p_from_organization_id,
    p_to_organization_id,
    p_forwarded_by_user_id,
    'sent',
    nullif(trim(p_note), '')
  )
  returning * into route_row;

  update public.telegrams
     set "currentOrganizationId" = p_to_organization_id,
         updatedAt = now()
   where id = p_telegram_id;

  return route_row;
end;
$$;

revoke all on function public.route_telegram(integer, uuid, uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.route_telegram(integer, uuid, uuid, integer, text)
  to service_role;
