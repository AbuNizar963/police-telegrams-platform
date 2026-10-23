import {
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
  type PlatformDocumentSettings,
} from "@shared/platformDocumentSettings";

export const DOCUMENT_SETTINGS_LOAD_ERROR =
  "تعذر تحميل إعدادات وثائق النظام. أعد المحاولة قبل الطباعة أو التصدير.";

/** Never fall back to a visible QR when the effective owner settings are unknown. */
export async function loadDocumentSettingsForExport(
  fetchSettings: () => Promise<PlatformDocumentSettings>
): Promise<PlatformDocumentSettings> {
  try {
    const settings = await fetchSettings();
    if (
      !settings ||
      typeof settings.showMinistryWatermarkText !== "boolean" ||
      typeof settings.showVerificationQr !== "boolean" ||
      !Number.isInteger(settings.watermarkOpacityPercent) ||
      settings.watermarkOpacityPercent < 0 ||
      settings.watermarkOpacityPercent > MAX_WATERMARK_OPACITY_PERCENT ||
      typeof settings.headerDividerColor !== "string" ||
      !HEX_COLOR_PATTERN.test(settings.headerDividerColor)
    ) {
      throw new Error(DOCUMENT_SETTINGS_LOAD_ERROR);
    }
    return settings;
  } catch {
    throw new Error(DOCUMENT_SETTINGS_LOAD_ERROR);
  }
}
