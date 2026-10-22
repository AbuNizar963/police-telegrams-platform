-- Keep global telegram serial allocation monotonic when settings drift behind existing rows.
-- Locking the legacy settings row serializes allocators; the unique serial constraint
-- remains the final database-level safeguard against duplicate telegram numbers.
CREATE OR REPLACE FUNCTION public.allocate_serial_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $allocate_serial_number$
DECLARE
  allocated bigint;
  configured_start bigint;
  configured_next bigint;
  existing_max bigint;
BEGIN
  INSERT INTO public.department_settings ("configKey")
  VALUES ('primary')
  ON CONFLICT ("configKey") WHERE "organizationId" IS NULL DO NOTHING;

  SELECT "serialStart", "nextSerial"
    INTO configured_start, configured_next
    FROM public.department_settings
   WHERE "configKey" = 'primary'
   FOR UPDATE;

  SELECT COALESCE(MAX("serialNumber")::bigint, 0)
    INTO existing_max
    FROM public.telegrams;

  allocated := GREATEST(
    COALESCE(configured_start, 1),
    COALESCE(configured_next, 1),
    existing_max + 1,
    1
  );

  IF allocated >= 2147483647 THEN
    RAISE EXCEPTION 'Telegram serial number limit reached'
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.department_settings
     SET "nextSerial" = (allocated + 1)::integer,
         "updatedAt" = now()
   WHERE "configKey" = 'primary';

  RETURN allocated::integer;
END;
$allocate_serial_number$;
