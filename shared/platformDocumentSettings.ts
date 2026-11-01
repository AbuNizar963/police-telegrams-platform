export const DEFAULT_PLATFORM_DOCUMENT_SETTINGS = {
  showMinistryWatermarkText: true,
  watermarkOpacityPercent: 12,
  headerDividerColor: "#b49a55",
  showVerificationQr: true,
} as const;

export type PlatformDocumentSettings = {
  showMinistryWatermarkText: boolean;
  /** Opacity percentage for the ministry text and organization-logo watermark layers (default 12%). */
  watermarkOpacityPercent: number;
  headerDividerColor: string;
  showVerificationQr: boolean;
  updatedAt?: string | Date | null;
};

export const MAX_WATERMARK_OPACITY_PERCENT = 60;
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
