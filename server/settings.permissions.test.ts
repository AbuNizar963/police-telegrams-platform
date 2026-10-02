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
        serialStart: 1,
        timezone: "Asia/Riyadh",
        dateFormat: "dd/MM/yyyy HH:mm:ss",
        numberSystem: "arabic",
        logoUrl: null,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
