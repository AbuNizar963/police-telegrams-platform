# Supabase Auth activation

The application supports Supabase Auth as its primary authentication provider. When the Supabase variables are absent, the existing Manus OAuth flow remains available as a compatibility fallback.

## Required variables

Configure these in the local environment and in the deployment provider's server and build settings:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

The publishable/anon key is safe for the browser only when the database and Storage Row Level Security policies are enabled. Never expose `SUPABASE_SECRET_KEY`, a service-role key, database passwords, or JWT signing secrets in the client or repository.

Set `OWNER_OPEN_ID` to the Supabase Auth user UUID that should receive the initial `admin` role in the current MySQL-compatible application database. The server verifies the Supabase access token through `auth.getUser`, then upserts the authenticated identity into the existing `users` table using the Supabase user UUID as `openId`.

## Supabase Dashboard settings

1. In **Authentication → Providers**, leave **Email** enabled for email/password sign-in.
2. In **Authentication → URL Configuration**, set the production site URL and add the local and preview callback origins if they are used.
3. Do not enable Google, GitHub, or another OAuth provider unless you also configure its client credentials and redirect URL. The application intentionally uses email/password to avoid calling a disabled provider.
4. Apply the SQL migration in `supabase/migrations` only after reviewing the target Supabase database and its RLS policies.

## Login behavior

The Arabic login screen supports email/password sign-in and account creation. Supabase persists the session in the browser, refreshes access tokens, and sends the current bearer token to the tRPC server. The server rejects requests without a valid Supabase token when Supabase variables are configured.
