import type { Request, Response } from "express";
import { createApp } from "../server/app";

const appPromise = createApp({ productionStatic: false });

export default async function handler(req: Request, res: Response) {
  const app = await appPromise;
  return app(req, res);
}
