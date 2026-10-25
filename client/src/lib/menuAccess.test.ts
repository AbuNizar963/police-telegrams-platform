import { describe, expect, it } from "vitest";
import {
  getManagementMenuHeading,
  hasOrganizationSettingsEditAccess,
  hasOrganizationSettingsMenuAccess,
  hasOrganizationStructureEditAccess,
  hasUserManagementMenuAccess,
} from "./menuAccess";

describe("management menu access mirrors server procedures", () => {
  it("allows organization settings for platform owners and organization admins", () => {
    expect(
      hasOrganizationSettingsMenuAccess({
        organizationRole: "system_admin",
        isPlatformOwner: false,
      })
    ).toBe(true);
    expect(
      hasOrganizationSettingsMenuAccess({
        organizationRole: "organization_admin",
        isPlatformOwner: false,
      })
    ).toBe(true);
    expect(
      hasOrganizationSettingsMenuAccess({
        organizationRole: null,
        isPlatformOwner: true,
      })
    ).toBe(true);
  });

  it("does not infer organization settings access from an admin account alone", () => {
    expect(
      hasOrganizationSettingsMenuAccess({
        organizationRole: null,
        isPlatformOwner: false,
      })
    ).toBe(false);
  });

  it("denies organization settings to report-only and scoped non-admin roles", () => {
    for (const organizationRole of [
      "regional_admin",
      "organization_supervisor",
      "reviewer",
      "reader",
      "auditor",
      "dispatcher",
    ]) {
      expect(
        hasOrganizationSettingsMenuAccess({
          organizationRole,
          isPlatformOwner: false,
        })
      ).toBe(false);
    }
  });

  it("allows user management for global admins, owners, and scoped managers", () => {
    expect(
      hasUserManagementMenuAccess({
        accountRole: "admin",
        organizationRole: null,
        isPlatformOwner: false,
      })
    ).toBe(true);
    expect(
      hasUserManagementMenuAccess({
        accountRole: "user",
        organizationRole: null,
        isPlatformOwner: true,
      })
    ).toBe(true);

    for (const organizationRole of [
      "system_admin",
      "organization_admin",
      "regional_admin",
      "organization_supervisor",
    ]) {
      expect(
        hasUserManagementMenuAccess({
          accountRole: "user",
          organizationRole,
          isPlatformOwner: false,
        })
      ).toBe(true);
    }
  });

  it("denies user management to roles limited to report or operational access", () => {
    for (const organizationRole of [
      "reviewer",
      "reader",
      "auditor",
      "dispatcher",
      "unknown",
    ]) {
      expect(
        hasUserManagementMenuAccess({
          accountRole: "user",
          organizationRole,
          isPlatformOwner: false,
        })
      ).toBe(false);
    }
  });

  it("allows structure edits only to adminProcedure accounts", () => {
    expect(hasOrganizationStructureEditAccess("admin")).toBe(true);
    expect(hasOrganizationStructureEditAccess("user")).toBe(false);
    expect(hasOrganizationStructureEditAccess(null)).toBe(false);
  });

  it("allows cross-organization settings edits only to a platform admin owner", () => {
    expect(
      hasOrganizationSettingsEditAccess({
        accountRole: "admin",
        isPlatformOwner: true,
      })
    ).toBe(true);
    expect(
      hasOrganizationSettingsEditAccess({
        accountRole: "admin",
        isPlatformOwner: false,
      })
    ).toBe(false);
    expect(
      hasOrganizationSettingsEditAccess({
        accountRole: "user",
        isPlatformOwner: true,
      })
    ).toBe(false);
  });

  it("uses consistent group headings for platform and organization managers", () => {
    expect(getManagementMenuHeading("admin", false)).toBe("إدارة النظام");
    expect(getManagementMenuHeading("user", true)).toBe("إعدادات المالك");
    expect(getManagementMenuHeading("user", false)).toBe("إدارة الجهة");
  });
});
