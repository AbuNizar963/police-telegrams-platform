-- This is a trigger-only SECURITY DEFINER function. The trigger can invoke it
-- without granting direct RPC execution to application roles.
REVOKE ALL ON FUNCTION public.enforce_organization_parent_acyclic()
  FROM PUBLIC, anon, authenticated, service_role;
