import { describe, expect, it } from "vitest";
import { getRequestAuditContext } from "./auditContext";

describe("request audit context", () => {
  it("uses the first trusted forwarded address and classifies mobile devices", () => {
    const result = getRequestAuditContext({
      ip: "10.0.0.10",
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.10",
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      },
    } as never);
    expect(result).toEqual({
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      deviceType: "mobile",
    });
  });

  it("falls back safely when request headers are unavailable", () => {
    expect(
      getRequestAuditContext({ ip: "127.0.0.1", headers: {} } as never)
    ).toEqual({
      ipAddress: "127.0.0.1",
      userAgent: null,
      deviceType: "unknown",
    });
  });
});
