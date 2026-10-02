import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { storageGet } from "./storage";

describe("storage provider boundary", () => {
  const originalProvider = ENV.storageProvider;

  afterEach(() => {
    ENV.storageProvider = originalProvider;
  });

  it("fails closed for an unreviewed provider", () => {
    ENV.storageProvider = "local";

    expect(() => storageGet("telegrams/42/report.png")).toThrow(
      "Unsupported storage provider 'local'"
    );
  });
});
