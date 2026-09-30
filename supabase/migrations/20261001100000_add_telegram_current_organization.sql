-- Track the current destination of a telegram separately from its origin organization.

alter table public.telegrams
  add column "currentOrganizationId" uuid;

update public.telegrams
set "currentOrganizationId" = "organizationId"
where "currentOrganizationId" is null;

alter table public.telegrams
  alter column "currentOrganizationId" set not null;

alter table public.telegrams
  add constraint telegrams_current_organization_fk
  foreign key ("currentOrganizationId")
  references public.organizations(id)
  on delete restrict;

create index telegrams_current_organization_idx
  on public.telegrams ("currentOrganizationId");

comment on column public.telegrams."organizationId" is
  'Origin/owning organization that created the telegram.';

comment on column public.telegrams."currentOrganizationId" is
  'Organization currently responsible for the telegram after routing.';
