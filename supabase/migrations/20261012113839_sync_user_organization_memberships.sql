-- Keep every non-owner account's active membership aligned with its canonical
-- users.organizationId. Telegram visibility and audit history are scoped by this
-- active membership, so stale legacy memberships must not select another entity.

UPDATE public.organization_memberships AS membership
SET "isActive" = false,
    "updatedAt" = now()
FROM public.users AS account
WHERE membership."userId" = account.id
  AND account."isPlatformOwner" = false
  AND membership."isActive" = true
  AND membership."organizationId" <> account."organizationId";

INSERT INTO public.organization_memberships (
  "organizationId",
  "userId",
  role,
  "isActive"
)
SELECT
  account."organizationId",
  account.id,
  'dispatcher'::public.organization_member_role,
  true
FROM public.users AS account
JOIN public.organizations AS organization
  ON organization.id = account."organizationId"
  AND organization."isActive" = true
WHERE account."isPlatformOwner" = false
ON CONFLICT ("organizationId", "userId") DO UPDATE
SET "isActive" = true,
    "updatedAt" = now();

COMMENT ON TABLE public.organization_memberships IS
  'User membership and organization-scoped role assignments. Non-owner active membership is synchronized with users.organizationId.';
