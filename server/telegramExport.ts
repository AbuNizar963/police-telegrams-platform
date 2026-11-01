import type { Express, Request, Response } from "express";
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import { getAuthenticatedUserFromRequest } from "./_core/auth";

const MAX_HTML_BYTES = 3_900_000;
const ALLOWED_FORMATS = new Set(["pdf", "png"]);
// Render at 384 DPI first, then fall back only when PNG would approach
// Vercel's 4.5 MB response cap. 4,000,000 bytes leaves protocol headroom.
export const MAX_TELEGRAM_PNG_BYTES = 4_000_000;
export const PNG_RENDER_SCALE_FACTORS = [4, 3, 2] as const;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

/** Add physical resolution metadata without re-encoding or resampling pixels. */
export function withPngDpiMetadata(png: Buffer, dpi = 384): Buffer {
  if (
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    png.length < 33 ||
    png.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Chromium returned an invalid PNG image");
  }

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const physicalResolution = Buffer.alloc(9);
  physicalResolution.writeUInt32BE(pixelsPerMeter, 0);
  physicalResolution.writeUInt32BE(pixelsPerMeter, 4);
  physicalResolution[8] = 1;

  const ihdrLength = png.readUInt32BE(8);
  const afterIhdr = 8 + 4 + 4 + ihdrLength + 4;
  const before = png.subarray(0, afterIhdr);
  const rest = png.subarray(afterIhdr);
  // Replace an existing pHYs chunk if the renderer ever starts emitting one.
  let cleanRest = rest;
  let offset = 0;
  while (offset + 12 <= cleanRest.length) {
    const length = cleanRest.readUInt32BE(offset);
    const type = cleanRest.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > cleanRest.length) break;
    if (type === "pHYs") {
      cleanRest = Buffer.concat([
        cleanRest.subarray(0, offset),
        cleanRest.subarray(end),
      ]);
      break;
    }
    offset = end;
  }

  return Buffer.concat([
    before,
    createPngChunk("pHYs", physicalResolution),
    cleanRest,
  ]);
}

