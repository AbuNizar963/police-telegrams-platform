-- Repair owner rows created before set_owner_workplace synchronized users.organizationId.
UPDATE public.users AS owner
SET "organizationId" = active."organizationId",
    "updatedAt" = now()
FROM (
  SELECT m."userId", m."organizationId"
  FROM public.organization_memberships AS m
  JOIN public.users AS candidate ON candidate.id = m."userId"
  WHERE candidate."isPlatformOwner" = true
    AND m."isActive" = true
  ORDER BY m."createdAt" DESC
  LIMIT 1
) AS active
WHERE owner.id = active."userId"
  AND owner."organizationId" IS DISTINCT FROM active."organizationId";
