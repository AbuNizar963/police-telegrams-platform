/**
 * Strict organization hierarchy:
 * central -> governorate -> (rural police department | city department)
 * -> station -> unit.
 * Legacy `region` and `command` levels are retained as display types only and
 * cannot be used to create a new path in the approved hierarchy.
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