export function isSafeExportHtml(html: string): boolean {
  // Validate executable markup and URL-bearing attributes, not visible text:
  // a legitimate telegram may contain words such as "javascript:" or "data:".
  // Cairo fonts and logos are intentionally embedded as safe data URLs by the
  // authenticated client before this document reaches Chromium.
  const unsafeUrl =
    /\b(?:src|href|action|formaction|poster|xlink:href)[ \t\r\n]*=[ \t\r\n]*(?:"[ \t\r\n]*(?:javascript|vbscript):|'[ \t\r\n]*(?:javascript|vbscript):|(?:javascript|vbscript):)/i;
  const unsafeDataUrl =
    /\b(?:src|href|action|formaction|poster|xlink:href)[ \t\r\n]*=[ \t\r\n]*(?:"[ \t\r\n]*data:(?!image\/(?:png|jpe?g|webp|gif|svg\+xml)[;,]|font\/ttf;base64,)|'[ \t\r\n]*data:(?!image\/(?:png|jpe?g|webp|gif|svg\+xml)[;,]|font\/ttf;base64,)|data:(?!image\/(?:png|jpe?g|webp|gif|svg\+xml)[;,]|font\/ttf;base64,))/i;
  const eventHandler = /\bon[a-z][\w:-]*\s*=\s*(?:["']|[^\s>]+)/i;
  return (
    html.length > 0 &&
    Buffer.byteLength(html, "utf8") <= MAX_HTML_BYTES &&
    !/<\s*script\b/i.test(html) &&
    !/<\s*(iframe|object|embed)\b/i.test(html) &&
    !/<\s*(?:meta|link)\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html) &&
    !eventHandler.test(html) &&
    !unsafeUrl.test(html) &&
    !unsafeDataUrl.test(html)
  );
}

export function isAllowedExportResourceUrl(url: string): boolean {
  return (
    url === "about:blank" ||
    /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(url) ||
    /^data:font\/ttf;base64,/i.test(url)
  );
}

export function hasMultiPageTelegramLayout(html: string): boolean {
  return /<article\b[^>]*class=["'][^"']*\btelegram-export-page\b[^"']*\btelegram-multipage\b[^"']*["']/i.test(
    html
  );
}

/** Keep the A4 page box full-size; the document's sole 10mm inset is its padding. */
export function getTelegramRenderLayoutCss(printLayout: boolean): string {
  return `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: auto !important;
      min-height: 0 !important;
      background: #fff !important;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    ${
      printLayout
        ? `
          .telegram-export-page {
            box-sizing: border-box !important;
            width: 210mm !important;
            height: auto !important;
            min-height: 297mm !important;
            max-height: none !important;
            padding: 10mm !important;
            display: block !important;
            margin: 0 auto !important;
            overflow: visible !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .telegram-export-page.telegram-multipage {
            min-height: 287mm !important;
            padding: 10mm 10mm 0 !important;
          }
          .telegram-export-page .page-watermark { position: fixed !important; }
          /* @page reserves 10mm for the counter; keep the watermark on full A4. */
          .telegram-export-page.telegram-multipage .page-watermark {
            inset: 0 auto auto 0 !important;
            width: 210mm !important;
            height: 297mm !important;
          }
        `
        : `
          .telegram-export-page {
            box-sizing: border-box !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            padding: 10mm !important;
            display: block !important;
            margin: 0 auto !important;
            overflow: hidden !important;
          }
        `
    }
  `;
}

function getChromiumExecutablePath(): string {
  return process.env.CHROMIUM_PATH || "/usr/bin/chromium";
}

async function launchBrowser() {
  const isServerless = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  );
  const executablePath = isServerless
    ? await chromium.executablePath()
    : getChromiumExecutablePath();

  return playwrightChromium.launch({
    executablePath,
    args: isServerless
      ? chromium.args
      : ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
}

export async function renderTelegramDocument(
  html: string,
  format: "pdf" | "png"
) {
  const browser = await launchBrowser();
  try {
    const isMultiPagePng = format === "png" && hasMultiPageTelegramLayout(html);
    const createReadyPage = async (
      deviceScaleFactor: number,
      printLayout: boolean
    ) => {
      const page = await browser.newPage({
        viewport: { width: 794, height: 1123 },
        deviceScaleFactor,
        javaScriptEnabled: false,
      });
      try {
        // Never allow untrusted export HTML to access localhost, cloud metadata,
        // the application API, or arbitrary external hosts while rendering.
        await page.route("**/*", async route => {
          if (isAllowedExportResourceUrl(route.request().url())) {
            await route.continue();
            return;
          }
          await route.abort("blockedbyclient");
        });
        await page.emulateMedia({ media: printLayout ? "print" : "screen" });
        await page.setContent(
          html.replace(
            "</head>",
            `<style>${getTelegramRenderLayoutCss(printLayout)}</style></head>`
          ),
          { waitUntil: "load" }
        );
        await page.evaluate(async () => {
          await document.fonts.ready;
          const images = Array.from(document.images);
          await Promise.all(
            images.map(async image => {
              if (!image.complete) {
                await new Promise<void>((resolve, reject) => {
                  const cleanup = () => {
                    image.removeEventListener("load", onLoad);
                    image.removeEventListener("error", onError);
                  };
                  const onLoad = () => {
                    cleanup();
                    resolve();
                  };
                  const onError = () => {
                    cleanup();
                    reject(new Error("تعذر تحميل صورة الشعار في محرك التصدير"));
                  };
                  image.addEventListener("load", onLoad, { once: true });
                  image.addEventListener("error", onError, { once: true });
                  if (image.complete) {
                    cleanup();
                    if (image.naturalWidth > 0) resolve();
                    else onError();
                  }
                });
              }
              if (typeof image.decode === "function") await image.decode();
              if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                throw new Error("صورة الشعار لم تُحمّل بصورة صالحة");
              }
            })
          );
        });
        await page
          .locator(".telegram-export-page")
          .waitFor({ state: "visible" });
        return page;
      } catch (error) {
        await page.close();
        throw error;
      }
    };

    if (format === "pdf") {
      const page = await createReadyPage(1, true);
      try {
        return {
          body: await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            tagged: true,
          }),
          contentType: "application/pdf",
          fileName: "telegram.pdf",
        };
      } finally {
        await page.close();
      }
    }

    if (isMultiPagePng) {
      const page = await createReadyPage(1, true);
      try {
        return {
          body: await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            tagged: true,
          }),
          contentType: "application/pdf",
          fileName: "telegram-pages.pdf",
        };
      } finally {
        await page.close();
      }
    }

    for (const deviceScaleFactor of PNG_RENDER_SCALE_FACTORS) {
      const page = await createReadyPage(deviceScaleFactor, false);
      try {
        const renderedPng = await page.screenshot({
          type: "png",
          animations: "disabled",
          clip: {
            x: 0,
            y: 0,
            width: (210 / 25.4) * 96,
            height: (297 / 25.4) * 96,
          },
        });
        const body = withPngDpiMetadata(renderedPng, deviceScaleFactor * 96);
        if (body.length <= MAX_TELEGRAM_PNG_BYTES) {
          return {
            body,
            contentType: "image/png",
            fileName: "telegram.png",
          };
        }
      } finally {
        await page.close();
      }
    }
    throw new Error(
      `PNG export exceeded the safe Vercel response budget of ${MAX_TELEGRAM_PNG_BYTES} bytes`
    );
  } finally {
    await browser.close();
  }
}

export function registerTelegramExportRoutes(app: Express): void {
  app.post("/api/telegram-render", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const user = await getAuthenticatedUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });

    const body = req.body as { html?: unknown; format?: unknown };
    const html = typeof body.html === "string" ? body.html : "";
    const format =
      body.format === "pdf" || body.format === "png" ? body.format : null;

    if (!format || !ALLOWED_FORMATS.has(format) || !isSafeExportHtml(html)) {
      return res.status(400).json({ error: "بيانات التصدير غير صالحة" });
    }

    try {
      const result = await renderTelegramDocument(html, format);
      res.setHeader("Content-Type", result.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.fileName}"`
      );
      return res.status(200).send(result.body);
    } catch (error) {
      console.error("Telegram Chromium export failed:", error);
      return res
        .status(503)
        .json({ error: "تعذر إنشاء الوثيقة الرسمية حاليًا" });
    }
  });
}
