import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  allocateOrganizationSerialNumber: vi.fn(),
  getSuggestedOrganizationSerialNumber: vi.fn(),
  reserveOrganizationSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
  getMaxSerialNumber: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getTelegramById: vi.fn(),
  listTelegrams: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  getUserOrganizationId: vi.fn(),
  getTelegramByIdempotencyKey: vi.fn(),
  recordTelegramAction: vi.fn(),
  recordTelegramVersion: vi.fn(),
  getConfiguredTelegramDestination: vi.fn(),
  listRoutingTargets: vi.fn(),
  listOrganizationDescendants: vi.fn(),
  routeTelegram: vi.fn(),
  routeTelegramBroadcastAtomic: vi.fn(),
}));

vi.mock("./db", () => mocked);
vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getConfiguredTelegramDestination: mocked.getConfiguredTelegramDestination,
    listRoutingTargets: mocked.listRoutingTargets,
    listOrganizationDescendants: mocked.listOrganizationDescendants,
    routeTelegram: mocked.routeTelegram,
    routeTelegramBroadcastAtomic: mocked.routeTelegramBroadcastAtomic,
  };
});

function createContext(): TrpcContext {
  return {
    user: {
      id: 42,
      authUserId: "00000000-0000-4000-8000-000000000042",
      name: "النقيب أحمد",
      badgeNumber: null,
      email: "ahmad@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("telegrams.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let allocatedSerialNumber = 1000;
    let allocatedOrganizationSerialNumber = 0;
    mocked.allocateSerialNumber.mockImplementation(
      async () => ++allocatedSerialNumber
    );
    mocked.allocateOrganizationSerialNumber.mockImplementation(
      async () => ++allocatedOrganizationSerialNumber
    );
    mocked.getSuggestedOrganizationSerialNumber.mockResolvedValue(1);
    mocked.reserveOrganizationSerialNumber.mockResolvedValue(77);
    mocked.getUserOrganizationId.mockResolvedValue(
      "00000000-0000-0000-0000-000000000001"
    );
    mocked.getOrCreateSettings.mockResolvedValue({
      serialPrefix: "OUT",
      incomingSerialPrefix: "IN",
      timezone: "Asia/Riyadh",
      numberSystem: "latin",
    });
    mocked.createTelegram.mockImplementation(async input => ({
      id: 7,
      createdAt: new Date(),
      ...input,
    }));
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getTelegramByIdempotencyKey.mockResolvedValue(undefined);
    mocked.recordTelegramAction.mockResolvedValue(undefined);
    mocked.recordTelegramVersion.mockResolvedValue(undefined);
    mocked.getConfiguredTelegramDestination.mockResolvedValue(null);
    mocked.listRoutingTargets.mockResolvedValue([]);
    mocked.listOrganizationDescendants.mockResolvedValue([]);
    mocked.routeTelegram.mockResolvedValue(undefined);
    mocked.routeTelegramBroadcastAtomic.mockResolvedValue({
      primaryRoute: { id: 11 },
      copies: [],
    });
  });

  it("uses the authenticated officer identity instead of accepting a client-supplied author", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.create({
      subject: "تنبيه أمني",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "urgent",
      category: "security",
    });

    expect(result?.serialNumber).toBe(1001);
    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 42,
        organizationId: "00000000-0000-0000-0000-000000000001",
        currentOrganizationId: "00000000-0000-0000-0000-000000000001",
        creatorName: "النقيب أحمد",
        creatorEmail: "ahmad@example.com",
        creatorFingerprint: "00000000-0000-4000-8000-000000000042",
        serialNumber: 1001,
        serialCode: expect.stringMatching(/^OUT-\d{4}-\d{2}-\d{2}-\d{5}$/),
        organizationSerialNumber: 1,
        organizationSerialCode: expect.stringMatching(
          /^OUT-\d{4}-\d{2}-\d{2}-00001$/
        ),
        verificationToken: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      })
    );
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 42,
        actorName: "النقيب أحمد",
        action: "telegram.create",
        entityType: "telegram",
      })
    );
    expect(mocked.routeTelegram).not.toHaveBeenCalled();
  });

  it("uses a caller-selected telegram number while keeping the global serial internal", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.telegrams.create({
      subject: "تنبيه أمني",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "urgent",
      category: "security",
      requestedOrganizationSerialNumber: 77,
    });

    expect(mocked.reserveOrganizationSerialNumber).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      77
    );
    expect(mocked.allocateOrganizationSerialNumber).not.toHaveBeenCalled();
    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        serialNumber: 1001,
        organizationSerialNumber: 77,
        organizationSerialCode: expect.stringMatching(
          /^OUT-\d{4}-\d{2}-\d{2}-00077$/
        ),
      })
    );
  });

  it("rejects an unavailable caller-selected number before allocating a global serial", async () => {
    mocked.reserveOrganizationSerialNumber.mockRejectedValue(
      new Error(
        "Organization serial reservation failed: رقم البرقية مستخدم بالفعل لهذه الجهة"
      )
    );
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.create({
        subject: "تنبيه أمني",
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "urgent",
        category: "security",
        requestedOrganizationSerialNumber: 77,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocked.allocateSerialNumber).not.toHaveBeenCalled();
    expect(mocked.createTelegram).not.toHaveBeenCalled();
  });

  it("returns the next outgoing number for the active organization", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.telegrams.nextOutgoingSerial()).resolves.toEqual({
      number: 1,
    });
    expect(mocked.getSuggestedOrganizationSerialNumber).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001"
    );
  });

  it("converts telegram text digits to the organization's configured system before saving", async () => {
    mocked.getOrCreateSettings.mockResolvedValue({
      serialPrefix: "OUT",
      incomingSerialPrefix: "IN",
      timezone: "Asia/Riyadh",
      numberSystem: "arabic",
    });
    const caller = appRouter.createCaller(createContext());

    await caller.telegrams.create({
      subject: "بلاغ 123/٤",
      recipient: "الوحدة 7",
      body: "تحركت الدورية 12 إلى الموقع ٣",
      classification: "normal",
      priority: "normal",
      category: "security",
    });

    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "بلاغ ١٢٣/٤",
        recipient: "الوحدة ٧",
        body: "تحركت الدورية ١٢ إلى الموقع ٣",
      })
    );
  });

  it("accepts every supported police telegram category", async () => {
    const categories = [
      "criminal",
      "administrative",
      "traffic",
      "security",
      "tactical",
      "intelligence",
      "emergency",
      "public_order",
      "personnel",
      "logistics",
      "training",
      "community",
      "other",
    ] as const;
    const caller = appRouter.createCaller(createContext());

    for (const category of categories) {
      await caller.telegrams.create({
        subject: `اختبار ${category}`,
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "normal",
        category,
      });
    }

    expect(mocked.createTelegram).toHaveBeenCalledTimes(categories.length);
  });

  it("returns the persisted telegram when a concurrent retry wins the idempotency race", async () => {
    const caller = appRouter.createCaller(createContext());
    const persistedTelegram = {
      id: 88,
      serialNumber: 1002,
      serialCode: "POL-2026-10-02-01002",
      status: "draft",
    };
    mocked.createTelegram.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint")
    );
    mocked.getTelegramByIdempotencyKey
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(persistedTelegram);

    await expect(
      caller.telegrams.create({
        subject: "تنبيه أمني",
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "urgent",
        category: "security",
        idempotencyKey: "create-telegram-race-0001",
      })
    ).resolves.toEqual(persistedTelegram);

    expect(mocked.writeAuditLog).not.toHaveBeenCalled();
    expect(mocked.recordTelegramAction).not.toHaveBeenCalled();
    expect(mocked.recordTelegramVersion).not.toHaveBeenCalled();
  });

  it("routes a new telegram to the organization configured for the source unit", async () => {
    const destination = {
      id: "00000000-0000-0000-0000-000000000002",
      name: "قيادة المنطقة",
    };
    const routedTelegram = {
      id: 7,
      serialNumber: 1001,
      serialCode: "POL-2026-10-02-01001",
      status: "forwarded",
      currentOrganizationId: destination.id,
    };
    mocked.getConfiguredTelegramDestination.mockResolvedValue(destination);
    mocked.getTelegramById.mockResolvedValue(routedTelegram);

    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.telegrams.create({
        subject: "إحالة اختبارية",
        recipient: "قيادة المنطقة",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "normal",
        category: "administrative",
      })
    ).resolves.toEqual(routedTelegram);

    expect(mocked.routeTelegram).toHaveBeenCalledWith({
      telegramId: 7,
      toOrganizationId: destination.id,
      forwardedByUserId: 42,
      allowDraft: true,
      note: "إحالة تلقائية إلى الجهة المحددة للقسم أو المخفر",
    });
  });

  it("routes to the explicitly selected allowed organization", async () => {
    const destination = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "قيادة المنطقة",
      isConfiguredDestination: false,
    };
    const routedTelegram = {
      id: 7,
      serialNumber: 1001,
      serialCode: "POL-2026-10-02-01001",
      status: "forwarded",
      currentOrganizationId: destination.id,
    };
    mocked.listRoutingTargets.mockResolvedValue([destination]);
    mocked.getTelegramById.mockResolvedValue(routedTelegram);

    const caller = appRouter.createCaller(createContext());
    await caller.telegrams.create({
      subject: "إحالة يدوية",
      recipient: destination.name,
      recipientOrganizationId: destination.id,
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "normal",
      category: "administrative",
    });

    expect(mocked.getConfiguredTelegramDestination).not.toHaveBeenCalled();
    expect(mocked.routeTelegram).toHaveBeenCalledWith({
      telegramId: 7,
      toOrganizationId: destination.id,
      forwardedByUserId: 42,
      allowDraft: true,
      note: "إحالة إلى الجهة المختارة عند إنشاء البرقية",
    });
  });

  it("reports an atomic broadcast failure without claiming that copies were committed", async () => {
    const targets = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "الجهة التابعة الأولى",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: "الجهة التابعة الثانية",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
      {
        id: "00000000-0000-4000-8000-000000000004",
        name: "الجهة التابعة الثالثة",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
    ];
    mocked.listOrganizationDescendants.mockResolvedValue(targets);
    mocked.routeTelegramBroadcastAtomic.mockRejectedValueOnce(
      new Error("routing copy failed")
    );

    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.create({
        subject: "تعميم اختبار",
        recipient: "الجهات التابعة",
        body: "محتوى التعميم",
        classification: "normal",
        priority: "normal",
        category: "administrative",
        broadcastToDescendants: true,
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining(
        "تراجعت مسارات الإرسال ونسخه ذريًا، وسُجّل الفشل للمراجعة."
      ),
    });

    expect(mocked.routeTelegramBroadcastAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: 7,
        toOrganizationId: targets[0].id,
        copies: expect.arrayContaining([
          expect.objectContaining({
            targetOrganizationId: targets[1].id,
          }),
          expect.objectContaining({
            targetOrganizationId: targets[2].id,
          }),
        ]),
      })
    );
    expect(mocked.recordTelegramAction).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: 7,
        action: "telegram.broadcast.atomic_failure",
        fromStatus: "draft",
        toStatus: "draft",
        metadata: expect.objectContaining({
          failure: "routing copy failed",
          rollbackGuaranteed: true,
          progress: [
            {
              telegramId: 7,
              organizationId: targets[0].id,
              status: "created",
            },
          ],
        }),
      })
    );
    expect(mocked.createTelegram).toHaveBeenCalledTimes(1);
    expect(mocked.routeTelegram).not.toHaveBeenCalled();
  });

  it("routes the primary telegram and every copy through one atomic RPC", async () => {
    const targets = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "الجهة التابعة الأولى",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: "الجهة التابعة الثانية",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
    ];
    mocked.listOrganizationDescendants.mockResolvedValue(targets);
    mocked.routeTelegramBroadcastAtomic.mockResolvedValueOnce({
      primaryRoute: { id: 11 },
      copies: [
        {
          telegramId: 8,
          routeId: 12,
          targetOrganizationId: targets[1].id,
        },
      ],
    });

    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.create({
        subject: "تعميم اختبار",
        recipient: "الجهات التابعة",
        body: "محتوى التعميم",
        classification: "normal",
        priority: "normal",
        category: "administrative",
        broadcastToDescendants: true,
      })
    ).resolves.toMatchObject({ id: 7 });

    expect(mocked.routeTelegramBroadcastAtomic).toHaveBeenCalledTimes(1);
    expect(mocked.routeTelegramBroadcastAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: 7,
        toOrganizationId: targets[0].id,
        forwardedByUserId: 42,
        copies: [
          expect.objectContaining({
            targetOrganizationId: targets[1].id,
            serialNumber: 1002,
            organizationSerialNumber: 2,
            subject: "تعميم اختبار",
            recipient: "الجهات التابعة",
            body: "محتوى التعميم",
          }),
        ],
      })
    );
    expect(mocked.createTelegram).toHaveBeenCalledTimes(1);
    expect(mocked.routeTelegram).not.toHaveBeenCalled();
    expect(mocked.recordTelegramAction).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: "telegram.broadcast.atomic_failure",
      })
    );
  });

  it("does not misreport a committed broadcast when refreshing the primary telegram fails", async () => {
    const targets = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "الجهة التابعة الأولى",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: "الجهة التابعة الثانية",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
    ];
    mocked.listOrganizationDescendants.mockResolvedValue(targets);
    mocked.routeTelegramBroadcastAtomic.mockResolvedValueOnce({
      primaryRoute: { id: 11 },
      copies: [
        {
          telegramId: 8,
          routeId: 12,
          targetOrganizationId: targets[1].id,
        },
      ],
    });
    mocked.getTelegramById.mockRejectedValueOnce(
      new Error("primary telegram refresh failed")
    );
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      const caller = appRouter.createCaller(createContext());

      await expect(
        caller.telegrams.create({
          subject: "تعميم اختبار",
          recipient: "الجهات التابعة",
          body: "محتوى التعميم",
          classification: "normal",
          priority: "normal",
          category: "administrative",
          broadcastToDescendants: true,
        })
      ).resolves.toMatchObject({ id: 7 });

      expect(mocked.recordTelegramAction).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: "telegram.broadcast.atomic_failure",
        })
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        "[Telegram broadcast] Primary telegram refresh failed after commit",
        expect.any(Error)
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("reports manual review if the atomic broadcast failure cannot be audited", async () => {
    const targets = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "الجهة التابعة الأولى",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: "الجهة التابعة الثانية",
        parentOrganizationId: "00000000-0000-0000-0000-000000000001",
      },
    ];
    mocked.listOrganizationDescendants.mockResolvedValue(targets);
    mocked.routeTelegramBroadcastAtomic.mockRejectedValueOnce(
      new Error("copy creation failed")
    );
    mocked.recordTelegramAction.mockRejectedValueOnce(
      new Error("audit persistence failed")
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const caller = appRouter.createCaller(createContext());

      await expect(
        caller.telegrams.create({
          subject: "تعميم اختبار",
          recipient: "الجهات التابعة",
          body: "محتوى التعميم",
          classification: "normal",
          priority: "normal",
          category: "administrative",
          broadcastToDescendants: true,
        })
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining(
          "تراجعت مسارات الإرسال ونسخه ذريًا، لكن تعذّر حفظ سجل التدقيق؛ يلزم مراجعة السجلات يدويًا."
        ),
      });

      expect(mocked.recordTelegramAction).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        "[Telegram broadcast] Failed to persist partial-failure audit",
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
