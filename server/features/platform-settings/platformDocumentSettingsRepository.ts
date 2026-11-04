import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
  type PlatformDocumentSettings,
} from "../../../shared/features/platform-settings/platformDocumentSettings";
import { getSupabaseAdmin } from "../../_core/supabase";

const asDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(String(value));

function throwIfError(
  error: { message: string } | null,
  context: string
): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function mapPlatformDocumentSettings(
  row: Record<string, unknown>
): PlatformDocumentSettings {
  const storedOpacity = Number(row.watermarkOpacityPercent);
  const storedColor = row.headerDividerColor;
  return {
    showMinistryWatermarkText:
      typeof row.showMinistryWatermarkText === "boolean"
        ? row.showMinistryWatermarkText
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showMinistryWatermarkText,
    watermarkOpacityPercent:
      Number.isInteger(storedOpacity) &&
      storedOpacity >= 0 &&
      storedOpacity <= MAX_WATERMARK_OPACITY_PERCENT
        ? storedOpacity
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkOpacityPercent,
    headerDividerColor:
      typeof storedColor === "string" && HEX_COLOR_PATTERN.test(storedColor)
        ? storedColor
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerDividerColor,
    showVerificationQr:
      typeof row.showVerificationQr === "boolean"
        ? row.showVerificationQr
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showVerificationQr,
    updatedAt: row.updatedAt ? asDate(row.updatedAt).toISOString() : null,
  };
}

export async function getPlatformDocumentSettings(): Promise<PlatformDocumentSettings> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("platform_document_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  throwIfError(error, "Failed to load platform document settings");

  if (data) return mapPlatformDocumentSettings(data as Record<string, unknown>);
  // Reads must never overwrite an owner's concurrent save. The migration
  // seeds the singleton; only the owner-authorized update path may recreate it.
  return { ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS, updatedAt: null };
}

export async function updatePlatformDocumentSettings(
  values: Omit<PlatformDocumentSettings, "updatedAt">,
  updatedByUserId: number
): Promise<PlatformDocumentSettings> {
  const { data, error } = await getSupabaseAdmin()
    .from("platform_document_settings")
    .upsert(
      {
        id: 1,
        ...values,
        updatedByUserId,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();
  throwIfError(error, "Failed to save platform document settings");
  return mapPlatformDocumentSettings(data as Record<string, unknown>);
}
