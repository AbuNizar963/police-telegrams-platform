import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationById: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  isPlatformOwner: vi.fn(),
}));

vi.mock("./organization", () => ({
  getOrganizationById: mocks.getOrganizationById,
  getUserOrganizationMembership: mocks.getUserOrganizationMembership,
}));

vi.mock("./ownerAccess", () => ({
  isPlatformOwner: mocks.isPlatformOwner,
}));

import { canAccessTelegramScope } from "./telegramAccess";

describe("canAccessTelegramScope", () => {
  const user = { id: 42, role: "user", username: "unit-account" };
  const telegram = {
    organizationId: "org-a",
    currentOrganizationId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPlatformOwner.mockReturnValue(false);
    mocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "org-a",
      isActive: true,
    });
    mocks.getOrganizationById.mockResolvedValue({
      id: "org-a",
      isActive: true,
    });
  });

  it("allows access to a telegram in the user's active organization", async () => {
    await expect(canAccessTelegramScope(user, telegram)).resolves.toBe(true);
  });

  it("allows access when the user's organization is the telegram's current organization", async () => {
    await expect(
      canAccessTelegramScope(user, {
        organizationId: "org-origin",
        currentOrganizationId: "org-a",
      })
    ).resolves.toBe(true);
  });

  it("denies access when the membership is inactive", async () => {
    mocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "org-a",
      isActive: false,
    });

    await expect(canAccessTelegramScope(user, telegram)).resolves.toBe(false);
    expect(mocks.getOrganizationById).not.toHaveBeenCalled();
  });

  it("denies access when the organization is missing or inactive", async () => {
    mocks.getOrganizationById.mockResolvedValue(null);

    await expect(canAccessTelegramScope(user, telegram)).resolves.toBe(false);
  });

  it("keeps the explicitly global admin scope without requiring membership", async () => {
    await expect(
      canAccessTelegramScope(
        { id: 7, role: "admin" },
        {
          organizationId: "org-other",
          currentOrganizationId: null,
        }
      )
    ).resolves.toBe(true);
    expect(mocks.getUserOrganizationMembership).not.toHaveBeenCalled();
  });
});
