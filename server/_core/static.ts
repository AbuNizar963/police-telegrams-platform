import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Serves the prebuilt client bundle in production without importing Vite or
 * any of its native build-time dependencies into the serverless function.
 */
export function serveStatic(app: Express): void {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Fall through to index.html if the requested asset does not exist.
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
