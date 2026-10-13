-- Scoped operational roles for regional and organization management.
-- Existing memberships remain unchanged; these values are opt-in assignments.
ALTER TYPE public.organization_member_role
  ADD VALUE IF NOT EXISTS 'regional_admin';

ALTER TYPE public.organization_member_role
  ADD VALUE IF NOT EXISTS 'organization_supervisor';
