import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./api/appRouter";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegramWithAttachments: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
  getTelegramAttachmentById: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getTelegramById: vi.fn(),
  listTelegrams: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  invokeLLM: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock("./data/database", () => ({
  allocateSerialNumber: mocked.allocateSerialNumber,
  createTelegramWithAttachments: mocked.createTelegramWithAttachments,
  writeAuditLog: mocked.writeAuditLog,
  getDashboardStats: mocked.getDashboardStats,
  getTelegramAttachmentById: mocked.getTelegramAttachmentById,
  getOrCreateSettings: mocked.getOrCreateSettings,
  getTelegramById: mocked.getTelegramById,
  listTelegrams: mocked.listTelegrams,
}));
vi.mock("./storage", () => ({
  storagePut: mocked.storagePut,
  storageGetSignedUrl: mocked.storageGetSignedUrl,
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocked.invokeLLM }));
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: mocked.transcribeAudio,
}));

function createContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "officer-42",
      name: "النقيب أحمد",
      email: "ahmad@example.com",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("telegram attachment security", () => {
  const validPng = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.storagePut.mockResolvedValue({
      key: "telegrams/42/report_abc123.png",
      url: "/manus-storage/telegrams/42/report_abc123.png",
    });
    mocked.storageGetSignedUrl.mockResolvedValue("https://storage.test/file");
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getTelegramAttachmentById.mockResolvedValue(undefined);
  });

  it("sanitizes path separators from uploaded filenames", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.uploadAttachment({
      fileName: "../بلاغ\\صورة.png",
      contentType: "image/png",
      base64: validPng,
    });

    expect(mocked.storagePut).toHaveBeenCalledWith(
      "telegrams/42/__بلاغ_صورة.png",
      expect.any(Buffer),
      "image/png"
    );
    expect(result.fileName).toBe("__بلاغ_صورة.png");
  });

  it("denies officers access to another user's attachment key", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(
      caller.telegrams.extractTextFromImage({
        fileKey: "telegrams/99/secret.png",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.telegrams.transcribeVoice({
        fileKey: "telegrams/99/recording.webm",
        language: "ar",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocked.storageGetSignedUrl).not.toHaveBeenCalled();
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "attachment.access_denied" })
    );
  });

  it("rejects content that does not match its declared MIME type", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.uploadAttachment({
        fileName: "report.png",
        contentType: "image/png",
        base64: Buffer.from("not-a-png").toString("base64"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocked.storagePut).not.toHaveBeenCalled();
  });

  it("rejects malformed telegram storage paths before signing", async () => {
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(
      caller.telegrams.extractTextFromImage({
        fileKey: "telegrams/not-a-user/secret.png",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.telegrams.extractTextFromImage({
        fileKey: "telegrams/42/",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocked.storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a telegram manifest that references another user's file", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(
      caller.telegrams.create({
        subject: "بلاغ اختبار",
        recipient: "غرفة العمليات",
        body: "محتوى اختبار كافٍ",
        classification: "normal",
        priority: "normal",
        category: "administrative",
        attachmentManifest: JSON.stringify([
          {
            fileKey: "telegrams/99/report.png",
            fileName: "report.png",
            contentType: "image/png",
            size: 16,
          },
        ]),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocked.allocateSerialNumber).not.toHaveBeenCalled();
    expect(mocked.createTelegramWithAttachments).not.toHaveBeenCalled();
  });

  it("allows an admin to inspect a telegram attachment key", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    mocked.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: "نص مستخرج" } }],
    });

    const result = await caller.telegrams.extractTextFromImage({
      fileKey: "telegrams/99/secret.png",
    });

    expect(result).toEqual({ text: "نص مستخرج" });
    expect(mocked.storageGetSignedUrl).toHaveBeenCalledWith(
      "telegrams/99/secret.png"
    );
  });

  it("denies downloading an attachment from another officer's telegram", async () => {
    mocked.getTelegramAttachmentById.mockResolvedValue({
      telegramOwnerId: 99,
      attachment: {
        id: 8,
        telegramId: 12,
        fileKey: "telegrams/99/report.png",
        fileName: "report.png",
        contentType: "image/png",
        size: 16,
        scanStatus: "clean",
      },
    });
    const caller = appRouter.createCaller(createContext("user"));

    await expect(
      caller.telegrams.downloadAttachment({ id: 8 })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocked.storageGetSignedUrl).not.toHaveBeenCalled();
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "attachment.download_denied" })
    );
  });

  it("denies a blocked attachment even to its owner", async () => {
    mocked.getTelegramAttachmentById.mockResolvedValue({
      telegramOwnerId: 42,
      attachment: {
        id: 9,
        telegramId: 12,
        fileKey: "telegrams/42/blocked.pdf",
        fileName: "blocked.pdf",
        contentType: "application/pdf",
        size: 16,
        scanStatus: "blocked",
      },
    });
    const caller = appRouter.createCaller(createContext("user"));

    await expect(
      caller.telegrams.downloadAttachment({ id: 9 })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocked.storageGetSignedUrl).not.toHaveBeenCalled();
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "attachment.download_blocked" })
    );
  });

  it("returns a short-lived signed URL for an authorized clean attachment", async () => {
    mocked.getTelegramAttachmentById.mockResolvedValue({
      telegramOwnerId: 42,
      attachment: {
        id: 10,
        telegramId: 12,
        fileKey: "telegrams/42/report.png",
        fileName: "report.png",
        contentType: "image/png",
        size: 16,
        scanStatus: "clean",
      },
    });
    const caller = appRouter.createCaller(createContext("user"));

    await expect(
      caller.telegrams.downloadAttachment({ id: 10 })
    ).resolves.toEqual({
      url: "https://storage.test/file",
      fileName: "report.png",
      contentType: "image/png",
      size: 16,
      expiresInSeconds: 300,
    });
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "attachment.download" })
    );
  });
});
