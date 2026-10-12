-- Allow each organization to choose 12-hour or 24-hour display time.
ALTER TABLE public.department_settings
  ADD COLUMN IF NOT EXISTS "timeFormat" varchar(2) NOT NULL DEFAULT '24';

UPDATE public.department_settings
SET "timeFormat" = '24'
WHERE "timeFormat" IS NULL OR "timeFormat" NOT IN ('12', '24');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.department_settings'::regclass
      AND conname = 'department_settings_time_format_check'
  ) THEN
    ALTER TABLE public.department_settings
      ADD CONSTRAINT department_settings_time_format_check
      CHECK ("timeFormat" IN ('12', '24'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.department_settings."timeFormat" IS
  'Display time format: 12 uses Arabic ص/م markers; 24 uses 24-hour time';
