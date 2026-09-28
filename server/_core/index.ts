import "dotenv/config";
import { createServer } from "http";
import net from "net";
import { createApp } from "../app";
import { setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.listen(port, () => {
      server.close(() => resolve(true));
    });

    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer(): Promise<void> {
  const server = createServer();
  const isDevelopment = process.env.NODE_ENV === "development";
  const app = createApp({
    productionStatic: !isDevelopment,
  });

  if (isDevelopment) {
    await setupVite(app, server);
  }

  server.on("request", app);

  const preferredPort = Number.parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error => {
  console.error("Failed to start server:", error);
  process.exitCode = 1;
});
