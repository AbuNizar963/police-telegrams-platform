-- Give each organization a separately configurable prefix for telegrams it
-- receives. Preserve the current appearance by initializing it from the
-- organization's existing (outgoing) prefix.
ALTER TABLE public.department_settings
  ADD COLUMN IF NOT EXISTS "incomingSerialPrefix" varchar(24) NOT NULL DEFAULT 'POL';

UPDATE public.department_settings
SET "incomingSerialPrefix" = COALESCE(NULLIF("serialPrefix", ''), 'POL')
WHERE "incomingSerialPrefix" = 'POL';

COMMENT ON COLUMN public.department_settings."serialPrefix" IS
  'Prefix used for outgoing telegram serials issued by this organization';

COMMENT ON COLUMN public.department_settings."incomingSerialPrefix" IS
  'Prefix used for incoming telegram serials received by this organization';
