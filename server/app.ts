import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { serveStatic, setupVite } from "./_core/vite";
import type { Server } from "http";

export async function createApp(
  options: { productionStatic?: boolean; viteServer?: Server } = {}
): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "police-telegrams-platform",
      timestamp: new Date().toISOString(),
    });
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (options.productionStatic) {
    serveStatic(app);
  } else if (options.viteServer) {
    await setupVite(app, options.viteServer);
  }

  return app;
}
