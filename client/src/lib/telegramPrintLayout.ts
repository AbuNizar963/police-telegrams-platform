export const PRINT_PAGE_WIDTH_MM = 210;
export const PRINT_PAGE_HEIGHT_MM = 297;
export const PRINT_MARGIN_MM = 10;
export const PRINT_CONTENT_WIDTH_MM = PRINT_PAGE_WIDTH_MM - PRINT_MARGIN_MM * 2;
export const PRINT_CONTENT_HEIGHT_MM =
  PRINT_PAGE_HEIGHT_MM - PRINT_MARGIN_MM * 2;
// The @page bottom margin is reserved for page numbering. The remaining
// printable page area includes a 10mm top inset, leaving 277mm for content.
export const PRINT_PAGE_AREA_HEIGHT_MM = PRINT_PAGE_HEIGHT_MM - PRINT_MARGIN_MM;
export const PRINT_PAGE_HEIGHT_PX = PRINT_PAGE_HEIGHT_MM * (96 / 25.4);

/**
 * CSS shared by the visible document, PDF/PNG export, and native printing.
 * The on-screen article is the full A4 sheet; print uses a 10mm bottom page
 * margin for page counters, with the other content insets inside the sheet.
 */
export function getTelegramPaperLayoutCss(
  selector = ".telegram-export-page",
  options: { screenLayout?: boolean; important?: boolean } = {}
) {
  const { screenLayout = true, important = false } = options;
  const suffix = important ? " !important" : "";
  const printSelector = selector;
  const screenCss = screenLayout
    ? `
      .telegram-export-page {
        box-sizing: border-box;
        width: ${PRINT_PAGE_WIDTH_MM}mm;
        min-height: ${PRINT_PAGE_HEIGHT_MM}mm;
        padding: ${PRINT_MARGIN_MM}mm;
        margin: 0;
      }
      .telegram-export-page.telegram-multipage { page: telegram-multipage; }
    `
    : "";

  return `
    ${screenCss}
    @page {
      size: A4 portrait;
      margin: 0 0 ${PRINT_MARGIN_MM}mm 0;
    }
    @page telegram-multipage {
      size: A4 portrait;
      margin: 0 0 ${PRINT_MARGIN_MM}mm 0;
      @bottom-center {
        content: "صفحة رقم " counter(page) " من " counter(pages);
        font-family: "Cairo", Tahoma, Arial, sans-serif;
        font-size: 9pt;
        color: #667085;
      }
    }
    @media print {
      ${printSelector} {
        box-sizing: border-box${suffix};
        width: ${PRINT_PAGE_WIDTH_MM}mm${suffix};
        height: auto${suffix};
        min-height: ${PRINT_PAGE_AREA_HEIGHT_MM}mm${suffix};
        max-height: none${suffix};
        padding: ${PRINT_MARGIN_MM}mm ${PRINT_MARGIN_MM}mm 0${suffix};
        margin: 0 auto${suffix};
        overflow: visible${suffix};
        break-inside: auto${suffix};
        page-break-inside: auto${suffix};
        -webkit-box-decoration-break: clone${suffix};
        box-decoration-break: clone${suffix};
      }
    }
  `;
}
