# Supabase integration

This directory contains the first PostgreSQL migration, RLS policies, private Storage bucket rules, and local seed data for the police telegram platform.

## Important status

The application now supports Supabase Auth as its primary authentication provider when the Supabase environment variables are configured. Without those variables, the existing Manus authentication remains available as a compatibility fallback. The current application data layer still uses the MySQL-compatible adapter until the PostgreSQL migration is activated.

## Local workflow

```bash
supabase start
supabase db reset
supabase test db
```

## Production workflow

After creating a Supabase project under the owner's account:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Do not change the production schema directly from the Dashboard after migrations are adopted. Add a new migration file, test it locally, commit it, and then push it.

## Secrets

Never commit `SUPABASE_SECRET_KEY`, database passwords, access tokens, or real officer data. Use the hosting provider's secret manager for server-only values. The publishable key is safe to expose only when all exposed tables and Storage objects have correct RLS policies.

## Auth activation

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in the deployment environment. Email/password is the supported login flow; do not send users to `/auth/v1/authorize?provider=...` unless that provider is explicitly enabled and configured in Supabase. See `docs/supabase-auth.md` for the complete activation checklist.
