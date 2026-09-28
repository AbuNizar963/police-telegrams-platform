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

On Vercel, configure both the `SUPABASE_*` and `VITE_SUPABASE_*` names. The server accepts the Vite-prefixed URL as a fallback because Vercel build variables are commonly supplied with the `VITE_` prefix.

The publishable/anon key is safe for the browser only when the database and Storage Row Level Security policies are enabled. Never expose `SUPABASE_SECRET_KEY`, a service-role key, database passwords, or JWT signing secrets in the client or repository.

Set `OWNER_OPEN_ID` to the Supabase Auth user UUID that should receive the initial `admin` role in the current MySQL-compatible application database. The server verifies the Supabase access token through `auth.getUser`, then upserts the authenticated identity into the existing `users` table using the Supabase user UUID as `openId`.

## Supabase Dashboard settings

1. In **Authentication → Providers**, leave **Email** enabled for email/password sign-in and enable **Google** if Google login is required.
2. In the Google provider settings, enter the Google Client ID and Client Secret, and add Supabase's callback URL shown in the dashboard to the Google Cloud OAuth client.
3. In **Authentication → URL Configuration**, set the production site URL to the Vercel site and add `https://YOUR-VERCEL-DOMAIN.vercel.app/` plus local and preview origins if they are used.
4. The application sends Google users back to the current site root with `redirectTo: window.location.origin + "/"`; that exact origin must be allow-listed in Supabase.
5. Apply the SQL migration in `supabase/migrations` only after reviewing the target Supabase database and its RLS policies.

## Login behavior

The Arabic login screen supports email/password sign-in and account creation. Supabase persists the session in the browser, refreshes access tokens, and sends the current bearer token to the tRPC server. The server rejects requests without a valid Supabase token when Supabase variables are configured.
