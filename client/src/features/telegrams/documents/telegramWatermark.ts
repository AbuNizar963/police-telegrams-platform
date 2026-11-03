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

export function buildTelegramWatermarkCss(opacity: number): string {
  const safeOpacity = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : 0.12;

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
      inset: 0;
      display: grid;
      grid-template-columns: repeat(${TELEGRAM_WATERMARK_COLUMNS}, max-content);
      grid-template-rows: repeat(${TELEGRAM_WATERMARK_ROWS}, max-content);
      column-gap: ${TELEGRAM_WATERMARK_GAP_MM}mm;
      row-gap: ${TELEGRAM_WATERMARK_GAP_MM}mm;
      justify-content: space-between;
      align-content: space-between;
      align-items: center;
      justify-items: center;
      overflow: hidden;
      opacity: ${safeOpacity};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .telegram-export-page .watermark-text-pattern span {
      color: #73777d;
      text-align: center;
      font-family: "Cairo", "Noto Naskh Arabic", Tahoma, serif;
      font-size: 8px;
      font-weight: 400;
      line-height: 1.2;
      white-space: nowrap;
    }
  `;
}
