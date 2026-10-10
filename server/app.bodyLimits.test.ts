import { describe, expect, it } from "vitest";
import { getJsonBodyLimit } from "./app";

describe("request body limits", () => {
  it("keeps ordinary API requests small", () => {
    expect(getJsonBodyLimit("/api/trpc/auth.login")).toBe("1mb");
    expect(getJsonBodyLimit("/api/trpc/telegrams.create")).toBe("1mb");
  });

  it("allows only the payload sizes required by file operations", () => {
    expect(getJsonBodyLimit("/api/trpc/telegrams.uploadAttachment")).toBe(
      "16mb"
    );
    expect(getJsonBodyLimit("/api/trpc/settings.uploadLogo")).toBe("8mb");
    expect(getJsonBodyLimit("/api/trpc/telegrams.importRows")).toBe("50mb");
    expect(
      getJsonBodyLimit(
        "/api/trpc/telegrams.importRows,telegrams.uploadAttachment"
      )
    ).toBe("50mb");
  });

  it("allows the HTML export limit plus JSON overhead without applying it globally", () => {
    expect(getJsonBodyLimit("/api/telegram-render")).toBe("3mb");
  });
});
