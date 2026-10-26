import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const mocked = vi.hoisted(() => ({
  listAuditLogs: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  listAuditLogs: mocked.listAuditLogs,
}));

vi.mock("./organization", async importOriginal => ({
  ...(await importOriginal<typeof import("./organization")>()),
  getUserOrganizationMembership: mocked.getUserOrganizationMembership,
}));

function contextFor(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: role === "admin" ? 1 : 42,
      authUserId:
        role === "admin"
          ? "00000000-0000-4000-8000-000000000001"
          : "00000000-0000-4000-8000-000000000042",
      name: role === "admin" ? "مدير النظام" : "موظف",
      badgeNumber: null,
      email: role === "admin" ? "admin@example.com" : "officer@example.com",
      loginMethod: "local",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("audit log access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000099",
      role: "dispatcher",
      isActive: true,
    });
    mocked.listAuditLogs.mockResolvedValue([]);
  });

  it("allows system administrators to read the audit log", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));

    await expect(caller.auditLogs.list()).resolves.toEqual([]);
    expect(mocked.listAuditLogs).toHaveBeenCalledOnce();
  });

  it("allows an active system-admin membership to read the audit log", async () => {
    mocked.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000099",
      role: "system_admin",
      isActive: true,
    });
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.auditLogs.list()).resolves.toEqual([]);
    expect(mocked.listAuditLogs).toHaveBeenCalledOnce();
  });

  it("rejects users without audit-log permission", async () => {
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.auditLogs.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocked.listAuditLogs).not.toHaveBeenCalled();
  });

  it("rejects an inactive system-admin membership", async () => {
    mocked.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000099",
      role: "system_admin",
      isActive: false,
    });
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.auditLogs.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocked.listAuditLogs).not.toHaveBeenCalled();
  });
});
