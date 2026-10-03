import type { Express, Request, Response } from "express";
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import { getAuthenticatedUserFromRequest } from "./_core/auth";

const MAX_HTML_BYTES = 2_500_000;
const ALLOWED_FORMATS = new Set(["pdf", "png"]);

function isSafeExportHtml(html: string): boolean {
  const unsafeDataUri = /data:(?!image\/(?:png|jpe?g|webp|gif|svg\+xml)[;,])/i;
  return (
    html.length > 0 &&
    Buffer.byteLength(html, "utf8") <= MAX_HTML_BYTES &&
    !/<\s*script\b/i.test(html) &&
    !/<\s*(iframe|object|embed)\b/i.test(html) &&
    !/\b(?:javascript|vbscript):/i.test(html) &&
    !unsafeDataUri.test(html)
  );
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

async function renderTelegramDocument(html: string, format: "pdf" | "png") {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: format === "png" ? 3 : 1,
    });

    await page.emulateMedia({ media: "print" });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(
        images.map(image =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), {
                  once: true,
                });
              })
        )
      );
    });

    const paper = page.locator(".telegram-export-page");
    await paper.waitFor({ state: "visible" });

    if (format === "pdf") {
      return {
        body: await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
          tagged: true,
        }),
        contentType: "application/pdf",
        fileName: "telegram.pdf",
      };
    }

    return {
      body: await paper.screenshot({ type: "png", animations: "disabled" }),
      contentType: "image/png",
      fileName: "telegram.png",
    };
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
