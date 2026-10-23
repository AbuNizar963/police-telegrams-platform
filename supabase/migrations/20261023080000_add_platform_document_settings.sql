-- Platform-wide document appearance settings. The service-role API is the
-- only supported access path; owner checks and audit logging live in the app.
CREATE TABLE IF NOT EXISTS public.platform_document_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "showMinistryWatermarkText" boolean NOT NULL DEFAULT true,
  "watermarkOpacityPercent" integer NOT NULL DEFAULT 16
    CHECK ("watermarkOpacityPercent" BETWEEN 0 AND 60),
  "headerDividerColor" varchar(7) NOT NULL DEFAULT '#b49a55'
    CHECK ("headerDividerColor" ~ '^#[0-9A-Fa-f]{6}$'),
  "showVerificationQr" boolean NOT NULL DEFAULT true,
  "updatedByUserId" integer REFERENCES public.users(id) ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_document_settings IS
  'Singleton document branding and print options controlled by the platform owner.';
COMMENT ON COLUMN public.platform_document_settings."showVerificationQr" IS
  'Platform-wide visibility of verification QR codes in exported telegram documents; verification links remain active.';
COMMENT ON COLUMN public.platform_document_settings."watermarkOpacityPercent" IS
  'Opacity percentage shared by the ministry text and organization-logo watermark layers; range 0 to 60.';

-- Preserve the most restrictive previous per-organization QR choice when
-- consolidating to one platform-wide setting: any organization that had opted
-- out keeps QR hidden until the owner explicitly changes this global setting.
INSERT INTO public.platform_document_settings (id, "showVerificationQr")
SELECT 1, COALESCE(bool_and("showVerificationQr"), true)
FROM public.department_settings
WHERE "organizationId" IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_document_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_document_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_document_settings TO service_role;
