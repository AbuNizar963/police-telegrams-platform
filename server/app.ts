import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageRoutes } from "./_core/storageRoutes";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { serveStatic } from "./_core/static";
import { setupVite } from "./_core/vite";
import type { Server } from "http";

export async function createApp(
  options: { productionStatic?: boolean; viteServer?: Server } = {},
): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "police-telegrams-platform",
      auth: "local-password",
      database: "supabase-postgres",
      timestamp: new Date().toISOString(),
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  if (options.productionStatic) {
    serveStatic(app);
  } else if (options.viteServer) {
    await setupVite(app, options.viteServer);
  }

  return app;
}
