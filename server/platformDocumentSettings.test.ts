import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const mocks = vi.hoisted(() => ({
  getPlatformDocumentSettings: vi.fn(),
  updatePlatformDocumentSettings: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("./db", () => mocks);

function context(input: {
  id: number;
  username: string;
  role: "admin" | "user";
}): TrpcContext {
  return {
    user: {
      id: input.id,
      authUserId: `00000000-0000-4000-8000-${String(input.id).padStart(12, "0")}`,
      name: input.username,
      badgeNumber: null,
      email: `${input.username}@example.test`,
      loginMethod: "local",
      username: input.username,
      role: input.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const input = {
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 24,
  headerDividerColor: "#2457a6",
  showVerificationQr: false,
};

const saved = {
  ...input,
  updatedAt: "2026-10-23T00:00:00.000Z",
};

describe("platform document settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatformDocumentSettings.mockResolvedValue(saved);
    mocks.updatePlatformDocumentSettings.mockResolvedValue(saved);
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("allows authenticated users to read effective document settings", async () => {
    const caller = appRouter.createCaller(
      context({ id: 8, username: "dispatcher", role: "user" })
    );

    await expect(caller.platformDocumentSettings.get()).resolves.toEqual(saved);
    expect(mocks.getPlatformDocumentSettings).toHaveBeenCalledOnce();
  });

  it("allows only the configured platform owner to change them and audits the save", async () => {
    const caller = appRouter.createCaller(
      context({ id: 1, username: ENV.ownerUsername, role: "admin" })
    );

    await expect(
      caller.platformDocumentSettings.update(input)
    ).resolves.toEqual(saved);
    expect(mocks.updatePlatformDocumentSettings).toHaveBeenCalledWith(input, 1);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        action: "platform.document_settings.update",
        entityType: "platform_document_settings",
        entityId: "1",
        metadata: JSON.stringify(input),
      })
    );
  });

  it("rejects another administrator even when the user has an admin role", async () => {
    const caller = appRouter.createCaller(
      context({ id: 2, username: "another-admin", role: "admin" })
    );

    await expect(
      caller.platformDocumentSettings.update(input)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.updatePlatformDocumentSettings).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects an ordinary user before any save or audit write", async () => {
    const caller = appRouter.createCaller(
      context({ id: 8, username: "dispatcher", role: "user" })
    );
    await expect(
      caller.platformDocumentSettings.update(input)
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.updatePlatformDocumentSettings).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated reads and writes", async () => {
    const anonymous = context({ id: 8, username: "dispatcher", role: "user" });
    anonymous.user = null;
    const caller = appRouter.createCaller(anonymous);
    await expect(caller.platformDocumentSettings.get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.platformDocumentSettings.update(input)
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.getPlatformDocumentSettings).not.toHaveBeenCalled();
    expect(mocks.updatePlatformDocumentSettings).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([0, 60])("accepts the safe opacity boundary %s", async opacity => {
    const caller = appRouter.createCaller(
      context({ id: 1, username: ENV.ownerUsername, role: "admin" })
    );
    await caller.platformDocumentSettings.update({
      ...input,
      watermarkOpacityPercent: opacity,
    });
    expect(mocks.updatePlatformDocumentSettings).toHaveBeenCalledWith(
      { ...input, watermarkOpacityPercent: opacity },
      1
    );
  });

  it.each([-1, 1.5, 61])(
    "rejects unsafe opacity %s without writing",
    async opacity => {
      const caller = appRouter.createCaller(
        context({ id: 1, username: ENV.ownerUsername, role: "admin" })
      );
      await expect(
        caller.platformDocumentSettings.update({
          ...input,
          watermarkOpacityPercent: opacity,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.updatePlatformDocumentSettings).not.toHaveBeenCalled();
      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    }
  );

  it("rejects opacity outside the safe range and non-hex CSS colors", async () => {
    const caller = appRouter.createCaller(
      context({ id: 1, username: ENV.ownerUsername, role: "admin" })
    );

    await expect(
      caller.platformDocumentSettings.update({
        ...input,
        watermarkOpacityPercent: 61,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.platformDocumentSettings.update({
        ...input,
        headerDividerColor: "red; background:url(javascript:alert(1))",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updatePlatformDocumentSettings).not.toHaveBeenCalled();
  });
});
