import { describe, expect, it } from "vitest";
import { resolveTelegramExportLogo } from "./resolveTelegramExportLogo";

describe("resolveTelegramExportLogo", () => {
  it("prefers the logo belonging to the telegram organization", () => {
    expect(
      resolveTelegramExportLogo({
        telegramOrganizationId: "org-b",
        organizationLogo: {
          organizationId: "org-b",
          logoUrl: " /api/storage/department/logos/org-b/logo.png ",
        },
        settingsOrganizationId: "org-a",
        settingsLogoUrl: "/api/storage/department/logos/org-a/logo.png",
      }),
    ).toBe("/api/storage/department/logos/org-b/logo.png");
  });

  it("uses account settings only when their organization matches the telegram", () => {
    expect(
      resolveTelegramExportLogo({
        telegramOrganizationId: "org-a",
        organizationLogo: {
          organizationId: "org-a",
          logoUrl: null,
        },
        settingsOrganizationId: "org-a",
        settingsLogoUrl: " /api/storage/department/logos/org-a/legacy.png ",
      }),
    ).toBe("/api/storage/department/logos/org-a/legacy.png");
  });

  it("never borrows a logo from another organization", () => {
    expect(
      resolveTelegramExportLogo({
        telegramOrganizationId: "org-b",
        organizationLogo: {
          organizationId: "org-a",
          logoUrl: "/api/storage/department/logos/org-a/logo.png",
        },
        settingsOrganizationId: "org-a",
        settingsLogoUrl: "/api/storage/department/logos/org-a/logo.png",
      }),
    ).toBeNull();
  });

  it("returns null when the telegram has no organization", () => {
    expect(
      resolveTelegramExportLogo({
        telegramOrganizationId: null,
        settingsOrganizationId: "org-a",
        settingsLogoUrl: "/api/storage/department/logos/org-a/logo.png",
      }),
    ).toBeNull();
  });
});
