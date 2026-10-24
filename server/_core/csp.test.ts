import { describe, expect, it } from "vitest";
import { getContentSecurityPolicy } from "./csp";

describe("getContentSecurityPolicy", () => {
  it("enforces a script policy without unsafe directives in production", () => {
    const policy = getContentSecurityPolicy(true);

    expect(policy.header).toBe("Content-Security-Policy");
    expect(policy.value).toContain("script-src 'self';");
    expect(policy.value).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy.value).not.toContain("'unsafe-eval'");
    expect(policy.value).toContain("object-src 'none'");
    expect(policy.value).toContain("frame-ancestors 'none'");
  });

  it("uses report-only mode outside production", () => {
    const policy = getContentSecurityPolicy(false);

    expect(policy.header).toBe("Content-Security-Policy-Report-Only");
    expect(policy.value).toContain("'unsafe-inline'");
    expect(policy.value).toContain("'unsafe-eval'");
  });
});
