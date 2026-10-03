import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  deletedTables: [] as string[],
  attachmentRows: [] as Array<{ storageKey: string }>,
  attachmentError: null as { message: string } | null,
  deleteErrors: {} as Record<string, { message: string } | null>,
  telegramRow: null as Record<string, unknown> | null,
  telegramError: null as { message: string } | null,
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      let isDelete = false;
      let isSelect = false;
      const settle = () => {
        if (isDelete) {
          if (table === "telegrams") {
            return { data: state.telegramRow, error: state.telegramError };
          }
          return { data: null, error: state.deleteErrors[table] ?? null };
        }
        if (isSelect) {
          return { data: state.attachmentRows, error: state.attachmentError };
        }
        return { data: null, error: null };
      };
      const builder = {
        select: () => {
          isSelect = true;
          return builder;
        },
        delete: () => {
          isDelete = true;
          state.deletedTables.push(table);
          return builder;
        },
        eq: () => builder,
        maybeSingle: () => Promise.resolve(settle()),
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(settle()).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import { purgeTelegramPermanently } from "./db";

const telegramRow = {
  id: 7,
  serialNumber: 1001,
  serialCode: "POL-2026-10-03-00701",
  createdByUserId: 42,
  creatorName: "موظف",
  creatorEmail: "officer@example.com",
  creatorBadgeId: null,
  creatorIp: null,
  creatorFingerprint: null,
  subject: "موضوع",
  recipient: "غرفة العمليات",
  body: "المحتوى",
  classification: "normal",
  priority: "normal",
  category: "security",
  status: "pending",
  attachmentManifest: null,
  gpsLatitude: null,
  gpsLongitude: null,
  archivedAt: null,
  createdAt: "2026-10-03T16:00:00.000Z",
  updatedAt: "2026-10-03T16:00:00.000Z",
};

describe("purgeTelegramPermanently", () => {
  beforeEach(() => {
    state.deletedTables = [];
    state.attachmentRows = [];
    state.attachmentError = null;
    state.deleteErrors = {};
    state.telegramRow = { ...telegramRow };
    state.telegramError = null;
  });

  it("removes dependents before the telegram row and returns attachment keys", async () => {
    state.attachmentRows = [
      { storageKey: "telegrams/7/report.pdf" },
      { storageKey: "telegrams/7/photo.jpg" },
    ];

    const result = await purgeTelegramPermanently(7);

    expect(state.deletedTables).toEqual([
      "telegram_actions",
      "telegram_versions",
      "telegram_attachments",
      "telegram_routes",
      "telegrams",
    ]);
    expect(result?.attachmentStorageKeys).toEqual([
      "telegrams/7/report.pdf",
      "telegrams/7/photo.jpg",
    ]);
    expect(result?.telegram.serialCode).toBe("POL-2026-10-03-00701");
    expect(result?.telegram.createdAt).toBeInstanceOf(Date);
  });

  it("returns undefined when the telegram row no longer exists", async () => {
    state.telegramRow = null;

    await expect(purgeTelegramPermanently(7)).resolves.toBeUndefined();
  });

  it("surfaces a failure while clearing dependent records", async () => {
    state.deleteErrors = {
      telegram_versions: { message: "violates foreign key constraint" },
    };

    await expect(purgeTelegramPermanently(7)).rejects.toThrow(
      "Failed to purge telegram_versions: violates foreign key constraint"
    );
    expect(state.deletedTables).not.toContain("telegrams");
  });
});
