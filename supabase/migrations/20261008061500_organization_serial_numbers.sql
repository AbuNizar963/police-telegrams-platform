ALTER TABLE public.department_settings
  ADD COLUMN IF NOT EXISTS "nextOutgoingSerial" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "nextIncomingSerial" integer NOT NULL DEFAULT 1;

ALTER TABLE public.telegrams
  ADD COLUMN IF NOT EXISTS "organizationSerialNumber" integer,
  ADD COLUMN IF NOT EXISTS "organizationSerialCode" varchar(48);

ALTER TABLE public.telegram_routes
  ADD COLUMN IF NOT EXISTS "incomingSerialNumber" integer,
  ADD COLUMN IF NOT EXISTS "incomingSerialCode" varchar(48);

CREATE INDEX IF NOT EXISTS telegrams_org_serial_idx
  ON public.telegrams ("organizationId", "organizationSerialNumber");
CREATE INDEX IF NOT EXISTS telegram_routes_incoming_serial_idx
  ON public.telegram_routes ("toOrganizationId", "incomingSerialNumber");

CREATE OR REPLACE FUNCTION public.allocate_organization_serial(
  p_organization_id uuid,
  p_direction text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_row public.department_settings%rowtype;
  allocated integer;
BEGIN
  IF p_direction NOT IN ('outgoing', 'incoming') THEN
    RAISE EXCEPTION 'Invalid serial direction';
  END IF;

  SELECT * INTO settings_row
  FROM public.department_settings
  WHERE "organizationId" = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization settings not found';
  END IF;

  IF p_direction = 'outgoing' THEN
    allocated := settings_row."nextOutgoingSerial";
    UPDATE public.department_settings
    SET "nextOutgoingSerial" = allocated + 1,
        "updatedAt" = now()
    WHERE id = settings_row.id;
  ELSE
    allocated := settings_row."nextIncomingSerial";
    UPDATE public.department_settings
    SET "nextIncomingSerial" = allocated + 1,
        "updatedAt" = now()
    WHERE id = settings_row.id;
  END IF;

  RETURN allocated;
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_organization_serial(uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_organization_serial(uuid, text)
  TO service_role;
