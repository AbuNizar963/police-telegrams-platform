-- Syrian police hierarchy: central -> governorate -> region -> police department -> station.
DO $$
BEGIN
  ALTER TYPE public.organization_type ADD VALUE IF NOT EXISTS 'governorate';
  ALTER TYPE public.organization_type ADD VALUE IF NOT EXISTS 'region';
  ALTER TYPE public.organization_type ADD VALUE IF NOT EXISTS 'police_department';
END $$;
UPDATE public.organizations
   SET type = 'central', "updatedAt" = now()
 WHERE code = 'LEGACY-PRIMARY';

ALTER TABLE public.telegram_routes
  ADD COLUMN IF NOT EXISTS "approvalStatus" varchar(24) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS "approvedByUserId" integer REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "approvalReason" text;
ALTER TABLE public.telegram_routes
  DROP CONSTRAINT IF EXISTS telegram_routes_approval_status_check;
ALTER TABLE public.telegram_routes
  ADD CONSTRAINT telegram_routes_approval_status_check
  CHECK ("approvalStatus" IN ('not_required', 'pending', 'approved', 'rejected'));
CREATE INDEX IF NOT EXISTS telegram_routes_approval_idx
  ON public.telegram_routes ("approvalStatus", "toOrganizationId", "createdAt");

CREATE OR REPLACE FUNCTION public.route_telegram(
  p_telegram_id integer,
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_forwarded_by_user_id integer,
  p_note text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  telegram_row public.telegrams%rowtype;
  source_org public.organizations%rowtype;
  target_org public.organizations%rowtype;
  route_row public.telegram_routes%rowtype;
  source_governorate uuid;
  target_governorate uuid;
  requires_approval boolean := false;
BEGIN
  IF p_from_organization_id = p_to_organization_id THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Source and destination organizations must differ';
  END IF;

  SELECT * INTO telegram_row FROM public.telegrams WHERE id = p_telegram_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Telegram not found';
  END IF;
  IF telegram_row."currentOrganizationId" <> p_from_organization_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Telegram is not currently assigned to the source organization';
  END IF;

  SELECT * INTO source_org FROM public.organizations
   WHERE id = p_from_organization_id AND "isActive" = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Source organization is inactive or unavailable';
  END IF;
  SELECT * INTO target_org FROM public.organizations
   WHERE id = p_to_organization_id AND "isActive" = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Destination organization is inactive or unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships membership
     WHERE membership."organizationId" = p_from_organization_id
       AND membership."userId" = p_forwarded_by_user_id
       AND membership."isActive" = true
       AND membership.role IN ('system_admin', 'organization_admin', 'dispatcher', 'reviewer')
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'User is not authorized to route telegrams from this organization';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, "parentOrganizationId", type FROM public.organizations WHERE id = source_org.id
    UNION ALL
    SELECT parent.id, parent."parentOrganizationId", parent.type
      FROM public.organizations parent JOIN ancestors child ON parent.id = child."parentOrganizationId"
  )
  SELECT id INTO source_governorate FROM ancestors WHERE type = 'governorate' LIMIT 1;

  WITH RECURSIVE ancestors AS (
    SELECT id, "parentOrganizationId", type FROM public.organizations WHERE id = target_org.id
    UNION ALL
    SELECT parent.id, parent."parentOrganizationId", parent.type
      FROM public.organizations parent JOIN ancestors child ON parent.id = child."parentOrganizationId"
  )
  SELECT id INTO target_governorate FROM ancestors WHERE type = 'governorate' LIMIT 1;

  IF target_org.type = 'governorate' AND source_org."parentOrganizationId" = target_org.id THEN
    requires_approval := false;
  ELSIF source_org.type = 'governorate' AND target_org."parentOrganizationId" = source_org.id THEN
    requires_approval := false;
  ELSIF target_org."parentOrganizationId" = source_org.id OR source_org."parentOrganizationId" = target_org.id THEN
    requires_approval := false;
  ELSIF source_governorate IS NOT NULL AND target_governorate IS NOT NULL THEN
    requires_approval := true;
  ELSE
    RAISE EXCEPTION USING errcode = '42501', message = 'Telegram routing must follow the police hierarchy';
  END IF;

  INSERT INTO public.telegram_routes (
    "telegramId", "fromOrganizationId", "toOrganizationId", "forwardedByUserId",
    status, "approvalStatus", note
  ) VALUES (
    p_telegram_id, p_from_organization_id, p_to_organization_id, p_forwarded_by_user_id,
    'sent', CASE WHEN requires_approval THEN 'pending' ELSE 'not_required' END,
    nullif(trim(p_note), '')
  ) RETURNING * INTO route_row;

  IF NOT requires_approval THEN
    UPDATE public.telegrams
       SET "currentOrganizationId" = p_to_organization_id, updatedAt = now()
     WHERE id = p_telegram_id;
  END IF;

  RETURN route_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_telegram_route(
  p_route_id integer,
  p_approver_user_id integer,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route_row public.telegram_routes%rowtype;
  telegram_row public.telegrams%rowtype;
  approver_org uuid;
  required_governorate uuid;
BEGIN
  SELECT * INTO route_row FROM public.telegram_routes WHERE id = p_route_id FOR UPDATE;
  IF NOT FOUND OR route_row."approvalStatus" <> 'pending' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Route is not awaiting approval';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, "parentOrganizationId", type FROM public.organizations WHERE id = route_row."fromOrganizationId"
    UNION ALL
    SELECT parent.id, parent."parentOrganizationId", parent.type
      FROM public.organizations parent JOIN ancestors child ON parent.id = child."parentOrganizationId"
  )
  SELECT id INTO required_governorate FROM ancestors WHERE type = 'governorate' LIMIT 1;

  SELECT "organizationId" INTO approver_org
    FROM public.organization_memberships
   WHERE "userId" = p_approver_user_id AND "isActive" = true
     AND role IN ('system_admin', 'organization_admin', 'reviewer')
   ORDER BY "createdAt" LIMIT 1;
  IF approver_org IS NULL OR (approver_org <> required_governorate AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_approver_user_id AND role = 'admin'
  )) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Only the governorate command may approve this route';
  END IF;

  UPDATE public.telegram_routes
     SET "approvalStatus" = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
         "approvedByUserId" = p_approver_user_id,
         "approvedAt" = now(),
         "approvalReason" = nullif(trim(p_reason), '')
   WHERE id = p_route_id
   RETURNING * INTO route_row;

  IF p_approved THEN
    UPDATE public.telegrams
       SET "currentOrganizationId" = route_row."toOrganizationId", updatedAt = now()
     WHERE id = route_row."telegramId";
  END IF;
  RETURN route_row;
END;
$$;

REVOKE ALL ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text) TO service_role;
