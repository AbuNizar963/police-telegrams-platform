export const OFFICIAL_MINISTRY_NAME = "وزارة الداخلية";
export const TELEGRAM_WATERMARK_COLUMNS = 13;
export const TELEGRAM_WATERMARK_ROWS = 33;
/** Calibrated against the bundled font in Chromium's A4 PDF output. */
export const TELEGRAM_WATERMARK_HORIZONTAL_GAP_MM = 6.16;
export const TELEGRAM_WATERMARK_INSET_MM = 3;
export const TELEGRAM_WATERMARK_FONT_SIZE_PT = 11;
export const TELEGRAM_WATERMARK_DEFAULT_OPACITY = 0.12;
export const TELEGRAM_WATERMARK_FONT_FAMILY = "Aref Ruqaa";
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
  const rows =
    options.showMinistryText === false
      ? ""
      : Array.from({ length: TELEGRAM_WATERMARK_ROWS }, (_, row) => {
          const labels = Array.from(
            { length: TELEGRAM_WATERMARK_COLUMNS },
            () => `<span>${OFFICIAL_MINISTRY_NAME}</span>`
          ).join("");
          return `<div class="watermark-text-row${row % 2 ? " watermark-text-row-offset" : ""}">${labels}</div>`;
        }).join("");
  const watermarkText = rows
    ? `<div class="watermark-text-pattern">${rows}</div>`
    : "";
  const logo = logoUrl?.trim()
    ? `<img class="watermark-logo" src="${escapeAttribute(logoUrl.trim())}" alt="" />`
    : "";

  return `<div class="page-watermark" aria-hidden="true">${watermarkText}${logo}</div>`;
}

export function buildTelegramWatermarkCss(opacity: number): string {
  const safeOpacity = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : TELEGRAM_WATERMARK_DEFAULT_OPACITY;

  return `
    .telegram-export-page .page-watermark {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .telegram-export-page .watermark-logo {
      position: absolute;
      z-index: 1;
      top: 50%;
      left: 50%;
      width: 93.75%;
      height: 93.75%;
      transform: translate(-50%, -50%);
      object-fit: contain;
      opacity: ${safeOpacity};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .telegram-export-page .watermark-text-pattern {
      position: absolute;
      z-index: 0;
      /* Aref Ruqaa glyph bounds are inset from line boxes; these offsets yield 3mm visible ink margins. */
      inset: 2.4mm 3.2mm ${TELEGRAM_WATERMARK_INSET_MM}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      gap: 0;
      overflow: hidden;
      opacity: ${safeOpacity};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .telegram-export-page .watermark-text-row {
      display: flex;
      flex: 0 0 auto;
      width: max-content;
      gap: ${TELEGRAM_WATERMARK_HORIZONTAL_GAP_MM}mm;
      white-space: nowrap;
    }
    .telegram-export-page .watermark-text-row-offset {
      transform: translateX(-10.3mm);
    }
    .telegram-export-page .watermark-text-pattern span {
      color: #73777d;
      text-align: center;
      font-family: "${TELEGRAM_WATERMARK_FONT_FAMILY}", serif;
      font-size: ${TELEGRAM_WATERMARK_FONT_SIZE_PT}pt;
      font-weight: 400;
      line-height: 1;
      white-space: nowrap;
    }
  `;
}
