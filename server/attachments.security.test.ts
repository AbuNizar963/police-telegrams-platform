import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./api/appRouter";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
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
  createTelegram: mocked.createTelegram,
  writeAuditLog: mocked.writeAuditLog,
  getDashboardStats: mocked.getDashboardStats,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.storagePut.mockResolvedValue({
      key: "telegrams/42/report_abc123.png",
      url: "/manus-storage/telegrams/42/report_abc123.png",
    });
    mocked.storageGetSignedUrl.mockResolvedValue("https://storage.test/file");
    mocked.writeAuditLog.mockResolvedValue(undefined);
  });

  it("sanitizes path separators from uploaded filenames", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.uploadAttachment({
      fileName: "../بلاغ\\صورة.png",
      contentType: "image/png",
      base64: Buffer.from("image-bytes").toString("base64"),
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
});
