import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserOrganizationMembership: vi.fn(),
  listAllOrganizations: vi.fn(),
}));

vi.mock("./organization", () => ({
  getUserOrganizationMembership: mocks.getUserOrganizationMembership,
  listAllOrganizations: mocks.listAllOrganizations,
}));

import { getManagedOrganizationIds } from "./organizationScope";

describe("getManagedOrganizationIds", () => {
  const user = { id: 7, role: "user" };
  const organizations = [
    { id: "root", parentOrganizationId: null, isActive: true },
    { id: "active-child", parentOrganizationId: "root", isActive: true },
    { id: "disabled-child", parentOrganizationId: "root", isActive: false },
    {
      id: "active-grandchild-under-disabled",
      parentOrganizationId: "disabled-child",
      isActive: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "root",
      role: "regional_admin",
      isActive: true,
    });
    mocks.listAllOrganizations.mockResolvedValue(organizations);
  });

  it("excludes disabled organizations and their descendants from read scopes", async () => {
    await expect(
      getManagedOrganizationIds(user, { activeOnly: true })
    ).resolves.toEqual(["root", "active-child"]);
  });

  it("preserves inactive descendant scope for organization recovery management", async () => {
    await expect(getManagedOrganizationIds(user)).resolves.toEqual([
      "root",
      "active-child",
      "disabled-child",
      "active-grandchild-under-disabled",
    ]);
  });
});
