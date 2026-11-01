export const PRINT_PAGE_WIDTH_PX = 794;
export const PRINT_PAGE_HEIGHT_PX = 1123;
export const PRINT_PAGE_WIDTH_MM = 210;
export const PRINT_PAGE_HEIGHT_MM = 297;
export const PRINT_MARGIN_MM = 10;
export const PRINT_CONTENT_WIDTH_MM = PRINT_PAGE_WIDTH_MM - PRINT_MARGIN_MM * 2;
export const PRINT_CONTENT_HEIGHT_MM =
  PRINT_PAGE_HEIGHT_MM - PRINT_MARGIN_MM * 2;
// Long documents reserve only the bottom 10mm for the page counter. The
// remaining A4 page is still 210x297mm, with the content inset inside it.
export const PRINT_PAGE_AREA_HEIGHT_MM = PRINT_PAGE_HEIGHT_MM - PRINT_MARGIN_MM;

/**
 * Restore the original 794x1123px A4 preview and full-page print geometry.
 * The only layout adjustment from the saved backup is a 10mm inset.
 */
export function getTelegramPaperLayoutCss(
  selector = ".telegram-export-page",
  options: { screenLayout?: boolean; important?: boolean } = {}
) {
  const { screenLayout = true, important = false } = options;
  const suffix = important ? " !important" : "";
  const multiPageSelector = `${selector}.telegram-multipage`;
  const screenCss = screenLayout
    ? `
      .telegram-export-page {
        box-sizing: border-box;
        width: ${PRINT_PAGE_WIDTH_PX}px;
        min-height: ${PRINT_PAGE_HEIGHT_PX}px;
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
      margin: 0;
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
      ${selector} {
        box-sizing: border-box${suffix};
        width: ${PRINT_PAGE_WIDTH_MM}mm${suffix};
        height: auto${suffix};
        min-height: ${PRINT_PAGE_HEIGHT_MM}mm${suffix};
        max-height: none${suffix};
        padding: ${PRINT_MARGIN_MM}mm${suffix};
        margin: 0 auto${suffix};
        overflow: visible${suffix};
        break-inside: auto${suffix};
        page-break-inside: auto${suffix};
        -webkit-box-decoration-break: clone${suffix};
        box-decoration-break: clone${suffix};
      }
      ${multiPageSelector} {
        min-height: ${PRINT_PAGE_AREA_HEIGHT_MM}mm${suffix};
        padding: ${PRINT_MARGIN_MM}mm ${PRINT_MARGIN_MM}mm 0${suffix};
      }
    }
  `;
}
