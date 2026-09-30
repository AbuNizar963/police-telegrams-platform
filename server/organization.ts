import type {
  Organization,
  OrganizationMembership,
  OrganizationMemberRole,
} from "../drizzle/schema";
import { getSupabaseAdmin } from "./_core/supabase";

function throwIfError(
  error: { message: string } | null,
  context: string,
): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    ...(row as unknown as Organization),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

function mapMembership(row: Record<string, unknown>): OrganizationMembership {
  return {
    ...(row as unknown as OrganizationMembership),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

export async function getUserOrganizationMembership(
  userId: number,
): Promise<OrganizationMembership | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_memberships")
    .select("*")
    .eq("userId", userId)
    .eq("isActive", true)
    .order("createdAt", { ascending: true })
    .limit(1)
    .maybeSingle();

  throwIfError(error, "Failed to load organization membership");
  return data ? mapMembership(data as Record<string, unknown>) : null;
}

export async function getOrganizationById(
  organizationId: string,
): Promise<Organization | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .eq("isActive", true)
    .maybeSingle();

  throwIfError(error, "Failed to load organization");
  return data ? mapOrganization(data as Record<string, unknown>) : null;
}

export async function listOrganizationsForUser(
  userId: number,
): Promise<Organization[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_memberships")
    .select("organizations(*)")
    .eq("userId", userId)
    .eq("isActive", true)
    .order("createdAt", { ascending: true });

  throwIfError(error, "Failed to list organizations");

  return (data ?? [])
    .map(row => {
      const organization = row.organizations;
      return organization && typeof organization === "object"
        ? mapOrganization(organization as Record<string, unknown>)
        : null;
    })
    .filter((organization): organization is Organization => Boolean(organization));
}

export async function createOrganization(input: {
  parentOrganizationId?: string | null;
  code: string;
  name: string;
  type: Organization["type"];
}): Promise<Organization> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .insert({
      parentOrganizationId: input.parentOrganizationId ?? null,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      type: input.type,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to create organization");
  return mapOrganization(data as Record<string, unknown>);
}

export async function addOrganizationMembership(input: {
  organizationId: string;
  userId: number;
  role: OrganizationMemberRole;
}): Promise<OrganizationMembership> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_memberships")
    .upsert(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        isActive: true,
      },
      { onConflict: "organizationId,userId" },
    )
    .select("*")
    .single();

  throwIfError(error, "Failed to assign organization membership");
  return mapMembership(data as Record<string, unknown>);
}
