-- In-app notification inbox for route requests, approvals, rejections, and incoming telegrams.
CREATE TABLE IF NOT EXISTS public.notifications (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  "organizationId" uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  type varchar(64) NOT NULL,
  title varchar(255) NOT NULL,
  body text NOT NULL,
  "telegramId" integer REFERENCES public.telegrams(id) ON DELETE RESTRICT,
  "routeId" integer REFERENCES public.telegram_routes(id) ON DELETE RESTRICT,
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications ("userId", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS notifications_organization_idx
  ON public.notifications ("organizationId", "createdAt");
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
COMMENT ON TABLE public.notifications IS
  'Immutable event inbox; readAt changes only presentation state, never the event body.';
