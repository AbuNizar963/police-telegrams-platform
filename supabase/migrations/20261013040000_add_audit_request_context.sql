-- Capture request context for security investigations without storing secrets.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS "ipAddress" varchar(80),
  ADD COLUMN IF NOT EXISTS "userAgent" varchar(512),
  ADD COLUMN IF NOT EXISTS "deviceType" varchar(16) NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS audit_ip_created_at_idx
  ON public.audit_logs ("ipAddress", "createdAt");

COMMENT ON COLUMN public.audit_logs."ipAddress" IS 'Client IP or trusted proxy IP, truncated to 80 characters';
COMMENT ON COLUMN public.audit_logs."userAgent" IS 'Browser user-agent, truncated to 512 characters';
COMMENT ON COLUMN public.audit_logs."deviceType" IS 'Coarse device category: mobile, tablet, desktop, or unknown';
