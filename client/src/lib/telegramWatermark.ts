export const OFFICIAL_MINISTRY_NAME = "وزارة الداخلية";
export const TELEGRAM_WATERMARK_COLUMNS = 10;
export const TELEGRAM_WATERMARK_ROWS = 34;
/** Half-centimetre horizontal and vertical separation between repetitions. */
export const TELEGRAM_WATERMARK_GAP_MM = 5;
export const TELEGRAM_WATERMARK_REPEAT_COUNT =
  TELEGRAM_WATERMARK_COLUMNS * TELEGRAM_WATERMARK_ROWS;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

export function buildTelegramWatermarkHtml(
  logoUrl?: string | null,
  options: { showMinistryText?: boolean } = {}
): string {
  const labels =
    options.showMinistryText === false
      ? ""
      : Array.from(
          { length: TELEGRAM_WATERMARK_REPEAT_COUNT },
          () => `<span>${OFFICIAL_MINISTRY_NAME}</span>`
        ).join("");
  const watermarkText = labels
    ? `<div class="watermark-text-pattern">${labels}</div>`
    : "";
  const logo = logoUrl?.trim()
    ? `<img class="watermark-logo" src="${escapeAttribute(logoUrl.trim())}" alt="" />`
    : "";

  return `<div class="page-watermark" aria-hidden="true">${watermarkText}${logo}</div>`;
}
