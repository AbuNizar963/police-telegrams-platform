# Supabase integration

This directory contains the first PostgreSQL migration, RLS policies, private Storage bucket rules, and local seed data for the police telegram platform.

## Important status

The application still uses the current Manus authentication and MySQL-compatible database adapter until a Supabase project is created and its credentials are configured. This migration is intentionally prepared first so the switch can be tested without interrupting the running application.

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
