import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "../shared/platformDocumentSettings";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  single: vi.fn(),
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
} from "./db";

const ownerSettings = {
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 0,
  headerDividerColor: "#ABCDEF",
  showVerificationQr: false,
  updatedAt: "2026-10-23T00:00:00.000Z",
};

describe("platform document settings persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const builder = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      upsert: mocks.upsert,
      single: mocks.single,
    };
    mocks.from.mockReturnValue(builder);
    mocks.select.mockReturnValue(builder);
    mocks.eq.mockReturnValue(builder);
    mocks.upsert.mockReturnValue(builder);
    mocks.maybeSingle.mockResolvedValue({ data: ownerSettings, error: null });
    mocks.single.mockResolvedValue({ data: ownerSettings, error: null });
  });

  it("reads the singleton without modifying owner settings", async () => {
    await expect(getPlatformDocumentSettings()).resolves.toEqual(ownerSettings);
    expect(mocks.from).toHaveBeenCalledWith("platform_document_settings");
    expect(mocks.eq).toHaveBeenCalledWith("id", 1);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns defaults without a write when the singleton is absent", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getPlatformDocumentSettings()).resolves.toEqual({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      updatedAt: null,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.single).not.toHaveBeenCalled();
  });

  it("does not reset a concurrent owner save after an empty read", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const reader = getPlatformDocumentSettings();
    const values = {
      showMinistryWatermarkText: false,
      watermarkOpacityPercent: 0,
      headerDividerColor: "#ABCDEF",
      showVerificationQr: false,
    };
    const writer = updatePlatformDocumentSettings(values, 1);
    await Promise.all([reader, writer]);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, ...values, updatedByUserId: 1 }),
      { onConflict: "id" }
    );
  });

  it("surfaces database errors rather than pretending defaults were loaded", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "relation does not exist" },
    });
    await expect(getPlatformDocumentSettings()).rejects.toThrow(
      "Failed to load platform document settings: relation does not exist"
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("surfaces failed saves", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(
      updatePlatformDocumentSettings(DEFAULT_PLATFORM_DOCUMENT_SETTINGS, 1)
    ).rejects.toThrow(
      "Failed to save platform document settings: permission denied"
    );
  });
});
