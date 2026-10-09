# Supabase deployment

Supabase is the independent authentication, PostgreSQL, and private file-storage backend for this project.

## 1. Create the project

Create a Supabase project, then apply the committed migration:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates the application tables, atomic serial-number allocator, restricted database permissions, and the private `telegram-files` Storage bucket.

## 2. Configure authentication

In Supabase Authentication, enable the OAuth provider you want to use (Google by default). Add your Vercel production URL and preview URLs to the allowed redirect URLs.

The browser only receives the publishable/anon key. The service-role key is server-only and must be stored in Vercel Environment Variables.

## 3. Configure Vercel

Copy the variables from `.env.example` into Vercel. Required for the core application:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`

Maps require `VITE_GOOGLE_MAPS_API_KEY`.

Never commit service-role keys, OAuth client secrets, database passwords, officer data, or OpenAI API keys.
