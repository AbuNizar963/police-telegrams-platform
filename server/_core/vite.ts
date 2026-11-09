import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import fs from "fs";
import { type Server } from "http";
import path from "path";

export async function setupVite(app: Express, server: Server) {
  // Keep Vite and its native Rollup dependencies out of production API startup.
  // This module is also imported by the serverless production app, where Vite
  // middleware is never initialized.
  const [{ createServer: createViteServer }, { default: viteConfig }] =
    await Promise.all([import("vite"), import("../../vite.config")]);

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  const clientTemplatePath = path.resolve(
    import.meta.dirname,
    "../..",
    "client",
    "index.html"
  );
  let templateCache: { mtimeMs: number; source: string } | null = null;
  const transformedIndexCache = new Map<
    string,
    { mtimeMs: number; html: string }
  >();

  const readClientTemplate = async () => {
    const stat = await fs.promises.stat(clientTemplatePath);
    if (!templateCache || templateCache.mtimeMs !== stat.mtimeMs) {
      let source = await fs.promises.readFile(clientTemplatePath, "utf-8");
      // Vite HMR handles source changes. A stable mtime-based query preserves
      // browser caching between requests while still invalidating the entry
      // when the HTML shell itself changes.
      source = source.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${Math.trunc(stat.mtimeMs)}"`
      );
      templateCache = { mtimeMs: stat.mtimeMs, source };
      transformedIndexCache.clear();
    }
    return templateCache;
  };

  // Vite fingerprints optimized dependency URLs, so they can safely be
  // reused by the browser during a development session. Source modules and
  // HMR endpoints intentionally keep their normal no-cache behavior.
  app.use((req, res, next) => {
    if (
      req.method === "GET" &&
      /^\/node_modules\/\.vite\/deps\/[^/]+\.(?:js|css)(?:\?.*)?$/.test(
        req.originalUrl
      )
    ) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    next();
  });

  app.use(vite.middlewares);
  app.use(
    "/{*splat}",
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({ error: "طلبات كثيرة لصفحة التطوير؛ أعد المحاولة لاحقًا" }),
    }),
    async (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const url = req.originalUrl;
      try {
        const template = await readClientTemplate();
        const cached = transformedIndexCache.get(url);
        if (cached?.mtimeMs === template.mtimeMs) {
          res
            .status(200)
            .set({
              "Cache-Control": "no-cache, must-revalidate",
              "Content-Type": "text/html",
            })
            .end(cached.html);
          return;
        }

        const page = await vite.transformIndexHtml(url, template.source);
        if (transformedIndexCache.size >= 64) {
          const oldestKey = transformedIndexCache.keys().next().value;
          if (oldestKey) transformedIndexCache.delete(oldestKey);
        }
        transformedIndexCache.set(url, {
          mtimeMs: template.mtimeMs,
          html: page,
        });
        res
          .status(200)
          .set({
            "Cache-Control": "no-cache, must-revalidate",
            "Content-Type": "text/html",
          })
          .end(page);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    }
  );
}
