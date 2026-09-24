# Project architecture

## Application layers

- `client/src/features/` contains user-facing product features. The operations dashboard lives under `features/operations`.
- `client/src/components/` contains reusable visual components and the shared UI kit.
- `client/src/pages/` contains route compatibility wrappers and route-level composition.
- `server/api/` contains the tRPC application router and API composition.
- `server/data/` contains database access helpers.
- `server/_core/` contains framework infrastructure such as auth, cookies, Vite, storage, and integrations.
- `drizzle/` contains the canonical relational schema and generated migrations.
- `supabase/` contains the separate PostgreSQL migration foundation for the future managed-database transition.
- `shared/` contains types and constants shared by browser and server code.
- `api/` contains the Vercel Function entrypoint.

## Compatibility rule

`server/routers.ts`, `server/db.ts`, and `client/src/pages/Home.tsx` remain thin compatibility entrypoints. New code should import feature modules directly, while existing imports can continue working during the gradual refactor.

## Recommended feature workflow

When adding a feature, keep its page and feature-specific components under `client/src/features/<feature-name>/`, its server procedures under `server/api/` or a dedicated server module, and its database helpers under `server/data/`. Add tests beside the server module and update the relevant route or compatibility wrapper only after the feature compiles.
