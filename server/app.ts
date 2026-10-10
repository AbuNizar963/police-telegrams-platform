import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageRoutes } from "./_core/storageRoutes";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { serveStatic } from "./_core/static";
import { getSupabaseAdmin } from "./_core/supabase";
import { registerTelegramExportRoutes } from "./telegramExport";
import { getTelegramSerialCode } from "@shared/telegramSerial";
import { getAuthenticatedUserFromRequest } from "./_core/auth";
import { getUserOrganizationMembership } from "./organization";

/**
 * Creates the HTTP application shared by the local server and Vercel.
 *
 * Vite is deliberately not imported here. Keeping development tooling out of
 * this module prevents serverless bundlers from tracing Vite's native build
 * dependencies into the production API function.
 */
export function getJsonBodyLimit(path: string): string {
  if (path === "/api/telegram-render") return "3mb";
  if (path.includes("/api/trpc/telegrams.importRows")) return "50mb";
  if (path.includes("/api/trpc/telegrams.uploadAttachment")) return "16mb";
  if (path.includes("/api/trpc/settings.uploadLogo")) return "8mb";
  return "1mb";
}

function requiresAuthenticatedLargeBody(path: string): boolean {
  return (
    path === "/api/telegram-render" ||
    path.includes("/api/trpc/telegrams.importRows") ||
    path.includes("/api/trpc/telegrams.uploadAttachment") ||
    path.includes("/api/trpc/settings.uploadLogo")
  );
}

function requiresOrganizationAdminLargeBody(path: string): boolean {
  return (
    path.includes("/api/trpc/telegrams.importRows") ||
    path.includes("/api/trpc/settings.uploadLogo")
  );
}

export function createApp(
  options: { productionStatic?: boolean } = {}
): Express {
  const app = express();
  app.disable("x-powered-by");

  // Authenticate large-payload routes before parsing attacker-controlled bodies.
  // This prevents unauthenticated requests from forcing 16–50 MB JSON allocations.
  app.use((req, res, next) => {
    const path = req.path;
    if (!requiresAuthenticatedLargeBody(path)) return next();

    void (async () => {
      const user = await getAuthenticatedUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
        return;
      }

      if (user.mustChangePassword) {
        res.status(403).json({
          error: "يجب تغيير كلمة المرور المؤقتة قبل استخدام النظام",
        });
        return;
      }

      if (requiresOrganizationAdminLargeBody(path)) {
        const membership = await getUserOrganizationMembership(user.id);
        if (
          !membership ||
          !["system_admin", "organization_admin"].includes(membership.role)
        ) {
          res.status(403).json({ error: "لا تملك صلاحية هذه العملية" });
          return;
        }
      }

      next();
    })().catch(next);
  });

  app.use((req, res, next) =>
    express.json({ limit: getJsonBodyLimit(req.path) })(req, res, next)
  );
  app.use(express.urlencoded({ limit: "64kb", extended: false }));

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
          "serialNumber, serialCode, organizationSerialCode, creatorName, createdAt, organizationId, archivedAt, status"
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
        // Match the organization-scoped serial printed in the telegram header.
        displaySerialCode:
          getTelegramSerialCode(telegram) ||
          String(telegram.serialNumber ?? ""),
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
