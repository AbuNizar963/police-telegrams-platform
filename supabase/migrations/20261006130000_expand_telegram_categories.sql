-- Expand police telegram categories while retaining all existing enum values.
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'intelligence';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'emergency';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'public_order';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'personnel';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'logistics';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'training';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'community';
ALTER TYPE public.telegram_category ADD VALUE IF NOT EXISTS 'other';
