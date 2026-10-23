import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/platformDocumentSettings";
import {
  DOCUMENT_SETTINGS_LOAD_ERROR,
  loadDocumentSettingsForExport,
} from "./platformDocumentSettings";

const ownerSettings: PlatformDocumentSettings = {
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 0,
  headerDividerColor: "#2457a6",
  showVerificationQr: false,
};

describe("document settings for export", () => {
  it("uses the freshly loaded owner settings, preserving false and zero values", async () => {
    const fetchSettings = vi.fn().mockResolvedValue(ownerSettings);
    await expect(loadDocumentSettingsForExport(fetchSettings)).resolves.toEqual(
      ownerSettings
    );
    expect(fetchSettings).toHaveBeenCalledOnce();
  });

  it("accepts defaults explicitly returned by the server", async () => {
    await expect(
      loadDocumentSettingsForExport(async () => ({
        ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
        updatedAt: null,
      }))
    ).resolves.toMatchObject(DEFAULT_PLATFORM_DOCUMENT_SETTINGS);
  });

  it("blocks export when loading fails instead of falling back to QR=true", async () => {
    await expect(
      loadDocumentSettingsForExport(async () => {
        throw new Error("network or unapplied migration");
      })
    ).rejects.toThrow(DOCUMENT_SETTINGS_LOAD_ERROR);
  });

  it.each([
    { showVerificationQr: undefined },
    { showMinistryWatermarkText: "false" },
    { watermarkOpacityPercent: Number.NaN },
    { watermarkOpacityPercent: -1 },
    { watermarkOpacityPercent: 61 },
    { watermarkOpacityPercent: 1.5 },
    { headerDividerColor: "red; background:url(javascript:alert(1))" },
  ])("blocks export with invalid effective settings: %o", async invalid => {
    await expect(
      loadDocumentSettingsForExport(
        async () =>
          ({
            ...ownerSettings,
            ...invalid,
          }) as PlatformDocumentSettings
      )
    ).rejects.toThrow(DOCUMENT_SETTINGS_LOAD_ERROR);
  });
});
