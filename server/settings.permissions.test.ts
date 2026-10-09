import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 9,
      authUserId: "00000000-0000-4000-8000-000000000009",
      name: "Test Officer",
      badgeNumber: null,
      email: "officer@example.com",
      loginMethod: "google",
      username: role === "admin" ? "nonowner-admin" : null,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("department branding permissions", () => {
  it("rejects branding updates from ordinary officers", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(
      caller.settings.update({
        departmentName: "قسم الاختبار",
        unitName: "وحدة الدوريات",
        unitChiefRank: "العقيد",
        unitChiefName: "محمد أحمد",
        serialPrefix: "TEST",
        incomingSerialPrefix: "IN",
        serialStart: 1,
        incomingSerialStart: 1,
        timezone: "Asia/Riyadh",
        dateFormat: "dd/MM/yyyy HH:mm:ss",
        numberSystem: "arabic",
        logoUrl: null,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects organization settings and hierarchy overrides from a non-owner admin", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    const organizationId = "00000000-0000-4000-8000-000000000009";

    await expect(
      caller.organizations.settings.get({ organizationId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.organizations.settings.update({
        organizationId,
        departmentName: "قسم الاختبار",
        unitName: "وحدة العمليات",
        unitChiefRank: "العقيد",
        unitChiefName: "رئيس الوحدة",
        serialPrefix: "718",
        incomingSerialPrefix: "IN",
        serialStart: 718,
        incomingSerialStart: 1,
        timezone: "Asia/Damascus",
        dateFormat: "dd/MM/yyyy HH:mm:ss",
        numberSystem: "arabic",
        logoUrl: null,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.organizations.create({
        code: "CUSTOM-UNIT",
        name: "وحدة اختبار",
        type: "unit",
        parentOrganizationId: organizationId,
        allowHierarchyOverride: true,
        createAccount: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
