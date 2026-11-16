import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();

  // Keep the smoke-test browser inside the local preview origin only.
  // Application scripts cannot send requests to external hosts during this test.
  await page.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.hostname === "127.0.0.1" && requestUrl.port === "4173") {
      await route.continue();
      return;
    }
    await route.abort();
  });

  const response = await page.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  assert.ok(response, "The browser did not receive a document response.");
  assert.equal(
    response.status(),
    200,
    "The web application did not return HTTP 200."
  );

  await page.waitForSelector('#root > :not(section[aria-label="Notifications alt+T"])', {
    timeout: 20_000,
  });

  const pageState = await page.evaluate(() => ({
    title: document.title.trim(),
    rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
    bodyText: document.body.innerText.trim(),
  }));

  assert.ok(pageState.title.length > 0, "The document title is empty.");
  assert.ok(
    pageState.rootChildren > 0,
    "The React application did not render."
  );
  assert.ok(
    pageState.bodyText.length > 0,
    "The rendered application has no visible text."
  );

  console.log("Playwright browser smoke test passed.");
  console.log(JSON.stringify(pageState, null, 2));
} finally {
  await browser.close();
}
