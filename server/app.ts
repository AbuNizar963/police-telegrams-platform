import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageRoutes } from "./_core/storageRoutes";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { serveStatic } from "./_core/static";
import { getSupabaseAdmin } from "./_core/supabase";
import { registerTelegramExportRoutes } from "./telegramExport";

/**
 * Creates the HTTP application shared by the local server and Vercel.
 *
 * Vite is deliberately not imported here. Keeping development tooling out of
 * this module prevents serverless bundlers from tracing Vite's native build
 * dependencies into the production API function.
 */
export function createApp(
  options: { productionStatic?: boolean } = {}
): Express {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageRoutes(app);
  registerTelegramExportRoutes(app);

  app.get("/api/verify/:token", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const token = req.params.token;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        token
      )
    ) {
      return res.status(404).json({ valid: false });
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data: telegram, error } = await supabase
        .from("telegrams")
        .select(
          "serialNumber, creatorName, createdAt, organizationId, archivedAt, status"
        )
        .eq("verificationToken", token)
        .maybeSingle();

      if (error) throw error;
      if (!telegram) return res.status(404).json({ valid: false });

      const { data: organization, error: organizationError } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", telegram.organizationId)
        .maybeSingle();

      if (organizationError) throw organizationError;

      return res.status(200).json({
        valid: true,
        status:
          telegram.status === "archived" || telegram.archivedAt
            ? "archived"
            : "valid",
        serialNumber: telegram.serialNumber,
        createdAt: telegram.createdAt,
        unitName: organization?.name ?? "الوحدة الشرطية",
        creatorName: telegram.creatorName,
      });
    } catch (error) {
      console.error("Telegram verification failed:", error);
      return res
        .status(500)
        .json({ valid: false, error: "تعذر التحقق حاليًا" });
    }
  });

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
    })
  );

  if (options.productionStatic) {
    serveStatic(app);
  }

  return app;
}
