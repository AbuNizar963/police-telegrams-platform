import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageRoutes } from "./_core/storageRoutes";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { serveStatic } from "./_core/static";

/**
 * Creates the HTTP application shared by the local server and Vercel.
 *
 * Vite is deliberately not imported here. Keeping development tooling out of
 * this module prevents serverless bundlers from tracing Vite's native build
 * dependencies into the production API function.
 */
export function createApp(
  options: { productionStatic?: boolean } = {},
): Express {
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
  }

  return app;
}
