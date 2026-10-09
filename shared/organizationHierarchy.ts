/**
 * Default organization hierarchy. The platform owner may explicitly override a
 * parent relationship for an individual organization; server validation still
 * rejects self-parenting and cycles.
 */
export const organizationParentTypes = {
  central: [],
  governorate: ["central"],
  region: [],
  police_department: ["governorate"],
  station: ["police_department", "department"],
  command: [],
  department: ["governorate"],
  unit: ["station"],
} as const;

export type OrganizationHierarchyType = keyof typeof organizationParentTypes;

export type OrganizationParentLink = {
  id: string;
  parentOrganizationId: string | null;
};

/**
 * Returns selected organizations together with every known ancestor needed to
 * present them in a drill-down tree. Broken links and cycles are tolerated so
 * that a malformed legacy record cannot lock the picker UI in a loop.
 */
export function getOrganizationTreeVisibleIds(
  organizations: readonly OrganizationParentLink[],
  selectedIds: Iterable<string>
): Set<string> {
  const parentById = new Map(
    organizations.map(organization => [
      organization.id,
      organization.parentOrganizationId,
    ])
  );
  const visible = new Set<string>();

  for (const selectedId of Array.from(selectedIds)) {
    let currentId: string | null = selectedId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      if (!parentById.has(currentId)) break;
      visible.add(currentId);
      visited.add(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }

  return visible;
}

export function canOrganizationHaveParent(
  childType: string,
  parentType: string
): boolean {
  const allowedParents = organizationParentTypes[
    childType as OrganizationHierarchyType
  ] as readonly string[] | undefined;
  return allowedParents?.includes(parentType) ?? false;
}

export function getAllowedOrganizationChildTypes(
  parentType: string
): OrganizationHierarchyType[] {
  return (
    Object.entries(organizationParentTypes) as [
      OrganizationHierarchyType,
      readonly string[],
    ][]
  )
    .filter(([, allowedParents]) => allowedParents.includes(parentType))
    .map(([childType]) => childType);
}

/**
 * Returns true if assigning `parentOrganizationId` to `organizationId` would
 * make a cycle. A null child ID is used for a not-yet-created organization and
 * still detects a pre-existing cycle in the proposed parent's ancestry.
 */
export function wouldCreateOrganizationCycle(
  organizations: readonly OrganizationParentLink[],
  organizationId: string | null,
  parentOrganizationId: string
): boolean {
  if (organizationId !== null && organizationId === parentOrganizationId) {
    return true;
  }

  const parentById = new Map(
    organizations.map(organization => [
      organization.id,
      organization.parentOrganizationId,
    ])
  );
  const visited = new Set<string>();
  let currentId: string | null = parentOrganizationId;

  while (currentId !== null) {
    if (currentId === organizationId || visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return false;
}
